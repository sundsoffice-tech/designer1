import type { ContactRequest } from "@ss/shared";

// Lead-Relay: Konfigurator-Anfrage an den Lead-Endpunkt von S&S (sunds-hub).
// Der Endpunkt speichert zuerst (fsync) und mailt danach an Info@sundsmessebau.com;
// der Anfragen-Dienst holt den Lead von dort ins Register (Prozess P1).
// Vertrag: leadmaschine zentrale/lead-endpunkt/SCHNITTSTELLE-MESSEBAU-WEBSITE.md,
// Kundenschluessel "messebau-konfigurator" in lead-endpunkt/kunden.json.

export const LEAD_ENDPOINT = "https://leads.sundsconnect.de/lead";
export const LEAD_KUNDE = "messebau-konfigurator";
const ZEITGRENZE_MS = 8000;

// Genau diese neun Schluessel (Zusagenliste), keiner mehr.
export type LeadPayload = {
  kunde: string;
  name: string;
  telefon: string;
  email: string;
  firma: string;
  plz: string;
  nachricht: string;
  seite: string;
  botcheck: string;
};

// Drei Ausgaenge: gespeichert, vom Server abgelehnt (Status bekannt) oder unklar.
// Unklar heisst: keine lesbare Antwort (Zeitgrenze, Netz, CORS). Weil der Endpunkt
// direkt nach dem Speichern antwortet, ist der Lead dann fast immer nie gespeichert;
// das Formular bittet um erneutes Senden und bietet mailto per Knopf an, nicht
// automatisch. Gleiche Leads fuehrt der Endpunkt 15 Minuten lang zusammen
// (Runde 3, Spieltheoretiker 1, Wissenschaftler 1).
export type LeadRelayResult =
  | { ok: true; vorgang: string }
  | { ok: false; unklar?: false; status: number; fehler?: string }
  | { ok: false; unklar: true };

// Wie TELEFON in dienst.py: eine Nummer, die das nicht erfuellt, lehnt der Endpunkt
// mit 400 ab. Dann geht sie als Freitext in die Nachricht, der Lead kommt trotzdem an.
const SERVER_TELEFON = /^[0-9+()/\s.-]{6,}$/;

// Nach Zeichen schneiden, nicht nach UTF-16-Einheiten: slice() trennte ein Emoji an
// der Grenze, das halbe Surrogat brachte den Endpunkt auf 500 (Wissenschaftler 4).
// Der Endpunkt zaehlt ebenfalls Codepoints (Python len).
const kappe = (text: string, grenze: number) => Array.from(text).slice(0, grenze).join("");

// Der Endpunkt nimmt hoechstens MAX_KOERPER = 16384 Byte (dienst.py) und antwortet sonst 413.
// Nach Zeichen gekappt passen 4000 Emoji (16000 Byte) in die Nachricht, Steuerzeichen werden
// in JSON zu sechs Byte (Wissenschaftler 5). Deshalb kuerzt buildLeadPayload die Nachricht,
// bis der Koerper mit Reserve unter der Grenze liegt.
const KOERPER_BYTES = 15 * 1024;

// UTF-8-Laenge ohne TextEncoder (fehlt je nach Testumgebung).
const utf8Laenge = (text: string) => {
  let n = 0;
  for (const zeichen of text) {
    const cp = zeichen.codePointAt(0) ?? 0;
    n += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
  }
  return n;
};

