# Projekt: S&S 3D Standkonfigurator (pnpm Monorepo)

## Monorepo-Struktur & Architektur
- `apps/frontend`: React 19, Three.js r181 / R3F v9, Vite 7, Zustand v5.
- `apps/backend`: Express 5, Node.js, OpenAI Integration (gpt-4.1-mini).
- `packages/shared`: Geteilte Zod-Schemas, TypeScript-Typen und Konfig-Utils.
- **Architektur-Dogma**: Frontend und Backend teilen Typen AUSSCHLIESSLICH ueber `packages/shared`.

## Kern-Dogmen
- **Notebook-First**: Keine Zeile Code und keine Architekturentscheidung ohne vorherige Konsultation des Verifizierungs-Notebooks (Ground Truth).
- **Strict TDD**: Test-Driven Development ist Pflicht. Zuerst fehlgeschlagene Tests, dann Implementation (Red-Green-Refactor).
- **Sicherheit**: Niemals API-Keys committen. `.env` Variablen ueber Zod validieren.
- **Performance First**: Keine Request-Waterfalls, keine Barrel-Files die ganze Bibliotheken laden.

## Tech-Stack-Regeln
- **React 19 & Zustand v5**: `use()` Hook fuer async. Kein `useState` in `useFrame`-Schleifen; direkte Mutation via Refs/getState().
- **Three.js r181 / R3F v9**: `InstancedMesh`/`BatchedMesh` fuer Massen-Rendering. Draw Calls unter 100.
- **Express 5**: Native Promise-Unterstuetzung fuer async Routes.
- **OpenAI**: Ausschliesslich "Strict" Structured Outputs via Zod-Schema fuer deterministische 3D-Szenen.
- **Sequential Thinking**: Bei Vektormathematik (Quaternionen, Matrizen, SAT/OBB-Kollision) Sequential Thinking MCP verwenden.

## Build- & Dev-Befehle
- `pnpm install` - Alle Monorepo-Dependencies installieren.
- `pnpm --filter @ss/frontend dev` - Frontend Dev-Server (Vite, Port 5173).
- `pnpm --filter @ss/frontend dev:ai` - Mit AI + Voice Flags.
- `pnpm --filter @ss/frontend build` - Produktionsbuild.
- `pnpm --filter @ss/frontend typecheck` - TypeScript-Pruefung.
- `pnpm --filter @ss/frontend lint` - ESLint.
- `pnpm --filter @ss/frontend test` - Jest Unit-Tests.
- `pnpm --filter @ss/frontend test:e2e` - Playwright E2E-Tests.
- `npm run start` (in apps/backend) - Backend starten.

## NotebookLM Verifizierung
- Verifizierungs-Notebook ID: `a10f1bea-5454-4e64-ae4b-99009797c94a`
- Mastery-Notebook ID: `ebfc4768-fc9b-408f-8640-09a75d6ba54c`
- CLI: `/c/Users/sunds/AppData/Local/Programs/Python/Python312/Scripts/notebooklm.exe`
