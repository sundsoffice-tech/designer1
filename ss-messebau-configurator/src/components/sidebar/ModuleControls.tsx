
import { useCallback, useEffect, useMemo, useState } from "react";
import { getAllowedWalls, useConfigStore, type DeepPartial } from "../../store/configStore";
import { useMaterialStore } from "../../store/materialStore";
import { resolveEffectiveContrast, useAccessibilityStore } from "../../store/accessibilityStore";
import { useTranslation } from "../../i18n";
import { fileToDataUrl } from "../../utils/file";
import { uploadBannerImage } from "../../lib/uploadClient";
import { getAllowedOptions } from "../../utils/options";
import type {
  AccessibilityConfig,
  CabinDoorSide,
  StandModules,
  TrussLightConfig,
  WallLightConfig,
  WallSurface,
  WallSide,
} from "../../lib/pricing";
import type { ModuleBundle } from "../../types/modules";

type MaterialDraftTarget = "floor" | "wall" | "counter";

type FloorControlsProps = {
  floorSelectValue: string;
  floorRaised: boolean;
  floorType: string;
  barrierFreeEnabled: boolean;
  rampLength: number;
  applyFloorSelection: (value: string) => void;
  handleFloorTextureUpload: (file?: File | null) => Promise<void>;
  updateAccessibility: (next: Partial<AccessibilityConfig>) => void;
  floorTypeLabel: (type?: string) => string;
  patchModules: (mods: DeepPartial<StandModules>) => void;
  floorMaterials: any[];
  materialStatus: string | null;
  setMaterialStatus: (status: string | null) => void;
  configDepth: number;
};

type WallControlsProps = {
  allowedWalls: WallSide[];
  wallFinishes: any[];
  wallCounts: Record<WallSide, number>;
  ledWallAllowed: boolean;
  wallSelectValue: (side: WallSide) => string;
  applyWallSelection: (side: WallSide, value: string) => void;
  updateWallLightCount: (side: WallSide, value: number) => void;
  handleWallTextureUpload: (side: WallSide, file?: File | null) => Promise<void>;
  selectedWallForUpload?: WallSide;
  setWallUploadSide: (side: WallSide | "") => void;
  wallUploadSide: WallSide | "";
  sideLabel: (side: CabinDoorSide) => string;
};

type CabinControlsProps = {
  cabinEnabled: boolean;
  storageDoorOptions: WallSide[];
  selectedCabinDoorSide: WallSide | "";
  getCabinSurface: (side: CabinDoorSide) => string;
  updateCabinSurface: (side: CabinDoorSide, surface: string) => void;
  patchModules: (mods: DeepPartial<StandModules>) => void;
  sideLabel: (side: CabinDoorSide) => string;
  configModules: StandModules;
};

type CounterControlsProps = {
  counterVariantOptions: { value: string; label: string }[];
  counterFinishes: any[];
  patchModules: (mods: DeepPartial<StandModules>) => void;
  counters: number;
  countersWall?: "front" | "island";
  counterVariant?: string;
  counterFinishId?: string;
  countersWithPower?: boolean;
};

type ScreenControlsProps = {
  screensCount: number;
  allowedWalls: WallSide[];
  screensWallValue: WallSide | "";
  sideLabel: (side: CabinDoorSide) => string;
  patchModules: (mods: DeepPartial<StandModules>) => void;
};

type TrussControlsProps = {
  enabled: boolean;
  trussCounts: Record<"front" | "back" | "left" | "right", number>;
  hasBackWall: boolean;
  hasLeftWall: boolean;
  hasRightWall: boolean;
  trussHeightValue: number;
  minTrussHeight: number;
  maxTrussHeight: number;
  wallTopHeight: number;
  trussOffsetClamped: number;
  trussHeightMode: "offset" | "absolute";
  setMaterialStatus: (status: string | null) => void;
  patchModules: (mods: DeepPartial<StandModules>) => void;
  updateTrussLightCount: (side: "front" | "back" | "left" | "right", value: number) => void;
  trussLightType: string;
  trussBannerWidth?: number;
  trussBannerHeight?: number;
  defaultBannerWidth: number;
  defaultBannerHeight: number;
};

type MaterialControlsProps = {
  materialTarget: MaterialDraftTarget;
  setMaterialTarget: (target: MaterialDraftTarget) => void;
  materialEditId: string;
  setMaterialEditId: (id: string) => void;
  materialLabel: string;
  setMaterialLabel: (v: string) => void;
  materialColor: string;
  setMaterialColor: (v: string) => void;
  materialBaseType: "carpet" | "laminate" | "vinyl" | "wood";
  setMaterialBaseType: (v: MaterialControlsProps["materialBaseType"]) => void;
  materialSurface: WallSurface;
  setMaterialSurface: (v: WallSurface) => void;
  materialRoughness: number;
  setMaterialRoughness: (v: number) => void;
  materialMetalness: number;
  setMaterialMetalness: (v: number) => void;
  materialEmissiveIntensity: number;
  setMaterialEmissiveIntensity: (v: number) => void;
  handleMaterialTextureFile: (file?: File | null) => Promise<void>;
  handleMaterialFile: (file?: File | null) => Promise<void>;
  materialOptions: any[];
  hydrateMaterialDraft: (target: MaterialDraftTarget, id: string) => void;
  handleQuickMaterialAdd: () => void;
  resetMaterials: () => void;
  resetMaterialDraft: (target: MaterialDraftTarget) => void;
  materialStatus: string | null;
  floorMaterials: any[];
  wallFinishes: any[];
  counterFinishes: any[];
  materialTexture: { dataUrl: string; fileName: string } | null;
  setMaterialTexture: (val: { dataUrl: string; fileName: string } | null) => void;
};

type ModuleControlsProps = {
  showMaterialLibrary?: boolean;
};

type BundleOption = ModuleBundle & { config?: DeepPartial<StandModules>; name?: string };

