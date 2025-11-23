import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { useConfigStore } from "../store/configStore";
import {
  DEFAULT_OBJECT_TEMPLATES,
  templateToCounterConfig,
  templateToCustomObject,
  templateToScreenConfig,
  useObjectCatalogStore,
  type ObjectKind,
  type ObjectTemplate,
} from "../store/objectCatalogStore";
import type { CounterVariant, ScreenSize, WallSide } from "../lib/pricing";
import { COUNTER_DIMENSIONS, DEFAULT_SCREEN_SIZE, SCREEN_DIMENSIONS } from "../config/objectDimensions";

const CATEGORY_DATALIST_ID = "catalog-category-options";
const DEFAULT_CATEGORY = "Custom 3D";
const CATEGORY_PRESETS = [
  DEFAULT_CATEGORY,
  "Tresen - Gerade",
  "Tresen - Premium",
  "Tresen - Eck",
  "Screens - Wand",
  "Screens - Boden",
  "Screens - Truss",
  "Banner / Grafik",
  "Beleuchtung",
  "Moebel",
  "Deko",
  "Prospekt",
  "Truss / Rigging",
];

type Draft = {
  name: string;
  kind: ObjectKind;
  variant: CounterVariant;
  price?: number;
  category: string;
  assetDataUrl?: string;
  assetFileName?: string;
  scale: number;
  footprintW?: number;
  footprintD?: number;
  footprintH?: number;
  width: number;
  depth: number;
  height?: number;
  thickness?: number;
  withPower: boolean;
  screenSize: ScreenSize;
  mount: "wall" | "truss" | "floor";
  wallSide: WallSide;
  heightFromFloor: number;
};

type ImportCandidate = {
  dataUrl: string;
  fileName: string;
  derivedName: string;
  dimensions?: { width: number; depth: number; height: number };
};

const counterDefaults = COUNTER_DIMENSIONS.basic;
const defaultScreenDims = SCREEN_DIMENSIONS[DEFAULT_SCREEN_SIZE];

const defaultDraft: Draft = {
  name: "",
  kind: "counter",
  variant: "basic",
  price: undefined,
  category: "",
  assetDataUrl: undefined,
  assetFileName: undefined,
  scale: 1,
  footprintW: undefined,
  footprintD: undefined,
  footprintH: undefined,
  width: counterDefaults.w,
  depth: counterDefaults.d,
  height: counterDefaults.h,
  thickness: defaultScreenDims.t,
  withPower: true,
  screenSize: DEFAULT_SCREEN_SIZE,
  mount: "wall",
  wallSide: "back",
  heightFromFloor: 1.6,
};

const templateToDraft = (tpl: ObjectTemplate): Draft => ({
  name: tpl.name ?? "",
  kind: tpl.kind,
  variant: tpl.variant ?? "basic",
  price: tpl.price,
  category: tpl.category ?? "",
  assetDataUrl: tpl.assetDataUrl,
  assetFileName: tpl.assetFileName,
  scale: tpl.defaultScale ?? 1,
  footprintW: tpl.footprint?.width,
  footprintD: tpl.footprint?.depth,
  footprintH: tpl.footprint?.height,
  width: tpl.dimensions?.width ?? defaultDraft.width,
  depth: tpl.dimensions?.depth ?? defaultDraft.depth,
  height: tpl.dimensions?.height,
  thickness: tpl.dimensions?.thickness,
  withPower: tpl.defaults?.withPower ?? defaultDraft.withPower,
  screenSize: tpl.screenSize ?? defaultDraft.screenSize,
  mount: tpl.defaults?.mount ?? defaultDraft.mount,
  wallSide: tpl.defaults?.wallSide ?? defaultDraft.wallSide,
  heightFromFloor: tpl.defaults?.heightFromFloor ?? defaultDraft.heightFromFloor,
});

const toNumber = (val: string, fallback: number | undefined) => {
  const num = Number(val);
  return Number.isFinite(num) ? num : fallback;
};

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const normalizeCategory = (value?: string) => {
  const trimmed = value?.trim().replace(/\s+/g, " ");
  return trimmed && trimmed.length > 0 ? trimmed : "Ohne Kategorie";
};
const categoryKey = (value?: string) => normalizeCategory(value).toLowerCase();

