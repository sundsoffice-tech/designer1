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

export type LeadRelayResult =
  | { ok: true; vorgang: string }
  | { ok: false; status?: number; fehler?: string };

// Wie TELEFON in dienst.py: eine Nummer, die das nicht erfuellt, lehnt der Endpunkt
// mit 400 ab. Dann geht sie als Freitext in die Nachricht, der Lead kommt trotzdem an.
const SERVER_TELEFON = /^[0-9+()/\s.-]{6,}$/;

const kappe = (text: string, grenze: number) => text.slice(0, grenze);

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
  return {
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
}

// Wirft nie: jeder Fehler wird zu { ok: false }, der Aufrufer faellt dann auf mailto zurueck.
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
    return { ok: false, status: antwort.status, fehler: daten?.fehler };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(uhr);
  }
}
