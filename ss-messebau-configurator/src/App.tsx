import { useState } from "react";
import SidebarControls from "./components/SidebarControls";
import Configurator3D from "./components/Configurator3D";

export default function App() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="app-root">
      <div className="mobile-banner">Mobile Version aktiv</div>

      <header className="app-header">
        <h1 className="app-header__title">S&amp;S Standkonfigurator</h1>
        <button
          type="button"
          className="app-header__menu-btn"
          aria-label="Menü öffnen"
          aria-expanded={isMobileMenuOpen}
          onClick={() => setIsMobileMenuOpen((prev) => !prev)}
        >
          Menü
        </button>
      </header>

      <main className="app-main">
        <div className="app-canvas-area main-viewport">
          <Configurator3D />
        </div>
        <div className="app-sidebar">
          <SidebarControls />
        </div>
      </main>
    </div>
  );
}
