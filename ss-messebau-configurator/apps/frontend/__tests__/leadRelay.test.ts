/**
 * Tests fuer den Lead-Relay des Konfigurators (src/lib/leadRelay.ts).
 * Vorbild: website-sundsmessebau/ss-messebau-website/src/lib/lead-relay.ts.
 * Kein Test schickt einen echten Request: fetch ist immer gestubbt.
 */
import {
  ERFOLG_SATZ,
  LEAD_ENDPOINT,
  LEAD_KUNDE,
  MAIL_HINWEIS,
  buildLeadPayload,
  formatStandgroesse,
  relayLeadToHub,
  submitStandRequest,
  type LeadPayload,
  type LeadRelayResult,
} from "../src/lib/leadRelay";

const STANDDATEN = [
  "Fläche: 6 x 4 m (24 m²)",
  "Standtyp: corner",
  "Region: nrw",
  "Eilauftrag: Nein",
  "",
  "Module:",
  "- Boden: Teppich",
  "",
  "Richtpreis (brutto / Richtwert): 12.345 €",
];

const basis = () => ({
  contact: {
    name: "  Erika Muster ",
    email: "erika@example.com ",
    company: "Muster GmbH",
    phone: "+49 211 123",
    fair: "boot Düsseldorf, Halle 5",
  },
  standdaten: STANDDATEN,
  standgroesse: formatStandgroesse(6, 4),
  seite: "/konfigurator",
});

const zeilen = (p: LeadPayload) => p.nachricht.split("\n");

describe("formatStandgroesse", () => {
  it("nennt Breite, Tiefe und Fläche", () => {
    expect(formatStandgroesse(6, 4)).toBe("6 x 4 m (24 m²)");
  });

  it("rundet die Fläche auf zwei Stellen", () => {
    expect(formatStandgroesse(0.1, 3)).toBe("0.1 x 3 m (0.3 m²)");
  });
});

