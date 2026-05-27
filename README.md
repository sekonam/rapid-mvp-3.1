## Bad Review → Movie Poster (Rapid MVP)

Paste a mundane/terrible customer review and get back a dramatic, cinematic, high-quality **movie poster**.

This MVP uses a **3-step AI flow**:
- **Interpretation step**: review → a structured “movie brief” (title, tagline, logline, style, trailer shot)
- **Poster step**: brief → a 2:3 **poster image** (PNG)
- **Trailer step**: poster + brief → a 2s **teaser video** (MP4) via Sora, guided by the poster

### Tech
- Next.js (App Router) + Tailwind
- OpenAI (text + image)

## Getting started (local)

### 1) Set one environment variable

Create `.env.local`:

```bash
OPENAI_API_KEY="YOUR_KEY_HERE"
```

### 2) Install + run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Deploy to Vercel

- Push this repo to GitHub.
- Import it in Vercel.
- Add `OPENAI_API_KEY` in **Project Settings → Environment Variables**.
- Deploy.

## Notes

- `POST /api/poster` — brief + poster image
- `POST /api/video` — starts a Sora job (uses poster as reference)
- `GET /api/video?id=...` — poll status; returns MP4 when complete
- Sora access must be enabled on your OpenAI project (video generation can take 1–3 minutes).

## Safety / constraints

- The prompt asks the image model to avoid real actor likeness, logos, and watermarks.
- If generation fails, the API returns an error (and the UI shows a clean error state).

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
```