function FloorControls(props: FloorControlsProps) {
  const {
    floorSelectValue,
    floorRaised,
    floorType,
    barrierFreeEnabled,
    rampLength,
    applyFloorSelection,
    handleFloorTextureUpload,
    updateAccessibility,
    floorTypeLabel,
    patchModules,
    floorMaterials,
    materialStatus,
    setMaterialStatus,
    configDepth,
  } = props;

  return (
    <>
      <label>
        Bodenbelag
        <select
          value={floorSelectValue}
          onChange={(e) => {
            setMaterialStatus(null);
            applyFloorSelection(e.target.value);
          }}
        >
          {floorMaterials.length > 0 && (
            <optgroup label="Kuratierte Auswahl (Admin)">
              {floorMaterials.map((mat) => (
                <option key={mat.id} value={`mat:${mat.id}`}>
                  {mat.label} ({floorTypeLabel(mat.baseType)})
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="Standard">
            <option value="type:carpet">Teppich</option>
            <option value="type:laminate">Laminat</option>
            <option value="type:vinyl">Vinyl</option>
            <option value="type:wood">Holz</option>
          </optgroup>
        </select>
      </label>

      <label>
        Eigenes Bodenbild (PNG/JPG)
        <input type="file" accept="image/*" onChange={(e) => handleFloorTextureUpload(e.target.files?.[0])} />
        <small style={{ fontSize: 10, color: "#6b7280" }}>
          Wird nur im Browser gespeichert und taucht sofort in den Boden-Optionen auf.
        </small>
      </label>

      <label className="toggle-line">
        <input
          type="checkbox"
          checked={barrierFreeEnabled}
          onChange={(e) => updateAccessibility({ barrierFree: e.target.checked })}
        />
        <div className="toggle-line-text">
          <span>Barrierefreie Rampe</span>
          <small>Rampensymbol wird im 3D angezeigt.</small>
        </div>
      </label>

      {barrierFreeEnabled && (
        <label>
          Rampenlaenge (m)
          <input
            type="number"
            min={0.8}
            max={Math.max(configDepth - 0.2, 0.8)}
            step={0.1}
            value={rampLength}
            aria-describedby="ramp-length-hint"
            onChange={(e) =>
              updateAccessibility({
                rampLength: Math.max(
                  0.8,
                  Math.min(parseFloat(e.target.value) || 0.8, Math.max(configDepth - 0.2, 0.8))
                ),
              })
            }
          />
          <small id="ramp-length-hint">Standard: 1,2 m. Wird auf die Frontseite gesetzt.</small>
        </label>
      )}

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={floorRaised}
          onChange={(e) =>
            patchModules({
              raisedFloor: e.target.checked,
              floor: {
                type: floorType as any,
                raised: e.target.checked,
              },
            })
          }
        />
        Doppelboden
      </label>

      {materialStatus && (
        <div className="ai-alert success" role="status" style={{ gridColumn: "1 / -1" }}>
          {materialStatus}
        </div>
      )}
    </>
  );
}

function WallControls(props: WallControlsProps) {
  const {
    allowedWalls,
    wallFinishes,
    wallCounts,
    ledWallAllowed,
    wallSelectValue,
    applyWallSelection,
    updateWallLightCount,
    handleWallTextureUpload,
    selectedWallForUpload,
    setWallUploadSide,
    wallUploadSide,
    sideLabel,
  } = props;

  return (
    <>
      <label htmlFor="fixed-walls">
        Geschlossene Seiten
        <input id="fixed-walls" type="number" value={allowedWalls.length} readOnly disabled />
      </label>

      {allowedWalls.includes("back") && (
        <>
          <label>
            Wanddesign Rueckwand
            <select value={wallSelectValue("back")} onChange={(e) => applyWallSelection("back", e.target.value)}>
              {wallFinishes.length > 0 && (
                <optgroup label="Kuratierte Auswahl (Admin)">
                  {wallFinishes.map((finish) => (
                    <option key={finish.id} value={`finish:${finish.id}`}>
                      {finish.label}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="Standard">
                <option value="surface:system">Systemwand (weiss)</option>
                <option value="surface:wood">Holzwand</option>
                <option value="surface:banner">Bannerflaeche</option>
                <option value="surface:seg">SEG / Textilrahmen</option>
                <option value="surface:led" disabled={!ledWallAllowed}>
                  LED-Wand {ledWallAllowed ? "" : "(Octalumina erforderlich)"}
                </option>
              </optgroup>
            </select>
          </label>

          <label>
            Strahler Rueckwand
            <input
              type="number"
              min={0}
              value={wallCounts.back}
              onChange={(e) => updateWallLightCount("back", Number(e.target.value) || 0)}
            />
          </label>

          <label>
            Eigene Wandgrafik (PNG/JPG)
            <div className="material-quick" style={{ alignItems: "center" }}>
              <select value={wallUploadSide} onChange={(e) => setWallUploadSide(e.target.value as WallSide)}>
                {allowedWalls.map((side) => (
                  <option key={side} value={side}>
                    {sideLabel(side)}
                  </option>
                ))}
              </select>
              <input
                type="file"
                accept="image/*"
                disabled={!selectedWallForUpload}
                onChange={(e) => {
                  if (!selectedWallForUpload) return;
                  handleWallTextureUpload(selectedWallForUpload, e.target.files?.[0]);
                }}
              />
            </div>
            <small style={{ fontSize: 10, color: "#6b7280" }}>
              Motiv wird lokal gespeichert und fuer Dropdowns und Rechtsklick-Menue uebernommen.
            </small>
          </label>
        </>
      )}

      {allowedWalls.includes("left") && (
        <>
          <label>
            Wanddesign linke Wand
            <select value={wallSelectValue("left")} onChange={(e) => applyWallSelection("left", e.target.value)}>
              {wallFinishes.length > 0 && (
                <optgroup label="Kuratierte Auswahl (Admin)">
                  {wallFinishes.map((finish) => (
                    <option key={finish.id} value={`finish:${finish.id}`}>
                      {finish.label}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="Standard">
                <option value="surface:system">Systemwand (weiss)</option>
                <option value="surface:wood">Holzwand</option>
                <option value="surface:banner">Bannerflaeche</option>
                <option value="surface:seg">SEG / Textilrahmen</option>
                <option value="surface:led" disabled={!ledWallAllowed}>
                  LED-Wand {ledWallAllowed ? "" : "(Octalumina erforderlich)"}
                </option>
              </optgroup>
            </select>
          </label>

          <label>
            Strahler linke Wand
            <input
              type="number"
              min={0}
              value={wallCounts.left}
              onChange={(e) => updateWallLightCount("left", Number(e.target.value) || 0)}
            />
          </label>
        </>
      )}

      {allowedWalls.includes("right") && (
        <>
          <label>
            Wanddesign rechte Wand
            <select value={wallSelectValue("right")} onChange={(e) => applyWallSelection("right", e.target.value)}>
              {wallFinishes.length > 0 && (
                <optgroup label="Kuratierte Auswahl (Admin)">
                  {wallFinishes.map((finish) => (
                    <option key={finish.id} value={`finish:${finish.id}`}>
                      {finish.label}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="Standard">
                <option value="surface:system">Systemwand (weiss)</option>
                <option value="surface:wood">Holzwand</option>
                <option value="surface:banner">Bannerflaeche</option>
                <option value="surface:seg">SEG / Textilrahmen</option>
                <option value="surface:led" disabled={!ledWallAllowed}>
                  LED-Wand {ledWallAllowed ? "" : "(Octalumina erforderlich)"}
                </option>
              </optgroup>
            </select>
          </label>

          <label>
            Strahler rechte Wand
            <input
              type="number"
              min={0}
              value={wallCounts.right}
              onChange={(e) => updateWallLightCount("right", Number(e.target.value) || 0)}
            />
          </label>
        </>
      )}
    </>
  );
}

function CabinControls(props: CabinControlsProps) {
  const {
    cabinEnabled,
    storageDoorOptions,
    selectedCabinDoorSide,
    getCabinSurface,
    updateCabinSurface,
    patchModules,
    sideLabel,
    configModules,
  } = props;

  return (
    <>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={configModules.storageRoom}
          onChange={(e) => patchModules({ storageRoom: e.target.checked })}
        />
        Lagerraum / Kabine
      </label>

      {configModules.storageRoom && (
        <>
          <label>
            Kabine Breite (m)
            <input
              type="number"
              min={1}
              step={0.1}
              value={(configModules as any).cabin?.width ?? 1.5}
              onChange={(e) => patchModules({ cabin: { width: Number(e.target.value) || 0 } as any })}
            />
          </label>
          <label>
            Kabine Tiefe (m)
            <input
              type="number"
              min={1}
              step={0.1}
              value={(configModules as any).cabin?.depth ?? 1.5}
              onChange={(e) => patchModules({ cabin: { depth: Number(e.target.value) || 0 } as any })}
            />
          </label>

          <label>
            Kabine X-Position (m)
            <input
              type="number"
              step={0.1}
              value={(configModules as any).cabin?.position?.x ?? 0}
              onChange={(e) => patchModules({ cabin: { position: { x: Number(e.target.value) } } as any })}
            />
          </label>

          <label>
            Kabine Z-Position (m)
            <input
              type="number"
              step={0.1}
              value={(configModules as any).cabin?.position?.z ?? 0}
              onChange={(e) => patchModules({ cabin: { position: { z: Number(e.target.value) } } as any })}
            />
          </label>

          <label>
            Kabinenwand Front
            <select value={getCabinSurface("front")} onChange={(e) => updateCabinSurface("front", e.target.value)}>
              <option value="system">Systemwand (hell)</option>
              <option value="wood">Holzwand</option>
              <option value="banner">Bannerflaeche</option>
              <option value="seg">SEG / Textilrahmen</option>
              <option value="led">LED-Wand</option>
            </select>
          </label>

          <label>
            Kabinenwand Hinten
            <select value={getCabinSurface("back")} onChange={(e) => updateCabinSurface("back", e.target.value)}>
              <option value="system">Systemwand (hell)</option>
              <option value="wood">Holzwand</option>
              <option value="banner">Bannerflaeche</option>
              <option value="seg">SEG / Textilrahmen</option>
              <option value="led">LED-Wand</option>
            </select>
          </label>

          <label>
            Kabinenwand Links
            <select value={getCabinSurface("left")} onChange={(e) => updateCabinSurface("left", e.target.value)}>
              <option value="system">Systemwand (hell)</option>
              <option value="wood">Holzwand</option>
              <option value="banner">Bannerflaeche</option>
              <option value="seg">SEG / Textilrahmen</option>
              <option value="led">LED-Wand</option>
            </select>
          </label>

          <label>
            Kabinenwand Rechts
            <select value={getCabinSurface("right")} onChange={(e) => updateCabinSurface("right", e.target.value)}>
              <option value="system">Systemwand (hell)</option>
              <option value="wood">Holzwand</option>
              <option value="banner">Bannerflaeche</option>
              <option value="seg">SEG / Textilrahmen</option>
              <option value="led">LED-Wand</option>
            </select>
          </label>

          <label>
            Tuerposition Lagerraum
            <select
              value={selectedCabinDoorSide}
              onChange={(e) =>
                patchModules({
                  storageDoorSide: e.target.value as WallSide,
                  cabin: { doorSide: e.target.value as WallSide } as any,
                })
              }
              disabled={!storageDoorOptions.length || !cabinEnabled}
            >
              {storageDoorOptions.map((side) => (
                <option key={side} value={side}>
                  {sideLabel(side)}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
    </>
  );
}

function CounterControls(props: CounterControlsProps) {
  const { counterVariantOptions, counterFinishes, patchModules, counters, countersWall, counterVariant, counterFinishId, countersWithPower } =
    props;

  return (
    <>
      <label>
        Counters / Theken
        <div className="number-input-row">
          <div className="number-input-wrapper">
            <input
              type="number"
              min={0}
              value={counters}
              onChange={(e) => patchModules({ counters: Number(e.target.value) || 0 })}
            />
            <div className="stepper-buttons">
              <button type="button" className="icon-btn" onClick={() => patchModules({ counters: Math.max(0, counters - 1) })}>
                -
              </button>
              <button type="button" className="icon-btn" onClick={() => patchModules({ counters: counters + 1 })}>
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
            <select value={countersWall ?? "front"} onChange={(e) => patchModules({ countersWall: e.target.value as any })}>
              <option value="front">Front (Besucherkante)</option>
              <option value="island">Insel (Mitte)</option>
            </select>
          </label>

          <label>
            Counter-Design
            <select value={counterVariant ?? "basic"} onChange={(e) => patchModules({ counterVariant: e.target.value as any })}>
              {counterVariantOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Theken-Finish (Palette)
            <select value={counterFinishId ?? ""} onChange={(e) => patchModules({ counterFinishId: e.target.value || undefined })}>
              <option value="">Standardfarbe</option>
              {counterFinishes.map((finish) => (
                <option key={finish.id} value={finish.id}>
                  {finish.label}
                </option>
              ))}
            </select>
          </label>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={countersWithPower ?? false}
              onChange={(e) => patchModules({ countersWithPower: e.target.checked })}
            />
            Tresen mit Strompaket
          </label>
        </>
      )}
    </>
  );
}

function ScreenControls(props: ScreenControlsProps) {
  const { screensCount, allowedWalls, screensWallValue, sideLabel, patchModules } = props;

  return (
    <>
      <label>
        Screens / Monitore
        <div className="number-input-row">
          <div className="number-input-wrapper">
            <input type="number" min={0} value={screensCount} onChange={(e) => patchModules({ screens: Number(e.target.value) || 0 })} />
            <div className="stepper-buttons">
              <button type="button" className="icon-btn" onClick={() => patchModules({ screens: Math.max(0, screensCount - 1) })}>
                -
              </button>
              <button type="button" className="icon-btn" onClick={() => patchModules({ screens: screensCount + 1 })}>
                +
              </button>
            </div>
          </div>
        </div>
      </label>

      {screensCount > 0 && (
        <label>
          Screens an Wand
          <select
            value={screensWallValue}
            onChange={(e) =>
              patchModules({
                screensWall: e.target.value as WallSide,
              })
            }
            disabled={!allowedWalls.length}
          >
            {allowedWalls.map((side) => (
              <option key={side} value={side}>
                {sideLabel(side)}
              </option>
            ))}
          </select>
        </label>
      )}
    </>
  );
}

function TrussControls(props: TrussControlsProps) {
  const {
    enabled,
    trussCounts,
    hasBackWall,
    hasLeftWall,
    hasRightWall,
    trussHeightValue,
    minTrussHeight,
    maxTrussHeight,
    wallTopHeight,
    trussOffsetClamped,
    trussHeightMode,
    setMaterialStatus,
    patchModules,
    updateTrussLightCount,
    trussLightType,
    trussBannerWidth,
    trussBannerHeight,
    defaultBannerWidth,
    defaultBannerHeight,
  } = props;

  return (
    <>
      <label className="checkbox-row">
        <input type="checkbox" checked={enabled} onChange={(e) => patchModules({ truss: e.target.checked })} />
        Traversen-Hängepunkte (Truss)
      </label>

      {enabled && (
        <>
          <label>
            Lampentyp Truss
            <select value={trussLightType ?? "spot"} onChange={(e) => patchModules({ trussLightType: e.target.value } as any)}>
              <option value="spot">Spots</option>
              <option value="wash">Fluter / Wash</option>
            </select>
          </label>

          <label>
            Abstand zur Wandoberkante (m)
            <input
              type="range"
              min={0.3}
              max={maxTrussHeight - wallTopHeight}
              step={0.05}
              value={trussOffsetClamped}
              onChange={(e) => {
                const offsetRaw = Number(e.target.value) || 0.3;
                const offset = Math.min(Math.max(offsetRaw, 0.3), maxTrussHeight - wallTopHeight);
                const absolute = wallTopHeight + offset;
                const clamped = Math.max(minTrussHeight, Math.min(absolute, maxTrussHeight));
                patchModules({
                  trussHeightMode: "offset",
                  trussHeightOffset: offset,
                  trussHeight: clamped,
                } as any);
              }}
            />

            <small style={{ fontSize: 10, color: "#6b7280" }}>
              {trussOffsetClamped.toFixed(2)} m ueber Wandoberkante - Gesamt: {(wallTopHeight + trussOffsetClamped).toFixed(2)} m
            </small>
          </label>

          <label htmlFor="truss-height">
            Truss-Hoehe absolut (m)
            <input
              id="truss-height"
              type="number"
              min={minTrussHeight}
              max={maxTrussHeight}
              step={0.1}
              value={trussHeightValue.toFixed(2)}
              onChange={(e) => {
                const raw = Number(e.target.value) || minTrussHeight;
                const clamped = Math.max(minTrussHeight, Math.min(raw, maxTrussHeight));
                patchModules({
                  trussHeightMode: "absolute",
                  trussHeight: clamped,
                  trussHeightOffset: Math.max(0.1, clamped - wallTopHeight),
                } as any);
              }}
              aria-describedby="truss-height-hint"
            />

            <small id="truss-height-hint" style={{ fontSize: 10, color: "#6b7280" }}>
              Standard: Wandhoehe + 0,5 m. Regler = Abstand zur Wandoberkante, Feld = absolute Angabe
              ({trussHeightMode === "offset" ? "Offset aktiv" : "absolute Eingabe aktiv"}).
            </small>
          </label>

          <label>
            Lampen Truss – Front
            <input type="number" min={0} value={trussCounts.front} onChange={(e) => updateTrussLightCount("front", Number(e.target.value) || 0)} />
          </label>
          <label>
            Lampen Truss – Back
            <input type="number" min={0} value={trussCounts.back} onChange={(e) => updateTrussLightCount("back", Number(e.target.value) || 0)} />
          </label>
          <label>
            Lampen Truss – Links
            <input type="number" min={0} value={trussCounts.left} onChange={(e) => updateTrussLightCount("left", Number(e.target.value) || 0)} />
          </label>
          <label>
            Lampen Truss – Rechts
            <input type="number" min={0} value={trussCounts.right} onChange={(e) => updateTrussLightCount("right", Number(e.target.value) || 0)} />
          </label>

          <label>
            Banner-Breite (m)
            <input
              type="number"
              step={0.1}
              min={1}
              value={trussBannerWidth ?? defaultBannerWidth}
              onChange={(e) => patchModules({ trussBannerWidth: Number(e.target.value) || 0 } as any)}
            />
          </label>

          <label>
            Banner-Höhe (m)
            <input
              type="number"
              step={0.1}
              min={0.5}
              value={trussBannerHeight ?? defaultBannerHeight}
              onChange={(e) => patchModules({ trussBannerHeight: Number(e.target.value) || 0 } as any)}
            />
          </label>

          {hasBackWall && (
            <label>
              Bannerrahmen – Back
              <input
                type="number"
                min={0}
                value={(enabled as any).trussBannersBack ?? 0}
                onChange={(e) => patchModules({ trussBannersBack: Number(e.target.value) || 0 } as any)}
              />
            </label>
          )}

          {hasLeftWall && (
            <label>
              Bannerrahmen – Links
              <input
                type="number"
                min={0}
                value={(enabled as any).trussBannersLeft ?? 0}
                onChange={(e) => patchModules({ trussBannersLeft: Number(e.target.value) || 0 } as any)}
              />
            </label>
          )}

          {hasRightWall && (
            <label>
              Bannerrahmen – Rechts
              <input
                type="number"
                min={0}
                value={(enabled as any).trussBannersRight ?? 0}
                onChange={(e) => patchModules({ trussBannersRight: Number(e.target.value) || 0 } as any)}
              />
            </label>
          )}

          <label htmlFor="truss-banner-image">
            Banner-Bild (optional)
            <input
              id="truss-banner-image"
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const processed = await uploadBannerImage(file);
                  patchModules({ trussBannerImageUrl: processed.url, trussBannerMipmaps: processed.mipmaps ?? [] } as any);
                  setMaterialStatus(`Banner-Bild komprimiert (${file.name})`);
                } catch (err) {
                  const dataUrl = await fileToDataUrl(file);
                  patchModules({ trussBannerImageUrl: dataUrl, trussBannerMipmaps: [] } as any);
                  setMaterialStatus(`Upload fehlgeschlagen, lokale Vorschau genutzt (${file.name})`);
                }
              }}
              aria-describedby="truss-banner-hint"
            />

            <small id="truss-banner-hint" style={{ fontSize: 10, color: "#6b7280" }}>
              Bilder werden serverseitig in WebP konvertiert und mit Mipmaps f��r saubere Banner ausgeliefert.
            </small>
          </label>
        </>
      )}
    </>
  );
}

function MaterialControls(props: MaterialControlsProps) {
  const {
    materialTarget,
    setMaterialTarget,
    materialEditId,
    setMaterialEditId,
    materialLabel,
    setMaterialLabel,
    materialColor,
    setMaterialColor,
    materialRoughness,
    setMaterialRoughness,
    materialMetalness,
    setMaterialMetalness,
    materialEmissiveIntensity,
    setMaterialEmissiveIntensity,
    materialBaseType,
    setMaterialBaseType,
    materialSurface,
    setMaterialSurface,
    handleMaterialTextureFile,
    handleMaterialFile,
    materialOptions,
    hydrateMaterialDraft,
    handleQuickMaterialAdd,
    resetMaterials,
    resetMaterialDraft,
    materialStatus,
    floorMaterials,
    wallFinishes,
    counterFinishes,
    materialTexture,
    setMaterialTexture,
  } = props;

  return (
    <div className="sidebar-section">
      <div className="sidebar-section-header">
        <span className="section-title">Materialbibliothek</span>
        <span className="section-sub">Boden / Wand / Tresen</span>
      </div>

      <div className="material-palette">
        <div className="material-chip-row">
          <strong>Böden ({floorMaterials.length})</strong>
          <div className="chip-line">
            {floorMaterials.slice(0, 4).map((f) => (
              <span key={f.id} className="chip" style={{ background: f.color ?? "#e5e7eb" }} title={f.id}>
                {f.label}
              </span>
            ))}
            {floorMaterials.length === 0 && <span className="chip muted">Noch keine Einträge</span>}
          </div>
        </div>

        <div className="material-chip-row">
          <strong>Wände ({wallFinishes.length})</strong>
          <div className="chip-line">
            {wallFinishes.slice(0, 4).map((w) => (
              <span key={w.id} className="chip" style={{ background: w.color ?? "#e5e7eb" }} title={w.id}>
                {w.label}
              </span>
            ))}
            {wallFinishes.length === 0 && <span className="chip muted">Noch keine Einträge</span>}
          </div>
        </div>

        <div className="material-chip-row">
          <strong>Theken ({counterFinishes.length})</strong>
          <div className="chip-line">
            {counterFinishes.slice(0, 4).map((c) => (
              <span key={c.id} className="chip" style={{ background: c.color ?? "#e5e7eb" }} title={c.id}>
                {c.label}
              </span>
            ))}
            {counterFinishes.length === 0 && <span className="chip muted">Noch keine Einträge</span>}
          </div>
        </div>
      </div>

      <div className="form-grid">
        <label htmlFor="material-import">
          Palette aus Datei (JSON)
          <input id="material-import" type="file" accept=".json" onChange={(e) => handleMaterialFile(e.target.files?.[0])} aria-describedby="material-import-hint" />
          <small id="material-import-hint">
            Minimal-Format: {"{ floors:[{ id, label, baseType, color }], walls:[{ id, label, surface }], counters:[] }"}
          </small>
        </label>

        <label htmlFor="material-target">
          Schnell anlegen
          <div className="material-quick" role="group" aria-labelledby="material-quick-label" aria-describedby="material-quick-hint">
            <span id="material-quick-label" className="visually-hidden">
              Schnell anlegen
            </span>
            <span id="material-quick-hint" className="visually-hidden">
              Materialtyp waehlen, Name vergeben und optional Farbe oder Oberflaeche setzen.
            </span>

            <select
              id="material-target"
              aria-label="Materialtyp"
              value={materialTarget}
              onChange={(e) => {
                const next = e.target.value as MaterialDraftTarget;
                setMaterialTarget(next);
                hydrateMaterialDraft(next, "new");
              }}
            >
              <option value="floor">Boden</option>
              <option value="wall">Wand</option>
              <option value="counter">Theke</option>
            </select>

            <select aria-label="Bestehendes Material bearbeiten" value={materialEditId} onChange={(e) => hydrateMaterialDraft(materialTarget, e.target.value)}>
              <option value="new">Neu anlegen</option>
              {materialOptions.map((mat) => (
                <option key={mat.id} value={mat.id}>
                  Bearbeiten: {mat.label}
                </option>
              ))}
            </select>

            <input
              type="text"
              placeholder="Name / Label"
              value={materialLabel}
              onChange={(e) => setMaterialLabel(e.target.value)}
              aria-label="Materialname"
            />

            <input type="color" value={materialColor} onChange={(e) => setMaterialColor(e.target.value)} aria-label="Farbwahl" />

            <div className="material-slider">
              <span style={{ fontSize: 12 }}>Roughness</span>
              <div className="material-quick" style={{ alignItems: "center" }}>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={materialRoughness}
                  onChange={(e) => setMaterialRoughness(parseFloat(e.target.value) || 0)}
                />
                <span className="chip">{materialRoughness.toFixed(2)}</span>
              </div>
            </div>

            <div className="material-slider">
              <span style={{ fontSize: 12 }}>Metalness</span>
              <div className="material-quick" style={{ alignItems: "center" }}>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={materialMetalness}
                  onChange={(e) => setMaterialMetalness(parseFloat(e.target.value) || 0)}
                />
                <span className="chip">{materialMetalness.toFixed(2)}</span>
              </div>
            </div>

            {materialTarget === "wall" && (
              <div className="material-slider">
                <span style={{ fontSize: 12 }}>Emissive</span>
                <div className="material-quick" style={{ alignItems: "center" }}>
                  <input
                    type="range"
                    min={0}
                    max={2}
                    step={0.05}
                    value={materialEmissiveIntensity}
                    onChange={(e) => setMaterialEmissiveIntensity(parseFloat(e.target.value) || 0)}
                  />
                  <span className="chip">{materialEmissiveIntensity.toFixed(2)}</span>
                </div>
              </div>
            )}

            {materialTarget !== "counter" && (
              <div className="material-file">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleMaterialTextureFile(e.target.files?.[0])}
                  aria-label={materialEditId === "new" ? "Textur hinzufuegen (optional)" : "Textur ersetzen"}
                />

                {materialTexture && materialEditId !== "new" && (
                  <small>Aktuell: {materialTexture.fileName}</small>
                )}
              </div>
            )}

            {materialTarget === "floor" && (
              <select value={materialBaseType} onChange={(e) => setMaterialBaseType(e.target.value as any)} aria-label="Boden-Basis">
                <option value="carpet">Teppich</option>
                <option value="laminate">Laminat</option>
                <option value="vinyl">Vinyl</option>
                <option value="wood">Holz</option>
              </select>
            )}

            {materialTarget === "wall" && (
              <select value={materialSurface} onChange={(e) => setMaterialSurface(e.target.value as any)} aria-label="Wandoberflaeche">
                <option value="system">System</option>
                <option value="wood">Holz</option>
                <option value="banner">Banner</option>
                <option value="seg">SEG</option>
                <option value="led">LED</option>
              </select>
            )}
          </div>
        </label>
      </div>

      <div className="preset-row" style={{ gap: 8 }}>
        <button type="button" className="btn-primary" onClick={handleQuickMaterialAdd}>
          Eintrag speichern
        </button>

        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            resetMaterials();
            setMaterialEditId("new");
            resetMaterialDraft(materialTarget);
            setMaterialTexture(null);
          }}
        >
          Admin-Defaults laden
        </button>
      </div>

      {materialStatus && <div className="ai-alert success">{materialStatus}</div>}
    </div>
  );
}

export function ModuleControls({ showMaterialLibrary = true }: ModuleControlsProps) {
  const { t } = useTranslation();
  const { config, setConfig, moduleCatalog, moduleVariants, moduleCompatibility } = useConfigStore();
  const patchModules = (mods: DeepPartial<StandModules>) => setConfig({ modules: mods });
  const materialPalette = useMaterialStore((s) => s.palette);
  const importMaterials = useMaterialStore((s) => s.importFromJson);
  const resetMaterials = useMaterialStore((s) => s.reset);
  const addFloorMaterial = useMaterialStore((s) => s.addFloorMaterial);
  const addWallFinish = useMaterialStore((s) => s.addWallFinish);
  const addCounterFinish = useMaterialStore((s) => s.addCounterFinish);
  const updateFloorMaterial = useMaterialStore((s) => s.updateFloorMaterial);
  const updateWallFinish = useMaterialStore((s) => s.updateWallFinish);
  const updateCounterFinish = useMaterialStore((s) => s.updateCounterFinish);
  const contrastMode = useAccessibilityStore((s) => s.contrastMode);
  const prefersHighContrast = useAccessibilityStore((s) => s.prefersHighContrast);
  resolveEffectiveContrast(contrastMode, prefersHighContrast);

  const [materialStatus, setMaterialStatus] = useState<string | null>(null);
  const [materialTarget, setMaterialTarget] = useState<MaterialDraftTarget>("floor");
  const [materialLabel, setMaterialLabel] = useState<string>("");
  const [materialColor, setMaterialColor] = useState<string>("#e5e7eb");
  const [materialRoughness, setMaterialRoughness] = useState<number>(0.6);
  const [materialMetalness, setMaterialMetalness] = useState<number>(0.2);
  const [materialEmissiveIntensity, setMaterialEmissiveIntensity] = useState<number>(0.8);
  const [materialBaseType, setMaterialBaseType] = useState<"carpet" | "laminate" | "vinyl" | "wood">("carpet");
  const [materialSurface, setMaterialSurface] = useState<WallSurface>("seg");
  const [materialEditId, setMaterialEditId] = useState<string>("new");
  const [materialTexture, setMaterialTexture] = useState<{ dataUrl: string; fileName: string } | null>(null);
  const [wallUploadSide, setWallUploadSide] = useState<WallSide | "">("");

  const floorMaterials = materialPalette.floors ?? [];
  const wallFinishes = materialPalette.walls ?? [];
  const counterFinishes = materialPalette.counters ?? [];

  const allowedWalls = useMemo(() => getAllowedWalls(config.type), [config.type]);
  useEffect(() => {
    const fallbackWall = allowedWalls[0] ?? "";
    setWallUploadSide((prev) => {
      if (prev && allowedWalls.includes(prev as WallSide)) return prev;
      return fallbackWall;
    });
  }, [allowedWalls]);

  const materialDefaults = useCallback(
    (target: MaterialDraftTarget) => ({
      roughness: target === "floor" ? 0.65 : target === "wall" ? 0.75 : 0.45,
      metalness: target === "floor" ? 0.2 : target === "wall" ? 0.2 : 0.4,
      emissive: target === "wall" ? 0.8 : 0,
    }),
    []
  );

  const selectedWallForUpload: WallSide | undefined =
    (wallUploadSide && allowedWalls.includes(wallUploadSide as WallSide) ? (wallUploadSide as WallSide) : allowedWalls[0]) ??
    undefined;

  const allowedFrameOptions = useMemo(() => getAllowedOptions(moduleCatalog, config, "ledFrame"), [moduleCatalog, config]);
  const allowedCounterOptions = useMemo(() => getAllowedOptions(moduleCatalog, config, "counter"), [moduleCatalog, config]);
  const frameVariants = allowedFrameOptions.variants.length
    ? allowedFrameOptions.variants
    : Object.values(moduleVariants ?? {}).filter((v) => v.kind === "frame");
  const selectedFrameVariant = useMemo(
    () => frameVariants.find((v) => v.key === config.modules.frameVariant) ?? frameVariants[0],
    [frameVariants, config.modules.frameVariant]
  );
  const ledAllowedVariants = moduleCompatibility?.ledFrame?.ledWall ?? [];
  const ledWallAllowed =
    !!selectedFrameVariant && Array.isArray(ledAllowedVariants) ? ledAllowedVariants.includes(selectedFrameVariant.key) : false;

  useEffect(() => {
    const allowed = allowedFrameOptions.variants;
    if (!allowed.length) return;
    const nextVariant = allowed.find((variant) => variant.key === config.modules.frameVariant) ?? allowed[0];
    if (!nextVariant) return;

    const sizeAllowed =
      !nextVariant.sizes?.length ||
      (config.modules.frameSize !== undefined && nextVariant.sizes.includes(config.modules.frameSize));
    const colorAllowed =
      !nextVariant.colors?.length ||
      (config.modules.frameColor !== undefined && nextVariant.colors.includes(config.modules.frameColor));

    const nextSize =
      nextVariant.sizes && nextVariant.sizes.length
        ? sizeAllowed && config.modules.frameSize !== undefined
          ? config.modules.frameSize
          : nextVariant.sizes[0]
        : undefined;
    const nextColor =
      nextVariant.colors && nextVariant.colors.length
        ? colorAllowed && config.modules.frameColor !== undefined
          ? config.modules.frameColor
          : nextVariant.colors[0]
        : undefined;

    const needsVariantUpdate = nextVariant.key !== config.modules.frameVariant;
    const needsSizeUpdate = nextSize !== config.modules.frameSize;
    const needsColorUpdate = nextColor !== config.modules.frameColor;

    if (needsVariantUpdate || needsSizeUpdate || needsColorUpdate) {
      patchModules({
        frameVariant: nextVariant.key,
        frameSize: nextSize,
        frameColor: nextColor,
      });
    }
  }, [allowedFrameOptions, config.modules.frameVariant, config.modules.frameSize, config.modules.frameColor, patchModules]);

  useEffect(() => {
    const allowed = allowedCounterOptions.variants;
    if (!allowed.length) return;
    const allowedValues = allowed.map((variant) => (variant.variant as string | undefined) ?? variant.key);
    const current = config.modules.counterVariant;
    if (current && allowedValues.includes(current)) return;
    const fallback = allowedValues[0];
    if (fallback) {
      patchModules({ counterVariant: fallback as any });
    }
  }, [allowedCounterOptions, config.modules.counterVariant, patchModules]);

  const floor = config.modules.floor;
  const floorType = floor?.type ?? "carpet";
  const floorRaised = floor?.raised ?? config.modules.raisedFloor ?? false;
  const floorSelectValue = floor?.materialId ? `mat:${floor.materialId}` : `type:${floorType}`;
  const accessibility = (config.modules as any).accessibility as AccessibilityConfig | undefined;
  const barrierFreeEnabled = Boolean(accessibility?.barrierFree);
  const rampLength = Math.min(Math.max(accessibility?.rampLength ?? 1.2, 0.8), Math.max(config.depth - 0.2, 0.8));
  const updateAccessibility = (next: Partial<AccessibilityConfig>) =>
    setConfig({
      modules: {
        accessibility: {
          barrierFree: barrierFreeEnabled,
          rampLength,
          ...(accessibility ?? {}),
          ...next,
        },
      },
    });

  const applyFloorSelection = (value: string) => {
    if (value.startsWith("mat:")) {
      const id = value.replace("mat:", "");
      const mat = floorMaterials.find((f) => f.id === id);
      patchModules({
        floor: {
          ...(config.modules.floor ?? {}),
          type: mat?.baseType ?? floorType,
          materialId: id,
          raised: floorRaised,
        },
      });
      return;
    }

    const type = value.replace("type:", "") as "carpet" | "laminate" | "vinyl" | "wood";
    patchModules({
      floor: {
        ...(config.modules.floor ?? {}),
        type,
        materialId: undefined,
        raised: floorRaised,
      },
    });
  };

  const getWallSurface = (side: WallSide): string => {
    const wallsDetail = (config.modules as any).wallsDetail as Partial<Record<WallSide, { surface?: string }>> | undefined;
    return wallsDetail?.[side]?.surface ?? "system";
  };

  const getWallFinishId = (side: WallSide): string | undefined => {
    const wallsDetail = (config.modules as any).wallsDetail as Partial<Record<WallSide, { surface?: string; finishId?: string }>> | undefined;
    return wallsDetail?.[side]?.finishId;
  };

  const updateWallSurface = (side: WallSide, surface: string, finishId?: string) => {
    const wallsDetail = ((config.modules as any).wallsDetail ?? {}) as Record<WallSide, { [key: string]: any }>;
    patchModules({
      wallsDetail: {
        ...wallsDetail,
        [side]: {
          ...(wallsDetail[side] ?? {}),
          surface,
          finishId,
        },
      } as any,
    });
  };

  const wallSelectValue = (side: WallSide) => {
    const finishId = getWallFinishId(side);
    if (finishId) return `finish:${finishId}`;
    return `surface:${getWallSurface(side)}`;
  };

  const applyWallSelection = (side: WallSide, value: string) => {
    if (value.startsWith("finish:")) {
      const id = value.slice("finish:".length);
      const finish = wallFinishes.find((w) => w.id === id);
      updateWallSurface(side, finish?.surface ?? getWallSurface(side), id);
      return;
    }
    const surface = value.replace("surface:", "") as WallSurface;
    if (surface === "led" && !ledWallAllowed) {
      updateWallSurface(side, "seg", undefined);
      return;
    }
    updateWallSurface(side, surface, undefined);
  };

  useEffect(() => {
    if (ledWallAllowed) return;
    const detail = ((config.modules as any).wallsDetail ?? {}) as Record<WallSide, { surface?: string; finishId?: string }>;
    (["back", "left", "right"] as WallSide[]).forEach((side) => {
      if (detail?.[side]?.surface === "led") {
        updateWallSurface(side, "seg", detail?.[side]?.finishId);
      }
    });
  }, [ledWallAllowed]);

  const getCabinSurface = (side: CabinDoorSide): string => {
    const surfaces = ((config.modules as any).cabin?.wallSurfaces ?? {}) as Partial<Record<CabinDoorSide, string>>;
    return surfaces?.[side] ?? "system";
  };

  const updateCabinSurface = (side: CabinDoorSide, surface: string) => {
    const surfaces = ((config.modules as any).cabin?.wallSurfaces ?? {}) as Partial<Record<CabinDoorSide, string>>;
    patchModules({
      cabin: {
        wallSurfaces: {
          ...surfaces,
          [side]: surface,
        },
      } as any,
    });
  };

  const counterVariantOptions = useMemo(() => {
    const allowed = allowedCounterOptions.variants;
    const list = allowed.length > 0 ? allowed : Object.values(moduleVariants ?? {}).filter((v) => v.kind === "counter");
    if (!list.length) {
      return [
        { value: "basic", label: "Basic Tresen" },
        { value: "premium", label: "Premium Tresen" },
        { value: "corner", label: "Eck-Tresen (L-Form)" },
      ];
    }
    return list.map((v) => ({
      value: (v.variant as string | undefined) ?? v.key,
      label: v.name ?? v.variant ?? v.key,
    }));
  }, [allowedCounterOptions.variants, moduleVariants]);

  const roundTables = ((config.modules as any).roundTables ?? []) as { id: string }[];
  const chairs = ((config.modules as any).chairsDetailed ?? []) as { id: string }[];
  const trussLights = ((config.modules as any).trussLightsDetailed ?? []) as TrussLightConfig[];
  const wallLights = ((config.modules as any).wallLightsDetailed ?? []) as WallLightConfig[];
  const trussBySide = {
    front: trussLights.filter((l) => l.side === "front"),
    back: trussLights.filter((l) => l.side === "back"),
    left: trussLights.filter((l) => l.side === "left"),
    right: trussLights.filter((l) => l.side === "right"),
  };
  const wallBySide = {
    back: wallLights.filter((l) => l.side === "back"),
    left: wallLights.filter((l) => l.side === "left"),
    right: wallLights.filter((l) => l.side === "right"),
  };
  const legacyTrussCounts = {
    front: (config.modules as any).trussLightsFront ?? 0,
    back: (config.modules as any).trussLightsBack ?? 0,
    left: (config.modules as any).trussLightsLeft ?? 0,
    right: (config.modules as any).trussLightsRight ?? 0,
  };
  const trussCounts = {
    front: trussBySide.front.length || legacyTrussCounts.front,
    back: trussBySide.back.length || legacyTrussCounts.back,
    left: trussBySide.left.length || legacyTrussCounts.left,
    right: trussBySide.right.length || legacyTrussCounts.right,
  };
  const wallCounts = {
    back: wallBySide.back.length || ((config.modules as any).wallLightsBack ?? 0),
    left: wallBySide.left.length || ((config.modules as any).wallLightsLeft ?? 0),
    right: wallBySide.right.length || ((config.modules as any).wallLightsRight ?? 0),
  };

  const raisedFloor = (config.modules as any).floor?.raised ?? (config.modules as any).raisedFloor ?? false;
  const floorHeight = raisedFloor ? 0.08 : 0.025;
  const wallTopHeight = config.height + floorHeight;
  const minTrussHeight = wallTopHeight + 0.3;
  const maxTrussHeight = wallTopHeight + 2.5;
  const trussHeightMode =
    ((config.modules as any).trussHeightMode ??
      ((config.modules as any).trussHeight != null ? "absolute" : "offset")) as "absolute" | "offset";
  const trussHeightOffset =
    typeof (config.modules as any).trussHeightOffset === "number"
      ? ((config.modules as any).trussHeightOffset as number)
      : (typeof (config.modules as any).trussHeight === "number"
          ? Math.max(0.1, (config.modules as any).trussHeight - wallTopHeight)
          : 0.5);
  const trussOffsetClamped = Math.min(Math.max(trussHeightOffset, 0.3), maxTrussHeight - wallTopHeight);
  const trussHeightValue =
    typeof (config.modules as any).trussHeight === "number"
      ? Math.max(minTrussHeight, Math.min((config.modules as any).trussHeight as number, maxTrussHeight))
      : wallTopHeight + trussOffsetClamped;

  const defaultWallLightHeight = Math.max(0.5, config.height - 0.3);

  const trussLayoutForSide = (side: "front" | "back" | "left" | "right", count: number) => {
    if (count <= 0) return [] as { position: { x: number; z: number } }[];
    if (side === "front" || side === "back") {
      const spacing = config.width / (count + 1);
      return Array.from({ length: count }).map((_, i) => ({
        position: {
          x: -config.width / 2 + spacing * (i + 1),
          z: side === "front" ? config.depth / 2 - 0.04 : -config.depth / 2 + 0.04,
        },
      }));
    }
    const spacing = config.depth / (count + 1);
    return Array.from({ length: count }).map((_, i) => ({
      position: {
        z: -config.depth / 2 + spacing * (i + 1),
        x: side === "left" ? -config.width / 2 + 0.04 : config.width / 2 - 0.04,
      },
    }));
  };

  const updateTrussLightCount = (side: "front" | "back" | "left" | "right", value: number) => {
    const desired = Math.max(0, Math.floor(value || 0));
    const layout = trussLayoutForSide(side, desired);
    const sortAxis = side === "front" || side === "back" ? "x" : "z";
    const sideExisting = trussBySide[side]
      .slice()
      .sort((a, b) => ((a.position as any)?.[sortAxis] ?? 0) - ((b.position as any)?.[sortAxis] ?? 0));
    const mergedForSide: TrussLightConfig[] = layout.map((pos, idx) => {
      const reuse = sideExisting[idx];
      return {
        id: reuse?.id ?? `truss-${side}-${Date.now()}-${idx}`,
        side,
        position: pos.position,
      };
    });

    const nextCounts = {
      front: side === "front" ? desired : trussCounts.front,
      back: side === "back" ? desired : trussCounts.back,
      left: side === "left" ? desired : trussCounts.left,
      right: side === "right" ? desired : trussCounts.right,
    };

    const nextLights = [...trussLights.filter((l) => l.side !== side), ...mergedForSide];

    patchModules({
      trussLightsDetailed: nextLights,
      trussLightsFront: nextCounts.front,
      trussLightsBack: nextCounts.back,
      trussLightsLeft: nextCounts.left,
      trussLightsRight: nextCounts.right,
      trussLights: nextCounts.front + nextCounts.back + nextCounts.left + nextCounts.right,
    } as any);
  };

  const wallLayoutForSide = (side: WallSide, count: number) => {
    if (count <= 0) return [] as WallLightConfig[];
    if (side === "back") {
      const spacing = config.width / (count + 1);
      return Array.from({ length: count }).map((_, i) => ({
        id: "",
        side,
        position: { x: -config.width / 2 + spacing * (i + 1) },
        heightFromFloor: defaultWallLightHeight,
      }));
    }
    const spacing = config.depth / (count + 1);
    return Array.from({ length: count }).map((_, i) => ({
      id: "",
      side,
      position: { z: -config.depth / 2 + spacing * (i + 1) },
      heightFromFloor: defaultWallLightHeight,
    }));
  };

  const updateWallLightCount = (side: WallSide, value: number) => {
    const desired = Math.max(0, Math.floor(value || 0));
    const layout = wallLayoutForSide(side, desired);
    const axis = side === "back" ? "x" : "z";
    const sideExisting = (wallBySide as any)[side]
      .slice()
      .sort((a: WallLightConfig, b: WallLightConfig) => (a.position?.[axis] ?? 0) - (b.position?.[axis] ?? 0));
    const mergedForSide: WallLightConfig[] = layout.map((pos, idx) => {
      const reuse = sideExisting[idx];
      return {
        id: reuse?.id ?? `wall-${side}-${Date.now()}-${idx}`,
        side,
        position: pos.position,
        heightFromFloor: reuse?.heightFromFloor ?? pos.heightFromFloor ?? defaultWallLightHeight,
      };
    });

    const nextCounts = {
      back: side === "back" ? desired : wallCounts.back,
      left: side === "left" ? desired : wallCounts.left,
      right: side === "right" ? desired : wallCounts.right,
    };

    const nextLights = [...wallLights.filter((l) => l.side !== side), ...mergedForSide];

    patchModules({
      wallLightsDetailed: nextLights,
      wallLightsBack: nextCounts.back,
      wallLightsLeft: nextCounts.left,
      wallLightsRight: nextCounts.right,
    } as any);
  };

  const handleMaterialTextureFile = async (file?: File | null) => {
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      setMaterialTexture({ dataUrl, fileName: file.name });
      setMaterialStatus(`Bild geladen (${file.name}) - wird beim Speichern uebernommen.`);
    } catch {
      setMaterialStatus("Konnte Bild nicht lesen.");
    }
  };

  const handleMaterialFile = async (file?: File | null) => {
    if (!file) return;
    const text = await file.text();
    const res = importMaterials(text);
    setMaterialStatus(res.message);
  };

  const resetMaterialDraft = (target: MaterialDraftTarget) => {
    setMaterialLabel("");
    setMaterialColor("#e5e7eb");
    setMaterialTexture(null);
    const defaults = materialDefaults(target);
    setMaterialRoughness(defaults.roughness);
    setMaterialMetalness(defaults.metalness);
    setMaterialEmissiveIntensity(defaults.emissive);
    if (target === "floor") setMaterialBaseType("carpet");
    if (target === "wall") setMaterialSurface("seg");
  };

  const hydrateMaterialDraft = (target: MaterialDraftTarget, id: string) => {
    setMaterialEditId(id);
    setMaterialTexture(null);
    if (id === "new") {
      resetMaterialDraft(target);
      return;
    }
    const list = target === "floor" ? floorMaterials : target === "wall" ? wallFinishes : counterFinishes;
    const existing = list.find((item) => item.id === id);
    if (!existing) {
      resetMaterialDraft(target);
      return;
    }
    setMaterialLabel(existing.label ?? "");
    setMaterialColor((existing as any).color ?? "#e5e7eb");
    const defaults = materialDefaults(target);
    setMaterialRoughness((existing as any).roughness ?? defaults.roughness);
    setMaterialMetalness((existing as any).metalness ?? defaults.metalness);
    setMaterialEmissiveIntensity(
      target === "wall" ? (existing as any).emissiveIntensity ?? defaults.emissive : 0
    );
    if (target === "floor") setMaterialBaseType((existing as any).baseType ?? "carpet");
    if (target === "wall") setMaterialSurface((existing as any).surface ?? "seg");
  };

  const labelFromFile = (file: File, fallback: string) => {
    const stem = file.name?.split(".").slice(0, -1).join(".") || "";
    return (stem || fallback).slice(0, 80);
  };

  const handleFloorTextureUpload = async (file?: File | null) => {
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    const label = labelFromFile(file, "Eigenes Bodenbild");
    const baseType = floorType as "carpet" | "laminate" | "vinyl" | "wood";
    const raised = floor?.raised ?? config.modules.raisedFloor ?? false;
    const created = addFloorMaterial({
      id: `upload-floor-${Date.now()}`,
      label,
      baseType,
      color: materialColor,
      roughness: materialRoughness,
      metalness: materialMetalness,
      textureUrl: dataUrl,
      textureFileName: file.name,
    });
    patchModules({
      floor: {
        ...(config.modules.floor ?? { type: baseType, raised }),
        type: created.baseType,
        materialId: created.id,
        raised,
      },
    });
    setMaterialStatus(`Bodenbild geladen (${created.label})`);
  };

  const handleWallTextureUpload = async (side: WallSide, file?: File | null) => {
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    const label = labelFromFile(file, "Wandgrafik");
    const surface = getWallSurface(side) as WallSurface;
    const finish = addWallFinish({
      id: `upload-wall-${Date.now()}`,
      label,
      surface,
      color: materialColor,
      roughness: materialRoughness,
      metalness: materialMetalness,
      emissiveIntensity: materialEmissiveIntensity,
      textureUrl: dataUrl,
      textureFileName: file.name,
    });
    updateWallSurface(side, surface, finish.id);
    setMaterialStatus(`Grafik fuer ${sideLabel(side)} geladen (${finish.label})`);
  };

  const handleQuickMaterialAdd = () => {
    const label = materialLabel.trim() || "Neues Material";
    const isEdit = materialEditId !== "new";
    let createdId = materialEditId;
    const texturePatch =
      materialTexture && materialTarget !== "counter"
        ? { textureUrl: materialTexture.dataUrl, textureFileName: materialTexture.fileName }
        : undefined;

    if (materialTarget === "floor") {
      if (isEdit) {
        updateFloorMaterial(materialEditId, {
          label,
          baseType: materialBaseType,
          color: materialColor,
          roughness: materialRoughness,
          metalness: materialMetalness,
          ...(texturePatch ?? {}),
        });
      } else {
        const created = addFloorMaterial({
          label,
          baseType: materialBaseType,
          color: materialColor,
          roughness: materialRoughness,
          metalness: materialMetalness,
          ...(texturePatch ?? {}),
        });
        createdId = created.id;
      }
    } else if (materialTarget === "wall") {
      if (isEdit) {
        updateWallFinish(materialEditId, {
          label,
          surface: materialSurface,
          color: materialColor,
          roughness: materialRoughness,
          metalness: materialMetalness,
          emissiveIntensity: materialEmissiveIntensity,
          ...(texturePatch ?? {}),
        });
      } else {
        const created = addWallFinish({
          label,
          surface: materialSurface,
          color: materialColor,
          roughness: materialRoughness,
          metalness: materialMetalness,
          emissiveIntensity: materialEmissiveIntensity,
          ...(texturePatch ?? {}),
        });
        createdId = created.id;
      }
    } else {
      if (isEdit) {
        updateCounterFinish(materialEditId, {
          label,
          color: materialColor,
          accentColor: materialColor,
          topColor: "#f3f4f6",
          roughness: materialRoughness,
          metalness: materialMetalness,
        });
      } else {
        const created = addCounterFinish({
          label,
          color: materialColor,
          accentColor: materialColor,
          topColor: "#f3f4f6",
          roughness: materialRoughness,
          metalness: materialMetalness,
        });
        createdId = created.id;
      }
    }

    setMaterialStatus(
      materialTarget === "floor"
        ? `Boden gespeichert (${label})`
        : materialTarget === "wall"
          ? `Wandfinish gespeichert (${label})`
          : `Thekenfinish gespeichert (${label})`
    );
    setMaterialEditId(createdId);
  };

  const materialOptions =
    materialTarget === "floor" ? floorMaterials : materialTarget === "wall" ? wallFinishes : counterFinishes;

  const storageDoorOptions: WallSide[] = config.modules.storageRoom ? allowedWalls : [];
  const cabinEnabled = Boolean((config.modules as any).cabin?.enabled ?? config.modules.storageRoom);
  const selectedCabinDoorSide: WallSide | "" =
    storageDoorOptions.find((side) => side === (config.modules as any).cabin?.doorSide) ??
    storageDoorOptions.find((side) => side === (config.modules.storageDoorSide as WallSide | undefined)) ??
    storageDoorOptions[0] ??
    "";

  const sideLabel = (side: CabinDoorSide) => t(`common.side.${side}` as const);

  const screensWallValue =
    (config.modules.screensWall && allowedWalls.includes(config.modules.screensWall as WallSide)
      ? (config.modules.screensWall as WallSide)
      : allowedWalls[0]) ?? "";

  const hasBackWall = allowedWalls.includes("back");
  const hasLeftWall = allowedWalls.includes("left");
  const hasRightWall = allowedWalls.includes("right");

  const bundleOptions = useMemo<BundleOption[]>(
    () => (moduleCatalog?.bundles ?? []).map((bundle) => ({ ...bundle })),
    [moduleCatalog]
  );

  const floorTypeLabel = (type: string | undefined) => {
    switch (type) {
      case "laminate":
        return t("common.floor.laminate");
      case "vinyl":
        return t("common.floor.vinyl");
      case "wood":
        return t("common.floor.wood");
      case "carpet":
      default:
        return t("common.floor.carpet");
    }
  };

  return (
    <>
      {showMaterialLibrary && (
        <MaterialControls
          materialTarget={materialTarget}
          setMaterialTarget={setMaterialTarget}
          materialEditId={materialEditId}
          setMaterialEditId={setMaterialEditId}
          materialLabel={materialLabel}
          setMaterialLabel={setMaterialLabel}
          materialColor={materialColor}
          setMaterialColor={setMaterialColor}
          materialRoughness={materialRoughness}
          setMaterialRoughness={setMaterialRoughness}
          materialMetalness={materialMetalness}
          setMaterialMetalness={setMaterialMetalness}
          materialEmissiveIntensity={materialEmissiveIntensity}
          setMaterialEmissiveIntensity={setMaterialEmissiveIntensity}
          materialBaseType={materialBaseType}
          setMaterialBaseType={setMaterialBaseType}
          materialSurface={materialSurface}
          setMaterialSurface={setMaterialSurface}
          handleMaterialTextureFile={handleMaterialTextureFile}
          handleMaterialFile={handleMaterialFile}
          materialOptions={materialOptions}
          hydrateMaterialDraft={hydrateMaterialDraft}
          handleQuickMaterialAdd={handleQuickMaterialAdd}
          resetMaterials={resetMaterials}
          resetMaterialDraft={resetMaterialDraft}
          materialStatus={materialStatus}
          floorMaterials={floorMaterials}
          wallFinishes={wallFinishes}
          counterFinishes={counterFinishes}
          materialTexture={materialTexture}
          setMaterialTexture={setMaterialTexture}
        />
      )}

      <div className="sidebar-section">
        <div className="sidebar-section-header">
          <span className="section-title">Module</span>
          <span className="section-sub">Boden, Wände, Counter, Screens, Licht</span>
        </div>

        {bundleOptions.length > 0 && (
          <div className="chip-line" style={{ marginBottom: 10 }}>
            {bundleOptions.map((bundle) => (
              <button
                key={bundle.key}
                type="button"
                className="chip"
                disabled={!bundle.config}
                onClick={() => bundle.config && patchModules(bundle.config as any)}
              >
                Paket: {bundle.label ?? bundle.key}
              </button>
            ))}
          </div>
        )}

        <div className="form-grid">
          <FloorControls
            floorSelectValue={floorSelectValue}
            floorRaised={floorRaised}
            floorType={floorType}
            barrierFreeEnabled={barrierFreeEnabled}
            rampLength={rampLength}
            applyFloorSelection={applyFloorSelection}
            handleFloorTextureUpload={handleFloorTextureUpload}
            updateAccessibility={updateAccessibility}
            floorTypeLabel={floorTypeLabel}
            patchModules={patchModules}
            floorMaterials={floorMaterials}
            materialStatus={materialStatus}
            setMaterialStatus={setMaterialStatus}
            configDepth={config.depth}
          />

          <WallControls
            allowedWalls={allowedWalls}
            wallFinishes={wallFinishes}
            wallCounts={wallCounts}
            ledWallAllowed={ledWallAllowed}
            wallSelectValue={wallSelectValue}
            applyWallSelection={applyWallSelection}
            updateWallLightCount={updateWallLightCount}
            handleWallTextureUpload={handleWallTextureUpload}
            selectedWallForUpload={selectedWallForUpload}
            setWallUploadSide={setWallUploadSide}
            wallUploadSide={wallUploadSide}
            sideLabel={sideLabel}
          />

          <CabinControls
            cabinEnabled={cabinEnabled}
            storageDoorOptions={storageDoorOptions}
            selectedCabinDoorSide={selectedCabinDoorSide}
            getCabinSurface={getCabinSurface}
            updateCabinSurface={updateCabinSurface}
            patchModules={patchModules}
            sideLabel={sideLabel}
            configModules={config.modules}
          />

          <CounterControls
            counterVariantOptions={counterVariantOptions}
            counterFinishes={counterFinishes}
            patchModules={patchModules}
            counters={config.modules.counters ?? 0}
            countersWall={config.modules.countersWall as any}
            counterVariant={config.modules.counterVariant}
            counterFinishId={(config.modules as any).counterFinishId as string | undefined}
            countersWithPower={config.modules.countersWithPower}
          />

          <ScreenControls
            screensCount={config.modules.screens ?? 0}
            allowedWalls={allowedWalls}
            screensWallValue={screensWallValue}
            sideLabel={sideLabel}
            patchModules={patchModules}
          />

          <TrussControls
            enabled={config.modules.truss ?? false}
            trussCounts={trussCounts}
            hasBackWall={hasBackWall}
            hasLeftWall={hasLeftWall}
            hasRightWall={hasRightWall}
            trussHeightValue={trussHeightValue}
            minTrussHeight={minTrussHeight}
            maxTrussHeight={maxTrussHeight}
            wallTopHeight={wallTopHeight}
            trussOffsetClamped={trussOffsetClamped}
            trussHeightMode={trussHeightMode}
            setMaterialStatus={setMaterialStatus}
            patchModules={patchModules}
            updateTrussLightCount={updateTrussLightCount}
            trussLightType={(config.modules as any).trussLightType ?? "spot"}
            trussBannerWidth={(config.modules as any).trussBannerWidth}
            trussBannerHeight={(config.modules as any).trussBannerHeight}
            defaultBannerWidth={Math.max(2, config.width * 0.6)}
            defaultBannerHeight={1}
          />

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={roundTables.length > 0}
              onChange={(e) => {
                if (e.target.checked) {
                  const id = `tbl-${Date.now()}`;
                  patchModules({
                    roundTables: [{ id, diameter: 0.9, height: 0.75, position: { x: 0, z: 0 } }],
                  } as any);
                } else {
                  patchModules({ roundTables: [] } as any);
                }
              }}
            />
            Runde Sitztische (per Rechtsklick im 3D verschiebbar)
          </label>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={chairs.length > 0}
              onChange={(e) => {
                if (e.target.checked) {
                  const id = `chair-${Date.now()}`;
                  patchModules({
                    chairsDetailed: [{ id, position: { x: 0.4, z: 0.4 }, color: "#e5e7eb" }],
                  } as any);
                } else {
                  patchModules({ chairsDetailed: [] } as any);
                }
              }}
            />
            Stuehle (per Rechtsklick im 3D verschiebbar)
          </label>
        </div>
      </div>
    </>
  );
}
