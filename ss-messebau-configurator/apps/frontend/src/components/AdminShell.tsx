import { useEffect, useState } from "react";
import Configurator3D from "./Configurator3D";
import { ErrorBoundary } from "./ErrorBoundary";
import SidebarControls from "./SidebarControls";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useTranslation } from "../i18n";
import ModelUploadPanel from "./ModelUploadPanel";
import TextureUploadPanel from "./TextureUploadPanel";

const adminEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_ADMIN_PANEL === "true";

export default function AdminShell() {
  const { t } = useTranslation();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(isDesktop);

  useEffect(() => {
    setSidebarOpen(isDesktop);
  }, [isDesktop]);

  if (!adminEnabled) {
    return (
      <div className="app-root" style={{ flexDirection: "column" }}>
        <main
          className="main-viewport"
          style={{ padding: "24px", overflowY: "auto", height: "auto", minHeight: "100vh" }}
        >
          <div className="sidebar-section admin-guard" style={{ maxWidth: 960, margin: "0 auto" }}>
            <div className="sidebar-section-header">
              <span className="section-title">Admin-Bereich</span>
              <span className="section-sub">Nicht verfuegbar</span>
            </div>
            <p className="admin-guard-body">
              Der Objekt-Katalog (Admin) ist nur im Dev-Modus oder mit VITE_ENABLE_ADMIN_PANEL=true erreichbar.
            </p>
            <div className="admin-guard-actions">
              <a className="btn-secondary" href="/">
                Zurueck zum Konfigurator
              </a>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const toggleSidebar = () => {
    if (isDesktop) {
      setSidebarOpen(true);
      return;
    }
    setSidebarOpen((prev) => !prev);
  };

  const closeSidebar = () => {
    if (isDesktop) return;
    setSidebarOpen(false);
  };

  const isMobile = !isDesktop;
  const sidebarClassName = sidebarOpen
    ? "sidebar sidebar-open translate-x-0"
    : "sidebar sidebar-hidden -translate-x-full";

  const sidebarFallback = (
    <aside className={sidebarClassName} id="app-sidebar" aria-hidden={!sidebarOpen}>
      <button type="button" className="sidebar-close" onClick={closeSidebar}>
        {t("app.menu.close", { defaultValue: "Schließen" })}
      </button>
      <div
        className="sidebar-fallback"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          padding: "8px 12px",
          borderRadius: "12px",
          background: "#fef2f2",
          color: "#b91c1c",
          fontWeight: 700,
          border: "1px solid #fecdd3",
          boxShadow: "0 8px 18px rgba(0,0,0,0.08)",
        }}
        role="status"
      >
        Sidebar konnte nicht geladen werden
      </div>
    </aside>
  );

  return (
    <div className="app-root">
      {isMobile && sidebarOpen && <div className="sidebar-backdrop" onClick={closeSidebar} />}
      <div className="app-shell">
        <ErrorBoundary fallback={sidebarFallback}>
          <SidebarControls drawerOpen={sidebarOpen} onClose={closeSidebar} />
        </ErrorBoundary>
        <main className="main-viewport">
          <button
            type="button"
            className="sidebar-toggle mobile-sidebar-toggle"
            onClick={toggleSidebar}
            aria-expanded={sidebarOpen}
            aria-controls="app-sidebar"
          >
            {t("app.menu.open", { defaultValue: "Menü & Einstellungen" })}
          </button>
          <div style={{ width: "100%", maxWidth: 980, margin: "0 auto 12px", padding: "0 12px" }}>
            <ModelUploadPanel />
            <TextureUploadPanel />
          </div>
          <Configurator3D />
        </main>
      </div>
    </div>
  );
}
