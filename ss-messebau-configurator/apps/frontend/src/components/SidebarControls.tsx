// src/components/SidebarControls.tsx
import { Suspense, lazy, useCallback, useEffect, useState, type FormEvent } from "react";
import { DEFAULT_LIGHTING, useConfigStore, type DeepPartial } from "../store/configStore";
import { generateRectangleLayout, generateUShapeLayout, generateBridgeLayout, generateRearCabinLayout } from "@ss/shared";
import type { CabinConfig, StandModules, WallDetailConfig, StandType, Region, ScreenConfig } from "../lib/pricing";
import { isValidEmail, type ContactRequest } from "@ss/shared";
import { collisionPlayground } from "../lib/playgrounds";
import { normalizeCounterPlacement } from "../lib/counters";
import SeatingControls from "./SeatingControls";
import { CameraPanel } from "./sidebar/CameraPanel";
import { aiAssistantEnabled, voiceAssistantEnabled } from "../config/ai";
import { useSceneInteractionStore } from "../store/sceneInteractionStore";
import { apiBaseUrl, buildApiUrl } from "../lib/apiBase";

type WallSide = "back" | "left" | "right" | "front";

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
  const sidebarClassName = drawerOpen
    ? "sidebar sidebar-open translate-x-0"
    : "sidebar sidebar-hidden -translate-x-full";
  const {
    config,
    price,
    setConfig,
    applyPreset,
    replaceConfig,
    undo,
    redo,
    history,
    future,
  } = useConfigStore();

  if (!config || !config.modules) {
    return (
      <aside className={sidebarClassName} id="app-sidebar" aria-hidden={!drawerOpen}>
        <button type="button" className="sidebar-close" onClick={onClose}>
          Schließen
        </button>
        <div className="sidebar-fallback" role="status">
          Konfiguration nicht verfügbar.
        </div>
      </aside>
    );
  }

  const modules = config.modules;
  const wallsClosedSides = modules.wallsClosedSides ?? 0;
  const counters = modules.counters ?? 0;
  const screens = modules.screens ?? 0;
  const storageRoomEnabled = modules.storageRoom ?? false;
  const cabinEnabled = modules.cabin?.enabled ?? storageRoomEnabled;
  const trussEnabled = modules.truss ?? false;
  const raisedFloor = modules.floor?.raised ?? modules.raisedFloor ?? false;
  const countersWithPower = modules.countersWithPower ?? false;
  const floorHeight = raisedFloor ? 0.08 : 0.025;
  const gridStep = Math.max(0.01, Math.min(1, modules.gridStep ?? modules.snapStep ?? 0.1));
  const snapToStructure = modules.snapToStructure ?? true;
  const detailedScreens = (modules.detailedScreens ?? []) as ScreenConfig[];
  const selectionIds = useSceneInteractionStore((s) => s.selectionIds);
  const selectedScreenIds = selectionIds
    .filter((id) => id.startsWith("scr-d-"))
    .map((id) => id.replace("scr-d-", ""))
    .filter(Boolean);
  const applyLayout = useCallback(
  (build: (w: number, d: number, h: number) => Partial<StandConfig>) => {
    const layout = build(config.width, config.depth, config.height);
    replaceConfig({
      ...config,
      ...layout,
      width: layout.width ?? config.width,
      depth: layout.depth ?? config.depth,
      height: layout.height ?? config.height,
      modules: (layout.modules as StandModules) ?? config.modules,
    });
  },
  [config, replaceConfig]
);

  // Helper: DeepPartial-Patch für modules (typsicher)
  const patchModules = (mods: DeepPartial<StandModules>) =>
    setConfig({ modules: mods });

  const buildCabinPatch = (): NonNullable<DeepPartial<StandModules>["cabin"]> => {
    const cabin = modules.cabin ?? ({} as Partial<CabinConfig>);
    const width = typeof cabin.width === "number" ? cabin.width : 1.5;
    const depth = typeof cabin.depth === "number" ? cabin.depth : 1.5;
    const height = typeof cabin.height === "number" ? cabin.height : config.height;
    const doorSide = (cabin.doorSide as WallSide | undefined) ?? (modules.storageDoorSide as WallSide | undefined);
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
      doorSide,
    };
  };

  const toggleStorageRoom = (checked: boolean) => {
    const baseCabin = buildCabinPatch();
    patchModules({
      storageRoom: checked,
      cabin: {
        ...baseCabin,
        enabled: checked,
      },
    });
  };

  const applyToSelectedScreens = (updater: (scr: ScreenConfig, index: number) => ScreenConfig) => {
    const targetIds =
      selectedScreenIds.length > 0
        ? selectedScreenIds
        : detailedScreens.length > 0
        ? [detailedScreens[0].id ?? "0"]
        : [];
    if (targetIds.length === 0) return;
    const next = detailedScreens.map((scr, idx) => {
      const id = scr.id ?? `${idx}`;
      return targetIds.includes(id) ? updater(scr, idx) : scr;
    });
    setConfig({ modules: { detailedScreens: next } });
  };

  const resolveUploadUrl = (path: string) => {
    if (!apiBaseUrl) {
      throw new Error("Backend fuer Uploads fehlt (VITE_API_BASE_URL setzen und Backend starten).");
    }
    return buildApiUrl(path);
  };

  const [voiceAssistantOpen, setVoiceAssistantOpen] = useState(voiceAssistantEnabled);
  const [customerName, setCustomerName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [fair, setFair] = useState("");
  const [contactErrors, setContactErrors] = useState<Partial<Record<keyof ContactRequest, string>>>({});
  const [bannerUploadStatus, setBannerUploadStatus] = useState<string | null>(null);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [videoUploadStatus, setVideoUploadStatus] = useState<string | null>(null);
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoUrlInput, setVideoUrlInput] = useState("");

  const canUndo = history.length > 0;
  const canRedo = future.length > 0;
  const selectedScreen =
    selectedScreenIds.length > 0
      ? detailedScreens.find((scr) => selectedScreenIds.includes(scr.id ?? ""))
      : detailedScreens[0];
  const screenVideoMuted = selectedScreen?.videoMuted ?? true;
  const screenVideoPaused = selectedScreen?.videoPaused ?? false;
  const screenVideoVolume = selectedScreen?.videoVolume ?? 0;

  const fixedWalls =
    wallFixedMap[config.type as keyof typeof wallFixedMap] ?? 0;

  useEffect(() => {
    setVideoUrlInput(selectedScreen?.videoUrl ?? "");
  }, [selectedScreen?.id, selectedScreen?.videoUrl]);

  const wallAttachmentIndex = modules.wallAttachmentIndex;
  const hasWallMountedObjects = () => {
    const ledFramesCount = modules.ledFrames ?? 0;
    const mappedCount =
      (wallAttachmentIndex?.byWall?.back?.length ?? 0) +
      (wallAttachmentIndex?.byWall?.left?.length ?? 0) +
      (wallAttachmentIndex?.byWall?.right?.length ?? 0) +
      (wallAttachmentIndex?.floating?.length ?? 0);
    const legacyScreens = (modules.screens ?? 0) > 0;
    const legacyFrames = ledFramesCount > 0;
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
  const lightingDefaults = { ...DEFAULT_LIGHTING } satisfies NonNullable<StandModules["lighting"]>;
  const resolvedLighting = { ...lightingDefaults, ...lighting };
  const clampLightingValue = (value: unknown, min: number, max: number, fallback: number) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.min(max, Math.max(min, num));
  };

  const patchLighting = (partial: Partial<NonNullable<StandModules["lighting"]>>) => {
    const normalized: Partial<NonNullable<StandModules["lighting"]>> = { ...partial };

    if ("ambientIntensity" in partial)
      normalized.ambientIntensity = clampLightingValue(partial.ambientIntensity, 0, 5, resolvedLighting.ambientIntensity);
    if ("environmentIntensity" in partial)
      normalized.environmentIntensity = clampLightingValue(
        partial.environmentIntensity,
        0,
        5,
        resolvedLighting.environmentIntensity
      );
    if ("emissiveIntensity" in partial)
      normalized.emissiveIntensity = clampLightingValue(partial.emissiveIntensity, 0, 8, resolvedLighting.emissiveIntensity);
    if ("materialRoughness" in partial)
      normalized.materialRoughness = clampLightingValue(
        partial.materialRoughness,
        0.2,
        1.8,
        resolvedLighting.materialRoughness
      );
    if ("materialMetalness" in partial)
      normalized.materialMetalness = clampLightingValue(
        partial.materialMetalness,
        0.2,
        1.8,
        resolvedLighting.materialMetalness
      );
    if ("exposure" in partial)
      normalized.exposure = clampLightingValue(partial.exposure, 0.1, 3, resolvedLighting.exposure);
    if ("bloomIntensity" in partial)
      normalized.bloomIntensity = clampLightingValue(partial.bloomIntensity, 0, 5, resolvedLighting.bloomIntensity);
    if ("dofFocus" in partial)
      normalized.dofFocus = clampLightingValue(partial.dofFocus, 0.001, 1, resolvedLighting.dofFocus ?? 0.02);
    if ("dofBokehScale" in partial)
      normalized.dofBokehScale = clampLightingValue(partial.dofBokehScale, 0, 10, resolvedLighting.dofBokehScale ?? 2);
    if ("envMapIntensity" in partial)
      normalized.envMapIntensity = clampLightingValue(partial.envMapIntensity, 0, 5, resolvedLighting.envMapIntensity ?? 1.2);

    patchModules({
      lighting: {
        ...lighting,
        ...normalized,
      },
    });
  };

  const handleStandTypeChange = (nextType: StandType) => {
    if (nextType === config.type) return;
    const currentWalls = wallFixedMap[config.type as keyof typeof wallFixedMap] ?? 0;
    const nextWalls = wallFixedMap[nextType as keyof typeof wallFixedMap] ?? 0;
    if (currentWalls > 0 && nextWalls === 0 && hasWallMountedObjects()) {
      const confirmRemoval =
        typeof window === "undefined"
          ? true
          : window.confirm(
              "Wenn die letzte Wand entfernt wird, werden wandmontierte Objekte ausgeblendet und muessen spaeter neu platziert werden. Fortfahren?"
            );
      if (!confirmRemoval) return;
    }
    setConfig({ type: nextType });
  };

  // Boden-Konfiguration (advanced + Fallback auf legacy raisedFloor)
  const floor = config.modules.floor;
  const floorType = floor?.type ?? "carpet";
  const floorRaised = floor?.raised ?? raisedFloor;
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

    if (typeof window !== "undefined") {
      window.addEventListener("keydown", handleHistoryHotkeys);
      return () => window.removeEventListener("keydown", handleHistoryHotkeys);
    }

    return () => {};
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
      const uploadUrl = resolveUploadUrl("/api/upload/banner");
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(uploadUrl, { method: "POST", body });
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

  const handleVideoUpload = async (file: File) => {
    if (!file) return;
    if (!file.type?.startsWith("video/")) {
      setVideoUploadStatus("Bitte ein Video (mp4/webm/ogg) waehlen.");
      return;
    }
    const maxSize = 80 * 1024 * 1024;
    if (file.size > maxSize) {
      setVideoUploadStatus("Datei zu gross (max. 80 MB).");
      return;
    }
    setVideoUploading(true);
    setVideoUploadStatus("Video-Upload laeuft...");
    try {
      const uploadUrl = resolveUploadUrl("/api/upload/video");
      const body = new FormData();
      body.append("file", file);
      body.append("name", file.name);
      const res = await fetch(uploadUrl, { method: "POST", body });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.url) {
        throw new Error(json?.error || "Upload fehlgeschlagen");
      }
      applyToSelectedScreens((scr) => ({
        ...scr,
        videoUrl: json.url as string,
        videoName: (json.name as string | undefined) ?? file.name,
        videoPaused: false,
        videoMuted: true,
        videoVolume: scr.videoVolume ?? 0.4,
      }));
      setVideoUrlInput((json.url as string) ?? "");
      setVideoUploadStatus(`Video gespeichert: ${json.name ?? file.name}`);
    } catch (err) {
      setVideoUploadStatus(err instanceof Error ? err.message : "Upload fehlgeschlagen");
    } finally {
      setVideoUploading(false);
    }
  };

  const handleVideoUrlApply = () => {
    const trimmed = videoUrlInput.trim();
    if (!trimmed) return;
    applyToSelectedScreens((scr) => ({
      ...scr,
      videoUrl: trimmed,
      videoName: scr.videoName ?? "Kunden-Video",
      videoPaused: false,
      videoMuted: scr.videoMuted ?? true,
    }));
  };

  const handlePlayToggle = (playing: boolean) => {
    applyToSelectedScreens((scr) => ({ ...scr, videoPaused: !playing }));
  };

  const handleVolumeChange = (value: number) => {
    const clamped = Math.min(1, Math.max(0, value));
    applyToSelectedScreens((scr) => {
      const currentMuted = scr.videoMuted ?? true;
      return {
        ...scr,
        videoVolume: clamped,
        videoMuted: clamped <= 0 ? true : currentMuted,
      };
    });
  };

  const handleMuteToggle = (muted: boolean) => {
    applyToSelectedScreens((scr) => ({ ...scr, videoMuted: muted }));
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

  const summarizeLedFrames = useCallback(() => {
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
  }, [config.modules.ledFrames, ledFramesDetailed, modules.ledWall]);

  const formatLedWallLabel = useCallback((counts: Record<WallSide, number>) => {
    const label = (side: WallSide) =>
      side === "back" ? "Rückwand" : side === "left" ? "Linke Wand" : "Rechte Wand";
    const parts: string[] = [];
    (["back", "left", "right"] as WallSide[]).forEach((side) => {
      const c = counts[side];
      if (c > 0) parts.push(`${label(side)} ${c}×`);
    });
    return parts.join(", ");
  }, []);

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

  const buildWallLines = useCallback(() => {
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
    if (wallsClosedSides >= 1)
      wallLines.push("  • " + wallSurfaceLabel("back", "Rückwand"));
    if (wallsClosedSides >= 2)
      wallLines.push("  • " + wallSurfaceLabel("left", "Linke Wand"));
    if (wallsClosedSides >= 3)
      wallLines.push("  • " + wallSurfaceLabel("right", "Rechte Wand"));

    return wallLines;
  }, [modules]);

  const buildModuleLines = useCallback(() => {
    const lightsFront = modules.trussLightsFront ?? 0;
    const lightsBack = modules.trussLightsBack ?? 0;
    const lightsLeft = modules.trussLightsLeft ?? 0;
    const lightsRight = modules.trussLightsRight ?? 0;
    const wallBack = modules.wallLightsBack ?? 0;
    const wallLeft = modules.wallLightsLeft ?? 0;
    const wallRight = modules.wallLightsRight ?? 0;

    const bannerW = modules.trussBannerWidth ?? 0;
    const bannerH = modules.trussBannerHeight ?? 0;
    const bFront = modules.trussBannersFront ?? 0;
    const bBack = modules.trussBannersBack ?? 0;
    const bLeft = modules.trussBannersLeft ?? 0;
    const bRight = modules.trussBannersRight ?? 0;
    const wallLines = buildWallLines();
    const ledInfo = summarizeLedFrames();
    const ledLabel = ledInfo.total > 0 ? formatLedWallLabel(ledInfo.counts) : "";

    return [
      `- Boden: ${floorTypeLabel(modules.floor?.type)}`,
      `- Doppelboden: ${raisedFloor ? "Ja" : "Nein"}`,
      ...(wallLines.length ? ["- Wände:", ...wallLines] : []),
      `- Geschlossene Seiten: ${wallsClosedSides}`,
      `- Lagerraum: ${storageRoomEnabled ? "Ja" : "Nein"}${
        storageRoomEnabled ? ` (Tür: ${modules.storageDoorSide ?? "front"})` : ""
      }`,
      `- LED-Rahmen: ${ledInfo.total}${ledLabel ? ` (${ledLabel})` : ""}`,
      `- Counters: ${counters} (Position: ${
        normalizeCounterPlacement(modules.countersWall)
      }, Strom: ${countersWithPower ? "Ja" : "Nein"})`,
      `- Screens: ${screens} (Wand: ${modules.screensWall ?? "back"})`,
      `- Truss: ${trussEnabled ? "Ja" : "Nein"}`,
      `- Truss-Lampen (Typ ${modules.trussLightType ?? "spot"}): Front ${lightsFront}, Back ${lightsBack}, Links ${lightsLeft}, Rechts ${lightsRight}`,
      `- Wandstrahler: Back ${wallBack}, Links ${wallLeft}, Rechts ${wallRight}`,
      `- Truss-Bannerrahmen (ca. ${bannerW || "?"} × ${bannerH || "?"} m): Front ${bFront}, Back ${bBack}, Links ${bLeft}, Rechts ${bRight}`,
    ];
  }, [buildWallLines, formatLedWallLabel, modules, summarizeLedFrames]);

  const buildStandSummary = useCallback(
    (options: { includeFair?: boolean; includePrice?: boolean } = {}) => {
      const area = config.width * config.depth;

      return [
        ...(options.includeFair ? [`Messe / Event: ${fair || "-"}`] : []),
        `Fläche: ${config.width} x ${config.depth} m (${area} m²)`,
        `Standtyp: ${config.type}`,
        `Region: ${config.region}`,
        `Eilauftrag: ${config.rush ? "Ja" : "Nein"}`,
        "",
        "Module:",
        ...buildModuleLines(),
        "",
        ...(options.includePrice ? [`Richtpreis (brutto / Richtwert): ${price.toLocaleString("de-DE")} €`] : []),
      ];
    },
    [buildModuleLines, config.depth, config.region, config.rush, config.type, config.width, fair, price]
  );

  const buildContactSection = useCallback((contact: ContactRequest) => {
    return [
      "=== Kontaktdaten Kunde ===",
      `Name: ${contact.name || "-"}`,
      `Firma: ${contact.company || "-"}`,
      `E-Mail: ${contact.email || "-"}`,
      `Telefon: ${contact.phone || "-"}`,
      contact.fair ? `Messe / Event: ${contact.fair}` : undefined,
    ].filter(Boolean) as string[];
  }, []);

  const copyConfigToClipboard = () => {
    const text = [
      "Neue Standanfrage über den 3D-Konfigurator:",
      "",
      ...buildStandSummary({ includePrice: true }),
    ].join("\n");

    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(text)
        .catch(() => console.log("Kopieren nicht möglich."));
    } else {
      console.log("Zwischenablage nicht verfügbar.");
    }

    if (typeof window !== "undefined" && typeof window.alert === "function") {
      window.alert("Konfiguration wurde in die Zwischenablage kopiert.");
    }
  };

  const sendEmailRequest = (contact: ContactRequest) => {
    const lines = [
      "Neue Standanfrage über den 3D-Konfigurator:",
      "",
      "=== Standdaten ===",
      ...buildStandSummary({ includeFair: true, includePrice: true }),
      "",
      ...buildContactSection(contact),
    ];

    const subject = encodeURIComponent(
      `Standanfrage Konfigurator - ${contact.company || contact.name || "Unbekannt"}`
    );
    const body = encodeURIComponent(lines.join("\n"));
    // Keep this on one line to avoid breaking the email address
    const mailto = `mailto:sunds-messebau@gmx.de?subject=${subject}&body=${body}`;
    if (typeof window !== "undefined" && typeof window.location !== "undefined") {
      window.location.href = mailto;
    }
  };

  const validateContact = useCallback((contact: ContactRequest) => {
    const errors: Partial<Record<keyof ContactRequest, string>> = {};

    if (!contact.name?.trim()) {
      errors.name = "Name ist ein Pflichtfeld.";
    }
    if (!contact.email?.trim()) {
      errors.email = "E-Mail ist erforderlich.";
    } else if (!isValidEmail(contact.email)) {
      errors.email = "Bitte eine gültige E-Mail-Adresse angeben.";
    }

    return errors;
  }, []);

  const handleContactSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const contact: ContactRequest = {
      name: customerName.trim(),
      company: company.trim() || undefined,
      email: email.trim(),
      phone: phone.trim() || undefined,
      fair: fair.trim() || undefined,
    };

    const errors = validateContact(contact);
    if (Object.keys(errors).length) {
      setContactErrors(errors);
      return;
    }

    setContactErrors({});
    sendEmailRequest(contact);
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
          <span className="section-sub">OBB + typabhaengige Clearance</span>
        </div>
        <p style={{ margin: "0.25rem 0 0", lineHeight: 1.35 }}>
          Bewegte Objekte (Tresen, Screens, Kabine, Truss-Griff) nutzen orientierte
          Bounding-Boxes mit typabhaengiger Clearance. Bei drohender Ueberschneidung erscheint ein
          roter Wireframe + Hinweis. Der Puffer laesst sich global ueber
          <code> modules.collisionClearance</code> oder je Objekt via <code>clearance</code> setzen.
        </p>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-header">
          <span className="section-title">Snap & Ausrichtung</span>
          <span className="section-sub">Raster, Waende & Truss</span>
        </div>
        <div className="form-grid">
          <label>
            Snap-Raster (m)
            <input
              type="number"
              min={0.01}
              max={1}
              step={0.01}
              value={gridStep}
              onChange={(e) =>
                patchModules({
                  gridStep: Math.max(0.01, Math.min(1, Number(e.target.value) || 0.1)),
                  snapStep: Math.max(0.01, Math.min(1, Number(e.target.value) || 0.1)),
                })
              }
            />
            <small style={{ color: "#6b7280" }}>
              0.05 m = fein, 0.10 m = Standard, 0.20 m = grob.
            </small>
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={snapToStructure}
              onChange={(e) => patchModules({ snapToStructure: e.target.checked })}
          />
          Snap an Waende / Truss aktiv
        </label>
      </div>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-header">
          <span className="section-title">Layout-Presets</span>
          <span className="section-sub">Truss & Kabinen</span>
        </div>
        <div className="form-grid" style={{ gap: 8 }}>
          <button type="button" className="btn-secondary" onClick={() => applyLayout(generateRectangleLayout)}>
            Rechteckiges Truss-Layout
          </button>
          <button type="button" className="btn-secondary" onClick={() => applyLayout(generateUShapeLayout)}>
            U-Layout
          </button>
          <button type="button" className="btn-secondary" onClick={() => applyLayout(generateBridgeLayout)}>
            Bruecke
          </button>
          <button type="button" className="btn-secondary" onClick={() => applyLayout(generateRearCabinLayout)}>
            Kabine hinten links
          </button>
        </div>
      </div>
      <div className="sidebar-section">
        <div className="sidebar-section-header">
          <span className="section-title">Gruppieren & Linien</span>
          <span className="section-sub">Multi-Select, Align</span>
        </div>
        <p style={{ margin: "0.25rem 0 0", lineHeight: 1.35 }}>
          Mehrere Module mit Strg/Shift anklicken, dann gemeinsam verschieben. Align-Shortcuts: <code>L</code> = gleiche X-Linie, <code>K</code> = gleiche Z-Linie, <code>B</code> = buendig an der Rueckwand. Gruppen folgen beim Drag der Auswahl.
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
          {wallsClosedSides >= 1 && (
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

          {wallsClosedSides >= 2 && (
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

          {wallsClosedSides >= 3 && (
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

          {/* Kabine */}
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={cabinEnabled}
              onChange={(e) => toggleStorageRoom(e.target.checked)}
            />
            Kabine (inkl. Tür)
          </label>

          {cabinEnabled && (
            <>
              {/* Kabine - Maße */}
              <label>
                Kabine Breite (m)
                <input
                  type="number"
                  min={1}
                  step={0.1}
                  value={modules.cabin?.width ?? 1.5}
                  onChange={(e) => {
                    const baseCabin = modules.cabin ?? (buildCabinPatch() as CabinConfig);
                    patchModules({
                      cabin: { ...baseCabin, width: Number(e.target.value) || 0 },
                      storageRoom: true,
                    });
                  }}
                />
              </label>
              <label>
                Kabine Tiefe (m)
                <input
                  type="number"
                  min={1}
                  step={0.1}
                  value={modules.cabin?.depth ?? 1.5}
                  onChange={(e) => {
                    const baseCabin = modules.cabin ?? (buildCabinPatch() as CabinConfig);
                    patchModules({
                      cabin: { ...baseCabin, depth: Number(e.target.value) || 0 },
                      storageRoom: true,
                    });
                  }}
                />
              </label>
              <label>
                Kabine Höhe (m)
                <input
                  type="number"
                  min={2}
                  step={0.1}
                  value={modules.cabin?.height ?? config.height ?? 2.5}
                  onChange={(e) => {
                    const baseCabin = modules.cabin ?? (buildCabinPatch() as CabinConfig);
                    patchModules({
                      cabin: { ...baseCabin, height: Number(e.target.value) || 0 },
                      storageRoom: true,
                    });
                  }}
                />
              </label>

              {/* Kabine - Position */}
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
                        enabled: true,
                      },
                      storageRoom: true,
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
                        enabled: true,
                      },
                      storageRoom: true,
                    });
                  }}
                />
              </label>

              <label>
                Türposition Kabine
                <select
                  value={(modules.cabin?.doorSide as WallSide | undefined) ?? config.modules.storageDoorSide ?? "back"}
                  onChange={(e) => {
                    const baseCabin = modules.cabin ?? (buildCabinPatch() as CabinConfig);
                    const side = e.target.value as WallSide;
                    patchModules({
                      storageDoorSide: side,
                      cabin: { ...baseCabin, doorSide: side, enabled: true },
                      storageRoom: true,
                    });
                  }}
                >
                  <option value="front">Front</option>
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
                value={counters}
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

          {counters > 0 && (
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
                  checked={countersWithPower}
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
                value={screens}
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

          {screens > 0 && (
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

          {detailedScreens.length > 0 && (
            <div className="hint-box" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontWeight: 600 }}>Screen-Video (kundeneigen)</div>
              <small style={{ color: "#4b5563" }}>
                Videos laufen geloopt und standardmaessig stumm. Waehle einen Screen im 3D-Viewport, um Play/Stop und
                Lautstaerke zu steuern (mobile Browser brauchen ggf. einen Tap zum Start).
              </small>
              <label>
                Video-URL
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    type="url"
                    value={videoUrlInput}
                    onChange={(e) => setVideoUrlInput(e.target.value)}
                    placeholder="https://cdn.example.com/clip.mp4"
                  />
                  <button type="button" className="btn-secondary" onClick={handleVideoUrlApply}>
                    Anwenden
                  </button>
                </div>
              </label>
              <label>
                Videodatei (mp4/webm/ogg)
                <input
                  type="file"
                  accept="video/mp4,video/webm,video/ogg,video/quicktime"
                  disabled={videoUploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      void handleVideoUpload(f);
                      e.target.value = "";
                    }
                  }}
                />
                {videoUploadStatus && (
                  <small
                    style={{
                      fontSize: 10,
                      color: videoUploading ? "#2563eb" : "#374151",
                      display: "block",
                      marginTop: 2,
                    }}
                  >
                    {videoUploadStatus}
                  </small>
                )}
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => handlePlayToggle(true)}
                  disabled={!selectedScreen}
                >
                  Play
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => handlePlayToggle(false)}
                  disabled={!selectedScreen}
                >
                  Stop
                </button>
              </div>
              <label>
                Lautstaerke
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={screenVideoVolume}
                  onChange={(e) => handleVolumeChange(Number(e.target.value))}
                />
                <div className="input-inline-display">{screenVideoVolume.toFixed(2)}</div>
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={!screenVideoMuted}
                  onChange={(e) => handleMuteToggle(!e.target.checked)}
                />
                Ton aktivieren (Standard: stumm, Loop an)
              </label>
            </div>
          )}

          {/* Truss & Banner */}
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={trussEnabled}
              onChange={(e) => patchModules({ truss: e.target.checked })}
            />
            Traversen-Hängepunkte (Truss)
          </label>

          {trussEnabled && (
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
                  value={config.traverseHeight ?? modules.trussHeight ?? config.height + 0.5}
                  onChange={(e) => {
                    const nextHeight = Number(e.target.value) || 0;
                    setConfig({
                      traverseHeight: nextHeight,
                      modules: { trussHeight: nextHeight },
                    });
                  }}
                />
                <input
                  type="range"
                  min={config.height + 0.3}
                  max={7}
                  step={0.05}
                  value={config.traverseHeight ?? modules.trussHeight ?? config.height + 0.5}
                  onChange={(e) => {
                    const nextHeight = Number(e.target.value) || 0;
                    setConfig({
                      traverseHeight: nextHeight,
                      modules: { trussHeight: nextHeight },
                    });
                  }}
                />
                <small style={{ fontSize: 10, color: "#6b7280" }}>
                  Höhe der Traverse (Mitte) über Boden. Standard:
                  Wandhöhe + 0,5 m.
                </small>
              </label>

              <label>
                Traverse Segmentlänge (m)
                <input
                  type="number"
                  min={0.4}
                  max={3}
                  step={0.1}
                  value={modules.trussSegmentLength ?? 1}
                  onChange={(e) => {
                    const next = Number(e.target.value) || 0;
                    setConfig({ modules: { trussSegmentLength: next } });
                  }}
                />
                <input
                  type="range"
                  min={0.4}
                  max={3}
                  step={0.05}
                  value={modules.trussSegmentLength ?? 1}
                  onChange={(e) => {
                    const next = Number(e.target.value) || 0;
                    setConfig({ modules: { trussSegmentLength: next } });
                  }}
                />
                <small style={{ fontSize: 10, color: "#6b7280" }}>
                  Kleinere Werte erzeugen mehr Streben-Segmente; Standard 1,0 m.
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
              onChange={(e) => patchLighting({ ambientColor: e.target.value })}
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
              onChange={(e) => patchLighting({ ambientIntensity: Number(e.target.value) })}
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
              onChange={(e) => patchLighting({ environmentIntensity: Number(e.target.value) })}
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
              onChange={(e) => patchLighting({ emissiveIntensity: Number(e.target.value) })}
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
              onChange={(e) => patchLighting({ materialRoughness: Number(e.target.value) })}
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
              onChange={(e) => patchLighting({ materialMetalness: Number(e.target.value) })}
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

      <CameraPanel
        width={config.width}
        depth={config.depth}
        height={config.height}
        floorHeight={floorHeight}
      />

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

        <form className="form-grid contact-form" onSubmit={handleContactSubmit} noValidate>
          <label htmlFor="contact-name">
            Name
            <input
              id="contact-name"
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Max Mustermann"
              aria-invalid={Boolean(contactErrors.name)}
              aria-describedby={contactErrors.name ? "contact-name-error" : undefined}
              required
            />
            {contactErrors.name ? (
              <p className="form-error" role="alert" id="contact-name-error">
                {contactErrors.name}
              </p>
            ) : null}
          </label>
          <label htmlFor="contact-company">
            Firma
            <input
              id="contact-company"
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Firma / Organisation"
            />
          </label>
          <label htmlFor="contact-email">
            E-Mail
            <input
              id="contact-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="mail@unternehmen.de"
              aria-invalid={Boolean(contactErrors.email)}
              aria-describedby={contactErrors.email ? "contact-email-error" : undefined}
              required
            />
            {contactErrors.email ? (
              <p className="form-error" role="alert" id="contact-email-error">
                {contactErrors.email}
              </p>
            ) : null}
          </label>
          <label htmlFor="contact-phone">
            Telefon
            <input
              id="contact-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+49 ..."
            />
          </label>
          <label htmlFor="contact-fair">
            Messe / Event / Ort
            <input
              id="contact-fair"
              type="text"
              value={fair}
              onChange={(e) => setFair(e.target.value)}
              placeholder="z. B. boot Düsseldorf, Halle 5"
            />
          </label>

          <div className="form-actions">
            <button className="btn-primary full-width" type="submit">
              Anfrage per E-Mail erstellen
            </button>
            <p className="form-helper" aria-live="polite">
              Wir nutzen Ihre Angaben ausschließlich zur Angebotserstellung.
            </p>
          </div>
        </form>
      </div>
    </aside>
  );
}



