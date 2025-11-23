# S&S 3D Standkonfigurator

Interner React/Three-Konfigurator für Systemstände. Relevante Dateien:
- `src/components/Configurator3D.tsx` – 3D-Szene inkl. Edit-Mode & Kollisionslogik
- `src/components/SidebarControls.tsx` – UI/Presets & Kollisionshilfe
- `src/store/configStore.ts` – Zustand + Normalisierung

## Kollisionsprüfung (AABB)
- Alle bewegten Objekte (Counters, Screens, Kabine, Truss-Griff/‑Stützen) erhalten AABBs mit
  einem Mindestabstand (Default `0.2 m`, konfigurierbar über `modules.collisionClearance`).
- Bewegungen werden in `onChange` geblockt, sobald ein AABB andere aktive Objekte schneiden
  würde. Die Position springt zurück auf die zuletzt gültige Koordinate.
- Visuelles Feedback: roter Wireframe + Tooltip am betroffenen Objekt.
- Nur kollisionsfreie Positionen werden im Store gespeichert; ungültige Moves erzeugen keine
  Seiteneffekte im Zustand.

## Collision-Playground
- Über die Sidebar („Kollisions-Playground“) lässt sich ein Mock-Stand mit mehreren Counters,
  Screens, Kabine und Truss laden (`src/lib/playgrounds.ts`).
- Der Playground nutzt einen höheren Sicherheitsabstand (`0.25 m`) und eignet sich für
  manuelle Checks von AABB-Kollisionen.

## Bedienhinweise (Auszug)
- Edit-Mode per Taste `E` aktivieren, Transform-Gizmos mit `T/R/S`, Snap via `G`.
- Objekte per Klick auswählen, Drag sperrt Orbit automatisch. Doppelklick auf Legacy-Counter
  konvertiert sie in frei platzierbare Varianten.


## OpenAI-Anbindung (Backend-Proxy)
- Key bleibt serverseitig: `.env` auf Basis von `.env.example` mit `OPENAI_API_KEY`, optional `OPENAI_MODEL`, `PORT` und `CORS_ORIGIN` fuellen. `.env` ist in `.gitignore`.
- Backend starten: `npm run api` (Express auf Port 4000). Healthcheck: `GET /api/ai/health`.
- Frontend ruft `POST /api/ai/design` ueber `src/lib/aiClient.ts`; Basis-URL per `VITE_API_BASE_URL` konfigurierbar (Default `http://localhost:4000`).
- KI-Assistenz sitzt in der Sidebar und schickt nur die aktuelle Konfig-JSON (keine Assets, kein Key) an die API. Antwort wird validiert und als Patch auf den Store angewendet.

## Runtime-Backend (Preis/Plausibilitaet/Speichern)
- Preise + Plausibilitaet laufen serverseitig: `POST /api/runtime/price` und `POST /api/runtime/validate` (Stand-JSON). Optionaler Kundenkontext per `customerId` im Body oder Header `x-customer-id` (Rabatte).
- Konfigurationen lassen sich ablegen/abrufen: `POST /api/configs` gibt eine `id` zurueck, `GET /api/configs/:id` laedt sie. Der Store persistiert auf Platte (`server/data/configs.json`), ueberlebt Neustarts und bereinigt abgelaufene IDs automatisch (Default-TTL 8h).
- TTL, Max-Anzahl und Datenpfad lassen sich per ENV steuern: `CONFIG_TTL_HOURS`, `CONFIG_STORE_MAX`, `CONFIG_PURGE_INTERVAL_MINUTES`, `CONFIG_STORE_DIR`.
- Frontend nutzt die neuen Endpunkte automatisch (asynchron, fallback auf lokale Kalkulation wenn Backend nicht erreichbar).
- Pricing-Daten liegen jetzt headless: `PRICING_DATA_FILE` oder `PRICING_API_URL` speisen das Modell, werden gecacht (`PRICING_CACHE_MINUTES`) und fliesen in `/api/runtime/pricing` (Modelldump) sowie `/api/catalog/modules` (Modulkatalog) ein. Optionaler Default-Kunde im Frontend: `VITE_CUSTOMER_ID`.
- Wer das Backend nicht startet und nur die lokale Preislogik nutzen will, setzt `VITE_DISABLE_RUNTIME=true`; dann entfallen die Requests auf `:4000/api/runtime/*`.

