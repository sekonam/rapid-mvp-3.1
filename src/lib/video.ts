import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type OpenAI from "openai";
import ffmpegPath from "ffmpeg-static";
import { TRAILER_SECONDS } from "@/lib/constants";

const execFileAsync = promisify(execFile);
const POLL_MS = 2500;
const MAX_WAIT_MS = 5 * 60 * 1000;

async function trimVideoToSeconds(input: Buffer, seconds: number) {
  if (!ffmpegPath) {
    throw new Error("ffmpeg is not available for trimming");
  }

  const dir = await mkdtemp(join(tmpdir(), "trailer-trim-"));
  const inputPath = join(dir, "in.mp4");
  const outputPath = join(dir, "out.mp4");

  try {
    await writeFile(inputPath, input);
    await execFileAsync(ffmpegPath, [
      "-i",
      inputPath,
      "-t",
      String(seconds),
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "23",
      "-an",
      "-movflags",
      "+faststart",
      "-y",
      outputPath,
    ]);
    return await readFile(outputPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function waitForVideo(client: OpenAI, videoId: string) {
  const started = Date.now();

  while (Date.now() - started < MAX_WAIT_MS) {
    const job = await client.videos.retrieve(videoId);

    if (job.status === "completed") return job;
    if (job.status === "failed") {
      const msg = job.error?.message ?? "Video generation failed";
      throw new Error(msg);
    }

    await new Promise((r) => setTimeout(r, POLL_MS));
  }

  throw new Error("Video generation timed out");
}

export async function downloadVideoBase64(client: OpenAI, videoId: string) {
  const res = await client.videos.downloadContent(videoId, { variant: "video" });
  const raw = Buffer.from(await res.arrayBuffer());
  const buf = await trimVideoToSeconds(raw, TRAILER_SECONDS);
  const b64 = buf.toString("base64");
  return {
    b64,
    dataUrl: `data:video/mp4;base64,${b64}`,
  };
}
