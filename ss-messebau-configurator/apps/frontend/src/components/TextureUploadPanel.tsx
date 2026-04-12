import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { TextureEntry, TextureCategory, TextureFit, WallDetailConfig } from "@ss/shared";
import { useConfigStore } from "../store/configStore";
import { runtimeApiDisabled, buildApiUrl } from "../lib/apiBase";

const categories: TextureCategory[] = ["wall", "floor", "banner", "generic"];
const aspectOptions: { value: TextureFit; label: string; description: string }[] = [
  { value: "cover", label: "Zuschneiden (Cover)", description: "bewahrt das Seitenverhaeltnis" },
  { value: "stretch", label: "Strecken", description: "passt sich exakt an, kann verzerren" },
];

export function TextureUploadPanel() {
  const patchModules = useConfigStore((s) => s.patchModules);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<TextureCategory>("wall");
  const [fit, setFit] = useState<TextureFit>("cover");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [library, setLibrary] = useState<TextureEntry[]>([]);

  const fetchLibrary = async () => {
    if (runtimeApiDisabled) return;
    try {
      const res = await fetch(buildApiUrl("/api/textures"));
      const json = await res.json();
      if (Array.isArray(json?.textures)) {
        setLibrary(json.textures as TextureEntry[]);
      }
    } catch {
      // optional backend
    }
  };

  useEffect(() => {
    void fetchLibrary();
  }, []);

  const applyTextureToScene = useCallback(
    (tex: TextureEntry) => {
      if (!tex?.url) return;
      if (tex.category === "floor") {
        patchModules({
          floor: {
            textureUrl: tex.url,
            textureFileName: tex.fileName ?? tex.name,
            textureFit: tex.fit ?? "cover",
          },
        });
        return;
      }
      if (tex.category === "wall") {
        const current = useConfigStore.getState().config.modules.wallsDetail ?? {};
        const patch: Partial<Record<string, WallDetailConfig>> = {};
        (["back", "left", "right"] as const).forEach((side) => {
          patch[side] = { ...(current?.[side] ?? {}), textureUrl: tex.url, textureFit: tex.fit ?? "cover" };
        });
        patchModules({ wallsDetail: patch });
      }
    },
    [patchModules]
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) {
      setError("Bitte eine Bilddatei waehlen.");
      return;
    }
    const ext = (file.name || "").toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? "";
    const allowed = new Set([".png", ".jpg", ".jpeg", ".webp"]);
    if (!allowed.has(ext)) {
      setError("Nur PNG / JPG / WebP sind erlaubt.");
      return;
    }
    const maxSizeBytes = 12 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      setError(`Datei ist zu gross (${(file.size / 1024 / 1024).toFixed(1)} MB, Limit 12 MB).`);
      return;
    }
    setBusy(true);
    setError(null);
    setStatus("Upload laeuft...");
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      if (name.trim()) body.append("name", name.trim());
      body.append("category", category);
      body.append("fit", fit);
      const endpoint = category === "banner" ? "/api/upload/banner" : "/api/uploadTexture";
      const res = await fetch(endpoint, { method: "POST", body });
      const json = await res.json().catch(() => ({}));
      const texture = (json?.texture as TextureEntry | undefined) ?? {
        id: json?.id ?? `${Date.now()}`,
        name: name.trim() || file.name || "Texture",
        category,
        url: json?.webpUrl ?? json?.url,
        width: json?.width,
        height: json?.height,
        size: json?.size,
        fit: (json?.fit as TextureFit | undefined) ?? fit,
        mipmaps: Array.isArray(json?.mipmaps) ? json.mipmaps : undefined,
        ktx2Url: json?.ktx2Url,
        format: json?.format,
      };
      if (!res.ok || !texture?.url) {
        throw new Error(json?.error || "Upload fehlgeschlagen");
      }
      const isBannerTexture = category === "banner";
      setStatus(
        isBannerTexture
          ? `Banner-Textur gespeichert: ${texture.name} (${texture.width ?? "?"}x${texture.height ?? "?"} px)`
          : `Texture "${texture.name}" gespeichert (${texture.url})`
      );
      setLibrary((prev) => [texture as TextureEntry, ...prev]);
      setFile(null);
      if (isBannerTexture) {
        const mipmaps = Array.isArray(texture.mipmaps) ? texture.mipmaps.filter(Boolean) : [];
        patchModules({
          trussBannerMipmaps: mipmaps.length ? mipmaps : texture.url ? [texture.url] : undefined,
          trussBannerWebpUrl: texture.url,
          trussBannerKtx2Url: texture.ktx2Url ?? undefined,
          trussBannerImageUrl: texture.url,
        });
      } else {
        applyTextureToScene(texture as TextureEntry);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload fehlgeschlagen";
      setError(msg);
      setStatus(null);
    } finally {
      setBusy(false);
    }
  };

  const applyBannerTexture = (tex: TextureEntry) => {
    const mipmaps = Array.isArray(tex.mipmaps) ? tex.mipmaps.filter(Boolean) : [];
    patchModules({
      trussBannerMipmaps: mipmaps.length ? mipmaps : tex.url ? [tex.url] : undefined,
      trussBannerWebpUrl: tex.url,
      trussBannerKtx2Url: tex.ktx2Url ?? undefined,
      trussBannerImageUrl: tex.url,
    });
    setStatus(`Banner-Textur angewendet: ${tex.name}`);
  };

  return (
    <div className="sidebar-section">
      <div className="sidebar-section-header">
        <span className="section-title">Texturen</span>
        <span className="section-sub">Wand / Boden / Banner</span>
      </div>
      <form className="form-grid" onSubmit={handleSubmit}>
        <label>
          Name
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. Beton hell" />
        </label>
        <label>
          Kategorie
          <select value={category} onChange={(e) => setCategory(e.target.value as TextureCategory)}>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </label>
        <label>
          Seitenverhaeltnis
          <select value={fit} onChange={(e) => setFit(e.target.value as TextureFit)}>
            {aspectOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label} ({opt.description})
              </option>
            ))}
          </select>
        </label>
        <label>
          Bilddatei (PNG/JPG)
          <input
            type="file"
            accept=".png,.jpg,.jpeg,image/png,image/jpeg"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <button className="btn-primary" type="submit" disabled={busy}>
          {busy ? "Lade..." : "Textur hochladen"}
        </button>
      </form>
      {status && (
        <div className="status-hint" role="status">
          {status}
        </div>
      )}
      {error && (
        <div className="status-hint" role="alert" style={{ background: "#fef2f2", color: "#b91c1c" }}>
          {error}
        </div>
      )}

      {library.length > 0 && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="sidebar-section-header">
            <span className="section-title">Library</span>
            <span className="section-sub">{library.length} Texturen</span>
          </div>
          <div className="preset-row" style={{ flexWrap: "wrap", gap: 8 }}>
            {library.slice(0, 6).map((tex) => (
              <div key={tex.id} className="catalog-card" style={{ minWidth: 200 }}>
                <strong>{tex.name}</strong>
                <div className="badge soft">{tex.category}</div>
                {tex.fit && <div className="badge muted">Fit: {tex.fit}</div>}
                <small>{tex.url}</small>
                {tex.width && tex.height ? <small>{`${tex.width}x${tex.height}px`}</small> : null}
                {tex.category === "banner" && (
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ marginTop: 6 }}
                    onClick={() => applyBannerTexture(tex)}
                  >
                    Banner nutzen
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default TextureUploadPanel;
