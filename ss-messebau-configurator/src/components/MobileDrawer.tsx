import type { ReactNode } from "react";

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

export default function MobileDrawer({ open, onClose, children }: MobileDrawerProps) {
  return (
    <div className={`mobile-drawer ${open ? "is-open" : ""}`} aria-hidden={!open}>
      <div className="mobile-drawer-backdrop" onClick={onClose} />
      <div className="mobile-drawer-content" role="dialog" aria-modal="true">
        <div className="mobile-drawer-header">
          <button type="button" className="mobile-drawer-close" onClick={onClose}>
            Schließen
          </button>
        </div>
        <div className="mobile-drawer-body">{children}</div>
      </div>
    </div>
  );
}
