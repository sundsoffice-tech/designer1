import { type FormEvent } from "react";
import { useTranslation } from "../../i18n";

type ContactFormProps = {
  customerName: string;
  company: string;
  email: string;
  phone: string;
  fair: string;
  onSubmit: () => void;
  onChange: {
    name: (value: string) => void;
    company: (value: string) => void;
    email: (value: string) => void;
    phone: (value: string) => void;
    fair: (value: string) => void;
  };
  disabled?: boolean;
  ctaLabel?: string;
  disabledHint?: string;
  hint?: string;
};

export function ContactForm({
  customerName,
  company,
  email,
  phone,
  fair,
  onSubmit,
  onChange,
  disabled = false,
  ctaLabel,
  disabledHint,
  hint,
}: ContactFormProps) {
  const { t } = useTranslation();

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (disabled) return;
    onSubmit();
  };

  return (
    <div className="sidebar-section">
      <div className="sidebar-section-header">
        <span className="section-title">{t("inquiry.title")}</span>
        <span className="section-sub">{t("inquiry.subtitle")}</span>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 8 }}>
        <label>
          {t("inquiry.name")}
          <input
            type="text"
            value={customerName}
            placeholder={t("inquiry.namePlaceholder")}
            onChange={(e) => onChange.name(e.target.value)}
          />
        </label>

        <label>
          {t("inquiry.company")}
          <input
            type="text"
            value={company}
            placeholder={t("inquiry.companyPlaceholder")}
            onChange={(e) => onChange.company(e.target.value)}
          />
        </label>

        <label>
          {t("inquiry.email")}
          <input
            type="email"
            value={email}
            placeholder={t("inquiry.emailPlaceholder")}
            onChange={(e) => onChange.email(e.target.value)}
          />
        </label>

        <label>
          {t("inquiry.phone")}
          <input
            type="tel"
            value={phone}
            placeholder={t("inquiry.phonePlaceholder")}
            onChange={(e) => onChange.phone(e.target.value)}
          />
        </label>

        <label>
          {t("inquiry.fair")}
          <input
            type="text"
            value={fair}
            placeholder={t("inquiry.fairPlaceholder")}
            onChange={(e) => onChange.fair(e.target.value)}
          />
        </label>

        {hint && (
          <p style={{ fontSize: 12, color: "var(--muted)", margin: "2px 0 0" }}>
            {hint}
          </p>
        )}

        {disabled && disabledHint && (
          <div style={{ color: "var(--danger)", fontSize: 12 }}>{disabledHint}</div>
        )}

        <button type="submit" className="btn-primary" disabled={disabled}>
          {ctaLabel || t("inquiry.sendCta")}
        </button>
      </form>
    </div>
  );
}
