import { create } from "zustand";

export type EnvironmentPreset = "hall" | "studio" | "outdoor";
export type ToneMappingMode = "aces" | "agx" | "reinhard" | "neutral";

export type EnvironmentOption = {
  id: EnvironmentPreset;
  labelKey: string;
  url: string;
  /** Optional Hinweis, wann die Map am besten passt */
  description?: string;
};

export const HDRI_OPTIONS: EnvironmentOption[] = [
  {
    id: "hall",
    labelKey: "environment.preset.hall",
    url: "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/empty_warehouse_01_2k.hdr",
    description: "Weite Halle mit sanften Reflexionen",
  },
  {
    id: "studio",
    labelKey: "environment.preset.studio",
    url: "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/studio_small_09_2k.hdr",
    description: "Neutraler Studio-Look ohne harte Farbstiche",
  },
  {
    id: "outdoor",
    labelKey: "environment.preset.outdoor",
    url: "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/kiara_1_dawn_2k.hdr",
    description: "Weiches Morgenlicht mit klaren Spiegelungen",
  },
];

type EnvironmentSettings = {
  preset: EnvironmentPreset;
  envIntensity: number;
  ambientIntensity: number;
  ambientColor: string;
  emissiveBoost: number;
  backgroundEnabled: boolean;
  exposure: number;
  toneMapping: ToneMappingMode;
  bloomEnabled: boolean;
  dofEnabled: boolean;
};

type EnvironmentState = EnvironmentSettings & {
  setPreset: (preset: EnvironmentPreset) => void;
  setEnvIntensity: (value: number) => void;
  setAmbientIntensity: (value: number) => void;
  setAmbientColor: (value: string) => void;
  setEmissiveBoost: (value: number) => void;
  setBackgroundEnabled: (value: boolean) => void;
  setExposure: (value: number) => void;
  setToneMapping: (mode: ToneMappingMode) => void;
  setBloomEnabled: (value: boolean) => void;
  setDofEnabled: (value: boolean) => void;
};

const STORAGE_KEY = "ss-environment-settings";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const DEFAULTS: EnvironmentSettings = {
  preset: "hall",
  envIntensity: 1,
  ambientIntensity: 0.35,
  ambientColor: "#ffffff",
  emissiveBoost: 1,
  backgroundEnabled: false,
  exposure: 1,
  toneMapping: "aces",
  bloomEnabled: true,
  dofEnabled: false,
};

const sanitize = (partial: Partial<EnvironmentSettings>): EnvironmentSettings => {
  const preset: EnvironmentPreset = partial.preset ?? DEFAULTS.preset;
  const envIntensity = clamp(
    typeof partial.envIntensity === "number" ? partial.envIntensity : DEFAULTS.envIntensity,
    0,
    3
  );
  const ambientIntensity = clamp(
    typeof partial.ambientIntensity === "number" ? partial.ambientIntensity : DEFAULTS.ambientIntensity,
    0,
    2
  );
  const ambientColor =
    typeof partial.ambientColor === "string" && partial.ambientColor.trim()
      ? partial.ambientColor
      : DEFAULTS.ambientColor;
  const emissiveBoost = clamp(
    typeof partial.emissiveBoost === "number" ? partial.emissiveBoost : DEFAULTS.emissiveBoost,
    0,
    3
  );
  const backgroundEnabled = Boolean(partial.backgroundEnabled ?? DEFAULTS.backgroundEnabled);
  const exposure = clamp(
    typeof partial.exposure === "number" ? partial.exposure : DEFAULTS.exposure,
    0.4,
    2.4
  );
  const toneMapping: ToneMappingMode =
    partial.toneMapping === "agx" || partial.toneMapping === "reinhard" || partial.toneMapping === "neutral"
      ? partial.toneMapping
      : "aces";
  const bloomEnabled = Boolean(partial.bloomEnabled ?? DEFAULTS.bloomEnabled);
  const dofEnabled = Boolean(partial.dofEnabled ?? DEFAULTS.dofEnabled);

  return {
    preset,
    envIntensity,
    ambientIntensity,
    ambientColor,
    emissiveBoost,
    backgroundEnabled,
    exposure,
    toneMapping,
    bloomEnabled,
    dofEnabled,
  };
};

const readInitialState = (): EnvironmentSettings => {
  if (typeof window === "undefined") return { ...DEFAULTS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<EnvironmentSettings>;
    return sanitize(parsed);
  } catch {
    return { ...DEFAULTS };
  }
};

const persistSettings = (settings: EnvironmentSettings) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore write errors (private mode, disabled storage)
  }
};

const mergeAndPersist = (
  current: EnvironmentSettings,
  patch: Partial<EnvironmentSettings>,
  set: (state: Partial<EnvironmentState>) => void
) => {
  const next = sanitize({ ...current, ...patch });
  set(next);
  persistSettings(next);
};

export const useEnvironmentStore = create<EnvironmentState>()((set, get) => ({
  ...readInitialState(),
  setPreset: (preset) => mergeAndPersist(getSettings(get), { preset }, set),
  setEnvIntensity: (value) => mergeAndPersist(getSettings(get), { envIntensity: value }, set),
  setAmbientIntensity: (value) => mergeAndPersist(getSettings(get), { ambientIntensity: value }, set),
  setAmbientColor: (value) => mergeAndPersist(getSettings(get), { ambientColor: value }, set),
  setEmissiveBoost: (value) => mergeAndPersist(getSettings(get), { emissiveBoost: value }, set),
  setBackgroundEnabled: (value) => mergeAndPersist(getSettings(get), { backgroundEnabled: value }, set),
  setExposure: (value) => mergeAndPersist(getSettings(get), { exposure: value }, set),
  setToneMapping: (mode) => mergeAndPersist(getSettings(get), { toneMapping: mode }, set),
  setBloomEnabled: (value) => mergeAndPersist(getSettings(get), { bloomEnabled: value }, set),
  setDofEnabled: (value) => mergeAndPersist(getSettings(get), { dofEnabled: value }, set),
}));

function getSettings(get: () => EnvironmentState): EnvironmentSettings {
  const state = get();
  return {
    preset: state.preset,
    envIntensity: state.envIntensity,
    ambientIntensity: state.ambientIntensity,
    ambientColor: state.ambientColor,
    emissiveBoost: state.emissiveBoost,
    backgroundEnabled: state.backgroundEnabled,
    exposure: state.exposure,
    toneMapping: state.toneMapping,
    bloomEnabled: state.bloomEnabled,
    dofEnabled: state.dofEnabled,
  };
}
