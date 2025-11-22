import { useEffect, useMemo } from "react";
import Configurator3D from "./components/Configurator3D";
import { createStandScene } from "./createStandScene";
import type { StandConfig } from "./lib/pricing";

declare global {
  interface Window {
    renderReady?: boolean;
  }
}

function parseConfigParam(): StandConfig | null {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("config");
  if (!raw) return null;
  try {
    return JSON.parse(decodeURIComponent(raw)) as StandConfig;
  } catch (error) {
    console.error("Failed to parse render config", error);
    return null;
  }
}

export default function RenderPage() {
  const parsedConfig = useMemo(() => parseConfigParam(), []);

  useEffect(() => {
    window.renderReady = false;
    return () => {
      window.renderReady = false;
    };
  }, []);

  useEffect(() => {
    if (parsedConfig) {
      createStandScene(parsedConfig);
    }
  }, [parsedConfig]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      window.requestAnimationFrame(() => {
        window.renderReady = true;
      });
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [parsedConfig]);

  return (
    <div className="render-page">
      <Configurator3D />
    </div>
  );
}
