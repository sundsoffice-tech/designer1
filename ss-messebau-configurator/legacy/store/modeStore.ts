// Simple persisted store to control the visible UI mode (customer/admin).
import { create } from "zustand";

export type Mode = "customer" | "admin";

type ModeState = {
  mode: Mode;
  setMode: (mode: Mode) => void;
  toggleMode: () => void;
};

const STORAGE_KEY = "ss-mode";

const readInitialMode = (): Mode => {
  if (typeof window === "undefined") return "customer";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "admin" ? "admin" : "customer";
  } catch {
    return "customer";
  }
};

const persistMode = (mode: Mode) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // ignore storage errors (private mode, disabled storage, etc.)
  }
};

export const useModeStore = create<ModeState>()((set, get) => ({
  mode: readInitialMode(),
  setMode: (mode) => {
    set({ mode });
    persistMode(mode);
  },
  toggleMode: () => {
    const next = get().mode === "admin" ? "customer" : "admin";
    set({ mode: next });
    persistMode(next);
  },
}));