const slugifyName = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const labelFromFileName = (value: string) =>
  value.replace(/\.(glb|gltf)$/i, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();

const measureGltfFile = async (file: File) => {
  const loader = new GLTFLoader();
  const url = URL.createObjectURL(file);

  return new Promise<{ width: number; depth: number; height: number }>((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        try {
          const box = new THREE.Box3().setFromObject(gltf.scene);
          const size = new THREE.Vector3();
          box.getSize(size);
          URL.revokeObjectURL(url);
          resolve({
            width: Number(size.x.toFixed(3)),
            depth: Number(size.z.toFixed(3)),
            height: Number(size.y.toFixed(3)),
          });
        } catch (err) {
          URL.revokeObjectURL(url);
          reject(err);
        }
      },
      undefined,
      (err) => {
        URL.revokeObjectURL(url);
        reject(err);
      }
    );
  });
};

export default function ObjectCatalogAdmin() {
  const config = useConfigStore((s) => s.config);
  const setConfig = useConfigStore((s) => s.setConfig);
  const {
    templates,
    addTemplate,
    updateTemplate,
    removeTemplate,
    resetToDefaults,
  } = useObjectCatalogStore();

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(defaultDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [quickImport, setQuickImport] = useState<ImportCandidate | null>(null);
  const [quickName, setQuickName] = useState<string>("");
  const [quickCategory, setQuickCategory] = useState<string>(DEFAULT_CATEGORY);
  const [quickScale, setQuickScale] = useState<number>(1);
  const [quickPrice, setQuickPrice] = useState<number | undefined>(undefined);
  const [quickTargetId, setQuickTargetId] = useState<string>("new");
  const [placeAfterImport, setPlaceAfterImport] = useState<boolean>(true);
  const [importBusy, setImportBusy] = useState<boolean>(false);
  const [dragActive, setDragActive] = useState<boolean>(false);

  const templateList = useMemo(
    () => Object.values(templates ?? {}).sort((a, b) => a.name.localeCompare(b.name)),
    [templates]
  );
  const customTemplates = useMemo(() => templateList.filter((tpl) => tpl.kind === "custom"), [templateList]);
  const editingTemplate = editingId ? templates[editingId] : undefined;
  const isEditing = Boolean(editingId);
  const categoryOptions = useMemo(() => {
    const categories = new Map<string, string>();
    CATEGORY_PRESETS.forEach((label) => categories.set(categoryKey(label), label));
    templateList.forEach((tpl) => {
      const label = normalizeCategory(tpl.category);
      categories.set(categoryKey(label), label);
    });
    return Array.from(categories.entries())
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([key, label]) => ({ key, label }));
  }, [templateList]);
  const filteredTemplates = useMemo(
    () =>
      templateList.filter((tpl) =>
        categoryFilter === "all" ? true : categoryKey(tpl.category) === categoryFilter
      ),
    [templateList, categoryFilter]
  );
  const activeFilterLabel =
    categoryFilter === "all"
      ? undefined
      : categoryOptions.find((opt) => opt.key === categoryFilter)?.label ?? categoryFilter;

  useEffect(() => {
    if (categoryFilter !== "all" && !categoryOptions.some((opt) => opt.key === categoryFilter)) {
      setCategoryFilter("all");
    }
  }, [categoryFilter, categoryOptions]);
  const scaledQuickDims = useMemo(
    () =>
      quickImport?.dimensions
        ? {
            width: Number((quickImport.dimensions.width * quickScale).toFixed(3)),
            depth: Number((quickImport.dimensions.depth * quickScale).toFixed(3)),
            height: quickImport.dimensions.height
              ? Number((quickImport.dimensions.height * quickScale).toFixed(3))
              : undefined,
          }
        : undefined,
    [quickImport, quickScale]
  );

  useEffect(() => {
    if (templateList.length === 0) {
      DEFAULT_OBJECT_TEMPLATES.forEach((tpl) => addTemplate(tpl));
    }
  }, [templateList.length, addTemplate]);

  const resetDraft = (keepCategory = false) => {
    setDraft((prev) => ({ ...defaultDraft, category: keepCategory ? prev.category : defaultDraft.category }));
    setEditingId(null);
  };

  const startEdit = (tpl: ObjectTemplate) => {
    setOpen(true);
    setEditingId(tpl.id);
    setDraft(templateToDraft(tpl));
    setStatus(`Bearbeite "${tpl.name}"`);
  };

  const handleDraftFile = async (file: File) => {
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setDraft((d) => ({
        ...d,
        assetDataUrl: dataUrl,
        assetFileName: file.name,
      }));
      setStatus(`3D-Datei geladen: ${file.name}`);
    } catch (err) {
      console.error(err);
      alert("3D-Datei konnte nicht gelesen werden.");
    }
  };

  const replaceTemplateAsset = async (tplId: string, file: File) => {
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const target = templates[tplId];
      updateTemplate(tplId, {
        assetDataUrl: dataUrl,
        assetFileName: file.name,
      });
      if (editingId === tplId) {
        setDraft((d) => ({ ...d, assetDataUrl: dataUrl, assetFileName: file.name }));
      }
      setStatus(`3D-Datei aktualisiert${target?.name ? ` (${target.name})` : ""}`);
    } catch (err) {
      console.error(err);
      alert("3D-Datei konnte nicht gelesen werden.");
    }
  };

  const resetQuickImport = (keepCategory = true) => {
    setQuickImport(null);
    setQuickName("");
    if (!keepCategory) {
      setQuickCategory(DEFAULT_CATEGORY);
    }
    setQuickScale(1);
    setQuickPrice(undefined);
    setQuickTargetId("new");
    setPlaceAfterImport(true);
    setDragActive(false);
  };

  const handleQuickFile = async (file: File) => {
    if (importBusy) return;
    setImportBusy(true);
    try {
      const [dataUrl, measured] = await Promise.all([
        readFileAsDataUrl(file),
        measureGltfFile(file).catch(() => null),
      ]);

      const derivedName = labelFromFileName(file.name) || "Custom 3D Objekt";
      const candidate: ImportCandidate = {
        dataUrl,
        fileName: file.name,
        derivedName,
        dimensions: measured ?? undefined,
      };

      setQuickImport(candidate);
      setQuickName((prev) => (prev.trim() ? prev : derivedName));
      setQuickCategory((prev) => prev || DEFAULT_CATEGORY);
      setDraft((d) => ({
        ...d,
        kind: "custom",
        assetDataUrl: dataUrl,
        assetFileName: file.name,
        scale: quickScale,
        width: measured?.width ?? d.width,
        depth: measured?.depth ?? d.depth,
        height: measured?.height ?? d.height,
        footprintW: measured?.width ?? d.footprintW,
        footprintD: measured?.depth ?? d.footprintD,
        footprintH: measured?.height ?? d.footprintH,
      }));

      const dimMsg = measured
        ? ` | Maße erkannt: ${measured.width} x ${measured.depth}${measured.height ? ` x ${measured.height}` : ""} m`
        : "";
      setStatus(`3D-Datei geladen (${file.name})${dimMsg}`);
    } catch (err) {
      console.error(err);
      setQuickImport(null);
      setStatus("3D-Datei konnte nicht geladen oder gelesen werden.");
    } finally {
      setImportBusy(false);
      setDragActive(false);
    }
  };

  const commitQuickImport = () => {
    if (!quickImport?.dataUrl) {
      setStatus("Bitte zuerst eine GLB/GLTF-Datei in den Import-Bereich ziehen.");
      return;
    }

    const target = quickTargetId !== "new" ? templates[quickTargetId] : undefined;
    const baseName = quickName.trim() || quickImport.derivedName || target?.name || "Custom 3D Objekt";
    const resolvedCategoryRaw =
      (quickCategory && quickCategory.trim()) || target?.category || DEFAULT_CATEGORY;
    const resolvedCategory = normalizeCategory(resolvedCategoryRaw);
    const footprint =
      quickImport.dimensions
        ? {
            width: quickImport.dimensions.width,
            depth: quickImport.dimensions.depth,
            height: quickImport.dimensions.height,
          }
        : target?.footprint
        ? { ...target.footprint }
        : undefined;

    const dimensions = scaledQuickDims ?? target?.dimensions;

    const payload: Omit<ObjectTemplate, "id"> = {
      name: baseName,
      kind: "custom",
      category: resolvedCategory || undefined,
      price: quickPrice ?? target?.price,
      assetDataUrl: quickImport.dataUrl,
      assetFileName: quickImport.fileName,
      defaultScale: quickScale || 1,
      footprint,
      dimensions,
      metadata: { source: "upload", file: quickImport.fileName },
    };

    if (target) {
      updateTemplate(target.id, payload);
      if (placeAfterImport) {
        applyTemplateToStand(target.id);
      }
      setStatus(
        `3D-Datei in "${baseName}" aktualisiert${placeAfterImport ? " und auf Stand gelegt" : ""}.`
      );
      setQuickCategory(resolvedCategory);
      return;
    }

    const created = addTemplate({
      ...payload,
      id: `${slugifyName(baseName) || "custom"}-${Date.now().toString(36)}`,
    });

    if (placeAfterImport) {
      applyTemplateToStand(created.id);
    }
    setStatus(`"${created.name}" importiert${placeAfterImport ? " und platziert" : ""}.`);
    setQuickCategory(resolvedCategory);
    resetQuickImport(true);
  };

  const storeTemplate = () => {
    if (!draft.name.trim()) {
      setStatus("Name fehlt");
      return;
    }
    if (draft.kind === "custom" && !draft.assetDataUrl) {
      alert("Bitte zuerst eine 3D-Datei (GLB/GLTF) laden oder ersetzen.");
      return;
    }

    const dimensions =
      draft.kind === "screen"
        ? {
            width: draft.width,
            depth: draft.thickness ?? draft.depth,
            height: draft.height,
            thickness: draft.thickness,
          }
        : {
            width: draft.width,
            depth: draft.depth,
            height: draft.height,
          };

    const footprint =
      draft.kind === "custom"
        ? {
            width: draft.footprintW || undefined,
            depth: draft.footprintD || undefined,
            height: draft.footprintH || undefined,
          }
        : undefined;

    const payload = {
      name: draft.name.trim(),
      kind: draft.kind,
      price: draft.price,
      assetDataUrl: draft.assetDataUrl,
      assetFileName: draft.assetFileName,
      defaultScale: draft.scale || 1,
      footprint,
      category: draft.category.trim() ? draft.category.trim() : undefined,
      variant: draft.kind === "counter" ? draft.variant : undefined,
      screenSize: draft.kind === "screen" ? draft.screenSize : undefined,
      dimensions,
      defaults: {
        withPower: draft.kind === "counter" ? draft.withPower : undefined,
        mount: draft.kind === "screen" ? draft.mount : undefined,
        wallSide: draft.kind === "screen" ? draft.wallSide : undefined,
        heightFromFloor: draft.kind === "screen" ? draft.heightFromFloor : undefined,
      },
    };

    if (editingId) {
      updateTemplate(editingId, payload);
      setStatus(`"${draft.name.trim()}" aktualisiert`);
    } else {
      const created = addTemplate(payload);
      setStatus(`"${created.name}" gespeichert`);
    }

    resetDraft(true);
  };

  const applyTemplateToStand = (templateId: string) => {
    const tpl = templates[templateId];
    if (!tpl) return;

    if (tpl.kind === "counter") {
      const counters = config.modules.countersDetailed ?? [];
      const spacing = Math.max(tpl.dimensions?.width ?? 1, 1) + 0.25;
      const x = -config.width / 2 + spacing * (counters.length + 1);
      const z = config.depth / 2 - 0.6;
      const counterCfg = templateToCounterConfig(tpl, { x, z });

      setConfig({
        modules: {
          countersDetailed: [...counters, counterCfg],
          counters: 0,
        } as any,
      });
      return;
    }

    if (tpl.kind === "custom") {
      if (!tpl.assetDataUrl) {
        alert("Keine 3D-Datei hinterlegt. Bitte im Admin-Formular laden.");
        return;
      }
      const customObjects = (config.modules as any).customObjects ?? [];
      const radius = Math.max(0.5, Math.min(config.width, config.depth) / 3);
      const angle = customObjects.length * 1.2;
      const x = Math.cos(angle) * radius * 0.6;
      const z = Math.sin(angle) * radius * 0.6;
      const customCfg = templateToCustomObject(tpl, { x, z });

      setConfig({
        modules: {
          customObjects: [...customObjects, customCfg],
        } as any,
      });
      return;
    }

    if (tpl.kind === "screen") {
      const screens = config.modules.detailedScreens ?? [];
      const side = tpl.defaults?.wallSide ?? "back";
      const countOnSide = screens.filter((s) => (s.wallSide ?? "back") === side).length;
      const isBack = side === "back";
      const isLeft = side === "left";
      const spacing = (isBack ? config.width : config.depth) / (countOnSide + 2);
      const x =
        side === "right"
          ? config.width / 2 - 0.08
          : side === "left"
          ? -config.width / 2 + 0.08
          : -config.width / 2 + spacing * (countOnSide + 1);
      const z =
        isBack
          ? -config.depth / 2 + 0.12
          : isLeft
          ? -config.depth / 2 + spacing * (countOnSide + 1)
          : config.depth / 2 - 0.12;

      const screenCfg = templateToScreenConfig(tpl, { x, z });
      setConfig({
        modules: {
          detailedScreens: [...screens, screenCfg],
          screens: 0,
        } as any,
      });
    }
  };

  const updatePrice = (id: string, price?: number) => {
    updateTemplate(id, { price });
  };

  const updateCategory = (id: string, category?: string) => {
    const normalized = category?.trim();
    updateTemplate(id, { category: normalized || undefined });
  };

  return (
    <div className="sidebar-section">
      <div className="sidebar-section-header">
        <span className="section-title">Objekt-Katalog (Admin)</span>
        <span className="section-sub">Tresen, Screens & mehr</span>
      </div>
      <p style={{ margin: "0 0 8px", lineHeight: 1.35 }}>
        Erweiterbarer Katalog f\u00fcr wiederverwendbare Objekte. Admins k\u00f6nnen
        Vorlagen inkl. Ma\u00dfe & Preis pflegen, eigene GLB/GLTF-Dateien einbetten
        und direkt auf den Stand legen.
      </p>

      <div className="admin-hint">
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <strong>Admin-Modus aktiv</strong>
          <small>Vorlagen anlegen oder anpassen. 3D-Dateien (GLB/GLTF) bleiben im Browser-Speicher.</small>
        </div>
        <span className={`badge ${isEditing ? "" : "soft"}`}>
          {isEditing ? `Bearbeitung: ${editingTemplate?.name ?? editingId}` : "Neu anlegen"}
        </span>
      </div>

      {status && (
        <div className="status-hint">
          {status}
        </div>
      )}

      <datalist id={CATEGORY_DATALIST_ID}>
        {categoryOptions.map((cat) => (
          <option key={cat.key} value={cat.label} />
        ))}
      </datalist>

      <div className="catalog-card quick-import-card">
        <div className="quick-import-header">
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <strong>Eigenes 3D-Objekt</strong>
            <small>GLB/GLTF laden, Maße erkennen und direkt als Custom nutzen.</small>
          </div>
          <span className="badge soft">3D-Import</span>
        </div>
        <div
          className={`dropzone ${dragActive ? "drag-active" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={async (e) => {
            e.preventDefault();
            setDragActive(false);
            const file = e.dataTransfer?.files?.[0];
            if (file) {
              await handleQuickFile(file);
            }
          }}
        >
          <p style={{ margin: "0 0 6px" }}>
            GLB/GLTF hier ablegen oder{" "}
            <label htmlFor="quick-import-file" style={{ color: "#1d4ed8", cursor: "pointer", fontWeight: 600 }}>
              Datei wählen
            </label>
          </p>
          <input
            id="quick-import-file"
            type="file"
            accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
            style={{ display: "none" }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) {
                await handleQuickFile(file);
              }
              e.target.value = "";
            }}
          />
          <small>
            Datei bleibt lokal im Browser. Wir lesen die Bounding-Box aus, um Maße & Kollisionen zu verbessern.
          </small>
          {importBusy && (
            <div className="status-hint" style={{ marginTop: 6 }}>
              Analysiere 3D-Datei...
            </div>
          )}
          {quickImport && !importBusy && (
            <div className="status-hint" style={{ marginTop: 6 }}>
              Geladen: {quickImport.fileName}{" "}
              {quickImport.dimensions ? (
                <span>
                  ({quickImport.dimensions.width} x {quickImport.dimensions.depth}
                  {quickImport.dimensions.height ? ` x ${quickImport.dimensions.height}` : ""} m, unskaliert)
                </span>
              ) : (
                "(ohne erkannte Maße)"
              )}
            </div>
          )}
        </div>

        <div className="form-grid" style={{ marginTop: 10 }}>
          <p id="quick-import-hint" className="visually-hidden">
            Name, Kategorie, Scale und Ziel bestimmen die neue Vorlage. Alle Felder lassen sich per Tastatur bedienen.
          </p>
          <label htmlFor="quick-name">
            Name
            <input
              id="quick-name"
              type="text"
              value={quickName || quickImport?.derivedName || ""}
              onChange={(e) => setQuickName(e.target.value)}
              placeholder="z.B. Prospektstaender GLB"
              aria-describedby="quick-import-hint"
            />
          </label>
          <label htmlFor="quick-category">
            Kategorie
            <input
              id="quick-category"
              type="text"
              list={CATEGORY_DATALIST_ID}
              value={quickCategory}
              onChange={(e) => setQuickCategory(e.target.value)}
              placeholder={DEFAULT_CATEGORY}
              aria-describedby="quick-import-hint"
            />
          </label>
          <label htmlFor="quick-scale">
            Scale
            <input
              id="quick-scale"
              type="number"
              step={0.05}
              min={0.05}
              value={quickScale}
              onChange={(e) => setQuickScale(toNumber(e.target.value, quickScale) ?? 1)}
              placeholder="1 = Original"
              aria-describedby="quick-import-hint"
            />
          </label>
          <label htmlFor="quick-price">
            Preis / Objekt (EUR)
            <input
              id="quick-price"
              type="number"
              step={10}
              value={quickPrice ?? ""}
              onChange={(e) => setQuickPrice(toNumber(e.target.value, undefined))}
              placeholder="optional"
              aria-describedby="quick-import-hint"
            />
          </label>
          <label htmlFor="quick-target">
            Ziel
            <select
              id="quick-target"
              value={quickTargetId}
              onChange={(e) => setQuickTargetId(e.target.value)}
              aria-describedby="quick-import-hint"
            >
              <option value="new">Neue Custom-Vorlage anlegen</option>
              {customTemplates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  Vorlage aktualisieren: {tpl.name}
                </option>
              ))}
            </select>
          </label>
          <label className="checkbox-row" htmlFor="quick-place">
            <input
              id="quick-place"
              type="checkbox"
              checked={placeAfterImport}
              onChange={(e) => setPlaceAfterImport(e.target.checked)}
              aria-describedby="quick-import-hint"
            />
            Direkt auf aktuellen Stand legen
          </label>
        </div>

        

        {scaledQuickDims && (
          <div className="quick-import-meta">
            <small>
              Endmaß mit Scale {quickScale}: {scaledQuickDims.width} x {scaledQuickDims.depth}
              {scaledQuickDims.height ? ` x ${scaledQuickDims.height}` : ""} m
            </small>
            {quickImport?.dimensions && (
              <small>
                Footprint (ohne Scale): {quickImport.dimensions.width} x {quickImport.dimensions.depth}
                {quickImport.dimensions.height ? ` x ${quickImport.dimensions.height}` : ""} m
              </small>
            )}
          </div>
        )}

        <div className="catalog-inline-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={commitQuickImport}
            disabled={!quickImport || importBusy}
          >
            3D-Objekt übernehmen
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => resetQuickImport(false)}
            disabled={importBusy}
          >
            Zurücksetzen
          </button>
        </div>
      </div>

      <button
        className="btn-secondary"
        style={{ width: "100%", marginBottom: 8 }}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Admin-Eingaben verstecken" : "Admin-Eingaben anzeigen"}
      </button>

      {open && (
        <div className="form-grid" style={{ marginBottom: 8 }}>
          {isEditing && (
            <div className="status-hint" style={{ gridColumn: "1 / span 2" }}>
              Du bearbeitest: {editingTemplate?.name ?? editingId}
            </div>
          )}
          <label>
            Name
            <input
              type="text"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="z.B. Premium Tresen 1.4m"
            />
          </label>
          <label>
            Typ
            <select
              value={draft.kind}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  kind: e.target.value as ObjectKind,
                }))
              }
            >
              <option value="counter">Counter / Tresen</option>
              <option value="screen">Screen</option>
              <option value="custom">Custom 3D (GLB/GLTF)</option>
            </select>
          </label>
          <label>
            Kategorie
            <input
              type="text"
              list={CATEGORY_DATALIST_ID}
              value={draft.category}
              onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
              placeholder="z.B. Tresen - Premium"
            />
          </label>
          {draft.kind === "custom" && (
            <>
              <label>
                3D-Datei (GLB oder GLTF)
                <input
                  type="file"
                  accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    await handleDraftFile(file);
                    e.target.value = "";
                  }}
                />
                <small style={{ fontSize: 10, color: "#6b7280" }}>
                  Datei wird nicht hochgeladen, sondern lokal (Browser/LocalStorage) gespeichert. Neue Dateien ersetzen
                  vorhandene GLB/GLTF-Assets.
                </small>
                {draft.assetFileName && (
                  <small style={{ display: "block", color: "#111827" }}>
                    Aktuell hinterlegt: {draft.assetFileName}
                  </small>
                )}
              </label>
              <label>
                Modell-Scale
                <input
                  type="number"
                  step={0.1}
                  min={0.05}
                  value={draft.scale}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, scale: toNumber(e.target.value, d.scale) ?? 1 }))
                  }
                  placeholder="1 = Originalgroesse"
                />
              </label>
              <label>
                Standflaeche Breite (m)
                <input
                  type="number"
                  step={0.05}
                  value={draft.footprintW ?? ""}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, footprintW: toNumber(e.target.value, undefined) }))
                  }
                  placeholder="optional, default 1 m"
                />
              </label>
              <label>
                Standflaeche Tiefe (m)
                <input
                  type="number"
                  step={0.05}
                  value={draft.footprintD ?? ""}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, footprintD: toNumber(e.target.value, undefined) }))
                  }
                  placeholder="optional, default 1 m"
                />
              </label>
              <label>
                Standflaeche Hoehe (m)
                <input
                  type="number"
                  step={0.05}
                  value={draft.footprintH ?? ""}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, footprintH: toNumber(e.target.value, undefined) }))
                  }
                  placeholder="optional"
                />
              </label>
            </>
          )}
          {draft.kind === "counter" && (
            <>
              <label>
                Variante
                <select
                  value={draft.variant}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      variant: e.target.value as CounterVariant,
                    }))
                  }
                >
                  <option value="basic">Basic</option>
                  <option value="premium">Premium</option>
                  <option value="corner">Eck</option>
                </select>
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={draft.withPower}
                  onChange={(e) => setDraft((d) => ({ ...d, withPower: e.target.checked }))}
                />
                Mit Strompaket
              </label>
            </>
          )}
          {draft.kind === "screen" && (
            <>
              <label>
                Montage
                <select
                  value={draft.mount}
                  onChange={(e) => setDraft((d) => ({ ...d, mount: e.target.value as Draft["mount"] }))}
                >
                  <option value="wall">Wand</option>
                  <option value="floor">Bodenstativ</option>
                  <option value="truss">Truss</option>
                </select>
              </label>
              <label>
                Wandseite
                <select
                  value={draft.wallSide}
                  onChange={(e) => setDraft((d) => ({ ...d, wallSide: e.target.value as WallSide }))}
                >
                  <option value="back">Back</option>
                  <option value="left">Links</option>
                  <option value="right">Rechts</option>
                </select>
              </label>
              <label>
                Screen-Size (Preisfaktor)
                <select
                  value={draft.screenSize}
                  onChange={(e) => setDraft((d) => ({ ...d, screenSize: e.target.value as ScreenSize }))}
                >
                  <option value="55">55"</option>
                  <option value="65">65"</option>
                  <option value="75">75"</option>
                </select>
              </label>
              <label>
                H\u00f6he ab Boden (m)
                <input
                  type="number"
                  step={0.1}
                  value={draft.heightFromFloor}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, heightFromFloor: toNumber(e.target.value, 1.6) ?? 1.6 }))
                  }
                />
              </label>
            </>
          )}
          <label>
            Breite (m)
            <input
              type="number"
              step={0.1}
              value={draft.width}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  width: toNumber(e.target.value, prev.width) ?? prev.width ?? 1,
                }))
              }
            />
          </label>
          <label>
            Tiefe (m)
            <input
              type="number"
              step={0.1}
              value={draft.depth}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  depth: toNumber(e.target.value, prev.depth) ?? prev.depth ?? 0.6,
                }))
              }
            />
          </label>
          <label>
            H\u00f6he (m)
            <input
              type="number"
              step={0.05}
              value={draft.height ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, height: toNumber(e.target.value, undefined) }))}
              placeholder="optional"
            />
          </label>
          {draft.kind === "screen" && (
            <label>
              Screen-Tiefe (m)
              <input
                type="number"
                step={0.02}
                value={draft.thickness ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, thickness: toNumber(e.target.value, undefined) }))}
                placeholder="optional"
              />
            </label>
          )}
          <label>
            Preis / Objekt (EUR)
            <input
              type="number"
              step={10}
              value={draft.price ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, price: toNumber(e.target.value, undefined) }))}
              placeholder="z.B. 320"
            />
          </label>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <button type="button" className="btn-primary" onClick={storeTemplate} style={{ flex: 1 }}>
              {isEditing ? "Vorlage aktualisieren" : "Vorlage speichern"}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => resetDraft()}
              style={{ flexShrink: 0 }}
            >
              {isEditing ? "Bearbeitung abbrechen" : "Felder leeren"}
            </button>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              resetToDefaults();
              resetDraft();
              setStatus("Standard-Templates geladen");
            }}
            style={{ gridColumn: "1 / span 2" }}
          >
            Reset auf Standard-Templates
          </button>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 8, flexWrap: "wrap" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 200 }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>Kategorie-Filter</span>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="all">Alle Kategorien ({templateList.length})</option>
            {categoryOptions.map((cat) => (
              <option key={cat.key} value={cat.key}>
                {cat.label}
              </option>
            ))}
          </select>
        </label>
        <div style={{ fontSize: 12, color: "#6b7280" }}>
          {categoryFilter === "all"
            ? "Zeigt alle Vorlagen nach Name sortiert"
            : `Filter: ${activeFilterLabel ?? categoryFilter} (${filteredTemplates.length}/${templateList.length})`}
        </div>
      </div>

      <div className="preset-row" style={{ flexWrap: "wrap", gap: 8 }}>
        {filteredTemplates.length === 0 && (
          <div className="catalog-card" style={{ minWidth: 240 }}>
            <strong>Keine Vorlagen</strong>
            <small>In dieser Kategorie existiert noch kein Objekt.</small>
          </div>
        )}
        {filteredTemplates.map((tpl) => {
          const fileInputId = `tpl-asset-${tpl.id}`;
          return (
            <div key={tpl.id} className="catalog-card" style={{ minWidth: 240 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <strong>{tpl.name}</strong>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <span className="badge">{tpl.kind}</span>
                    <span className="badge soft">{normalizeCategory(tpl.category)}</span>
                  </div>
                </div>
              </div>
              {tpl.description && (
                <small style={{ lineHeight: 1.3 }}>
                  {tpl.description}
                </small>
              )}
              <small>
                {tpl.dimensions?.width ?? "?"} x {tpl.dimensions?.depth ?? "?"} m{" "}
                {tpl.dimensions?.height ? ` / h ${tpl.dimensions?.height} m` : ""}
              </small>
              {tpl.kind === "custom" && (
                <small style={{ color: tpl.assetDataUrl ? "#15803d" : "#b91c1c" }}>
                  {tpl.assetDataUrl
                    ? `3D-File: ${tpl.assetFileName || "GLB/GLTF hinterlegt"} (Scale ${tpl.defaultScale ?? 1})`
                    : "Kein 3D-File hinterlegt"}
                </small>
              )}
              {tpl.price != null && <small>Preis je Objekt: {tpl.price} EUR</small>}
              <div className="catalog-inline-actions">
                <button type="button" className="btn-secondary" onClick={() => startEdit(tpl)}>
                  Bearbeiten
                </button>
                {tpl.kind === "custom" && (
                  <>
                    <input
                      id={fileInputId}
                      type="file"
                      accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
                      style={{ display: "none" }}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        await replaceTemplateAsset(tpl.id, file);
                        e.target.value = "";
                      }}
                    />
                    <label className="btn-secondary" htmlFor={fileInputId}>
                      3D-Datei ersetzen
                    </label>
                  </>
                )}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  type="number"
                  step={10}
                  value={tpl.price ?? ""}
                  onChange={(e) => updatePrice(tpl.id, toNumber(e.target.value, undefined))}
                  placeholder="Preis"
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => applyTemplateToStand(tpl.id)}
                  disabled={tpl.kind === "custom" && !tpl.assetDataUrl}
                  title={tpl.kind === "custom" && !tpl.assetDataUrl ? "Bitte zunaechst ein GLB/GLTF laden" : undefined}
                >
                  Auf Stand legen
                </button>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  type="text"
                  list={CATEGORY_DATALIST_ID}
                  value={tpl.category ?? ""}
                  onChange={(e) => updateCategory(tpl.id, e.target.value)}
                placeholder="Kategorie zuordnen"
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  removeTemplate(tpl.id);
                  if (editingId === tpl.id) {
                    resetDraft();
                    setStatus("Vorlage entfernt");
                  }
                }}
              >
                L\u00f6schen
              </button>
            </div>
          </div>
        );
        })}
      </div>
    </div>
  );
}
