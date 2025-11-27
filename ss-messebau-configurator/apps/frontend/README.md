# S&S 3D Standkonfigurator

Interner React/Three-Konfigurator für Systemstände. Relevante Dateien:
- `src/components/Configurator3D.tsx` – 3D-Szene inkl. Edit-Mode & Kollisionslogik
- `src/components/SidebarControls.tsx` – UI/Presets & Kollisionshilfe
- `src/store/configStore.ts` – Zustand + Normalisierung

## Kollisionspruefung (OBB)
- Bewegte Objekte (Counters, Screens, Kabine, Truss-Griff/-Stuetzen) nutzen orientierte Bounding-Boxes mit typabhaengiger Clearance (`clearance` je Objekt, Fallback `modules.collisionClearance`).
- Bewegungen werden in `onChange` geblockt, sobald eine OBB andere aktive Objekte schneiden wuerde. Die Position springt zurueck auf die zuletzt gueltige Koordinate.
- Visuelles Feedback: roter Wireframe + Tooltip am betroffenen Objekt.
- Snap-Raster & Struktur-Snap per Store (`modules.gridStep`/`modules.snapStep`, `modules.snapToStructure`).
- Nur kollisionsfreie Positionen werden im Store gespeichert; ungueltige Moves erzeugen keine Seiteneffekte im Zustand.

## Collision-Playground
- Ueber die Sidebar ("Kollisions-Playground") laesst sich ein Mock-Stand mit Counters, Screens, Kabine und Truss laden (`src/lib/playgrounds.ts`).
- Der Playground nutzt einen hoeheren Sicherheitsabstand (`0.25 m`) und eignet sich fuer manuelle Checks von OBB-Kollisionen.


## Bedienhinweise (Auszug)
- Edit-Mode ist standardm\xC3\xA4\xC3\x9Fig aktiv (Taste `E` sperrt/freigibt), Transform-Gizmos mit `T/R/S`, Snap via `G`.
- Objekte per Klick auswählen, Drag sperrt Orbit automatisch. Doppelklick auf Legacy-Counter
  konvertiert sie in frei platzierbare Varianten.


## OpenAI-Anbindung (Backend-Proxy)
- Key bleibt serverseitig: `.env` auf Basis von `.env.example` mit `OPENAI_API_KEY`, optional `OPENAI_MODEL`, `PORT` und `CORS_ORIGIN` fuellen. `.env` ist in `.gitignore`.
- Backend starten: `npm run api` (Express auf Port 4000). Healthcheck: `GET /api/ai/health`.
- Frontend nutzt `src/lib/aiClient.ts` fuer alle AI-Endpunkte (`/stand-from-text`, `/marketing-copy`, `/banner-image`, `/voice`). Basis-URL & API-Key kommen aus `VITE_AI_API_BASE` und `VITE_AI_API_KEY`.
- Das Sidebar-Panel `AiAssistantPanel` ist per Feature-Flag `VITE_ENABLE_AI_ASSISTANT=true` lazy-loaded; ohne Flag/Config wird kein KI-Code geladen und die UI zeigt eine Fehlermeldung aus dem Client.

## Runtime-Backend (Preis/Plausibilitaet/Speichern)
- Preise + Plausibilitaet laufen serverseitig: `POST /api/runtime/price` und `POST /api/runtime/validate` (Stand-JSON). Optionaler Kundenkontext per `customerId` im Body oder Header `x-customer-id` (Rabatte).
- Konfigurationen lassen sich ablegen/abrufen: `POST /api/configs` gibt eine `id` zurueck, `GET /api/configs/:id` laedt sie. Der Store persistiert auf Platte (`server/data/configs.json`), ueberlebt Neustarts und bereinigt abgelaufene IDs automatisch (Default-TTL 8h).
- TTL, Max-Anzahl und Datenpfad lassen sich per ENV steuern: `CONFIG_TTL_HOURS`, `CONFIG_STORE_MAX`, `CONFIG_PURGE_INTERVAL_MINUTES`, `CONFIG_STORE_DIR`.
- Frontend nutzt die neuen Endpunkte automatisch (asynchron, fallback auf lokale Kalkulation wenn Backend nicht erreichbar oder kein API-Host konfiguriert).
- Pricing-Daten liegen jetzt headless: `PRICING_DATA_FILE` oder `PRICING_API_URL` speisen das Modell, werden gecacht (`PRICING_CACHE_MINUTES`) und fliesen in `/api/runtime/pricing` (Modelldump) sowie `/api/catalog/modules` (Modulkatalog) ein. Optionaler Default-Kunde im Frontend: `VITE_CUSTOMER_ID`.
- Ohne `VITE_API_BASE_URL` bleibt die Runtime-API automatisch aus; wer das Backend ansprechen will, setzt `VITE_API_BASE_URL` (und optional `VITE_DISABLE_RUNTIME=false`). Wer nur die lokale Preislogik nutzen will, behaelt das Flag oder lässt die API-URL leer, dann entfallen die Requests auf `:4000/api/runtime/*`.

## Admin-Katalog
- Route: `/admin/catalog` laedt eine schlanke Admin-Shell mit `ObjectCatalogAdmin`.
- Guard: nur sichtbar in `import.meta.env.DEV` oder wenn `VITE_ENABLE_ADMIN_PANEL=true` gesetzt ist (siehe `.env.example`).
- Nicht in der Haupt-UI verlinkt; fallback ist ein kurzer Hinweistext, wenn der Admin-Bereich deaktiviert ist.

## Kamera-Panel (Sales-Flag)
- Setze `VITE_ENABLE_CAMERA_TOOLS=true`, um das Kamera-/Tour-Panel in der Sidebar einzublenden (Ansichten speichern, gefuehrte Tour starten/stoppen).
- Standard bleibt `false`, damit das Feature nur bei Sales-Demos sichtbar ist.

