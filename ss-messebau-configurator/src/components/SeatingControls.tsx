import { useMemo, useState } from "react";
import { resolveSeatingGeometry } from "../config/objectDimensions";
import { useTranslation } from "../i18n";
import type { ChairConfig, SeatingCover, SeatingType } from "../lib/pricing";
import { useConfigStore } from "../store/configStore";

type SeatingPalette = Record<SeatingType, { seat: string; frame: string }>;

const SEATING_PALETTE: SeatingPalette = {
  chair: { seat: "#e5e7eb", frame: "#0f172a" },
  barstool: { seat: "#f5f3ff", frame: "#111827" },
  lounge: { seat: "#e2e8f0", frame: "#0f172a" },
};

const COVER_CHOICES: SeatingCover[] = ["none", "white", "branding"];

const resolveSeatType = (seat?: ChairConfig): SeatingType => (seat?.type ?? "chair") as SeatingType;

export default function SeatingControls() {
  const { t } = useTranslation();
  const config = useConfigStore((s) => s.config);
  const setConfig = useConfigStore((s) => s.setConfig);

  const seating = ((config.modules as any).chairsDetailed ?? []) as ChairConfig[];
  const [coverChoice, setCoverChoice] = useState<Partial<Record<SeatingType, SeatingCover>>>({});

  const seatingCounts = useMemo(
    () =>
      seating.reduce(
        (acc, seat) => {
          const type = resolveSeatType(seat);
          acc[type] = (acc[type] ?? 0) + 1;
          return acc;
        },
        { chair: 0, barstool: 0, lounge: 0 } as Record<SeatingType, number>
      ),
    [seating]
  );

  const applyChairs = (next: ChairConfig[]) =>
    setConfig({
      modules: { chairsDetailed: next } as any,
    });

  const updateCover = (type: SeatingType, cover: SeatingCover) => {
    setCoverChoice((prev) => ({ ...prev, [type]: cover }));
    const next = seating.map((seat) =>
      resolveSeatType(seat) === type ? { ...seat, cover } : seat
    );
    applyChairs(next);
  };

  const addSeat = (type: SeatingType) => {
    const id = `${type}-${Date.now()}`;
    const dims = resolveSeatingGeometry(type);
    const palette = SEATING_PALETTE[type];
    const radius = Math.max(0.6, Math.min(config.width, config.depth) / 4);
    const angle = seating.length * 1.2 + seatingCounts[type] * 0.4;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const cover =
      coverChoice[type] ??
      seating.find((s) => resolveSeatType(s) === type)?.cover ??
      "none";

    const next: ChairConfig = {
      id,
      type,
      cover,
      footprint: { w: dims.w, d: dims.d },
      seatHeight: dims.seatHeight,
      backHeight: dims.backHeight,
      color: palette.seat,
      frameColor: palette.frame,
      position: { x, z },
    };

    applyChairs([...seating, next]);
  };

  const removeSeat = (type: SeatingType) => {
    const copy = [...seating];
    const idxFromEnd = copy
      .slice()
      .reverse()
      .findIndex((seat) => resolveSeatType(seat) === type);
    if (idxFromEnd < 0) return;
    copy.splice(copy.length - 1 - idxFromEnd, 1);
    applyChairs(copy);
  };

  const options: { type: SeatingType; label: string; hint: string }[] = [
    { type: "chair", label: t("modules.seating.type.chair"), hint: t("modules.seating.type.chairHint") },
    { type: "barstool", label: t("modules.seating.type.barstool"), hint: t("modules.seating.type.barstoolHint") },
    { type: "lounge", label: t("modules.seating.type.lounge"), hint: t("modules.seating.type.loungeHint") },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <label style={{ fontWeight: 600 }}>{t("modules.seating.title")}</label>
        <small style={{ fontSize: 11, color: "#6b7280" }}>{t("modules.seating.hint")}</small>
      </div>

      {options.map((opt) => {
        const count = seatingCounts[opt.type] ?? 0;
        const selectedCover =
          coverChoice[opt.type] ??
          seating.find((s) => resolveSeatType(s) === opt.type)?.cover ??
          "none";

        return (
          <div
            key={opt.type}
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              padding: "10px 12px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              background: "#f9fafb",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <div>
                <div style={{ fontWeight: 600 }}>{opt.label}</div>
                <small style={{ color: "#6b7280" }}>{opt.hint}</small>
              </div>
              <div style={{ fontSize: 13, color: "#111827", minWidth: 48, textAlign: "right" }}>
                {count}x
              </div>
            </div>

            <div className="number-input-row" style={{ alignItems: "center" }}>
              <div className="number-input-wrapper">
                <input
                  id={`seating-${opt.type}`}
                  type="number"
                  min={0}
                  value={count}
                  readOnly
                  aria-label={opt.label}
                />
                <div className="stepper-buttons">
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => removeSeat(opt.type)}
                    disabled={count === 0}
                  >
                    -
                  </button>
                  <button type="button" className="icon-btn" onClick={() => addSeat(opt.type)}>
                    +
                  </button>
                </div>
              </div>
            </div>

            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
              {t("modules.seating.coverLabel")}
              <select
                value={selectedCover}
                onChange={(e) => updateCover(opt.type, e.target.value as SeatingCover)}
              >
                {COVER_CHOICES.map((cover) => (
                  <option key={cover} value={cover}>
                    {t(`modules.seating.cover.${cover}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        );
      })}
    </div>
  );
}
