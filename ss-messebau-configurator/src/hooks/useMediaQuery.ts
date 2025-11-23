import { useSyncExternalStore } from "react";

/**
 * Lightweight media query hook to react to breakpoint changes (e.g. desktop vs. mobile).
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = (callback: () => void) => {
    if (typeof window === "undefined") return () => undefined;
    const media = window.matchMedia(query);
    const handleChange = () => callback();
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  };

  const getMatch = () => (typeof window !== "undefined" ? window.matchMedia(query).matches : false);
  const getServerSnapshot = () => false;

  return useSyncExternalStore(subscribe, getMatch, getServerSnapshot);
}
