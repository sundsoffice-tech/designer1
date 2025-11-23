import { useMemo, useState } from "react";
import { useCameraStore, type CameraPose } from "../../store/cameraStore";
import { useTranslation } from "../../i18n";

type CameraPanelProps = {
  width: number;
  depth: number;
  height: number;
  floorHeight: number;
};

const clampValue = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function CameraPanel({ width, depth, height, floorHeight }: CameraPanelProps) {
  const { t } = useTranslation();
  const savedViews = useCameraStore((s) => s.savedViews);
  const guides = useCameraStore((s) => s.guides);
  const currentPose = useCameraStore((s) => s.currentPose);
  const queueAction = useCameraStore((s) => s.queueAction);
  const saveCurrentView = useCameraStore((s) => s.saveCurrentView);
  const deleteView = useCameraStore((s) => s.deleteView);
  const loadView = useCameraStore((s) => s.loadView);
  const [viewName, setViewName] = useState<string>(t("camera.savePlaceholder"));

  const targetY = useMemo(
    () => clampValue(height * 0.45 + floorHeight, floorHeight + 1.2, floorHeight + Math.max(height * 0.85, 2)),
    [floorHeight, height]
  );

  const quickViews = useMemo<{ id: string; label: string; pose: CameraPose }[]>(() => {
    const orbitPadding = Math.max(Math.max(width, depth) * 0.55, 4);
    const flyHeight = Math.max(height + floorHeight + 2.4, targetY + 1.6);
    const center: [number, number, number] = [0, targetY, 0];
    return [
      {
        id: "front",
        label: t("camera.quick.front"),
        pose: { position: [0, flyHeight, depth / 2 + orbitPadding], target: center },
      },
      {
        id: "left",
        label: t("camera.quick.left"),
        pose: { position: [-width / 2 - orbitPadding, flyHeight, 0], target: center },
      },
      {
        id: "top",
        label: t("camera.quick.top"),
        pose: { position: [0, flyHeight + orbitPadding * 0.6, 0.001], target: center },
      },
      {
        id: "hero",
        label: t("camera.quick.hero"),
        pose: { position: [orbitPadding * 0.65, flyHeight * 0.92, depth / 2 + orbitPadding * 0.7], target: center },
      },
    ];
  }, [depth, floorHeight, height, targetY, t, width]);

  const saveView = () => {
    const created = saveCurrentView(viewName);
    if (created) {
      setViewName(t("camera.savePlaceholder"));
    }
  };

  const stopTours = () => {
    const pose =
      currentPose ??
      ({
        position: [0, targetY + 2, depth / 2 + Math.max(width, depth, 6) * 0.4],
        target: [0, targetY, 0],
      } satisfies CameraPose);
    queueAction({ type: "flyTo", pose, duration: 0.6 });
  };

  return (
    <div className="sidebar-section">
      <div className="sidebar-section-header">
        <span className="section-title">{t("camera.title")}</span>
        <span className="section-sub">{t("camera.subtitle")}</span>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {quickViews.map((view) => (
            <button
              key={view.id}
              type="button"
              className="btn-secondary"
              onClick={() => queueAction({ type: "flyTo", pose: view.pose, duration: 0.85 })}
            >
              {view.label}
            </button>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <input
            type="text"
            value={viewName}
            onChange={(e) => setViewName(e.target.value)}
            placeholder={t("camera.savePlaceholder")}
            style={{ flex: 1, minWidth: 160 }}
          />
          <button type="button" className="btn-primary" onClick={saveView} disabled={!currentPose}>
            {t("camera.saveCurrent")}
          </button>
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontWeight: 600 }}>{t("camera.savedTitle")}</div>
          {savedViews.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--muted)" }}>{t("camera.noSaved")}</div>
          ) : (
            savedViews.map((view) => (
              <div
                key={view.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 8px",
                  borderRadius: 8,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{view.name}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>
                    {new Date(view.createdAt).toLocaleTimeString()}
                  </div>
                </div>
                <button type="button" className="btn-secondary" onClick={() => loadView(view.id)}>
                  {t("camera.load")}
                </button>
                <button type="button" className="btn-secondary" onClick={() => deleteView(view.id)}>
                  {t("camera.delete")}
                </button>
              </div>
            ))
          )}
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontWeight: 600 }}>{t("camera.guidedTitle")}</div>
          {guides.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--muted)" }}>{t("camera.noGuides")}</div>
          ) : (
            guides.map((guide) => (
              <div
                key={guide.id}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{guide.name}</div>
                  {guide.description && (
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>{guide.description}</div>
                  )}
                </div>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => queueAction({ type: "playGuide", guideId: guide.id })}
                >
                  {t("camera.playGuide")}
                </button>
              </div>
            ))
          )}
          <button type="button" className="btn-secondary" onClick={stopTours}>
            {t("camera.stopGuide")}
          </button>
        </div>
      </div>
    </div>
  );
}
