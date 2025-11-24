import { useEffect, useState } from "react";
import SidebarControls from "./SidebarControls";
import Configurator3D from "./Configurator3D";
import { ErrorBoundary } from "./ErrorBoundary";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useTranslation } from "../i18n";

const adminEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_ADMIN_PANEL === "true";

export default function AdminShell() {
  const { t } = useTranslation();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(isDesktop);

  useEffect(() => {
    setIsSidebarOpen(isDesktop);
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
      setIsSidebarOpen(true);
      return;
    }
    setIsSidebarOpen((prev) => !prev);
  };

  const closeSidebar = () => {
    if (isDesktop) return;
    setIsSidebarOpen(false);
  };

  const isMobile = !isDesktop;

  return (
    <div className="app-root">
      {isMobile && isSidebarOpen && <div className="sidebar-backdrop" onClick={closeSidebar} />}
      {isMobile && (
        <button
          type="button"
          className="mobile-sidebar-toggle"
          onClick={toggleSidebar}
          aria-expanded={isSidebarOpen}
          aria-controls="app-sidebar"
        >
          {isSidebarOpen ? t("app.menu.close") : t("app.menu.open")}
        </button>
      )}
      <div className="app-shell">
        <aside className="app-sidebar" id="app-sidebar">
          <ErrorBoundary
            fallback={<div className="sidebar-fallback">Sidebar konnte nicht geladen werden</div>}
          >
            <SidebarControls drawerOpen={isSidebarOpen} onClose={closeSidebar} />
          </ErrorBoundary>
        </aside>
        <main className="app-main">
          <Configurator3D />
        </main>
      </div>
    </div>
  );
}
