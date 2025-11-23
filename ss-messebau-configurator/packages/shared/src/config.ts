export type StandType = "row" | "corner" | "head" | "island";

export type Region = "NRW" | "Sued" | "Süd" | "Nord" | "Ausland" | string;

export type StandConfig = {
  width: number;
  depth: number;
  height: number;
  type: StandType;
  region?: Region;
  rush?: boolean;
  modules: Record<string, unknown>;
  bundleKey?: string;
  bundleLabel?: string;
  bundleDiscount?: number;
};

export type ContactRequest = {
  name: string;
  email: string;
  company?: string;
  phone?: string;
  fair?: string;
  message?: string;
};
