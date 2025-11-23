import { useState } from "react";
import { languageOptions, useTranslation } from "../i18n";

export default function LanguageSwitcher() {
  const { language, setLanguage, t } = useTranslation();
  const [open, setOpen] = useState(false);
  const active = languageOptions.find((opt) => opt.code === language) ?? languageOptions[0];
  const activeLabel = t(active.labelKey);

  return (
    <div className={`language-switcher ${open ? "open" : ""}`}>
      <button
        className="lang-toggle"
        type="button"
        aria-label={t("languageSwitcher.aria")}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="flag" role="img" aria-hidden>
          {active.flag}
        </span>
        <span className="code">{active.code.toUpperCase()}</span>
        <span className="name">{activeLabel}</span>
      </button>
      {open && (
        <div className="lang-menu">
          {languageOptions.map((opt) => (
            <button
              key={opt.code}
              type="button"
              className={`lang-option ${opt.code === language ? "active" : ""}`}
              onClick={() => {
                setLanguage(opt.code);
                setOpen(false);
              }}
            >
              <span className="flag" role="img" aria-hidden>
                {opt.flag}
              </span>
              <span className="code">{opt.code.toUpperCase()}</span>
              <span className="name">{t(opt.labelKey)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
