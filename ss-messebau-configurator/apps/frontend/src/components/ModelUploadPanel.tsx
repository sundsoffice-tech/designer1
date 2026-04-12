import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { CatalogEntry, LampModule } from "@ss/shared";
import { useConfigStore } from "../store/configStore";

type UploadResponse = {
  ok?: boolean;
  module?: CatalogEntry;
  url?: string;
  dimensions?: { width?: number; depth?: number; height?: number };
  error?: string;
  details?: string;
};

const toOptionalNumber = (value: string): number | undefined => {
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
};

const defaultSnapHint = "Snap-Punkte (JSON oder Zeilenweise x,y,z)";

export function ModelUploadPanel() {
  const config = useConfigStore((s) => s.config);
  const setConfig = useConfigStore((s) => s.setConfig);
  const refreshModuleCatalog = useConfigStore((s) => s.refreshModuleCatalog);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Custom 3D");
  const [price, setPrice] = useState("");
  const [clearance, setClearance] = useState("0.1");
  const [snapPoints, setSnapPoints] = useState("");
  const [weight, setWeight] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<(CatalogEntry)[]>([]);
  const [lastUploaded, setLastUploaded] = useState<CatalogEntry | null>(null);
  const [asLamp, setAsLamp] = useState(false);
  const [lampIntensity, setLampIntensity] = useState("1.2");
  const [lampColor, setLampColor] = useState("#ffffff");
  const [lampDistance, setLampDistance] = useState("8");
  const [lampAngle, setLampAngle] = useState("0.6");
  const [lampDecay, setLampDecay] = useState("2");
  const [lampSpot, setLampSpot] = useState(true);
  const [lampMount, setLampMount] = useState<"floor" | "truss" | "wall">("truss");
  const [lampWallSide, setLampWallSide] = useState<"back" | "left" | "right">("back");
  const [lampHeight, setLampHeight] = useState("3.5");

  const fetchCatalog = async () => {
    try {
      const res = await fetch("/api/models");
      const json = await res.json();
      if (Array.isArray(json?.models)) {
        setCatalog(json.models as CatalogEntry[]);
      }
    } catch {
      // ignore – backend optional
    }
  };

  useEffect(() => {
    void fetchCatalog();
  }, []);

  const placeOnStand = useCallback((module: CatalogEntry) => {
    const objects = config.modules.customObjects ?? [];
    const angle = objects.length * 1.1;
    const radius = Math.max(0.5, Math.min(config.width, config.depth) / 3);
    const pos = { x: Math.cos(angle) * radius * 0.6, z: Math.sin(angle) * radius * 0.6 };

    if (module.type === "lamp") {
      const lamps = config.modules.lamps ?? [];
      const lamp = module as LampModule;
      const mount = lamp.mount ?? "truss";
      const wallSide = lamp.wallSide ?? "back";
      const baseY =
        typeof lamp.heightFromFloor === "number"
          ? lamp.heightFromFloor
          : mount === "truss"
          ? (config.traverseHeight ?? config.modules.trussHeight ?? config.height + 0.5)
          : 2.8;
      const nextLamp = {
        id: `${lamp.id}-${Date.now().toString(36)}`,
        modelId: lamp.id,
        name: lamp.name,
        assetUrl: lamp.modelPath,
        mount,
        wallSide,
        position: { x: pos.x, z: pos.z, y: baseY },
        rotationY: 0,
        intensity: lamp.intensity ?? 1.2,
        color: lamp.color ?? "#ffffff",
        distance: lamp.distance ?? 8,
        angle: lamp.angle ?? 0.6,
        decay: lamp.decay ?? 2,
        spot: lamp.spot ?? true,
        footprint: { w: lamp.width, d: lamp.depth, h: lamp.height },
        clearance: lamp.clearance,
        snapPoints: lamp.attachmentPoints,
      };
      setConfig({ modules: { lamps: [...lamps, nextLamp] } });
      setStatus(`Lampe "${lamp.name}" auf Stand gelegt.`);
      return;
    }

    const next = {
      id: `${module.id}-${Date.now().toString(36)}`,
      templateId: module.id,
      modelId: module.id,
      name: module.name,
      assetUrl: module.modelPath,
      sourceFileName: module.sourceFileName,
      scale: 1,
      unitPrice: module.price,
      footprint: { w: module.width, d: module.depth, h: module.height },
      clearance: module.clearance,
      snapPoints: module.attachmentPoints,
      weight: module.weight,
      position: { x: pos.x, z: pos.z, y: 0 },
      rotationY: 0,
    };
    setConfig({ modules: { customObjects: [...objects, next] } });
    setStatus(`"${module.name}" auf Stand gelegt.`);
  }, [config.depth, config.modules.customObjects, config.width, setConfig]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) {
      setError("Bitte eine 3D-Datei (.glb/.gltf/.fbx) wählen.");
      return;
    }
    const ext = (file.name || "").toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? "";
    const allowedExt = new Set([".glb", ".gltf", ".fbx"]);
    if (!allowedExt.has(ext)) {
      setError("Nur .glb / .gltf / .fbx werden akzeptiert.");
      return;
    }
    const maxSizeBytes = 64 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      setError(`Datei ist zu gross (${(file.size / 1024 / 1024).toFixed(1)} MB, Limit 64 MB).`);
      return;
    }
    setBusy(true);
    setError(null);
    setStatus("Lade Modell hoch...");

    try {
      const body = new FormData();
      body.append("file", file);
      body.append("type", asLamp ? "lamp" : "custom");
      if (name.trim()) body.append("name", name.trim());
      if (category.trim()) body.append("category", category.trim());
      const priceNum = toOptionalNumber(price);
      if (priceNum !== undefined) body.append("price", String(priceNum));
      const clearanceNum = toOptionalNumber(clearance);
      if (clearanceNum !== undefined) body.append("clearance", String(clearanceNum));
      const weightNum = toOptionalNumber(weight);
      if (weightNum !== undefined) body.append("weight", String(weightNum));
      if (snapPoints.trim()) body.append("snapPoints", snapPoints.trim());
      if (asLamp) {
        const i = toOptionalNumber(lampIntensity);
        if (i !== undefined) body.append("intensity", String(i));
        const d = toOptionalNumber(lampDistance);
        if (d !== undefined) body.append("distance", String(d));
        const a = toOptionalNumber(lampAngle);
        if (a !== undefined) body.append("angle", String(a));
        const dec = toOptionalNumber(lampDecay);
        if (dec !== undefined) body.append("decay", String(dec));
        if (lampColor) body.append("color", lampColor);
        body.append("spot", String(lampSpot));
        body.append("mount", lampMount);
        body.append("wallSide", lampWallSide);
        const h = toOptionalNumber(lampHeight);
        if (h !== undefined) body.append("heightFromFloor", String(h));
      }

      const res = await fetch("/api/uploadModel", { method: "POST", body });
      const json: UploadResponse = await res.json().catch(() => ({}));
      if (!res.ok || !json?.module) {
        throw new Error(json?.error || json?.details || "Upload fehlgeschlagen");
      }
      setLastUploaded(json.module);
      void refreshModuleCatalog();
      setCatalog((prev) => {
        const filtered = prev.filter((item) => item.id !== json.module?.id);
        return [json.module as CatalogEntry, ...filtered];
      });
      setStatus(
        `Hochgeladen: ${json.module.name} (${json.dimensions?.width ?? "?"} x ${json.dimensions?.depth ?? "?"} m)`
      );
      setError(null);
      setFile(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload fehlgeschlagen";
      setError(message);
      setStatus(null);
    } finally {
      setBusy(false);
    }
  };

  const renderCatalog = useMemo(
    () =>
      catalog.slice(0, 8).map((item) => (
        <div key={item.id} className="catalog-card" style={{ minWidth: 240 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <strong>{item.name}</strong>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span className="badge">{item.type === "lamp" ? "Lampe" : "Custom"}</span>
                <span className="badge soft">{item.category || "Ohne Kategorie"}</span>
              </div>
            </div>
            <button type="button" className="btn-secondary" onClick={() => placeOnStand(item)}>
              Auf Stand legen
            </button>
          </div>
          <small>
            {item.width} × {item.depth} × {item.height ?? "?"} m
            {item.clearance ? ` • Clearance ${item.clearance} m` : ""}
          </small>
          {item.type === "lamp" && (
            <small>
              Licht: {item.intensity ?? "1"} | {item.color ?? "#fff"} | Mount {item.mount ?? "truss"}
            </small>
          )}
          {item.price != null && <small>Basispreis: {item.price} €</small>}
          <small>{item.modelPath}</small>
        </div>
      )),
    [catalog, placeOnStand]
  );

  return (
    <div className="sidebar-section">
      <div className="sidebar-section-header">
        <span className="section-title">3D-Modelle</span>
        <span className="section-sub">Upload & Katalog (Server)</span>
      </div>
      <p style={{ margin: "0 0 8px", lineHeight: 1.35 }}>
        Lade GLB/GLTF/FBX hoch, ermittle Bounding-Box serverseitig und erzeuge automatisch einen Modul-Eintrag. Nach dem
        Upload kannst du das Modell sofort auf dem Stand platzieren.
      </p>

      <form className="form-grid" onSubmit={handleSubmit}>
        <label>
          Name
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="z.B. Kundentisch"
            required
          />
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={asLamp} onChange={(e) => setAsLamp(e.target.checked)} />
          Als Lampe behandeln (mit Lichtquelle)
        </label>
        <label>
          Kategorie
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Möbel, Lampe ..."
          />
        </label>
        <label>
          Basispreis (€)
          <input
            type="number"
            value={price}
            step={10}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="optional"
          />
        </label>
        <label>
          Clearance (m)
          <input
            type="number"
            step={0.05}
            value={clearance}
            onChange={(e) => setClearance(e.target.value)}
            placeholder="0.1"
          />
        </label>
        <label>
          Snap-Punkte
          <textarea
            value={snapPoints}
            onChange={(e) => setSnapPoints(e.target.value)}
            placeholder={defaultSnapHint}
            rows={3}
          />
        </label>
        <label>
          Gewicht (kg)
          <input
            type="number"
            step={1}
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="optional"
          />
        </label>
        <label>
          3D-Datei (.glb/.gltf/.fbx)
          <input
            type="file"
            accept=".glb,.gltf,.fbx,model/gltf-binary,model/gltf+json"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        {asLamp && (
          <>
            <label>
              Licht-Intensität
              <input type="number" step={0.1} value={lampIntensity} onChange={(e) => setLampIntensity(e.target.value)} />
            </label>
            <label>
              Farbe (hex)
              <input type="color" value={lampColor} onChange={(e) => setLampColor(e.target.value)} />
            </label>
            <label>
              Reichweite (distance)
              <input type="number" step={0.5} value={lampDistance} onChange={(e) => setLampDistance(e.target.value)} />
            </label>
            <label>
              Abstrahlwinkel (rad)
              <input type="number" step={0.05} value={lampAngle} onChange={(e) => setLampAngle(e.target.value)} />
            </label>
            <label>
              Decay
              <input type="number" step={0.1} value={lampDecay} onChange={(e) => setLampDecay(e.target.value)} />
            </label>
            <label className="checkbox-row">
              <input type="checkbox" checked={lampSpot} onChange={(e) => setLampSpot(e.target.checked)} />
              SpotLight statt PointLight
            </label>
            <label>
              Montage
              <select value={lampMount} onChange={(e) => setLampMount(e.target.value as typeof lampMount)}>
                <option value="truss">Truss</option>
                <option value="wall">Wand</option>
                <option value="floor">Boden</option>
              </select>
            </label>
            {lampMount === "wall" && (
              <label>
                Wandseite
                <select value={lampWallSide} onChange={(e) => setLampWallSide(e.target.value as typeof lampWallSide)}>
                  <option value="back">Back</option>
                  <option value="left">Links</option>
                  <option value="right">Rechts</option>
                </select>
              </label>
            )}
            <label>
              Höhe ab Boden (m)
              <input type="number" step={0.1} value={lampHeight} onChange={(e) => setLampHeight(e.target.value)} />
            </label>
          </>
        )}
        <button className="btn-primary" type="submit" disabled={busy}>
          {busy ? "Lade..." : "Modell hochladen"}
        </button>
      </form>

      {status && <div className="status-hint" role="status">{status}</div>}
      {error && (
        <div className="status-hint" role="alert" style={{ background: "#fef2f2", color: "#b91c1c" }}>
          {error}
        </div>
      )}

      {lastUploaded && (
        <div className="catalog-card" style={{ marginTop: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <div>
              <strong>Zuletzt hochgeladen:</strong> {lastUploaded.name}
              <div style={{ fontSize: 12, color: "#6b7280" }}>{lastUploaded.modelPath}</div>
            </div>
            <button type="button" className="btn-secondary" onClick={() => placeOnStand(lastUploaded)}>
              Auf Stand legen
            </button>
          </div>
          <small>
            {lastUploaded.width} × {lastUploaded.depth}
            {lastUploaded.height ? ` × ${lastUploaded.height}` : ""} m · Clearance{" "}
            {lastUploaded.clearance ?? "0"}
          </small>
        </div>
      )}

      {catalog.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
          <div className="sidebar-section-header">
            <span className="section-title">Katalog (Server)</span>
            <span className="section-sub">{catalog.length} Modelle</span>
          </div>
          <div className="preset-row" style={{ flexWrap: "wrap", gap: 8 }}>
            {renderCatalog}
          </div>
        </div>
      )}
    </div>
  );
}

export default ModelUploadPanel;
