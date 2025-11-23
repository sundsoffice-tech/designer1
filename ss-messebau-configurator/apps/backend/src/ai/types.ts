// Muss zu eurem Frontend-Typ passen
export type StandConfig = {
  width: number;
  depth: number;
  height: number;
  type: "row" | "corner" | "head" | "island";
  region: string;
  rush: boolean;
  modules: any; // optional detaillierter machen, wenn ihr moechtet
};

export type StandConfigPatch = Partial<StandConfig> & {
  modules?: Record<string, any>;
};