describe("buildLeadPayload", () => {
  it("setzt kunde messebau, die Kontaktfelder und einen leeren botcheck", () => {
    const p = buildLeadPayload(basis());
    expect(LEAD_KUNDE).toBe("messebau");
    expect(p).toMatchObject({
      kunde: "messebau",
      name: "Erika Muster",
      email: "erika@example.com",
      firma: "Muster GmbH",
      telefon: "+49 211 123",
      plz: "",
      seite: "/konfigurator",
      botcheck: "",
    });
  });

  it("sendet genau die Felder des Vertrags, nichts darueber hinaus", () => {
    const p = buildLeadPayload(basis());
    expect(Object.keys(p).sort()).toEqual(
      ["botcheck", "email", "firma", "kunde", "nachricht", "name", "plz", "seite", "telefon"].sort()
    );
  });

  it("schreibt zuerst die Standdaten, dann den Formularblock, zuletzt die Formularzeile", () => {
    const z = zeilen(buildLeadPayload(basis()));
    expect(z.slice(0, STANDDATEN.length)).toEqual(STANDDATEN);
    const block = z.indexOf("— Angaben aus dem Formular —");
    expect(block).toBeGreaterThan(STANDDATEN.length - 1);
    expect(z).toContain("Messe/Event: boot Düsseldorf, Halle 5");
    expect(z).toContain("Standgröße: 6 x 4 m (24 m²)");
    expect(z.indexOf("Messe/Event: boot Düsseldorf, Halle 5")).toBeGreaterThan(block);
    expect(z.indexOf("Standgröße: 6 x 4 m (24 m²)")).toBeGreaterThan(block);
    expect(z[z.length - 1]).toBe("Formular: konfigurator");
  });

  it("laesst Messe/Event weg, wenn das Feld leer ist (die Regel liest jeden Wert als Angabe)", () => {
    const eingabe = basis();
    eingabe.contact.fair = "   ";
    const p = buildLeadPayload(eingabe);
    expect(p.nachricht).not.toMatch(/^Messe\/Event:/m);
    expect(p.nachricht).toMatch(/^Standgröße: 6 x 4 m \(24 m²\)$/m);
  });

  it("kuerzt Felder auf die Grenzen des Endpunkts", () => {
    const eingabe = basis();
    eingabe.contact.name = "N".repeat(500);
    eingabe.contact.phone = "1".repeat(500);
    eingabe.contact.email = "e".repeat(500);
    eingabe.contact.company = "F".repeat(500);
    eingabe.seite = "/" + "s".repeat(500);
    const p = buildLeadPayload(eingabe);
    expect(p.name).toHaveLength(120);
    expect(p.telefon).toHaveLength(60);
    expect(p.email).toHaveLength(180);
    expect(p.firma).toHaveLength(160);
    expect(p.seite).toHaveLength(300);
  });

  it("schickt eine Telefonnummer ausserhalb des Endpunkt-Musters nur in der Nachricht (S1)", () => {
    const eingabe = basis();
    eingabe.contact.phone = "0172 1234567 mobil";
    const p = buildLeadPayload(eingabe);
    expect(p.telefon).toBe("");
    expect(zeilen(p)).toContain("Telefon (wie eingegeben): 0172 1234567 mobil");
    expect(zeilen(p)[zeilen(p).length - 1]).toBe("Formular: konfigurator");
  });

  it("zitiert in der ersten Mailzeile den Erfolgssatz des Formulars woertlich (Kuenstler 0215)", () => {
    expect(MAIL_HINWEIS).toContain(`„${ERFOLG_SATZ}“`);
  });

  it("laesst eine gueltige Telefonnummer im Feld und nicht in der Nachricht", () => {
    const p = buildLeadPayload(basis());
    expect(p.telefon).toBe("+49 211 123");
    expect(p.nachricht).not.toContain("Telefon (wie eingegeben)");
  });

  it("haelt die Nachricht unter 4000 Zeichen und behaelt Block und letzte Zeile", () => {
    const eingabe = basis();
    eingabe.standdaten = Array.from({ length: 400 }, (_, i) => `- Zeile ${i}: ${"x".repeat(40)}`);
    eingabe.contact.fair = "M".repeat(3000);
    const p = buildLeadPayload(eingabe);
    expect(p.nachricht.length).toBeLessThanOrEqual(4000);
    expect(p.nachricht).toContain("— Angaben aus dem Formular —");
    expect(p.nachricht).toMatch(/^Standgröße: /m);
    expect(zeilen(p)[zeilen(p).length - 1]).toBe("Formular: konfigurator");
  });

  it("nimmt window.location.pathname, wenn keine Seite angegeben ist", () => {
    const eingabe: Partial<ReturnType<typeof basis>> = basis();
    delete eingabe.seite;
    const p = buildLeadPayload(eingabe as ReturnType<typeof basis>);
    expect(p.seite).toBe(window.location.pathname);
  });
});

