# DEV QA (Modern Features)

## Quick setup
- Copy `.env.example` to `.env` and fill `OPENAI_API_KEY`, `OPENAI_MODEL` (optional) plus `VITE_AI_API_BASE`/`VITE_AI_API_KEY` for AI + Voice. Keep `VITE_ENABLE_*` flags `false` unless a scenario below asks to enable them.
- Start backend proxy for AI/runtime pricing: `npm run api` (default port 4000).
- Start frontend: `npm run dev` (default flags off), `npm run dev:ai` (AI + Voice flags on), `npm run dev:sales` (Kamera-/Tour-Panel fuer Demos), oder `npm run dev:admin` (Admin-Panel). Admin UI lives at `/admin/catalog`.

## Smoke tests (5–10 quick checks)
1) Sidebar basic flow (floor, walls, modules) — with backend running, open `/` and switch stand type (row/corner), toggle floor covering/raised floor, change wall surfaces, then add/remove counters/screens; ensure price updates and collision hints appear for invalid placements.
2) Seating section — in the Sidebar, open Seating, add a seating cluster, change layout size, and confirm seats render on the floor grid and price adjusts.
3) AI Assistant ON — start with `npm run dev:ai`, open the AI card in the Sidebar, ask a simple command (e.g., “add 2 counters on the back wall”), wait for rationale, and verify the config updates; warnings show if validation trims the change.
4) AI Assistant OFF — run `npm run dev` (flags false) and confirm the AI panel is hidden; no AI requests should be sent.
5) Voice Assistant ON — with `npm run dev:ai`, open the Voice card, click Start, speak “increase booth height to 3 meters”, watch transcript fill, and confirm the change applies or a rationale explains why not; Stop ends recording.
6) Voice Assistant OFF — with `npm run dev` ensure the Voice card does not render.
7) Voice unsupported browser — still with flags on, open the app in a browser without `SpeechRecognition` (e.g., Firefox), confirm a “nicht unterstuetzt/unsupported” warning appears and microphone button stays disabled.
8) Admin Object Catalog ON — run `npm run dev:admin`, browse to `/admin/catalog`, and verify categories/items load plus search/filter work without console errors.
9) Admin OFF/guard — with default `npm run dev` and `VITE_ENABLE_ADMIN_PANEL=false`, open `/admin/catalog`; expect the guard page explaining the feature flag requirement and a back link.
