import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { executeCommand } from "../store/commandRegistry";
import { useContextMenuStore } from "./store";
import type { ContextMenuItem } from "./types";
import { contextMenuConfig } from "../config/contextMenu";
import { useTranslation } from "../i18n";

const MENU_PADDING = 8;

const useOutsideClick = (onOutside: () => void) => {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (!ref.current) return;
      if (event.target instanceof Node && !ref.current.contains(event.target)) {
        onOutside();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onOutside]);
  return ref;
};

const nextFocusableIndex = (items: ContextMenuItem[], start: number, delta: 1 | -1) => {
  const focusable = items.filter((item) => !item.disabled && item.commandId);
  if (focusable.length === 0) return -1;
  const ids = focusable.map((item) => item.id);
  const currentId = items[start]?.id;
  const currentIdx = currentId ? ids.indexOf(currentId) : -1;
  const next = (currentIdx + delta + focusable.length) % focusable.length;
  return items.findIndex((item) => item.id === ids[next]);
};

export const ContextMenuRoot = () => {
  const { isOpen, items, position, context, closeMenu, highlightedId, setHighlighted } = useContextMenuStore();
  const { t } = useTranslation();
  const [renderPosition, setRenderPosition] = useState(position);
  const menuRef = useOutsideClick(closeMenu);

  useLayoutEffect(() => {
    if (!isOpen) return;
    const el = menuRef.current;
    if (!el) return;
    const { innerWidth, innerHeight } = window;
    const rect = el.getBoundingClientRect();
    const margin = contextMenuConfig.foldMargin + MENU_PADDING;
    const nextX = Math.min(Math.max(position.x, margin), innerWidth - rect.width - margin);
    const nextY = Math.min(Math.max(position.y, margin), innerHeight - rect.height - margin);
    setRenderPosition({ x: nextX, y: nextY });
  }, [isOpen, menuRef, position]);

  useEffect(() => {
    if (!isOpen) return;
    const firstFocusable = items.find((item) => item.commandId && !item.disabled);
    setHighlighted(firstFocusable ? firstFocusable.id : null);
  }, [isOpen, items, setHighlighted]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (!isOpen) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const delta = event.key === "ArrowDown" ? 1 : -1;
        const currentIndex = highlightedId ? items.findIndex((i) => i.id === highlightedId) : -1;
        const nextIndex = nextFocusableIndex(items, currentIndex, delta as 1 | -1);
        if (nextIndex >= 0) setHighlighted(items[nextIndex].id);
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        const item = items.find((i) => i.id === highlightedId && i.commandId && !i.disabled);
        if (item && context) {
          executeCommand(item.commandId, context).finally(() => closeMenu());
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeMenu, context, highlightedId, isOpen, items, setHighlighted]);

  if (!isOpen || !context) return null;

  const handleActivate = (item: ContextMenuItem) => {
    if (!item.commandId || item.disabled) return;
    executeCommand(item.commandId, context).finally(() => closeMenu());
  };

  const menu = (
    <div
      ref={menuRef}
      className="context-menu-root"
      style={{
        position: "fixed",
        top: renderPosition.y,
        left: renderPosition.x,
        zIndex: 9999,
        background: "rgba(2,6,23,0.96)",
        color: "#e5e7eb",
        border: "1px solid rgba(148,163,184,0.4)",
        borderRadius: 10,
        minWidth: 220,
        padding: 6,
        boxShadow: "0 16px 40px rgba(0,0,0,0.45)",
        backdropFilter: "blur(6px)",
      }}
    >
      <ul role="menu" style={{ listStyle: "none", margin: 0, padding: 0, maxHeight: "70vh", overflowY: "auto" }}>
        {items.map((item) => (
          <Fragment key={item.id}>
            {item.separatorBefore && (
              <li
                className="context-menu-separator"
                style={{
                  margin: "6px 0",
                  borderTop: "1px solid rgba(148,163,184,0.2)",
                }}
              />
            )}
            <li
              role="menuitem"
              aria-disabled={item.disabled}
              onMouseEnter={() => item.commandId && setHighlighted(item.id)}
              onFocus={() => item.commandId && setHighlighted(item.id)}
              onClick={() => handleActivate(item)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 10px",
                borderRadius: 8,
                cursor: item.disabled ? "not-allowed" : "pointer",
                background: highlightedId === item.id ? "rgba(59,130,246,0.14)" : "transparent",
                color: item.disabled ? "rgba(148,163,184,0.6)" : item.destructive ? "#fca5a5" : "#e5e7eb",
                userSelect: "none",
                transition: "background 120ms ease, color 120ms ease",
              }}
            >
              {item.icon && (
                <span
                  aria-hidden
                  style={{
                    width: 16,
                    height: 16,
                    opacity: item.disabled ? 0.4 : 0.9,
                    display: "inline-flex",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  •
                </span>
              )}
              <span style={{ flex: 1 }}>{t(item.labelKey)}</span>
            </li>
          </Fragment>
        ))}
      </ul>
    </div>
  );

  return createPortal(menu, document.body);
};

export default ContextMenuRoot;
