import {
  LEAD_ENDPOINT,
  LEAD_KUNDE,
  buildAnfrageMailText,
  buildLeadPayload,
  kurzeNummer,
  leadAusgang,
  ohneEinzelSurrogat,
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

  // Rollen 15.10.2026, Wissenschaftler 4: slice() schnitt nach UTF-16-Einheiten. Ein Emoji
  // an Stelle 120 (Name) oder 4000 (Nachricht) liess ein halbes Surrogat stehen, der
  // Endpunkt antwortete 500, kein Lead.
  it("schneidet nie ein Emoji an der Grenze entzwei", () => {
    const halbesSurrogat = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
    const emoji = "\u{1F600}";
    const p = buildLeadPayload(
      { name: "x".repeat(119) + emoji + "y", email: "a@b.de", company: "x".repeat(159) + emoji, phone: "" },
      ["z".repeat(4000) + emoji],
      "/" + "s".repeat(298) + emoji
    );
    for (const feld of [p.name, p.firma, p.nachricht, p.seite]) {
      expect(halbesSurrogat.test(feld)).toBe(false);
    }
    expect(p.name).toBe("x".repeat(119) + emoji);
    expect(Array.from(p.name).length).toBe(120);
    expect(Array.from(p.nachricht).length).toBeLessThanOrEqual(4000);
  });

  // Mit der Kappe nach Zeichen passen 4000 Emoji (16000 Byte) in die Nachricht; Steuerzeichen
  // werden in JSON zu \u00XX (sechs Byte). Beides darf den Endpunkt nicht auf 413 bringen.
  it("bleibt auch mit Emoji und Steuerzeichen unter der Bytegrenze des Endpunkts", () => {
    for (const z of ["\u{1F600}", "\u0001"]) {
      const lang = z.repeat(10000);
      const p = buildLeadPayload(
        { name: lang, email: "a@b.de", company: lang, phone: "", fair: lang },
        [lang],
        "/" + lang
      );
      expect(utf8Bytes(JSON.stringify(p))).toBeLessThan(16 * 1024);
      expect(p.nachricht.startsWith("Standanfrage aus dem 3D-Konfigurator")).toBe(true);
    }
  });

  // Runde 3, K1: Die geaenderte Anfrage nennt den Vorgang, auf den sie sich bezieht.
  it("beginnt eine geaenderte Anfrage mit 'Änderung zu Vorgang X'", () => {
    const p = buildLeadPayload(kontakt, stand, "/designer1/", "a1b2c3d4e5");
    expect(p.nachricht.startsWith("Änderung zu Vorgang a1b2c3d4e5\nStandanfrage aus dem 3D-Konfigurator")).toBe(true);
    const ohne = buildLeadPayload(kontakt, stand, "/designer1/");
    expect(ohne.nachricht.startsWith("Standanfrage aus dem 3D-Konfigurator")).toBe(true);
  });
});

// programmierer Runde 3, Kann-Fund: Scheitert die geaenderte Anfrage am Endpunkt und geht
// ueber das Mailprogramm, muss auch die Mail den Vorgang nennen.
describe("buildAnfrageMailText", () => {
  const kontaktZeilen = ["=== Kontakt ===", "Name: Erika Muster"];

  it("nennt bei einer Aenderung den Vorgang in der ersten Zeile", () => {
    const text = buildAnfrageMailText(stand, kontaktZeilen, "a1b2c3d4e5");
    expect(text.split("\n")[0]).toBe("Änderung zu Vorgang a1b2c3d4e5");
    expect(text).toContain("Neue Standanfrage über den 3D-Konfigurator:");
    expect(text).toContain("Fläche: 6 x 4 m (24 m²)");
    expect(text).toContain("Name: Erika Muster");
  });

  it("bleibt ohne Vorgang wie bisher", () => {
    expect(buildAnfrageMailText(stand, kontaktZeilen)).toBe(
      [
        "Neue Standanfrage über den 3D-Konfigurator:",
        "",
        "=== Standdaten ===",
        ...stand,
        "",
        ...kontaktZeilen,
      ].join("\n")
    );
  });
});

