import { useConfigStore } from "./store/configStore";
import type { StandConfig } from "./lib/pricing";

export function createStandScene(config: StandConfig) {
  const replaceConfig = useConfigStore.getState().replaceConfig;
  replaceConfig(config);
}

export type { StandConfig };
