// src/components/SidebarControls.tsx
import { Suspense, lazy, useEffect, useState } from "react";
import { useConfigStore, type DeepPartial } from "../store/configStore";
import type { CabinConfig, StandModules, WallDetailConfig, StandType, Region } from "../lib/pricing";
import { collisionPlayground } from "../lib/playgrounds";
import { normalizeCounterPlacement } from "../lib/counters";
import SeatingControls from "./SeatingControls";
import { aiAssistantEnabled, voiceAssistantEnabled } from "../config/ai";

type WallSide = "back" | "left" | "right";

// Feste Anzahl geschlossener Seiten pro Standtyp
const wallFixedMap = {
  row: 3,
  corner: 2,
  head: 1,
  island: 0,
} as const;

const LazyAiAssistantPanel = aiAssistantEnabled
  ? lazy(() =>
      import("./AiAssistantPanel").then((mod) => ({
        default: mod.AiAssistantPanel,
      }))
    )
  : null;

const LazyVoiceAssistant = voiceAssistantEnabled ? lazy(() => import("./VoiceAssistant")) : null;

export default function SidebarControls({
  drawerOpen,
  onClose,
}: {
  drawerOpen: boolean;
  onClose: () => void;
}) {
  const { config, price, setConfig, applyPreset, replaceConfig, undo, redo, history, future } =
    useConfigStore();
  const modules = config.modules;
  const sidebarClassName = drawerOpen
    ? "sidebar sidebar-open translate-x-0"
    : "sidebar sidebar-hidden -translate-x-full";

  // Helper: DeepPartial-Patch für modules (typsicher)
  const patchModules = (mods: DeepPartial<StandModules>) =>
    setConfig({ modules: mods });

  const buildCabinPatch = (): NonNullable<DeepPartial<StandModules>["cabin"]> => {
    const cabin = modules.cabin ?? ({} as Partial<CabinConfig>);
    const width = typeof cabin.width === "number" ? cabin.width : 1.5;
    const depth = typeof cabin.depth === "number" ? cabin.depth : 1.5;
    const height = typeof cabin.height === "number" ? cabin.height : config.height;
    const defaultPosition = {
      x: -config.width / 2 + width / 2 + 0.25,
      z: -config.depth / 2 + depth / 2 + 0.25,
    };

    return {
      enabled: true,
      width,
      depth,
      height,
      position: {
        x:
          typeof cabin.position?.x === "number"
            ? cabin.position.x
            : defaultPosition.x,
        z:
          typeof cabin.position?.z === "number"
            ? cabin.position.z
            : defaultPosition.z,
      },
    };
  };

  const toggleStorageRoom = (checked: boolean) => {
    if (checked) {
      patchModules({
        storageRoom: true,
        cabin: buildCabinPatch(),
      });
      return;
    }

    const baseCabin = buildCabinPatch();
    patchModules({
      storageRoom: false,
      cabin: {
        enabled: false,
        width: baseCabin.width ?? 1.5,
        depth: baseCabin.depth ?? 1.5,
        height: baseCabin.height ?? config.height,
        position: baseCabin.position,
      },
    });
  };

  const [voiceAssistantOpen, setVoiceAssistantOpen] = useState(voiceAssistantEnabled);
  const [customerName, setCustomerName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [fair, setFair] = useState("");
  const [bannerUploadStatus, setBannerUploadStatus] = useState<string | null>(null);
  const [bannerUploading, setBannerUploading] = useState(false);

  const canUndo = history.length > 0;
  const canRedo = future.length > 0;

  const fixedWalls =
    wallFixedMap[config.type as keyof typeof wallFixedMap] ?? 0;

  const wallAttachmentIndex = modules.wallAttachmentIndex;
  const hasWallMountedObjects = () => {
    const mappedCount =
      (wallAttachmentIndex?.byWall?.back?.length ?? 0) +
      (wallAttachmentIndex?.byWall?.left?.length ?? 0) +
      (wallAttachmentIndex?.byWall?.right?.length ?? 0) +
      (wallAttachmentIndex?.floating?.length ?? 0);
    const legacyScreens = (modules.screens ?? 0) > 0;
    const legacyFrames = (modules.ledFrames ?? 0) > 0;
    const detailedScreens = Array.isArray(modules.detailedScreens) && modules.detailedScreens.length > 0;
    const detailedFrames = Array.isArray(modules.ledFramesDetailed) && modules.ledFramesDetailed.length > 0;
    const wallLightsCount =
      (modules.wallLightsBack ?? 0) + (modules.wallLightsLeft ?? 0) + (modules.wallLightsRight ?? 0);
    return (
      mappedCount > 0 ||
      legacyScreens ||
      legacyFrames ||
      detailedScreens ||
      detailedFrames ||
      wallLightsCount > 0
    );
  };

  const lighting = (modules.lighting ?? {}) as NonNullable<StandModules["lighting"]>;
  const lightingDefaults = {
    hdri: "hall",
    background: false,
    ambientColor: "#ffffff",
    ambientIntensity: 0.35,
    environmentIntensity: 1.2,
    exposure: 1,
    toneMapping: "agx" as NonNullable<StandModules["lighting"]>["toneMapping"],
    bloom: false,
    bloomIntensity: 0.35,
    dof: false,
    envMapIntensity: 1.2,
  };
  const resolvedLighting = { ...lightingDefaults, ...lighting };
  const patchLighting = (partial: Partial<NonNullable<StandModules["lighting"]>>) =>
    patchModules({
      lighting: {
        ...lighting,
        ...partial,
      },
    });

  const handleStandTypeChange = (nextType: StandType) => {
    if (nextType === config.type) return;
    const currentWalls = wallFixedMap[config.type as keyof typeof wallFixedMap] ?? 0;
    const nextWalls = wallFixedMap[nextType as keyof typeof wallFixedMap] ?? 0;
    if (currentWalls > 0 && nextWalls === 0 && hasWallMountedObjects()) {
      const confirmRemoval = window.confirm(
        "Wenn die letzte Wand entfernt wird, werden wandmontierte Objekte ausgeblendet und muessen spaeter neu platziert werden. Fortfahren?"
      );
      if (!confirmRemoval) return;
    }
    setConfig({ type: nextType });
  };

  // Boden-Konfiguration (advanced + Fallback auf legacy raisedFloor)
  const floor = config.modules.floor;
  const floorType = floor?.type ?? "carpet";
  const floorRaised = floor?.raised ?? config.modules.raisedFloor ?? false;
  const floorHeight = floorRaised ? 0.08 : 0.025;
  const counterPlacement = normalizeCounterPlacement(config.modules.countersWall);

  useEffect(() => {
    const handleHistoryHotkeys = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (isTypingTarget) return;

      const key = event.key.toLowerCase();
      const comboPressed = event.metaKey || event.ctrlKey;
      if (!comboPressed) return;

      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }

      if (key === "y") {
        event.preventDefault();
        redo();
      }
    };

    window.addEventListener("keydown", handleHistoryHotkeys);
    return () => window.removeEventListener("keydown", handleHistoryHotkeys);
  }, [redo, undo]);

  const getWallsDetail = () =>
    (modules.wallsDetail ??
      ({} as Partial<Record<WallSide, WallDetailConfig>>)) as Partial<
      Record<WallSide, WallDetailConfig>
    >;

  // Wand-Oberflächen aus modules.wallsDetail lesen
  const getWallSurface = (side: WallSide): string => {
    const wallsDetail = getWallsDetail();
    return wallsDetail?.[side]?.surface ?? "system";
  };

  const updateWallSurface = (side: WallSide, surface: string) => {
    const existingWallsDetail = modules.wallsDetail as
      | Partial<Record<WallSide, WallDetailConfig>>
      | undefined;
    const wallsDetail =
      existingWallsDetail ?? ({} as Partial<Record<WallSide, WallDetailConfig>>);

    const nextWallsDetail = {
      ...wallsDetail,
      [side]: {
        ...(wallsDetail[side] ?? {}),
        surface,
      },
    } as Partial<Record<WallSide, WallDetailConfig>>;

    if (!existingWallsDetail) {
      setConfig({ modules: { wallsDetail: nextWallsDetail } });
      return;
    }

    patchModules({
      wallsDetail: nextWallsDetail,
    });
  };

  const handleBannerUpload = async (file: File) => {
    if (!file) return;
    if (!file.type?.startsWith("image/")) {
      setBannerUploadStatus("Nur Bilddateien sind erlaubt.");
      return;
    }
    const maxSize = 12 * 1024 * 1024;
    if (file.size > maxSize) {
      setBannerUploadStatus("Datei zu gross (max. 12 MB).");
      return;
    }

    setBannerUploading(true);
    setBannerUploadStatus("Upload & WebP-Konvertierung läuft...");

    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/upload/banner", { method: "POST", body });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.url) {
        throw new Error(json?.error || "Upload fehlgeschlagen");
      }

      const mipmaps: string[] = Array.isArray(json.mipmaps) ? json.mipmaps : [];
      patchModules({
        trussBannerMipmaps: mipmaps.length ? mipmaps : [json.url],
        trussBannerWebpUrl: json.webpUrl ?? json.url,
        trussBannerKtx2Url: json.ktx2Url ?? undefined,
        trussBannerImageUrl: json.url,
      });
      const sizeLabel =
        json.width && json.height ? ` ${json.width}x${json.height}px` : "";
      setBannerUploadStatus(`Fertig: WebP${sizeLabel} + ${mipmaps.length || 1} Mipmaps`);
    } catch (err) {
      setBannerUploadStatus(err instanceof Error ? err.message : "Upload fehlgeschlagen");
    } finally {
      setBannerUploading(false);
    }
  };

  const stepModule = (
    field: "counters" | "screens",
    delta: number,
    min = 0,
    max?: number
  ) => {
    const current = (config.modules[field] as number) ?? 0;
    let next = current + delta;
    if (typeof min === "number") next = Math.max(min, next);
    if (typeof max === "number") next = Math.min(max, next);
    patchModules({ [field]: next } as DeepPartial<StandModules>);
  };

  const ledFramesDetailed =
    modules.ledFramesDetailed as
      | {
          id?: string;
          variant?: string;
          size?: number;
          color?: string;
          count?: number;
          wallSide?: WallSide;
          lastWallSide?: WallSide;
        }[]
      | undefined;

  const resolveLedWallSide = (): WallSide => {
    const firstFrame =
      Array.isArray(ledFramesDetailed) && ledFramesDetailed.length
        ? ledFramesDetailed[0]
        : undefined;
    const legacyWall = modules.ledWall as WallSide | undefined;
    return (firstFrame?.wallSide ?? firstFrame?.lastWallSide ?? legacyWall ?? "back") as WallSide;
  };

  const syncLedFramesDetailed = (nextCount: number, wallSide: WallSide) => {
    const safeCount = Math.max(0, Math.floor(Number(nextCount) || 0));
    if (safeCount <= 0) {
      patchModules({ ledFrames: 0, ledFramesDetailed: [] });
      return;
    }

    const existing = Array.isArray(ledFramesDetailed) ? ledFramesDetailed.filter(Boolean) : [];
    const baseVariant =
      existing[0]?.variant ?? config.modules.frameVariant ?? "ledFrame_octalumina";
    const baseSize = existing[0]?.size ?? config.modules.frameSize ?? 2.5;
    const baseColor = existing[0]?.color ?? config.modules.frameColor;

    const detailed = Array.from({ length: safeCount }).map((_, idx) => {
      const prev = existing[idx] ?? {};
      return {
        ...prev,
        id: prev.id ?? `led-frame-${idx + 1}`,
        variant: prev.variant ?? baseVariant,
        size: prev.size ?? baseSize,
        color: prev.color ?? baseColor,
        count: 1,
        wallSide,
        lastWallSide: wallSide,
      };
    });

    patchModules({
      ledFrames: safeCount,
      ledFramesDetailed: detailed,
      frameVariant: baseVariant,
      frameSize: baseSize,
      frameColor: baseColor,
    });
  };

  const ledFramesCount =
    config.modules.ledFrames ??
    (Array.isArray(ledFramesDetailed) ? ledFramesDetailed.length : 0) ??
    0;
  const ledWallSide = resolveLedWallSide();

  const handleLedFrameCountChange = (value: number) => {
    syncLedFramesDetailed(value, ledWallSide);
  };

  const stepLedFrames = (delta: number) => {
    const next = (ledFramesCount || 0) + delta;
    syncLedFramesDetailed(next, ledWallSide);
  };

  const handleLedWallChange = (side: WallSide) => {
    const baseCount = Math.max(
      ledFramesCount,
      Array.isArray(ledFramesDetailed) ? ledFramesDetailed.length : 0
    );
    syncLedFramesDetailed(Math.max(1, baseCount), side);
  };

  const summarizeLedFrames = () => {
    const counts: Record<WallSide, number> = { back: 0, left: 0, right: 0 };
    let total = 0;

    if (Array.isArray(ledFramesDetailed) && ledFramesDetailed.length) {
      ledFramesDetailed.forEach((frame) => {
        const wall = (frame.wallSide ?? frame.lastWallSide ?? "back") as WallSide;
        const count = Math.max(1, Number(frame.count) || 1);
        counts[wall] += count;
        total += count;
      });
    } else {
      const legacyCount = config.modules.ledFrames ?? 0;
      if (legacyCount > 0) {
        const wall = (modules.ledWall as WallSide | undefined) ?? "back";
        counts[wall] = legacyCount;
        total = legacyCount;
      }
    }

    return { total, counts };
  };

  const formatLedWallLabel = (counts: Record<WallSide, number>) => {
    const label = (side: WallSide) =>
      side === "back" ? "Rückwand" : side === "left" ? "Linke Wand" : "Rechte Wand";
    const parts: string[] = [];
    (["back", "left", "right"] as WallSide[]).forEach((side) => {
      const c = counts[side];
      if (c > 0) parts.push(`${label(side)} ${c}×`);
    });
    return parts.join(", ");
  };

  const floorTypeLabel = (type: string | undefined) => {
    switch (type) {
      case "laminate":
        return "Laminat";
      case "vinyl":
        return "Vinyl";
      case "wood":
        return "Holz";
      case "carpet":
      default:
        return "Teppich";
    }
  };

  const copyConfigToClipboard = () => {
    const area = config.width * config.depth;
    const m = modules;
    const mm = modules;
    const wd = modules.wallsDetail;

    const wallSurfaceLabel = (side: WallSide, label: string) => {
      const surface = wd?.[side]?.surface ?? "system";
      const nice =
        surface === "wood"
          ? "Holzwand"
          : surface === "banner"
          ? "Bannerfläche"
          : surface === "seg"
          ? "Textil / SEG"
          : surface === "led"
          ? "LED-Wand"
          : "Systemwand";
      return `${label}: ${nice}`;
    };

    const wallLines: string[] = [];
    if (m.wallsClosedSides >= 1)
      wallLines.push("  • " + wallSurfaceLabel("back", "Rückwand"));
    if (m.wallsClosedSides >= 2)
      wallLines.push("  • " + wallSurfaceLabel("left", "Linke Wand"));
    if (m.wallsClosedSides >= 3)
      wallLines.push("  • " + wallSurfaceLabel("right", "Rechte Wand"));

    const floorLbl = floorTypeLabel(m.floor?.type);

    const lightsFront = mm.trussLightsFront ?? 0;
    const lightsBack = mm.trussLightsBack ?? 0;
    const lightsLeft = mm.trussLightsLeft ?? 0;
    const lightsRight = mm.trussLightsRight ?? 0;
    const wallBack = mm.wallLightsBack ?? 0;
    const wallLeft = mm.wallLightsLeft ?? 0;
    const wallRight = mm.wallLightsRight ?? 0;

    const bannerW = mm.trussBannerWidth ?? 0;
    const bannerH = mm.trussBannerHeight ?? 0;
    const bFront = mm.trussBannersFront ?? 0;
    const bBack = mm.trussBannersBack ?? 0;
    const bLeft = mm.trussBannersLeft ?? 0;
    const bRight = mm.trussBannersRight ?? 0;
    const ledInfo = summarizeLedFrames();
    const ledLabel = ledInfo.total > 0 ? formatLedWallLabel(ledInfo.counts) : "";

    const text = [
      "Neue Standanfrage über den 3D-Konfigurator:",
      "",
      `Fläche: ${config.width} x ${config.depth} m (${area} m²)`,
      `Standtyp: ${config.type}`,
      `Region: ${config.region}`,
      `Eilauftrag: ${config.rush ? "Ja" : "Nein"}`,
      "",
      "Module:",
      `- Boden: ${floorLbl}`,
      `- Doppelboden: ${
        (m.floor?.raised ?? m.raisedFloor) ? "Ja" : "Nein"
      }`,
      ...(wallLines.length ? ["- Wände:", ...wallLines] : []),
      `- Geschlossene Seiten: ${m.wallsClosedSides}`,
      `- Lagerraum: ${m.storageRoom ? "Ja" : "Nein"}${
        m.storageRoom ? ` (Tür: ${m.storageDoorSide ?? "front"})` : ""
      }`,
      `- LED-Rahmen: ${ledInfo.total}${ledLabel ? ` (${ledLabel})` : ""}`,
      `- Counters: ${m.counters} (Position: ${
        normalizeCounterPlacement(m.countersWall)
      }, Strom: ${m.countersWithPower ? "Ja" : "Nein"})`,
      `- Screens: ${m.screens} (Wand: ${m.screensWall ?? "back"})`,
      `- Truss: ${m.truss ? "Ja" : "Nein"}`,
      `- Truss-Lampen (Typ ${mm.trussLightType ?? "spot"}): Front ${lightsFront}, Back ${lightsBack}, Links ${lightsLeft}, Rechts ${lightsRight}`,
      `- Wandstrahler: Back ${wallBack}, Links ${wallLeft}, Rechts ${wallRight}`,
      `- Truss-Bannerrahmen (ca. ${bannerW || "?"} × ${bannerH || "?"} m): Front ${bFront}, Back ${bBack}, Links ${bLeft}, Rechts ${bRight}`,
      "",
      `Richtpreis: ${price.toLocaleString("de-DE")} €`,
    ].join("\n");

    navigator.clipboard
      .writeText(text)
      .catch(() => console.log("Kopieren nicht möglich."));
    alert("Konfiguration wurde in die Zwischenablage kopiert.");
  };

  const sendEmailRequest = () => {
    const area = config.width * config.depth;
    const m = modules;
    const wd = m.wallsDetail;
    const mm = m;

    const wallSurfaceLabel = (side: WallSide, label: string) => {
      const surface = wd?.[side]?.surface ?? "system";
      const nice =
        surface === "wood"
          ? "Holzwand"
          : surface === "banner"
          ? "Bannerfläche"
          : surface === "seg"
          ? "Textil / SEG"
          : surface === "led"
          ? "LED-Wand"
          : "Systemwand";
      return `${label}: ${nice}`;
    };

    const wallLines: string[] = [];
    if (m.wallsClosedSides >= 1)
      wallLines.push("  • " + wallSurfaceLabel("back", "Rückwand"));
    if (m.wallsClosedSides >= 2)
      wallLines.push("  • " + wallSurfaceLabel("left", "Linke Wand"));
    if (m.wallsClosedSides >= 3)
      wallLines.push("  • " + wallSurfaceLabel("right", "Rechte Wand"));

    const floorLbl = floorTypeLabel(m.floor?.type);

    const lightsFront = mm.trussLightsFront ?? 0;
    const lightsBack = mm.trussLightsBack ?? 0;
    const lightsLeft = mm.trussLightsLeft ?? 0;
    const lightsRight = mm.trussLightsRight ?? 0;
    const wallBack = mm.wallLightsBack ?? 0;
    const wallLeft = mm.wallLightsLeft ?? 0;
    const wallRight = mm.wallLightsRight ?? 0;

    const bannerW = mm.trussBannerWidth ?? 0;
    const bannerH = mm.trussBannerHeight ?? 0;
    const bFront = mm.trussBannersFront ?? 0;
    const bBack = mm.trussBannersBack ?? 0;
    const bLeft = mm.trussBannersLeft ?? 0;
    const bRight = mm.trussBannersRight ?? 0;
    const ledInfo = summarizeLedFrames();
    const ledLabel = ledInfo.total > 0 ? formatLedWallLabel(ledInfo.counts) : "";

    const lines = [
      "Neue Standanfrage über den 3D-Konfigurator:",
      "",
      "=== Standdaten ===",
      `Messe / Event: ${fair || "-"}`,
      `Fläche: ${config.width} x ${config.depth} m (${area} m²)`,
      `Standtyp: ${config.type}`,
      `Region: ${config.region}`,
      `Eilauftrag: ${config.rush ? "Ja" : "Nein"}`,
      "",
      "Module:",
      `- Boden: ${floorLbl}`,
      `- Doppelboden: ${
        (m.floor?.raised ?? m.raisedFloor) ? "Ja" : "Nein"
      }`,
      ...(wallLines.length ? ["- Wände:", ...wallLines] : []),
      `- Geschlossene Seiten: ${m.wallsClosedSides}`,
      `- Lagerraum: ${m.storageRoom ? "Ja" : "Nein"}${
        m.storageRoom ? ` (Tür: ${m.storageDoorSide ?? "front"})` : ""
      }`,
      `- LED-Rahmen: ${ledInfo.total}${ledLabel ? ` (${ledLabel})` : ""}`,
      `- Counters: ${m.counters} (Position: ${
        normalizeCounterPlacement(m.countersWall)
      }, Strom: ${m.countersWithPower ? "Ja" : "Nein"})`,
      `- Screens: ${m.screens} (Wand: ${m.screensWall ?? "back"})`,
      `- Truss: ${m.truss ? "Ja" : "Nein"}`,
      `- Truss-Lampen (Typ ${mm.trussLightType ?? "spot"}): Front ${lightsFront}, Back ${lightsBack}, Links ${lightsLeft}, Rechts ${lightsRight}`,
      `- Wandstrahler: Back ${wallBack}, Links ${wallLeft}, Rechts ${wallRight}`,
      `- Truss-Bannerrahmen (ca. ${bannerW || "?"} × ${
        bannerH || "?"
      } m): Front ${bFront}, Back ${bBack}, Links ${bLeft}, Rechts ${bRight}`,
      "",
      `Richtpreis (brutto / Richtwert): ${price.toLocaleString("de-DE")} €`,
      "",
      "=== Kontaktdaten Kunde ===",
      `Name: ${customerName || "-"}`,
      `Firma: ${company || "-"}`,
      `E-Mail: ${email || "-"}`,
      `Telefon: ${phone || "-"}`,
    ];

    const subject = encodeURIComponent(
      `Standanfrage Konfigurator - ${company || customerName || "Unbekannt"}`
    );
    const body = encodeURIComponent(lines.join("\n"));
    // Keep this on one line to avoid breaking the email address
    const mailto = `mailto:sunds-messebau@gmx.de?subject=${subject}&body=${body}`;
    window.location.href = mailto;
  };

  return (
    <aside
      className={sidebarClassName}
      id="app-sidebar"
      aria-hidden={!drawerOpen}
    >
      <button type="button" className="sidebar-close" onClick={onClose}>
        Schließen
      </button>
      <div className="sidebar-header">
        <div className="sidebar-title-row">
          <h1>S&S 3D Standkonfigurator</h1>
          <span className="badge">Beta • intern</span>
        </div>
        <small>Richtkalkulation für System- & Individualstände</small>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-header">
          <span className="section-title">Verlauf</span>
          <span className="section-sub">Strg+Z / Strg+Umschalt+Z</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={undo}
            disabled={!canUndo}
          >
            Rückgängig
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={redo}
            disabled={!canRedo}
          >
            Wiederholen
          </button>
        </div>
      </div>

      {aiAssistantEnabled && LazyAiAssistantPanel && (
        <div className="sidebar-section">
          <div className="sidebar-section-header">
            <span className="section-title">AI-Assistent</span>
            <span className="section-sub">Experimentell</span>
          </div>
          <Suspense fallback={<div style={{ color: "#6b7280" }}>KI-Modul wird geladen...</div>}>
            <LazyAiAssistantPanel />
          </Suspense>
        </div>
      )}

      {voiceAssistantEnabled && LazyVoiceAssistant && (
      <div className="sidebar-section">
        <div className="sidebar-section-header">
          <span className="section-title">Voice-Assistent</span>
          <span className="section-sub">Experimentell</span>
        </div>
        {voiceAssistantOpen ? (
          <Suspense fallback={<div style={{ color: "#6b7280" }}>Voice-Assistent wird geladen...</div>}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              <LazyVoiceAssistant />
              <button
                type="button"
                className="btn-secondary"
                style={{ alignSelf: "flex-end" }}
                onClick={() => setVoiceAssistantOpen(false)}
              >
                Voice-Assistent ausblenden
              </button>
            </div>
          </Suspense>
        ) : (
          <button
            type="button"
            className="btn-secondary"
            style={{ alignSelf: "flex-start" }}
            onClick={() => setVoiceAssistantOpen(true)}
          >
            Voice-Assistent starten
          </button>
        )}
      </div>
    )}

      {/* Presets */}
      <div className="sidebar-section">
        <div className="sidebar-section-header">
          <span className="section-title">Schnellstart</span>
          <span className="section-sub">Typische Standgrößen</span>
        </div>
        <div className="preset-row">
          <button
            type="button"
            className="preset-btn"
            onClick={() => applyPreset("small")}
          >
            <strong>9 m²</strong>
            <small>3×3 • Reihenstand</small>
          </button>
          <button
            type="button"
            className="preset-btn"
            onClick={() => applyPreset("medium")}
          >
            <strong>24 m²</strong>
            <small>6×4 • Eckstand</small>
          </button>
          <button
            type="button"
            className="preset-btn"
            onClick={() => applyPreset("premium")}
          >
            <strong>40 m²</strong>
            <small>8×5 • Kopfstand Premium</small>
          </button>
        </div>
        <div className="preset-row">
          <button
            type="button"
            className="preset-btn"
            onClick={() => replaceConfig(collisionPlayground)}
            title="Lädt den Mock-Stand mit eng stehenden Modulen, um Kollisionen zu testen"
          >
            <strong>Kollisions-Playground</strong>
            <small>Mock-Stand mit vielen Objekten</small>
          </button>
        </div>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-header">
          <span className="section-title">Kollisionsschutz</span>
          <span className="section-sub">AABB + Mindestabstand</span>
        </div>
        <p style={{ margin: "0.25rem 0 0", lineHeight: 1.35 }}>
          Bewegte Objekte (Tresen, Screens, Kabine, Truss-Griff) prallen an einem
          AABB-Sicherheitsabstand ab. Bei drohender Überschneidung erscheint ein
          roter Wireframe + Hinweis. Der Mindestabstand lässt sich über
          <code> modules.collisionClearance</code> im Store konfigurieren
          (Playground: 0,25 m).
        </p>
      </div>

      {/* Grunddaten */}
      <div className="sidebar-section">
        <div className="sidebar-section-header">
          <span className="section-title">Grunddaten</span>
          <span className="section-sub">Fläche & Standtyp</span>
        </div>

        <div className="form-grid">
          <label>
            Breite (m)
            <input
              type="number"
              min={2}
              step={1}
              value={config.width}
              onChange={(e) =>
                setConfig({ width: Number(e.target.value) || 0 })
              }
            />
          </label>

          <label>
            Tiefe (m)
            <input
              type="number"
              min={2}
              step={1}
              value={config.depth}
              onChange={(e) =>
                setConfig({ depth: Number(e.target.value) || 0 })
              }
            />
          </label>

          {/* Wandhöhe */}
          <label>
            Wandhöhe (m)
            <input
              type="number"
              min={2}
              max={6}
              step={0.1}
              value={config.height}
              onChange={(e) =>
                setConfig({ height: Number(e.target.value) || 0 })
              }
            />
            <small style={{ fontSize: 10, color: "#6b7280" }}>
              Standard: ca. 2,50 m – je nach Messe bis ~4,00 m.
            </small>
          </label>

          <label>
            Standtyp
            <select
              value={config.type}
              onChange={(e) => handleStandTypeChange(e.target.value as StandType)}
            >
              <option value="row">Reihenstand</option>
              <option value="corner">Eckstand</option>
              <option value="head">Kopfstand</option>
              <option value="island">Inselstand</option>
            </select>
          </label>

          <label>
            Region
            <select
              value={config.region}
              onChange={(e) => setConfig({ region: e.target.value as Region })}
            >
              <option value="NRW">NRW / Mitte</option>
              <option value="Nord">Norden</option>
              <option value="Süd">Süden</option>
              <option value="Ausland">Ausland</option>
            </select>
          </label>

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={config.rush}
          onChange={(e) => setConfig({ rush: e.target.checked })}
        />
        Eilauftrag (kurzfristige Umsetzung)
      </label>
    </div>
  </div>

      {/* Licht & Environment */}
      <div className="sidebar-section">
        <div className="sidebar-section-header">
          <span className="section-title">Licht & Environment</span>
          <span className="section-sub">HDRI, Belichtung, Effekte</span>
        </div>

        <div className="form-grid">
          <label>
            HDRI-Umgebung
            <select
              value={resolvedLighting.hdri}
              onChange={(e) => patchLighting({ hdri: e.target.value as "hall" | "studio" | "outdoor" })}
            >
              <option value="hall">Messehalle</option>
              <option value="studio">Studio</option>
              <option value="outdoor">Outdoor</option>
            </select>
          </label>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={resolvedLighting.background}
              onChange={(e) => patchLighting({ background: e.target.checked })}
            />
            HDRI als Hintergrund
          </label>

          <label>
            Environment-Intensität
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={resolvedLighting.environmentIntensity}
              onChange={(e) => patchLighting({ environmentIntensity: Number(e.target.value) })}
            />
            <small style={{ color: "#6b7280" }}>
              Spiegelungen & Licht ({resolvedLighting.environmentIntensity.toFixed(2)})
            </small>
          </label>

          <label>
            Ambient-Light
            <input
              type="range"
              min={0}
              max={1.5}
              step={0.05}
              value={resolvedLighting.ambientIntensity}
              onChange={(e) => patchLighting({ ambientIntensity: Number(e.target.value) })}
            />
            <small style={{ color: "#6b7280" }}>
              Fülllicht ({resolvedLighting.ambientIntensity.toFixed(2)})
            </small>
          </label>

          <label>
            Belichtung
            <input
              type="range"
              min={0.6}
              max={1.6}
              step={0.02}
              value={resolvedLighting.exposure}
              onChange={(e) => patchLighting({ exposure: Number(e.target.value) })}
            />
            <small style={{ color: "#6b7280" }}>
              Tone-Mapping Exposure ({resolvedLighting.exposure.toFixed(2)})
            </small>
          </label>

          <label>
            Tone-Mapping
            <select
              value={resolvedLighting.toneMapping}
              onChange={(e) =>
                patchLighting({ toneMapping: e.target.value as "aces" | "agx" | "reinhard" | "neutral" })
              }
            >
              <option value="agx">AgX (cinematic)</option>
              <option value="aces">ACES (filmic)</option>
              <option value="reinhard">Reinhard</option>
              <option value="neutral">Neutral</option>
            </select>
          </label>

          <label>
            Reflektions-Boost (envMap)
            <input
              type="range"
              min={0}
              max={3}
              step={0.05}
              value={resolvedLighting.envMapIntensity}
              onChange={(e) => patchLighting({ envMapIntensity: Number(e.target.value) })}
            />
            <small style={{ color: "#6b7280" }}>
              Glänzende Materialien ({resolvedLighting.envMapIntensity.toFixed(2)})
            </small>
          </label>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={resolvedLighting.bloom}
              onChange={(e) => patchLighting({ bloom: e.target.checked })}
            />
            Bloom-Effekt
          </label>

          {resolvedLighting.bloom && (
            <label>
              Bloom-Intensität
              <input
                type="range"
                min={0}
                max={2}
                step={0.05}
                value={resolvedLighting.bloomIntensity}
                onChange={(e) => patchLighting({ bloomIntensity: Number(e.target.value) })}
              />
            </label>
          )}

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={resolvedLighting.dof}
              onChange={(e) => patchLighting({ dof: e.target.checked })}
            />
            Depth of Field
          </label>

          <div style={{ gridColumn: "1 / -1", fontSize: 12, color: "#6b7280" }}>
            HDRI-Maps steuern Spiegelungen & Licht. Höhere envMapIntensity lässt Counter & LED-Rahmen glänzender wirken.
          </div>
        </div>
      </div>

      {/* Module */}
      <div className="sidebar-section">
        <div className="sidebar-section-header">
          <span className="section-title">Module</span>
          <span className="section-sub">
            Boden, Wände, LED, Counter, Screens, Licht
          </span>
        </div>

        <div className="form-grid">
          {/* Boden */}
          <label>
            Bodenbelag
            <select
              value={floorType}
              onChange={(e) => {
                const type = e.target.value as
                  | "carpet"
                  | "laminate"
                  | "vinyl"
                  | "wood";
                patchModules({
                  floor: {
                    ...(config.modules.floor ?? {}),
                    type,
                    raised: floorRaised,
                  },
                });
              }}
            >
              <option value="carpet">Teppich</option>
              <option value="laminate">Laminat</option>
              <option value="vinyl">Vinyl</option>
              <option value="wood">Holz</option>
            </select>
          </label>

          {/* Wände – feste Logik */}
          <label>
            Geschlossene Seiten
            <input type="number" value={fixedWalls} readOnly disabled />
            <small style={{ fontSize: 10, color: "#6b7280" }}>
              {config.type === "row" &&
                "Reihenstand: 3 geschlossene Seiten (Rückwand + 2 Seitenwände)."}
              {config.type === "corner" &&
                "Eckstand: 2 geschlossene Seiten (Rückwand + eine Seitenwand)."}
              {config.type === "head" &&
                "Kopfstand: 1 geschlossene Rückwand, Seiten offen."}
              {config.type === "island" &&
                "Inselstand: keine festen Wände, rundum offen."}
            </small>
          </label>

          {/* Wand-Design + Wandstrahler */}
          {config.modules.wallsClosedSides >= 1 && (
            <>
              <label>
                Wanddesign Rückwand
                <select
                  value={getWallSurface("back")}
                  onChange={(e) =>
                    updateWallSurface(
                      "back",
                      e.target.value as "system" | "wood" | "banner" | "seg" | "led"
                    )
                  }
                >
                  <option value="system">Systemwand (weiß)</option>
                  <option value="wood">Holzwand</option>
                  <option value="banner">Bannerfläche</option>
                  <option value="seg">SEG / Textilrahmen</option>
                  <option value="led">LED-Wand</option>
                </select>
              </label>
              <label>
                Strahler Rückwand
                <input
                  type="number"
                  min={0}
                  value={modules.wallLightsBack ?? 0}
                  onChange={(e) =>
                    patchModules({
                      wallLightsBack: Number(e.target.value) || 0,
                    })
                  }
                />
              </label>
            </>
          )}

          {config.modules.wallsClosedSides >= 2 && (
            <>
              <label>
                Wanddesign linke Wand
                <select
                  value={getWallSurface("left")}
                  onChange={(e) =>
                    updateWallSurface(
                      "left",
                      e.target.value as "system" | "wood" | "banner" | "seg" | "led"
                    )
                  }
                >
                  <option value="system">Systemwand (weiß)</option>
                  <option value="wood">Holzwand</option>
                  <option value="banner">Bannerfläche</option>
                  <option value="seg">SEG / Textilrahmen</option>
                  <option value="led">LED-Wand</option>
                </select>
              </label>
              <label>
                Strahler linke Wand
                <input
                  type="number"
                  min={0}
                  value={modules.wallLightsLeft ?? 0}
                  onChange={(e) =>
                    patchModules({
                      wallLightsLeft: Number(e.target.value) || 0,
                    })
                  }
                />
              </label>
            </>
          )}

          {config.modules.wallsClosedSides >= 3 && (
            <>
              <label>
                Wanddesign rechte Wand
                <select
                  value={getWallSurface("right")}
                  onChange={(e) =>
                    updateWallSurface(
                      "right",
                      e.target.value as "system" | "wood" | "banner" | "seg" | "led"
                    )
                  }
                >
                  <option value="system">Systemwand (weiß)</option>
                  <option value="wood">Holzwand</option>
                  <option value="banner">Bannerfläche</option>
                  <option value="seg">SEG / Textilrahmen</option>
                  <option value="led">LED-Wand</option>
                </select>
              </label>
              <label>
                Strahler rechte Wand
                <input
                  type="number"
                  min={0}
                  value={modules.wallLightsRight ?? 0}
                  onChange={(e) =>
                    patchModules({
                      wallLightsRight: Number(e.target.value) || 0,
                    })
                  }
                />
              </label>
            </>
          )}

          {/* Lagerraum */}
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={config.modules.storageRoom}
              onChange={(e) => toggleStorageRoom(e.target.checked)}
            />
            Lagerraum / Kabine
          </label>

          {config.modules.storageRoom && (
            <>
              {/* Kabine – Maße */}
              <label>
                Kabine Breite (m)
                <input
                  type="number"
                  min={1}
                  step={0.1}
                value={modules.cabin?.width ?? 1.5}
                onChange={(e) =>
                  {
                    const baseCabin = modules.cabin ?? (buildCabinPatch() as CabinConfig);
                    patchModules({
                      cabin: { ...baseCabin, width: Number(e.target.value) || 0 },
                    });
                  }
                }
              />
            </label>
              <label>
                Kabine Tiefe (m)
                <input
                  type="number"
                  min={1}
                  step={0.1}
                value={modules.cabin?.depth ?? 1.5}
                onChange={(e) =>
                  {
                    const baseCabin = modules.cabin ?? (buildCabinPatch() as CabinConfig);
                    patchModules({
                      cabin: { ...baseCabin, depth: Number(e.target.value) || 0 },
                    });
                  }
                }
              />
            </label>

              {/* Kabine – Position */}
              <label>
                Kabine X-Position (m)
                <input
                  type="number"
                  step={0.1}
                value={modules.cabin?.position?.x ?? 0}
                  onChange={(e) => {
                    const baseCabin = modules.cabin ?? (buildCabinPatch() as CabinConfig);
                    const currentPos = baseCabin.position ?? { x: 0, z: 0 };
                    patchModules({
                      cabin: {
                        ...baseCabin,
                        position: { ...currentPos, x: Number(e.target.value) },
                      },
                    });
                  }}
              />
            </label>
              <label>
                Kabine Z-Position (m)
                <input
                  type="number"
                  step={0.1}
                value={modules.cabin?.position?.z ?? 0}
                  onChange={(e) => {
                    const baseCabin = modules.cabin ?? (buildCabinPatch() as CabinConfig);
                    const currentPos = baseCabin.position ?? { x: 0, z: 0 };
                    patchModules({
                      cabin: {
                        ...baseCabin,
                        position: { ...currentPos, z: Number(e.target.value) },
                      },
                    });
                  }}
              />
            </label>

              <label>
                Türposition Lagerraum
                <select
                  value={config.modules.storageDoorSide ?? "back"}
                  onChange={(e) =>
                    patchModules({
                      storageDoorSide: e.target.value as WallSide,
                    })
                  }
                >
                  <option value="back">Rückwand</option>
                  <option value="left">Links</option>
                  <option value="right">Rechts</option>
                </select>
              </label>
            </>
          )}

          {/* LED-Rahmen */}
          <label>
            LED-Rahmen
            <div className="number-input-row">
              <div className="number-input-wrapper">
                <input
                  type="number"
                  min={0}
                  value={ledFramesCount}
                  onChange={(e) => handleLedFrameCountChange(Number(e.target.value) || 0)}
                />
                <div className="stepper-buttons">
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => stepLedFrames(-1)}
                  >
                    –
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => stepLedFrames(1)}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </label>

          {ledFramesCount > 0 && (
            <label>
              LED-Rahmen an Wand
              <select
                value={ledWallSide}
                onChange={(e) =>
                  handleLedWallChange(e.target.value as "back" | "left" | "right")
                }
              >
                <option value="back">Rückwand</option>
                <option value="left">Linke Wand</option>
                <option value="right">Rechte Wand</option>
              </select>
            </label>
          )}

          {/* Counters / Theken */}
          <label>
            Counters / Theken
            <div className="number-input-row">
              <div className="number-input-wrapper">
                <input
                  type="number"
                  min={0}
                  value={config.modules.counters}
                  onChange={(e) =>
                    patchModules({ counters: Number(e.target.value) || 0 })
                  }
                />
                <div className="stepper-buttons">
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => stepModule("counters", -1, 0)}
                  >
                    –
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => stepModule("counters", 1, 0)}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </label>

          {config.modules.counters > 0 && (
            <>
              <label>
                Counter-Position
                <select
                  value={counterPlacement}
                  onChange={(e) =>
                    patchModules({
                      countersWall: normalizeCounterPlacement(e.target.value),
                    })
                  }
                >
                  <option value="front">Front (Besucherkante)</option>
                  <option value="center">Mitte (zentriert)</option>
                </select>
              </label>

              <label>
                Counter-Design
                <select
                  value={config.modules.counterVariant ?? "basic"}
                  onChange={(e) =>
                    patchModules({
                      counterVariant: e.target.value as "basic" | "premium" | "corner",
                    })
                  }
                >
                  <option value="basic">Basic Tresen</option>
                  <option value="premium">Premium Tresen</option>
                  <option value="corner">Eck-Tresen (L-Form)</option>
                </select>
              </label>

              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={config.modules.countersWithPower ?? false}
                  onChange={(e) =>
                    patchModules({ countersWithPower: e.target.checked })
                  }
                />
                Tresen mit Strompaket
              </label>
            </>
          )}

          {/* Screens / Monitore */}
          <label>
            Screens / Monitore
            <div className="number-input-row">
              <div className="number-input-wrapper">
                <input
                  type="number"
                  min={0}
                  value={config.modules.screens}
                  onChange={(e) =>
                    patchModules({ screens: Number(e.target.value) || 0 })
                  }
                />
                <div className="stepper-buttons">
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => stepModule("screens", -1, 0)}
                  >
                    –
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => stepModule("screens", 1, 0)}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </label>

          {config.modules.screens > 0 && (
            <label>
              Screens an Wand
              <select
                value={config.modules.screensWall ?? "back"}
                onChange={(e) =>
                  patchModules({
                    screensWall: e.target.value as "back" | "left" | "right",
                  })
                }
              >
                <option value="back">Rückwand</option>
                <option value="left">Linke Wand</option>
                <option value="right">Rechte Wand</option>
              </select>
            </label>
          )}

          {/* Truss & Banner */}
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={config.modules.truss ?? false}
              onChange={(e) => patchModules({ truss: e.target.checked })}
            />
            Traversen-Hängepunkte (Truss)
          </label>

          {config.modules.truss && (
            <>
              <label>
                Lampentyp Truss
                <select
                  value={modules.trussLightType ?? "spot"}
                  onChange={(e) =>
                    patchModules({ trussLightType: e.target.value as "spot" | "wash" })
                  }
                >
                  <option value="spot">Spots</option>
                  <option value="wash">Fluter / Wash</option>
                </select>
              </label>

              {/* Truss-Höhe */}
              <label>
                Truss-Höhe (m)
                <input
                  type="number"
                  min={config.height + 0.3}
                  max={7}
                  step={0.1}
                  value={modules.trussHeight ?? config.height + 0.5}
                  onChange={(e) =>
                    patchModules({ trussHeight: Number(e.target.value) || 0 })
                  }
                />
                <small style={{ fontSize: 10, color: "#6b7280" }}>
                  Höhe der Traverse (Mitte) über Boden. Standard:
                  Wandhöhe + 0,5 m.
                </small>
              </label>

              <label>
                Lampen Truss – Front
                <input
                  type="number"
                  min={0}
                  value={modules.trussLightsFront ?? 0}
                  onChange={(e) =>
                    patchModules({
                      trussLightsFront: Number(e.target.value) || 0,
                    })
                  }
                />
              </label>
              <label>
                Lampen Truss – Back
                <input
                  type="number"
                  min={0}
                  value={modules.trussLightsBack ?? 0}
                  onChange={(e) =>
                    patchModules({
                      trussLightsBack: Number(e.target.value) || 0,
                    })
                  }
                />
              </label>
              <label>
                Lampen Truss – Links
                <input
                  type="number"
                  min={0}
                  value={modules.trussLightsLeft ?? 0}
                  onChange={(e) =>
                    patchModules({
                      trussLightsLeft: Number(e.target.value) || 0,
                    })
                  }
                />
              </label>
              <label>
                Lampen Truss – Rechts
                <input
                  type="number"
                  min={0}
                  value={modules.trussLightsRight ?? 0}
                  onChange={(e) =>
                    patchModules({
                      trussLightsRight: Number(e.target.value) || 0,
                    })
                  }
                />
              </label>

              <label>
                Banner-Breite (m)
                <input
                  type="number"
                  step={0.1}
                  min={1}
                  value={
                    modules.trussBannerWidth ??
                    Math.max(2, config.width * 0.6)
                  }
                  onChange={(e) =>
                    patchModules({
                      trussBannerWidth: Number(e.target.value) || 0,
                    })
                  }
                />
              </label>
              <label>
                Banner-Höhe (m)
                <input
                  type="number"
                  step={0.1}
                  min={0.5}
                  value={modules.trussBannerHeight ?? 1}
                  onChange={(e) =>
                    patchModules({
                      trussBannerHeight: Number(e.target.value) || 0,
                    })
                  }
                />
              </label>

              <label>
                Bannerrahmen – Front
                <input
                  type="number"
                  min={0}
                  value={modules.trussBannersFront ?? 0}
                  onChange={(e) =>
                    patchModules({
                      trussBannersFront: Number(e.target.value) || 0,
                    })
                  }
                />
              </label>
              <label>
                Bannerrahmen – Back
                <input
                  type="number"
                  min={0}
                  value={modules.trussBannersBack ?? 0}
                  onChange={(e) =>
                    patchModules({
                      trussBannersBack: Number(e.target.value) || 0,
                    })
                  }
                />
              </label>
              <label>
                Bannerrahmen – Links
                <input
                  type="number"
                  min={0}
                  value={modules.trussBannersLeft ?? 0}
                  onChange={(e) =>
                    patchModules({
                      trussBannersLeft: Number(e.target.value) || 0,
                    })
                  }
                />
              </label>
              <label>
                Bannerrahmen – Rechts
                <input
                  type="number"
                  min={0}
                  value={modules.trussBannersRight ?? 0}
                  onChange={(e) =>
                    patchModules({
                      trussBannersRight: Number(e.target.value) || 0,
                    })
                  }
                />
              </label>

              <label>
                Banner-Bild (optional)
                <input
                  type="file"
                  accept="image/*"
                  disabled={bannerUploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    void handleBannerUpload(file);
                    e.target.value = "";
                  }}
                />
                <small style={{ fontSize: 10, color: "#6b7280" }}>
                  Upload wird serverseitig nach WebP konvertiert und mit Mipmaps versehen.
                </small>
                {bannerUploadStatus && (
                  <small
                    style={{
                      fontSize: 10,
                      color: bannerUploading ? "#2563eb" : "#374151",
                      display: "block",
                      marginTop: 2,
                    }}
                  >
                    {bannerUploadStatus}
                  </small>
                )}
              </label>
            </>
          )}

          {/* Doppelboden */}
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={floorRaised}
              onChange={(e) =>
                patchModules({
                  raisedFloor: e.target.checked,
                  floor: {
                    ...(config.modules.floor ?? { type: floorType }),
                    raised: e.target.checked,
                  },
                })
              }
            />
            Doppelboden
          </label>
        </div>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-header">
          <span className="section-title">Material & Licht</span>
          <span className="section-sub">Roughness, Metalness, Ambient</span>
        </div>

        <div className="form-grid">
          <label>
            Ambient-Farbe
            <input
              type="color"
              value={(lighting.ambientColor as string) ?? "#ffffff"}
              onChange={(e) =>
                patchModules({ lighting: { ambientColor: e.target.value } })
              }
            />
          </label>
          <label>
            Ambient-Intensität
            <input
              type="range"
              min={0}
              max={3}
              step={0.05}
              value={lighting.ambientIntensity ?? 0.35}
              onChange={(e) =>
                patchModules({
                  lighting: { ambientIntensity: Number(e.target.value) },
                })
              }
            />
            <div className="input-inline-display">
              {(lighting.ambientIntensity ?? 0.35).toFixed(2)}
            </div>
          </label>

          <label>
            Environment-Intensität
            <input
              type="range"
              min={0}
              max={3}
              step={0.05}
              value={lighting.environmentIntensity ?? 1.2}
              onChange={(e) =>
                patchModules({
                  lighting: { environmentIntensity: Number(e.target.value) },
                })
              }
            />
            <div className="input-inline-display">
              {(lighting.environmentIntensity ?? 1.2).toFixed(2)}
            </div>
          </label>

          <label>
            Emissive-Boost
            <input
              type="range"
              min={0}
              max={4}
              step={0.05}
              value={lighting.emissiveIntensity ?? 1}
              onChange={(e) =>
                patchModules({
                  lighting: { emissiveIntensity: Number(e.target.value) },
                })
              }
            />
            <div className="input-inline-display">
              {(lighting.emissiveIntensity ?? 1).toFixed(2)}×
            </div>
          </label>

          <label>
            Roughness (global)
            <input
              type="range"
              min={0.2}
              max={1.8}
              step={0.05}
              value={lighting.materialRoughness ?? 1}
              onChange={(e) =>
                patchModules({
                  lighting: { materialRoughness: Number(e.target.value) },
                })
              }
            />
            <div className="input-inline-display">
              {(lighting.materialRoughness ?? 1).toFixed(2)}×
            </div>
            <small style={{ fontSize: 10, color: "#6b7280" }}>
              Skaliert die Rauheit aller Standard-Materialien.
            </small>
          </label>

          <label>
            Metalness (global)
            <input
              type="range"
              min={0.2}
              max={1.8}
              step={0.05}
              value={lighting.materialMetalness ?? 1}
              onChange={(e) =>
                patchModules({
                  lighting: { materialMetalness: Number(e.target.value) },
                })
              }
            />
            <div className="input-inline-display">
              {(lighting.materialMetalness ?? 1).toFixed(2)}×
            </div>
            <small style={{ fontSize: 10, color: "#6b7280" }}>
              Erhöht oder reduziert den Metallanteil der Oberflächen.
            </small>
          </label>
        </div>
      </div>

      {/* Seating */}
      <div className="sidebar-section">
        <div className="sidebar-section-header">
          <span className="section-title">Sitzmoebel</span>
          <span className="section-sub">Stuehle, Barhocker, Lounge</span>
        </div>

        <div className="form-grid">
          <SeatingControls />
        </div>
      </div>

      {/* Preisbox */}
      <div className="price-box">
        <div className="price-box-label">Unverbindliche Richtkalkulation</div>
        <div className="price-box-main">
          <strong>{price.toLocaleString("de-DE")} €</strong>
          <span className="price-badge">Projektpreis inkl. Aufbau</span>
        </div>
        <div style={{ fontSize: 11, marginTop: 2, color: "#9ca3af" }}>
          Endgültige Preise je nach Messe, Technik und Detailumfang.
        </div>
      </div>

      <button className="btn-secondary" onClick={copyConfigToClipboard}>
        Konfiguration kopieren
      </button>

      {/* Anfrageformular */}
      <div className="sidebar-section">
        <div className="sidebar-section-header">
          <span className="section-title">Anfrage senden</span>
          <span className="section-sub">Direkt an S&S Messebau</span>
        </div>

        <div className="form-grid">
          <label>
            Name
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Max Mustermann"
            />
          </label>
          <label>
            Firma
            <input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Firma / Organisation"
            />
          </label>
          <label>
            E-Mail
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="mail@unternehmen.de"
            />
          </label>
          <label>
            Telefon
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+49 ..."
            />
          </label>
          <label>
            Messe / Event / Ort
            <input
              type="text"
              value={fair}
              onChange={(e) => setFair(e.target.value)}
              placeholder="z. B. boot Düsseldorf, Halle 5"
            />
          </label>

          <button
            className="btn-primary"
            style={{ width: "100%" }}
            onClick={sendEmailRequest}
          >
            Anfrage per E-Mail erstellen
          </button>
        </div>
      </div>
    </aside>
  );
}
