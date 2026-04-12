import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import App from "./App";
import i18n from "./i18n";
import "./styles.css";
import { cleanupPwaArtifactsForDev } from "./pwaDevCleanup";

cleanupPwaArtifactsForDev();

const adminEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_ADMIN_PANEL === "true";
const isAdminRoute =
  typeof window !== "undefined" && window.location.pathname.startsWith("/admin/catalog");
// Keep admin chunk out of the prod bundle unless explicitly enabled
const adminShellLoader = adminEnabled ? () => import("./components/AdminShell") : null;
const AdminShell = adminShellLoader ? lazy(adminShellLoader) : null;

export const AdminUnavailable = () => (
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

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <I18nextProvider i18n={i18n}>
      {isAdminRoute ? (
        adminEnabled && AdminShell ? (
          <Suspense fallback={<div className="sidebar-section">Lade Admin-Katalog...</div>}>
            <AdminShell />
          </Suspense>
        ) : (
          <AdminUnavailable />
        )
      ) : (
        <App />
      )}
    </I18nextProvider>
  </React.StrictMode>
);