// Runde 3, K3: encodeURIComponent wirft bei einem einzelnen Surrogat (URIError),
// dann oeffnete der mailto-Weg nichts.
describe("ohneEinzelSurrogat", () => {
  const hoch = String.fromCharCode(0xd83d);
  const tief = String.fromCharCode(0xde00);
  const ersatz = String.fromCharCode(0xfffd);

  it("ersetzt einzelne Surrogate und laesst ganze Emoji stehen", () => {
    expect(ohneEinzelSurrogat("a" + hoch + "b")).toBe("a" + ersatz + "b");
    expect(ohneEinzelSurrogat("a" + tief)).toBe("a" + ersatz);
    expect(ohneEinzelSurrogat("x" + hoch)).toBe("x" + ersatz);
    expect(ohneEinzelSurrogat(hoch + tief + "ä")).toBe(hoch + tief + "ä");
    expect(ohneEinzelSurrogat(tief + hoch)).toBe(ersatz + ersatz);
  });

  it("macht jeden Text fuer encodeURIComponent tauglich", () => {
    const kaputt = "Halle 5 " + hoch + " Stand " + tief;
    expect(() => encodeURIComponent(kaputt)).toThrow(URIError);
    expect(() => encodeURIComponent(ohneEinzelSurrogat(kaputt))).not.toThrow();
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
    await expect(relayLeadToHub(payload, netz as unknown as typeof fetch)).resolves.toEqual({ ok: false, unklar: true });
    const kaputt = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => { throw new Error("x"); } });
    await expect(relayLeadToHub(payload, kaputt as unknown as typeof fetch)).resolves.toEqual({ ok: false, unklar: true });
  });

  // Rollen 15.10.2026 (Spieltheoretiker 4, Wissenschaftler 2): Der Abbruch nach der
  // Zeitgrenze hiess "gescheitert", das Formular oeffnete mailto, obwohl der Server den
  // Lead oft schon gespeichert hatte -> Doppel-Lead. Jetzt ist der Ausgang unklar,
  // und der Aufrufer faellt NICHT automatisch auf mailto zurueck.
  it("meldet nach der Zeitgrenze einen unklaren Ausgang, keinen Fehlschlag", async () => {
    const haengt = jest.fn((_url: string, init: { signal: AbortSignal }) =>
      new Promise((_res, rej) => init.signal.addEventListener("abort", () => rej(new Error("abgebrochen"))))
    );
    const r = await relayLeadToHub(payload, haengt as unknown as typeof fetch, 20);
    expect(r).toEqual({ ok: false, unklar: true });
  });

  it("eine Ablehnung mit Status ist kein unklarer Ausgang", async () => {
    for (const status of [400, 413, 429, 500]) {
      const fetchMock = jest.fn().mockResolvedValue({ ok: false, status, json: async () => ({ ok: false }) });
      const r = await relayLeadToHub(payload, fetchMock as unknown as typeof fetch);
      expect(r).toEqual({ ok: false, status, fehler: undefined });
      expect("unklar" in r && r.unklar).toBeFalsy();
    }
  });
});

// Was das Formular nach dem Senden zeigt (Rollen 15.10.2026, Kuenstler 1, 2, 12).
describe("leadAusgang", () => {
  it("gespeichert -> angekommen mit Vorgang", () => {
    expect(leadAusgang({ ok: true, vorgang: "a1b2c3d4e5" })).toEqual({ art: "angekommen", vorgang: "a1b2c3d4e5" });
  });

  it("unklar -> kein Mailprogramm", () => {
    expect(leadAusgang({ ok: false, unklar: true })).toEqual({ art: "unklar" });
  });

  it("400 und 429 mit Text des Servers -> Text zeigen, kein Mailprogramm", () => {
    expect(leadAusgang({ ok: false, status: 400, fehler: "Bitte geben Sie Ihren Namen an." })).toEqual({
      art: "abgelehnt",
      text: "Bitte geben Sie Ihren Namen an.",
      status: 400,
    });
    expect(leadAusgang({ ok: false, status: 429, fehler: "Zu viele Anfragen." })).toMatchObject({
      art: "abgelehnt",
      status: 429,
    });
  });

  it("jede andere Ablehnung oder 400 ohne Text -> Mailprogramm", () => {
    for (const r of [
      { ok: false as const, status: 400 },
      { ok: false as const, status: 413, fehler: "Anfrage zu groß" },
      { ok: false as const, status: 403, fehler: "Herkunft nicht freigegeben" },
      { ok: false as const, status: 404, fehler: "unbekannter Kunde" },
      { ok: false as const, status: 500, fehler: "Technischer Fehler." },
      { ok: false as const, status: 200 },
    ]) {
      expect(leadAusgang(r)).toEqual({ art: "mailprogramm" });
    }
  });
});

// Runde 4, Kuenstler S1: kurze lesbare Nummer statt Maschinennummer im Dankessatz.
// Erwartete Werte unabhaengig in Python gerechnet (FNV-1a 32 Bit ueber UTF-8, 1000 + h % 9000),
// damit der Endpunkt dieselbe Nummer nachrechnen kann.
describe("kurzeNummer", () => {
  it("leitet aus dem Vorgang stabil eine vierstellige Nummer ab", () => {
    expect(kurzeNummer("a1b2c3d4e5")).toBe("7471");
    expect(kurzeNummer("0f9e8d7c6b")).toBe("7611");
    expect(kurzeNummer("Vorgäng")).toBe("3009");
    expect(kurzeNummer("a1b2c3d4e5")).toBe(kurzeNummer("a1b2c3d4e5"));
  });

  it("liefert immer vier Ziffern ohne fuehrende Null und streut", () => {
    const nummern = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const n = kurzeNummer(i.toString(16).padStart(10, "0"));
      expect(n).toMatch(/^[1-9][0-9]{3}$/);
      nummern.add(n as string);
    }
    expect(nummern.size).toBeGreaterThan(190);
  });

  it("zeigt ohne Vorgang keine Nummer", () => {
    expect(kurzeNummer("")).toBeNull();
    expect(kurzeNummer("   ")).toBeNull();
  });
});
