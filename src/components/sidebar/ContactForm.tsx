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
  disabled: boolean;
  ctaLabel: string;
  hint: string;
  disabledHint?: string;
};

export function ContactForm({
  customerName,
  company,
  email,
  phone,
  fair,
  onSubmit,
  onChange,
  disabled,
  ctaLabel,
  hint,
  disabledHint,
}: ContactFormProps) {
  return (
    <div className="sidebar-section">
      <div className="sidebar-section-header">
        <span className="section-title">Anfrage senden</span>
        <span className="section-sub">Direkt an S&S Messebau</span>
      </div>

      <p id="request-form-hint" className="visually-hidden">
        {hint}
      </p>

      <div className="form-grid">
        <label htmlFor="request-name">
          Name
          <input
            id="request-name"
            type="text"
            value={customerName}
            onChange={(e) => onChange.name(e.target.value)}
            placeholder="Max Mustermann"
            aria-describedby="request-form-hint"
          />
        </label>

        <label htmlFor="request-company">
          Firma
          <input
            id="request-company"
            type="text"
            value={company}
            onChange={(e) => onChange.company(e.target.value)}
            placeholder="Firma / Organisation"
            aria-describedby="request-form-hint"
          />
        </label>

        <label htmlFor="request-email">
          E-Mail
          <input
            id="request-email"
            type="email"
            value={email}
            onChange={(e) => onChange.email(e.target.value)}
            placeholder="mail@unternehmen.de"
            aria-describedby="request-form-hint"
          />
        </label>

        <label htmlFor="request-phone">
          Telefon
          <input
            id="request-phone"
            type="tel"
            value={phone}
            onChange={(e) => onChange.phone(e.target.value)}
            placeholder="+49 ..."
            aria-describedby="request-form-hint"
          />
        </label>

        <label htmlFor="request-fair">
          Messe / Event / Ort
          <input
            id="request-fair"
            type="text"
            value={fair}
            onChange={(e) => onChange.fair(e.target.value)}
            placeholder="z. B. boot Duesseldorf, Halle 5"
            aria-describedby="request-form-hint"
          />
        </label>

        <button className="btn-primary" style={{ width: "100%" }} disabled={disabled} onClick={onSubmit}>
          {ctaLabel}
        </button>
        {disabled && (
          <small style={{ color: "#b91c1c", marginTop: 6 }}>
            {disabledHint ?? ctaLabel}
          </small>
        )}
      </div>
    </div>
  );
}
