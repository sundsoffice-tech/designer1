import SidebarControls from "./components/SidebarControls";
import Configurator3D from "./components/Configurator3D";

export default function App() {
  return (
    <>
      <div className="mobile-banner">Mobile Version aktiv</div>
      <div className="app-root">
        <SidebarControls />
        <main className="main-viewport">
          <Configurator3D />
        </main>
      </div>
    </>
  );
}
