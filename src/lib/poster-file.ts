import { toFile } from "openai";
import sharp from "sharp";

export const VIDEO_SIZE = { width: 720, height: 1280 } as const;

function parseDataUrl(dataUrl: string) {
  const match = /^data:([^;]+);base64,([\s\S]+)$/.exec(dataUrl.trim());
  if (!match) {
    throw new Error("Invalid poster data URL");
  }
  return {
    mime: match[1],
    buffer: Buffer.from(match[2], "base64"),
  };
}

/** Resize poster to exact Sora frame size and return an Uploadable File. */
export async function posterDataUrlToReferenceFile(dataUrl: string) {
  const { buffer } = parseDataUrl(dataUrl);

  const resized = await sharp(buffer)
    .resize(VIDEO_SIZE.width, VIDEO_SIZE.height, { fit: "cover", position: "centre" })
    .jpeg({ quality: 92 })
    .toBuffer();

  return toFile(resized, "poster-reference.jpg", { type: "image/jpeg" });
}
