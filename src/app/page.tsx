"use client";

import { useMemo, useRef, useState } from "react";

type GenreOption =
  | "Auto"
  | "Disaster Movie"
  | "Romantic Comedy"
  | "Gritty Reboot"
  | "Psychological Thriller"
  | "Sci‑Fi Epic"
  | "Creature Feature";

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

type PosterResponse = {
  brief: PosterBrief;
  image: { b64: string; dataUrl: string };
  error?: string;
};

type VideoResponse = {
  videoId?: string;
  status?: string;
  progress?: number;
  video?: { b64: string; dataUrl: string };
  error?: string;
};

const GENRES: GenreOption[] = [
  "Auto",
  "Disaster Movie",
  "Romantic Comedy",
  "Gritty Reboot",
  "Psychological Thriller",
  "Sci‑Fi Epic",
  "Creature Feature",
];

const EXAMPLES = [
  "The seagulls stole my chips and the pool was cold.",
  "Room smelled like wet cardboard. The 'ocean view' was a parking lot with ambition.",
  "They forgot my order, then argued with me about what I ordered. Iconic.",
  "The gym had one dumbbell and it was judging me.",
];

export default function Home() {
  const [review, setReview] = useState(EXAMPLES[0]);
  const [genre, setGenre] = useState<GenreOption>("Auto");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PosterResponse | null>(null);
  const [video, setVideo] = useState<VideoResponse | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [videoProgress, setVideoProgress] = useState(0);
  const [loadingStage, setLoadingStage] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const videoAbortRef = useRef<AbortController | null>(null);

  const stages = useMemo(
    () => [
      "Reading your review…",
      "Extracting characters and stakes…",
      "Pitching a title and tagline…",
      "Lighting the scene…",
      "Printing the poster…",
      "Rolling camera on the teaser…",
      "Rendering the trailer…",
    ],
    [],
  );

  async function generateTrailer(brief: PosterBrief, posterDataUrl: string, signal?: AbortSignal) {
    setVideo(null);
    setVideoError(null);
    setVideoLoading(true);
    setVideoProgress(0);

    const createRes = await fetch("/api/video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        trailerPrompt: brief.trailerPrompt,
        posterDataUrl,
      }),
    });

    const created = (await createRes.json()) as VideoResponse;
    if (!createRes.ok) {
      throw new Error(created.error ?? "Failed to start trailer");
    }

    const videoId = created.videoId;
    if (!videoId) throw new Error("No video job id");

    setVideo({ videoId, status: created.status, progress: created.progress ?? 0 });

    while (true) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

      const statusRes = await fetch(`/api/video?id=${encodeURIComponent(videoId)}`, { signal });
      const statusData = (await statusRes.json()) as VideoResponse;

      if (!statusRes.ok) {
        throw new Error(statusData.error ?? "Trailer status failed");
      }

      setVideoProgress(statusData.progress ?? 0);
      setVideo(statusData);

      if (statusData.status === "completed" && statusData.video?.dataUrl) {
        return statusData;
      }
      if (statusData.status === "failed") {
        throw new Error(statusData.error ?? "Trailer generation failed");
      }

      await new Promise((r) => setTimeout(r, 2500));
    }
  }

  async function onSubmit() {
    const trimmed = review.trim();
    if (!trimmed) {
      setError("Paste a review first.");
      return;
    }

    setError(null);
    setResult(null);
    setVideo(null);
    setVideoError(null);
    setIsLoading(true);
    setVideoLoading(false);
    setLoadingStage(0);

    abortRef.current?.abort();
    videoAbortRef.current?.abort();
    const ac = new AbortController();
    const videoAc = new AbortController();
    abortRef.current = ac;
    videoAbortRef.current = videoAc;

    const timer = window.setInterval(() => {
      setLoadingStage((s) => Math.min(s + 1, stages.length - 2));
    }, 900);

    let posterReady = false;

    try {
      const res = await fetch("/api/poster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          review: trimmed,
          genre: genre === "Auto" ? "" : genre,
        }),
      });

      const data = (await res.json()) as PosterResponse;
      if (!res.ok) {
        throw new Error((data as unknown as { error?: string }).error ?? "Request failed");
      }

      setResult(data);
      posterReady = true;
      setIsLoading(false);
      setLoadingStage(stages.length - 2);

      setVideoLoading(true);
      setLoadingStage(stages.length - 1);
      await generateTrailer(data.brief, data.image.dataUrl, videoAc.signal);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      if (e instanceof DOMException && e.name === "AbortError") {
        setError("Cancelled.");
      } else if (msg !== "The user aborted a request.") {
        if (posterReady) {
          setVideoError(msg);
        } else {
          setError(msg);
        }
      }
    } finally {
      window.clearInterval(timer);
      setIsLoading(false);
      setVideoLoading(false);
      abortRef.current = null;
      videoAbortRef.current = null;
    }
  }

  function onCancel() {
    abortRef.current?.abort();
    videoAbortRef.current?.abort();
    abortRef.current = null;
    videoAbortRef.current = null;
    setIsLoading(false);
    setVideoLoading(false);
    setError("Cancelled.");
  }

  function slugTitle() {
    return (result?.brief?.title ?? "movie").replaceAll(/[^a-z0-9-_ ]/gi, "").trim() || "movie";
  }

  function downloadImage() {
    const url = result?.image?.dataUrl;
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slugTitle()}-poster.png`;
    a.click();
  }

  function downloadVideo() {
    const url = video?.video?.dataUrl;
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slugTitle()}-trailer.mp4`;
    a.click();
  }

  const isBusy = isLoading || videoLoading;

  return (
    <div className="min-h-full flex flex-col bg-zinc-50 text-zinc-950 dark:bg-black dark:text-zinc-50">
      <header className="border-b border-zinc-200/70 dark:border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-5 flex items-center justify-between gap-4">
          <div className="flex flex-col">
            <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400">The Bad Review Movie Poster</div>
            <h1 className="text-xl font-semibold tracking-tight">Turn petty pain into cinema.</h1>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
            <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 dark:border-white/10 dark:bg-white/5">
              brief → poster → trailer
            </span>
            <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 dark:border-white/10 dark:bg-white/5">
              PNG + MP4
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <section className="lg:col-span-2">
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold tracking-tight">Your review</h2>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  {review.trim().length}/500
                </div>
              </div>
              <textarea
                value={review}
                maxLength={500}
                onChange={(e) => setReview(e.target.value)}
                placeholder="Paste a terrible review…"
                className="mt-3 h-36 w-full resize-none rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900/10 dark:border-white/10 dark:bg-black/20 dark:focus:ring-white/15"
                disabled={isBusy}
              />

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <div className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Examples</div>
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => setReview(ex)}
                    disabled={isBusy}
                    className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200 dark:hover:bg-white/10"
                    type="button"
                  >
                    Use
                  </button>
                ))}
              </div>

              <div className="mt-5 flex items-center justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Genre</label>
                  <select
                    value={genre}
                    onChange={(e) => setGenre(e.target.value as GenreOption)}
                    disabled={isBusy}
                    className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-900/10 disabled:opacity-50 dark:border-white/10 dark:bg-black/20 dark:focus:ring-white/15"
                  >
                    {GENRES.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-end gap-2">
                  {!isBusy ? (
                    <button
                      onClick={onSubmit}
                      className="h-10 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                      type="button"
                    >
                      Make it a movie
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={onCancel}
                        className="h-10 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100 dark:hover:bg-white/10"
                        type="button"
                      >
                        Cancel
                      </button>
                      <div className="h-10 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white flex items-center gap-2 dark:bg-white dark:text-black">
                        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white dark:border-black/30 dark:border-t-black" />
                        Working…
                      </div>
                    </>
                  )}
                </div>
              </div>

              {error ? (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                  {error}
                </div>
              ) : null}

              {isBusy ? (
                <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 dark:border-white/10 dark:bg-white/5">
                  <div className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Now generating</div>
                  <div className="mt-1 text-sm font-semibold">{stages[loadingStage]}</div>
                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10">
                    <div
                      className="h-full bg-zinc-900 dark:bg-white transition-all"
                      style={{
                        width: `${videoLoading ? Math.max(55, videoProgress) : Math.round(((loadingStage + 1) / (stages.length - 1)) * 50)}%`,
                      }}
                    />
                  </div>
                  {videoLoading ? (
                    <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                      Trailer render: {Math.round(videoProgress)}%
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </section>

          <section className="lg:col-span-3">
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold tracking-tight">Poster & trailer</h2>
                {result?.image?.dataUrl ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={downloadImage}
                      className="h-9 rounded-xl bg-zinc-900 px-3 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                      type="button"
                    >
                      Download PNG
                    </button>
                    <button
                      onClick={() => onSubmit()}
                      className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100 dark:hover:bg-white/10"
                      type="button"
                      disabled={isBusy}
                    >
                      Regenerate
                    </button>
                  </div>
                ) : null}
              </div>

              {!result?.image?.dataUrl && !isBusy ? (
                <div className="mt-4 rounded-xl border border-dashed border-zinc-300 p-8 text-sm text-zinc-600 dark:border-white/15 dark:text-zinc-300">
                  Paste a review, pick a genre (optional), and hit <span className="font-semibold">Make it a movie</span>.
                  <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                    Tip: short, specific complaints produce the funniest “serious” posters.
                  </div>
                </div>
              ) : null}

              {isBusy && !result?.image?.dataUrl ? (
                <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className="aspect-[2/3] w-full rounded-xl bg-zinc-100 animate-pulse dark:bg-white/10" />
                  <div className="space-y-3">
                    <div className="h-5 w-2/3 rounded bg-zinc-100 animate-pulse dark:bg-white/10" />
                    <div className="h-4 w-full rounded bg-zinc-100 animate-pulse dark:bg-white/10" />
                    <div className="h-4 w-5/6 rounded bg-zinc-100 animate-pulse dark:bg-white/10" />
                    <div className="h-24 w-full rounded bg-zinc-100 animate-pulse dark:bg-white/10" />
                  </div>
                </div>
              ) : null}

              {result?.image?.dataUrl ? (
                <div className="mt-4 flex flex-col gap-6">
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <div className="rounded-xl overflow-hidden border border-zinc-200 bg-zinc-50 dark:border-white/10 dark:bg-black/20">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img alt={result.brief.title} src={result.image.dataUrl} className="h-full w-full object-cover" />
                    </div>

                    <div className="flex flex-col gap-3">
                    <div>
                      <div className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Title</div>
                      <div className="text-lg font-semibold tracking-tight">{result.brief.title}</div>
                      <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">“{result.brief.tagline}”</div>
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs dark:border-white/10 dark:bg-white/5">
                        <div className="font-semibold text-zinc-600 dark:text-zinc-400">Genre</div>
                        <div className="mt-0.5 text-sm">{result.brief.genre}</div>
                      </div>
                      <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs dark:border-white/10 dark:bg-white/5">
                        <div className="font-semibold text-zinc-600 dark:text-zinc-400">Palette</div>
                        <div className="mt-0.5 text-sm">{result.brief.visualStyle.colorPalette}</div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200">
                      {result.brief.logline}
                    </div>

                    <details className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5">
                      <summary className="cursor-pointer text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                        Show the AI “brief”
                      </summary>
                      <div className="mt-2 space-y-2 text-xs text-zinc-700 dark:text-zinc-200">
                        {result.brief.keyBeats?.length ? (
                          <div>
                            <div className="font-semibold text-zinc-600 dark:text-zinc-400">Key beats</div>
                            <ul className="mt-1 list-disc pl-5">
                              {result.brief.keyBeats.slice(0, 6).map((b) => (
                                <li key={b}>{b}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        <div>
                          <div className="font-semibold text-zinc-600 dark:text-zinc-400">Poster prompt</div>
                          <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-zinc-50 p-2 text-[11px] leading-relaxed text-zinc-800 dark:bg-black/30 dark:text-zinc-100">
                            {result.brief.posterPrompt}
                          </pre>
                        </div>
                        <div>
                          <div className="font-semibold text-zinc-600 dark:text-zinc-400">Trailer prompt</div>
                          <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-zinc-50 p-2 text-[11px] leading-relaxed text-zinc-800 dark:bg-black/30 dark:text-zinc-100">
                            {result.brief.trailerPrompt}
                          </pre>
                        </div>
                      </div>
                    </details>
                    </div>
                  </div>

                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-white/10 dark:bg-black/20">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold tracking-tight">Teaser trailer (4s)</h3>
                      {video?.video?.dataUrl ? (
                        <button
                          onClick={downloadVideo}
                          className="h-9 rounded-xl bg-zinc-900 px-3 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                          type="button"
                        >
                          Download MP4
                        </button>
                      ) : null}
                    </div>

                    {videoLoading ? (
                      <div className="mt-3 aspect-[9/16] max-w-xs rounded-xl bg-zinc-200 animate-pulse dark:bg-white/10" />
                    ) : null}

                    {videoError ? (
                      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                        Trailer failed: {videoError}. Your poster is still above.
                      </div>
                    ) : null}

                    {video?.video?.dataUrl ? (
                      <video
                        className="mt-3 max-h-[480px] w-full max-w-xs rounded-xl border border-zinc-200 dark:border-white/10"
                        src={video.video.dataUrl}
                        controls
                        playsInline
                        autoPlay
                        loop
                        muted
                      />
                    ) : null}

                    {!videoLoading && !video?.video?.dataUrl && !videoError ? (
                      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                        Trailer generates after the poster (Sora, ~1–3 min).
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </main>

      <footer className="border-t border-zinc-200/70 dark:border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-6 text-xs text-zinc-500 dark:text-zinc-400">
          Bring your own key via <span className="font-mono">OPENAI_API_KEY</span>. Poster + trailer generated on-demand (Sora requires API access).
        </div>
      </footer>
    </div>
  );
}
