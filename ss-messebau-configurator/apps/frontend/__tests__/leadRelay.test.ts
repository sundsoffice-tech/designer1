import {
  LEAD_ENDPOINT,
  LEAD_KUNDE,
  buildLeadPayload,
  relayLeadToHub,
} from "../src/lib/leadRelay";

// Vertrag: leadmaschine zentrale/lead-endpunkt/SCHNITTSTELLE-MESSEBAU-WEBSITE.md, Paragraf 2.
// Genau diese neun Schluessel, keiner mehr (Zusagenliste, KONVENTION Paragraf 8.4).
const ZUSAGE = ["botcheck", "email", "firma", "kunde", "nachricht", "name", "plz", "seite", "telefon"];
// Dieselbe Telefonpruefung wie der Endpunkt (dienst.py, TELEFON), damit kein Lead an 400 scheitert.
const SERVER_TELEFON = /^[0-9+()/\s.-]{6,}$/;

// Bytes in UTF-8, ohne TextEncoder (fehlt je nach Testumgebung).
const utf8Bytes = (text: string) => encodeURIComponent(text).replace(/%[0-9A-F]{2}/g, "x").length;

const kontakt = {
  name: "Erika Muster",
  email: "erika@example.org",
  company: "Muster GmbH",
  phone: "+49 2161 123456",
  fair: "boot Duesseldorf, Halle 5",
};
const stand = ["Fläche: 6 x 4 m (24 m²)", "Standtyp: corner"];

describe("buildLeadPayload", () => {
  it("liefert genau die neun Schluessel des Vertrags", () => {
    const p = buildLeadPayload(kontakt, stand, "/designer1/");
    expect(Object.keys(p).sort()).toEqual(ZUSAGE);
    expect(p.kunde).toBe(LEAD_KUNDE);
    expect(p.kunde).toBe("messebau-konfigurator");
    expect(p.botcheck).toBe("");
    expect(p.plz).toBe("");
    expect(p.seite).toBe("/designer1/");
  });

  it("bildet Kontakt und Standdaten ab", () => {
    const p = buildLeadPayload(kontakt, stand, "/designer1/");
    expect(p.name).toBe("Erika Muster");
    expect(p.email).toBe("erika@example.org");
    expect(p.firma).toBe("Muster GmbH");
    expect(p.telefon).toBe("+49 2161 123456");
    expect(p.nachricht).toContain("Messe / Event: boot Duesseldorf, Halle 5");
    expect(p.nachricht).toContain("Fläche: 6 x 4 m (24 m²)");
    expect(p.nachricht).toContain("3D-Konfigurator");
  });

  it("schickt eine Telefonnummer, die der Server ablehnen wuerde, nicht als telefon", () => {
    const p = buildLeadPayload({ ...kontakt, phone: "abends" }, stand, "/");
    expect(p.telefon).toBe("");
    expect(p.nachricht).toContain("Telefon (Freitext): abends");
  });

  it("jede gesendete Telefonnummer besteht die Serverpruefung", () => {
    for (const phone of ["+49 2161 123456", "0211/12345", "(0211) 123-45", "12", "tel: 0211 1", ""]) {
      const p = buildLeadPayload({ ...kontakt, phone }, stand, "/");
      expect(p.telefon === "" || SERVER_TELEFON.test(p.telefon)).toBe(true);
    }
  });

  it("haelt die Laengengrenzen des Endpunkts ein", () => {
    const lang = "x".repeat(10000);
    const p = buildLeadPayload(
      { name: lang, email: "a@b.de", company: lang, phone: "", fair: lang },
      [lang],
      "/" + lang
    );
    expect(p.name.length).toBeLessThanOrEqual(120);
    expect(p.firma.length).toBeLessThanOrEqual(160);
    expect(p.nachricht.length).toBeLessThanOrEqual(4000);
    expect(p.seite.length).toBeLessThanOrEqual(300);
    expect(utf8Bytes(JSON.stringify(p))).toBeLessThan(16 * 1024);
  });

  it("bleibt auch mit Mehrbyte-Zeichen unter der Bytegrenze des Endpunkts (MAX_KOERPER)", () => {
    // Der Server zaehlt Bytes, nicht Zeichen; "€" sind drei Bytes in UTF-8.
    const lang = "€".repeat(10000);
    const p = buildLeadPayload(
      { name: lang, email: "a@b.de", company: lang, phone: "", fair: lang },
      [lang],
      "/" + lang
    );
    expect(utf8Bytes(JSON.stringify(p))).toBeLessThan(16 * 1024);
  });
});

describe("relayLeadToHub", () => {
  const payload = buildLeadPayload(kontakt, stand, "/designer1/");

  it("sendet per POST als JSON an den Endpunkt und liefert den Vorgang", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, vorgang: "a1b2c3d4e5" }),
    });
    const r = await relayLeadToHub(payload, fetchMock as unknown as typeof fetch);
    expect(r).toEqual({ ok: true, vorgang: "a1b2c3d4e5" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(LEAD_ENDPOINT);
    expect(url).toBe("https://leads.sundsconnect.de/lead");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual(payload);
  });

  it("wertet 200 ohne Vorgang nicht als gespeichert", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
    const r = await relayLeadToHub(payload, fetchMock as unknown as typeof fetch);
    expect(r.ok).toBe(false);
  });

  it("reicht den Besuchertext des Servers bei Ablehnung durch", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ ok: false, fehler: "Bitte geben Sie Ihren Namen an." }),
    });
    const r = await relayLeadToHub(payload, fetchMock as unknown as typeof fetch);
    expect(r).toEqual({ ok: false, status: 400, fehler: "Bitte geben Sie Ihren Namen an." });
  });

  it("wirft nie, auch nicht bei Netzfehler oder kaputter Antwort", async () => {
    const netz = jest.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(relayLeadToHub(payload, netz as unknown as typeof fetch)).resolves.toMatchObject({ ok: false });
    const kaputt = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => { throw new Error("x"); } });
    await expect(relayLeadToHub(payload, kaputt as unknown as typeof fetch)).resolves.toMatchObject({ ok: false });
  });

  it("bricht nach der Zeitgrenze ab", async () => {
    const haengt = jest.fn((_url: string, init: { signal: AbortSignal }) =>
      new Promise((_res, rej) => init.signal.addEventListener("abort", () => rej(new Error("abgebrochen"))))
    );
    const r = await relayLeadToHub(payload, haengt as unknown as typeof fetch, 20);
    expect(r.ok).toBe(false);
  });
});
