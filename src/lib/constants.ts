/** Delivered trailer length (seconds). */
export const TRAILER_SECONDS = 2;

/** Sora API minimum clip length — we trim down to TRAILER_SECONDS after download. */
export const SORA_GENERATION_SECONDS = "4" as const;
