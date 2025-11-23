# DEV-QA Guide (Configurator)

## Setup & Run
- Node: use Node 20 LTS (>=18 works with Vite 7 + sharp); install deps via `npm install`.
- Env: copy `.env.example` to `.env` and align frontend URLs with the local backend.
- Example `.env` values (adjust keys/hosts as needed):
```
VITE_API_BASE_URL=http://localhost:4000
VITE_AI_API_BASE=http://localhost:4000/api/ai
VITE_AI_API_KEY=sk-*****
VITE_DISABLE_AI=false
VITE_DISABLE_RUNTIME=false
VITE_ENABLE_AI_ASSISTANT=false
VITE_ENABLE_VOICE_ASSISTANT=false
VITE_ENABLE_ADMIN_PANEL=false
```
- Start frontend: `npm run dev` (variants: `npm run dev:ai` enables AI+Voice flags, `npm run dev:admin` adds Admin, `npm run dev:sales` enables Camera tools).
- Start AI/runtime backend: `npm run api` (Express on :4000; serves `/api/ai`, runtime pricing/validation, uploads). Keep `VITE_API_BASE_URL` and `VITE_AI_API_BASE` pointing here.

## Smoke Tests
### Core configurator
- With backend running, open `/`; change stand width/depth/height and type (row/corner) and confirm layout + price update.
- Add modules (counters, screens, LED frames, truss handle) and move them; invalid overlaps show red wireframe + blocked move while valid placements persist.
- Remove modules and confirm totals and stored config update correctly.

### Collision playground & clearance
- Load the Collision Playground preset in the Sidebar; it uses `modules.collisionClearance = 0.25`.
- Attempt to overlap counters/truss; expect AABB warning + revert. Increase spacing (>0.25 m) and confirm collisions clear and movement is accepted.

### SeatingControls
- Open Seating; add chair, barstool, and lounge entries with the `+` buttons and verify counts and positions render.
- Switch covers (none/white/branding) per type and confirm the material update on the floor objects.
- Remove seats with `-` until zero; ensure no stray seating remains.

### AI Assistant
- Flags on (`npm run dev:ai` or set `VITE_ENABLE_AI_ASSISTANT=true` with `VITE_AI_API_BASE/VITE_AI_API_KEY` set): open the AI panel.
- Run **stand-from-text** (e.g., “6m row stand, 2 counters”) and confirm a config patch applies with rationale/warnings shown.
- Run **marketing copy** and **banner image** prompts; expect populated text fields and an image URL render.
- Flags off (`npm run dev` default): AI panel hidden/disabled and no KI requests sent.
- Stop the backend and trigger a prompt; expect a graceful error message (disabled or unreachable) without breaking the form.

### Voice Assistant
- With flags + AI config on, click Start; browser asks for mic; speak a command and check transcript, applied config change, rationale, and warnings; Stop ends the session.
- Mid-session Stop should halt recording and clear the listening state.
- Unsupported browser (no `SpeechRecognition`) shows an “unsupported” hint with Start disabled; mic permission denied shows a permission warning and disabled Start.

### ObjectCatalogAdmin
- Enable flag (`npm run dev:admin` or `VITE_ENABLE_ADMIN_PANEL=true`) and open `/admin/catalog`.
- Drag & drop GLB/GLTF; verify auto-measured bounding box/dimensions populate; invalid files surface an error.
- Create or edit a template (name/category/price/mount/footprint/scale), save, and see it listed; place on stand to confirm it appears and is movable/removable.
- Use “Reset to defaults” to restore the bundled templates and clear customs.

### CameraPanel
- Enable camera tools (`npm run dev:sales` or `VITE_ENABLE_CAMERA_TOOLS=true`), open the Camera panel.
- Trigger quick views (Front/Left/Top/Hero) and verify camera animations.
- Save current view, then load and delete it.
- Play a guided tour and then Stop; ensure the animation halts and camera returns to a stable pose.

## Before Release
- Run: `npm run lint`, `npm run typecheck`, `npm run build` (ensure env paths align with backend host).
- Manual smoke (8–10 key interactions):
  - Start backend (`npm run api`) and frontend (`npm run dev`).
  - Switch stand type row -> corner; adjust width/depth and verify price + layout update without errors.
  - Add two counters + one screen; drag into collision to see red wireframe, then resolve spacing.
  - Load Collision Playground and confirm 0.25 m clearance blocks overlaps until spacing increases.
  - Save a camera view, reload it, then delete it.
  - Add seating of each type and change covers; confirm renders/counts update.
  - Run AI stand-from-text; then stop backend and ensure the AI panel surfaces a clean error.
  - Run a Voice command in Chrome (applies patch) and in Firefox (unsupported hint).
  - In `/admin/catalog`, import a GLB, create a template, place it, then reset defaults.
  - Toggle LED frames/truss on/off and confirm totals and 3D state stay in sync.
