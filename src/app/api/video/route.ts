import { NextResponse } from "next/server";
import { getOpenAIClient } from "@/lib/openai";
import { SORA_GENERATION_SECONDS } from "@/lib/constants";
import { posterDataUrlToReferenceFile } from "@/lib/poster-file";
import { downloadVideoBase64, waitForVideo } from "@/lib/video";

export const runtime = "nodejs";
export const maxDuration = 300;

type CreateBody = {
  trailerPrompt: string;
  posterDataUrl: string;
};

function asNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export async function POST(req: Request) {
  let client: ReturnType<typeof getOpenAIClient>;
  try {
    client = getOpenAIClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Missing API key";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const trailerPrompt = asNonEmptyString(body.trailerPrompt);
  const posterDataUrl = asNonEmptyString(body.posterDataUrl);
  if (!trailerPrompt || !posterDataUrl) {
    return NextResponse.json({ error: "Missing trailerPrompt or posterDataUrl" }, { status: 400 });
  }

  let inputReference;
  try {
    inputReference = await posterDataUrlToReferenceFile(posterDataUrl);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid poster image";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const job = await client.videos.create({
    model: "sora-2",
    prompt: [
      trailerPrompt,
      "",
      "Cinematic movie teaser. Smooth camera motion. Dramatic lighting. No on-screen text. No logos.",
    ].join("\n"),
    seconds: SORA_GENERATION_SECONDS,
    size: "720x1280",
    input_reference: inputReference,
  });

  return NextResponse.json({
    videoId: job.id,
    status: job.status,
    progress: job.progress,
  });
}

export async function GET(req: Request) {
  let client: ReturnType<typeof getOpenAIClient>;
  try {
    client = getOpenAIClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Missing API key";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const videoId = new URL(req.url).searchParams.get("id");
  if (!videoId) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const wait = new URL(req.url).searchParams.get("wait") === "1";

  try {
    const job = wait ? await waitForVideo(client, videoId) : await client.videos.retrieve(videoId);

    if (job.status === "failed") {
      return NextResponse.json(
        { videoId, status: job.status, progress: job.progress, error: job.error?.message ?? "Failed" },
        { status: 502 },
      );
    }

    if (job.status !== "completed") {
      return NextResponse.json({
        videoId,
        status: job.status,
        progress: job.progress,
      });
    }

    const video = await downloadVideoBase64(client, videoId);
    return NextResponse.json({
      videoId,
      status: job.status,
      progress: 100,
      video,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Video request failed";
    return NextResponse.json({ error: msg, videoId }, { status: 502 });
  }
}
