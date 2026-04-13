---
description: React Three Fiber, WebGPU & Performance Standards fuer 3D-Messebau-Konfigurator
globs: "apps/frontend/**"
---

# R3F & 3D Standards (Messebau-Konfigurator)

## 1. React Three Fiber Guidelines & Performance-Regeln
- **WebGPU First:** Nutze den WebGPU-Renderer mit asynchroner Initialisierung ueber die `gl`-Prop (`gl={async (props) => ... }`).
- **TSL (Three Shader Language):** Schreibe Shader fuer benutzerdefinierte Materialien ausschliesslich in TSL (Node-Materials) fuer WebGPU und WebGL 2 Kompatibilitaet.
- **Draw Calls Limitieren:** Halte Draw Calls zwingend unter 100 pro Frame.
- **Instancing & Batching:** Fuer wiederkehrende identische Elemente (Stuehle, Stellwaende, Traversen) `InstancedMesh` nutzen. Fuer unterschiedliche Geometrien mit gleichem Material `BatchedMesh`.
- **On-Demand Rendering:** Fuer statische Szenen `<Canvas frameloop="demand">` setzen. Updates ueber `invalidate()` aus dem R3F-Store.
- **Asset-Kompression:** Messemodelle progressiv laden. Draco-Kompression fuer Geometrien, KTX2 (UASTC/ETC1S) fuer Texturen.

## 2. Transient vs Persistent State (Zustand-Patterns fuer 3D)
- **Persistent State:** Zustand-Selektoren (`useStore(state => state.value)`) NUR fuer UI-Elemente die React-Re-Render erfordern.
- **Transient State:** Schnelle 3D-Updates (Objekt-Dragging, Kamera-Fahrten) NIEMALS reaktiv an React-State binden.
- Innerhalb von `useFrame` den State direkt und nicht-reaktiv via `useStore.getState()` auslesen. Alternativ: `useStore.subscribe` fuer renderfreie Updates.

## 3. useFrame Best Practices
- **Kein setState:** Niemals React `setState` innerhalb von `useFrame` ausfuehren.
- **Direkte Mutation:** Three.js-Eigenschaften zwingend direkt ueber Refs mutieren (z.B. `meshRef.current.position.x += delta`).
- **GC-Pausen vermeiden:** NIEMALS neue Objekte (`new THREE.Vector3()`) innerhalb der Render-Schleife erstellen. Vektoren global oder via `useMemo` initialisieren, dann `.copy()` oder `.lerp()` verwenden.
- **Framerate-Unabhaengigkeit:** Immer den `delta`-Parameter fuer Animationen nutzen.

## 4. Memory Management (dispose)
- **Explizites Aufraeumen:** Three.js fuehrt keine automatische Garbage Collection fuer GPU-Ressourcen durch.
- In `useEffect`-Cleanup `.dispose()` fuer alle Geometrien, Materialien und Texturen aufrufen wenn Komponenten unmounted werden.
- **ImageBitmap Leaks:** GLTF-Texturen als `ImageBitmap` laden. Vor Dispose zwingend `texture.source.data.close?.()` aufrufen.
- Speicherlecks in der Entwicklung ueber `renderer.info.memory` ueberwachen.
