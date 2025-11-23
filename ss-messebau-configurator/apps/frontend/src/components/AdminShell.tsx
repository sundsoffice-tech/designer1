import ObjectCatalogAdmin from "./ObjectCatalogAdmin";

const adminEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_ADMIN_PANEL === "true";

export default function AdminShell() {
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

  return (
    <div className="app-root admin-shell" style={{ flexDirection: "column" }}>
      <header className="sidebar-section" style={{ maxWidth: 1100, margin: "16px auto 10px", width: "100%" }}>
        <div className="sidebar-section-header">
          <span className="section-title">Objekt-Katalog (Admin)</span>
          <span className="section-sub">Interner Bereich</span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <p style={{ margin: 0, lineHeight: 1.4 }}>
            Diese Shell rendert nur den Objekt-Katalog. Aktiv im Dev-Modus oder wenn VITE_ENABLE_ADMIN_PANEL=true.
          </p>
          <a className="btn-secondary" href="/">
            Zurueck zur Haupt-UI
          </a>
        </div>
      </header>
      <main
        className="main-viewport"
        style={{ padding: "0 16px 16px", overflowY: "auto", height: "auto", minHeight: "0" }}
      >
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <ObjectCatalogAdmin />
        </div>
      </main>
    </div>
  );
}
