import type OpenAI from "openai";

const POLL_MS = 2500;
const MAX_WAIT_MS = 5 * 60 * 1000;

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
  const buf = Buffer.from(await res.arrayBuffer());
  const b64 = buf.toString("base64");
  return {
    b64,
    dataUrl: `data:video/mp4;base64,${b64}`,
  };
}