export function buildLeadPayload(
  contact: ContactRequest,
  standLines: string[],
  seite: string
): LeadPayload {
  const telefonRoh = (contact.phone ?? "").trim();
  const telefon = SERVER_TELEFON.test(telefonRoh) ? kappe(telefonRoh, 60) : "";
  const kopf = [
    "Standanfrage aus dem 3D-Konfigurator",
    ...(contact.fair ? [`Messe / Event: ${contact.fair}`] : []),
    ...(telefonRoh && !telefon ? [`Telefon (Freitext): ${telefonRoh}`] : []),
    ...(contact.message ? ["", contact.message] : []),
    "",
  ];
  const payload: LeadPayload = {
    kunde: LEAD_KUNDE,
    name: kappe(contact.name.trim(), 120),
    telefon,
    email: kappe(contact.email.trim(), 180),
    firma: kappe((contact.company ?? "").trim(), 160),
    plz: "",
    nachricht: kappe([...kopf, ...standLines].join("\n"), 4000),
    seite: kappe(seite, 300),
    botcheck: "",
  };
  let zeichen = Array.from(payload.nachricht);
  while (zeichen.length > 0 && utf8Laenge(JSON.stringify(payload)) > KOERPER_BYTES) {
    zeichen = zeichen.slice(0, Math.floor(zeichen.length * 0.9));
    payload.nachricht = zeichen.join("");
  }
  return payload;
}

// Was das Formular nach dem Senden zeigt (SidebarControls.tsx):
// - angekommen: gespeichert, mit Vorgang;
// - unklar: keine lesbare Antwort, Bitte um erneutes Senden, Knopf "Per E-Mail senden",
//   Adresse und Kopierknoepfe (Runde 3, M1);
// - abgelehnt: 400/429 mit Text des Servers, kein mailto (Kuenstler 12);
// - mailprogramm: jede andere Ablehnung, Rueckfall auf mailto mit Ausweg (Kuenstler 1).
export type LeadAusgang =
  | { art: "angekommen"; vorgang: string }
  | { art: "unklar" }
  | { art: "abgelehnt"; text: string; status: number }
  | { art: "mailprogramm" };

export function leadAusgang(ergebnis: LeadRelayResult): LeadAusgang {
  if (ergebnis.ok) {
    return { art: "angekommen", vorgang: ergebnis.vorgang };
  }
  if (ergebnis.unklar) {
    return { art: "unklar" };
  }
  if ((ergebnis.status === 400 || ergebnis.status === 429) && ergebnis.fehler) {
    return { art: "abgelehnt", text: ergebnis.fehler, status: ergebnis.status };
  }
  return { art: "mailprogramm" };
}

// Wirft nie: jeder Fehler wird zu { ok: false }. Was der Aufrufer daraus macht
// (mailto, Servertext, unklar), entscheidet leadAusgang().
export async function relayLeadToHub(
  payload: LeadPayload,
  fetchImpl: typeof fetch = fetch,
  zeitgrenzeMs: number = ZEITGRENZE_MS
): Promise<LeadRelayResult> {
  const abbruch = new AbortController();
  const uhr = setTimeout(() => abbruch.abort(), zeitgrenzeMs);
  try {
    const antwort = await fetchImpl(LEAD_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: abbruch.signal,
    });
    const daten = (await antwort.json().catch(() => null)) as
      | { ok?: boolean; vorgang?: string; fehler?: string }
      | null;
    // Nur mit Vorgang ist der Lead gespeichert; 200 ohne Vorgang heisst Honigtopf.
    if (antwort.ok && daten?.ok === true && typeof daten.vorgang === "string" && daten.vorgang) {
      return { ok: true, vorgang: daten.vorgang };
    }
    // 2xx ohne lesbaren Vorgang (Antwort abgebrochen): Ob gespeichert, wissen wir nicht.
    if (antwort.ok && daten === null) {
      return { ok: false, unklar: true };
    }
    return { ok: false, status: antwort.status, fehler: daten?.fehler };
  } catch {
    // Zeitgrenze, Netzfehler oder vom Browser verworfene Antwort (Preflight, 403/502
    // ohne CORS-Kopf): meist nie gespeichert, selten schon gespeichert. Erneutes Senden
    // ist gefahrlos, der Endpunkt fuehrt gleiche Leads zusammen.
    return { ok: false, unklar: true };
  } finally {
    clearTimeout(uhr);
  }
}
