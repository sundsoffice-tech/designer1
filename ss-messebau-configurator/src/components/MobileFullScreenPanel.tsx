import type { ReactNode } from "react";

interface MobileFullScreenPanelProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

export default function MobileFullScreenPanel({
  open,
  onClose,
  children,
}: MobileFullScreenPanelProps) {
  return (
    <div
      className={`mobile-panel-backdrop ${open ? "is-open" : ""}`}
      aria-hidden={!open}
      onClick={onClose}
    >
      <div
        className="mobile-panel-content"
        role="dialog"
        aria-modal="true"
        aria-label="Konfiguration"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="mobile-panel-header">
          <h2>Konfiguration</h2>
          <button
            type="button"
            className="mobile-panel-close"
            aria-label="Konfiguration schließen"
            onClick={onClose}
          >
            ✕
          </button>
        </header>
        <div className="mobile-panel-body">{children}</div>
      </div>
    </div>
  );
}
