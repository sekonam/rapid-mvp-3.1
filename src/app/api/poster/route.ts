import { NextResponse } from "next/server";
import { getOpenAIClient } from "@/lib/openai";

export const runtime = "nodejs";

type PosterRequest = {
  review: string;
  genre?: string;
};

type PosterBrief = {
  title: string;
  tagline: string;
  genre: string;
  logline: string;
  keyCharacters: string[];
  keyBeats: string[];
  visualStyle: {
    era: string;
    lighting: string;
    colorPalette: string;
    camera: string;
    composition: string;
    typography: string;
  };
  posterPrompt: string;
  trailerPrompt: string;
  negativePrompt: string;
};

function asNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function coerceBrief(data: unknown): PosterBrief | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;

  const title = asNonEmptyString(d.title);
  const tagline = asNonEmptyString(d.tagline);
  const genre = asNonEmptyString(d.genre);
  const logline = asNonEmptyString(d.logline);
  const posterPrompt = asNonEmptyString(d.posterPrompt);
  const trailerPrompt = asNonEmptyString(d.trailerPrompt);
  const negativePrompt = asNonEmptyString(d.negativePrompt) ?? "";

  const keyCharacters = Array.isArray(d.keyCharacters)
    ? d.keyCharacters.filter((x) => typeof x === "string" && x.trim()).map((x) => (x as string).trim())
    : [];
  const keyBeats = Array.isArray(d.keyBeats)
    ? d.keyBeats.filter((x) => typeof x === "string" && x.trim()).map((x) => (x as string).trim())
    : [];

  const vs = (d.visualStyle && typeof d.visualStyle === "object" ? (d.visualStyle as Record<string, unknown>) : null) as
    | Record<string, unknown>
    | null;

  const visualStyle = vs
    ? {
        era: asNonEmptyString(vs.era) ?? "modern",
        lighting: asNonEmptyString(vs.lighting) ?? "high-contrast cinematic",
        colorPalette: asNonEmptyString(vs.colorPalette) ?? "teal and orange",
        camera: asNonEmptyString(vs.camera) ?? "35mm film look",
        composition: asNonEmptyString(vs.composition) ?? "centered hero composition",
        typography: asNonEmptyString(vs.typography) ?? "bold theatrical title treatment",
      }
    : {
        era: "modern",
        lighting: "high-contrast cinematic",
        colorPalette: "teal and orange",
        camera: "35mm film look",
        composition: "centered hero composition",
        typography: "bold theatrical title treatment",
      };

  if (!title || !tagline || !genre || !logline || !posterPrompt || !trailerPrompt) return null;

  return {
    title,
    tagline,
    genre,
    logline,
    keyCharacters,
    keyBeats,
    visualStyle,
    posterPrompt,
    trailerPrompt,
    negativePrompt,
  };
}

export async function POST(req: Request) {
  let client: ReturnType<typeof getOpenAIClient>;
  try {
    client = getOpenAIClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Missing API key";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  let body: PosterRequest;
  try {
    body = (await req.json()) as PosterRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const review = asNonEmptyString(body.review);
  const genreHint = asNonEmptyString(body.genre);
  if (!review) {
    return NextResponse.json({ error: "Missing review" }, { status: 400 });
  }

  const briefResponse = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0.8,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You turn mundane customer reviews into cinematic movie-poster briefs. Output ONLY valid JSON. No markdown.",
      },
      {
        role: "user",
        content: [
          `Review:\n${review}`,
          "",
          `Optional genre hint (may be empty): ${genreHint ?? ""}`,
          "",
          "Return JSON with keys:",
          "- title (short, punchy)",
          "- tagline (1 line)",
          "- genre (choose one)",
          "- logline (1-2 sentences)",
          "- keyCharacters (array of 2-5 strings)",
          "- keyBeats (array of 3-6 strings)",
          "- visualStyle: { era, lighting, colorPalette, camera, composition, typography }",
          "- posterPrompt (a single, detailed image prompt for a dramatic, high-quality theatrical movie poster; include title + tagline placement guidance, realistic details, cinematic lighting, no logos/watermarks)",
          "- trailerPrompt (a 4-second cinematic teaser shot: one dramatic camera move, no on-screen text, no logos, no real actor likeness; describe motion, lighting, and the key beat from the review)",
          "- negativePrompt (what to avoid: low quality, text gibberish, extra limbs, watermarks, etc.)",
        ].join("\n"),
      },
    ],
  });

  const briefRaw = briefResponse.choices[0]?.message?.content ?? "";
  const briefParsed = safeJsonParse(briefRaw);
  const brief = coerceBrief(briefParsed);
  if (!brief) {
    return NextResponse.json(
      { error: "Failed to create a poster brief", debug: { briefRaw } },
      { status: 502 },
    );
  }

  const imagePrompt = [
    brief.posterPrompt,
    "",
    "Important constraints:",
    "- Vertical poster aspect ratio (2:3)",
    "- No watermarks, no brand logos, no real actor likeness",
    "- Keep title and tagline legible with clean typography (avoid scrambled text)",
  ].join("\n");

  const img = await client.images.generate({
    model: "gpt-image-1",
    prompt: imagePrompt,
    size: "1024x1536",
  });

  const b64 = img.data?.[0]?.b64_json;
  if (!b64) {
    return NextResponse.json({ error: "Image generation failed" }, { status: 502 });
  }

  return NextResponse.json({
    brief,
    image: {
      b64,
      dataUrl: `data:image/png;base64,${b64}`,
    },
  });
}

