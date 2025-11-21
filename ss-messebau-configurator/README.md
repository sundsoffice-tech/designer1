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

## Fehleranalyse: 400/500 bei `/api/runtime/price`
- Die Preislogik läuft komplett im Frontend. `useConfigStore` ruft die lokale Funktion
  `calcPrice` auf; es gibt weder `fetch`- noch `axios`-Imports im Projekt.
- Damit schickt der Konfigurator keine Requests an `/api/runtime/price` oder `/api/aiclient`.
  Solche Calls stammen vermutlich von einer externen Browser-Extension (z. B. AI-Assistent)
  oder einem Proxy, der auf `localhost:4000` zeigt. Ohne passenden Backend-Endpunkt enden
  diese Anfragen mit 400/500-Fehlern, obwohl die App selbst rein statisch arbeitet.