describe("relayLeadToHub", () => {
  const payload = buildLeadPayload(basis());

  it("schickt POST mit JSON und keepalive an den Endpunkt und meldet den Vorgang", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, vorgang: "v-123" }),
    });
    const r = await relayLeadToHub(payload, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r).toEqual({ ok: true, vorgang: "v-123" });
    expect(LEAD_ENDPOINT).toBe("https://leads.sundsconnect.de/lead");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(LEAD_ENDPOINT);
    expect(init.method).toBe("POST");
    expect(init.keepalive).toBe(true);
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body)).toEqual(payload);
  });

  it("meldet einen HTTP-Fehler mit dem Text des Endpunkts, ohne zu werfen", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ ok: false, fehler: "email ungueltig" }),
    });
    await expect(relayLeadToHub(payload, { fetchImpl: fetchImpl as unknown as typeof fetch })).resolves.toEqual({
      ok: false,
      error: "email ungueltig",
    });
  });

  it("meldet HTTP-Status, wenn die Antwort kein JSON ist", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new SyntaxError("kein JSON");
      },
    });
    await expect(relayLeadToHub(payload, { fetchImpl: fetchImpl as unknown as typeof fetch })).resolves.toEqual({
      ok: false,
      error: "HTTP 502",
    });
  });

  it("faengt einen Netzwerkfehler ab", async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(relayLeadToHub(payload, { fetchImpl: fetchImpl as unknown as typeof fetch })).resolves.toEqual({
      ok: false,
      error: "Failed to fetch",
    });
  });

  it("bricht nach der Zeitgrenze ab", async () => {
    const fetchImpl = jest.fn(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new Error("abgebrochen")));
        })
    );
    const r = await relayLeadToHub(payload, { fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 10 });
    expect(r).toEqual({ ok: false, error: "abgebrochen" });
  });

  it("meldet fehlendes fetch statt zu werfen", async () => {
    const original = globalThis.fetch;
    // jsdom bringt in Jest 29 kein fetch mit; fuer den Fall sicher entfernen
    (globalThis as { fetch?: typeof fetch }).fetch = undefined;
    try {
      await expect(relayLeadToHub(payload)).resolves.toEqual({ ok: false, error: "fetch nicht verfügbar" });
    } finally {
      (globalThis as { fetch?: typeof fetch }).fetch = original;
    }
  });
});

describe("submitStandRequest (Ablauf hinter handleContactSubmit)", () => {
  const payload = buildLeadPayload(basis());
  const mailtoUrl = "mailto:test@example.com?subject=x";

  it("oeffnet mailto auch dann, wenn der Relay fehlschlaegt, meldet aber keinen Erfolg (S2)", async () => {
    const open = jest.fn();
    const relay = jest.fn().mockResolvedValue({ ok: false, error: "HTTP 500" } as LeadRelayResult);
    const r = await submitStandRequest({ payload, mailtoUrl, relay, open });
    expect(open).toHaveBeenCalledWith(mailtoUrl);
    expect(r).toEqual({ ok: false, relay: { ok: false, error: "HTTP 500" }, mailto: true });
  });

  it("oeffnet mailto auch dann, wenn der Relay synchron wirft", async () => {
    const open = jest.fn();
    const relay = jest.fn(() => {
      throw new Error("kaputt");
    });
    const r = await submitStandRequest({ payload, mailtoUrl, relay, open });
    expect(open).toHaveBeenCalledWith(mailtoUrl);
    expect(r.ok).toBe(false);
    expect(r.mailto).toBe(true);
    expect(r.relay).toEqual({ ok: false, error: "kaputt" });
  });

  it("startet den Relay vor dem mailto (parallel, nicht nacheinander)", async () => {
    const reihenfolge: string[] = [];
    const relay = jest.fn(async () => {
      reihenfolge.push("relay");
      return { ok: true, vorgang: "v-1" };
    });
    const open = jest.fn(() => {
      reihenfolge.push("mailto");
    });
    await submitStandRequest({ payload, mailtoUrl, relay, open });
    expect(reihenfolge).toEqual(["relay", "mailto"]);
    expect(relay).toHaveBeenCalledWith(payload);
  });

  it("meldet Erfolg ueber den Relay, wenn mailto wirft", async () => {
    const open = jest.fn(() => {
      throw new Error("kein Mailprogramm");
    });
    const relay = jest.fn().mockResolvedValue({ ok: true, vorgang: "v-2" });
    const r = await submitStandRequest({ payload, mailtoUrl, relay, open });
    expect(r).toEqual({ ok: true, relay: { ok: true, vorgang: "v-2" }, mailto: false });
  });

  it("meldet Fehlschlag nur, wenn beide Wege scheitern", async () => {
    const open = jest.fn(() => {
      throw new Error("kein Mailprogramm");
    });
    const relay = jest.fn().mockRejectedValue(new Error("offline"));
    const r = await submitStandRequest({ payload, mailtoUrl, relay, open });
    expect(r).toEqual({ ok: false, relay: { ok: false, error: "offline" }, mailto: false });
  });
});
