import { useEffect, useState } from "react";
import SidebarControls from "./components/SidebarControls";
import Configurator3D from "./components/Configurator3D";
import LanguageSwitcher from "./components/LanguageSwitcher";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useMediaQuery } from "./hooks/useMediaQuery";
import { useConfigStore } from "./store/configStore";
import { resolveEffectiveContrast, useAccessibilityStore } from "./store/accessibilityStore";
import { useTranslation } from "./i18n";
import { ContextMenuRoot, buildContextMenu, useContextMenuStore } from "./contextMenu";
import { useSceneInteractionStore } from "./store/sceneInteractionStore";

export default function App() {
  const { t } = useTranslation();
  const [isOffline, setIsOffline] = useState<boolean>(() => typeof navigator !== "undefined" && !navigator.onLine);
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(isDesktop);
  const loadRemoteConfig = useConfigStore((s) => s.loadRemoteConfig);
  const contrastMode = useAccessibilityStore((s) => s.contrastMode);
  const prefersHighContrast = useAccessibilityStore((s) => s.prefersHighContrast);
  const setPrefersHighContrast = useAccessibilityStore((s) => s.setPrefersHighContrast);
  const openContextMenu = useContextMenuStore((s) => s.openMenu);
  const closeContextMenu = useContextMenuStore((s) => s.closeMenu);
  const getInteractionContext = useSceneInteractionStore((s) => s.getContext);

  useEffect(() => {
    const media = window.matchMedia("(prefers-contrast: more)");
    const apply = (matches: boolean) => setPrefersHighContrast(matches);
    apply(media.matches);
    const listener = (event: MediaQueryListEvent) => apply(event.matches);
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", listener);
      return () => media.removeEventListener("change", listener);
    }
    media.addListener(listener);
    return () => media.removeListener(listener);
  }, [setPrefersHighContrast]);

  const effectiveContrast = resolveEffectiveContrast(contrastMode, prefersHighContrast);

  useEffect(() => {
    document.documentElement.dataset.contrast = effectiveContrast;
  }, [effectiveContrast]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const remoteId = params.get("configId");
    if (remoteId) {
      loadRemoteConfig(remoteId);
    }
  }, [loadRemoteConfig]);

  useEffect(() => {
    const updateOnlineStatus = () => setIsOffline(!navigator.onLine);
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);
    updateOnlineStatus();
    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
    };
  }, []);

  useEffect(() => {
    setIsSidebarOpen(isDesktop);
  }, [isDesktop]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeContextMenu();
      }
      if (event.key === "ContextMenu" || (event.shiftKey && event.key.toLowerCase() === "f10")) {
        event.preventDefault();
        const center = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        const context = getInteractionContext({ mousePosition: center });
        openContextMenu({ ...buildContextMenu(context), position: center });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [closeContextMenu, getInteractionContext, openContextMenu]);

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
      {isOffline && (
        <div className="offline-banner" role="status" aria-live="polite">
          {t("app.offline")}
        </div>
      )}
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
      <LanguageSwitcher />
      <div className="app-shell">
        <ErrorBoundary fallback={<div className="sidebar-error" role="alert">Sidebar konnte nicht geladen werden.</div>}>
          <SidebarControls drawerOpen={isSidebarOpen} onClose={closeSidebar} />
        </ErrorBoundary>
        <main className="main-viewport">
          <ErrorBoundary fallback={<div className="viewport-error" role="alert">3D-Ansicht konnte nicht geladen werden.</div>}>
            <Configurator3D />
          </ErrorBoundary>
        </main>
      </div>
      <ContextMenuRoot />
    </div>
  );
}
