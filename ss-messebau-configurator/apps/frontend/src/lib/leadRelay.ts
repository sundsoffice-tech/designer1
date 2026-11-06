/**
 * Lead-Relay des 3D-Standkonfigurators: zweiter, unabhängiger Zustellweg für Standanfragen.
 *
 * Neben dem `mailto:`-Link (Mailprogramm des Besuchers) geht jede Anfrage an den
 * Lead-Endpunkt des S&S-Ökosystems:
 *
 *     POST https://leads.sundsconnect.de/lead   (kunde = "messebau")
 *
 * Vorbild 1:1: website-sundsmessebau/ss-messebau-website/src/lib/lead-relay.ts,
 * Vertrag SCHNITTSTELLE-LEADS.md im Website-Repo.
 *
 * Regeln dieses Moduls:
 * - wirft nie; ein Fehler hier darf das Formular nicht brechen
 * - sendet genau die im Vertrag zugesagten Felder, nichts darüber hinaus
 * - `botcheck` bleibt leer (Honigtopf des Endpunkts; gefüllt = Bot)
 * - die Nachricht endet mit dem Block „— Angaben aus dem Formular —“ und der Zeile
 *   `Formular: konfigurator`; die Regel-Stufe qualifizierung_regel.py liest die
 *   Bezeichner `Messe/Event` und `Standgröße` aus diesem Block
 *
 * Typen bleiben hier: Nur das Frontend spricht mit dem Lead-Endpunkt, das Backend nicht.
 */
import type { ContactRequest } from "@ss/shared";

export const LEAD_ENDPOINT = "https://leads.sundsconnect.de/lead";
export const LEAD_KUNDE = "messebau";
export const LEAD_FORMULAR = "konfigurator";
export const FORMULAR_BLOCK = "— Angaben aus dem Formular —";

/** Felder, die der Lead-Endpunkt kennt (Vertrag § 2). */
export interface LeadPayload {
  kunde: typeof LEAD_KUNDE;
  name: string;
  telefon: string;
  email: string;
  firma: string;
  plz: string;
  nachricht: string;
  seite: string;
  botcheck: "";
}

export interface LeadRelayResult {
  ok: boolean;
  vorgang?: string;
  error?: string;
}

/** Grenzen des Endpunkts (dienst.py, pruefe()). Wir schneiden vorher ab. */
const GRENZEN = { name: 120, telefon: 60, email: 180, firma: 160, plz: 10, nachricht: 4000, seite: 300 };
/** Ein Blockwert darf die Standdaten nicht verdrängen. */
const GRENZE_BLOCKWERT = 300;

const text = (v: unknown): string => (v === undefined || v === null ? "" : String(v)).trim();
const kuerze = (v: string, n: number): string => (v.length > n ? v.slice(0, n) : v);

/** „6 x 4 m (24 m²)“: Breite, Tiefe, Fläche auf zwei Stellen gerundet. */
export function formatStandgroesse(width: number, depth: number): string {
  const flaeche = Math.round(width * depth * 100) / 100;
  return `${width} x ${depth} m (${flaeche} m²)`;
}

export interface BuildLeadInput {
  /** Kontaktdaten aus dem Formular */
  contact: ContactRequest;
  /** Zeilen der Standdaten (buildStandSummary) */
  standdaten: string[];
  /** Standgröße, z. B. aus formatStandgroesse() */
  standgroesse: string;
  /** Pfad der Seite; Standard: window.location.pathname */
  seite?: string;
}

/** Erfolgssatz im Formular; die erste Zeile der Mail zitiert ihn wörtlich (Künstler 0215 MUSS 2 und 3). */
export const ERFOLG_SATZ = "Danke, Ihre Anfrage ist bei uns angekommen.";

/** Erste Zeile der vorbereiteten Mail gegen Doppelsendung. */
export const MAIL_HINWEIS =
  `Diese E-Mail ist eine Kopie Ihrer Anfrage. Steht im Konfigurator „${ERFOLG_SATZ}“, ist alles erledigt und Sie ` +
  "können diese E-Mail schließen. Steht dort etwas anderes, senden Sie sie bitte ab.";

/** Telefonmuster des Endpunkts (dienst.py TELEFON, fullmatch). */
export const TELEFON_MUSTER = /^[0-9+()/\s.-]{6,}$/;

/** Baut die Nutzlast für POST /lead. Rein, ohne Seiteneffekte, testbar. */
export function buildLeadPayload(input: BuildLeadInput): LeadPayload {
  const c = input.contact;

  const block: string[] = [FORMULAR_BLOCK];
  const messe = kuerze(text(c.fair), GRENZE_BLOCKWERT);
  // Leeres Feld weglassen: die Regel-Stufe nimmt jeden Wert (auch „-“) als Angabe des Besuchers.
  if (messe) block.push(`Messe/Event: ${messe}`);
  const groesse = kuerze(text(input.standgroesse), GRENZE_BLOCKWERT);
  if (groesse) block.push(`Standgröße: ${groesse}`);
  // Spieltheoretiker 0130 S1: der Endpunkt lehnt Telefonnummern außerhalb seines Musters mit 400 ab; dann geht die Eingabe
  // in die Nachricht und das Feld bleibt leer (Telefon ist bei messebau nicht Pflicht, E-Mail prüft das Formular).
  const telefonRoh = kuerze(text(c.phone), GRENZEN.telefon);
  const telefon = TELEFON_MUSTER.test(telefonRoh) ? telefonRoh : "";
  if (telefonRoh && !telefon) block.push(`Telefon (wie eingegeben): ${kuerze(telefonRoh, GRENZE_BLOCKWERT)}`);
  const schluss = `\n\n${block.join("\n")}\n\nFormular: ${LEAD_FORMULAR}`;

  // Gekürzt werden nur die Standdaten, damit Block und letzte Zeile immer ankommen.
  const standdaten = kuerze(input.standdaten.join("\n").trim(), GRENZEN.nachricht - schluss.length);
  const nachricht = standdaten ? standdaten + schluss : schluss.trimStart();

  let seite = input.seite;
  if (seite === undefined) {
    seite = typeof window !== "undefined" && window.location ? window.location.pathname : "";
  }

  return {
    kunde: LEAD_KUNDE,
    name: kuerze(text(c.name), GRENZEN.name),
    telefon,
    email: kuerze(text(c.email), GRENZEN.email),
    firma: kuerze(text(c.company), GRENZEN.firma),
    plz: "",
    nachricht,
    seite: kuerze(seite, GRENZEN.seite),
    botcheck: "",
  };
}

/**
 * Schickt die Nutzlast an den Lead-Endpunkt. Wirft nie.
 * `keepalive` sorgt dafür, dass der Request auch dann noch rausgeht, wenn der
 * `mailto:`-Link die Seite verlässt.
 */
export async function relayLeadToHub(
  payload: LeadPayload,
  options: { timeoutMs?: number; fetchImpl?: typeof fetch; endpoint?: string } = {}
): Promise<LeadRelayResult> {
  const fetchImpl = options.fetchImpl ?? (typeof fetch === "function" ? fetch : undefined);
  if (!fetchImpl) return { ok: false, error: "fetch nicht verfügbar" };
  const endpoint = options.endpoint ?? LEAD_ENDPOINT;
  const timeoutMs = options.timeoutMs ?? 8000;
  const controller = typeof AbortController === "function" ? new AbortController() : undefined;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
  try {
    const res = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
      signal: controller?.signal,
    });
    let body: { ok?: boolean; vorgang?: string; fehler?: string } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      /* keine oder ungültige JSON-Antwort, unten als Fehler behandelt */
    }
    if (res.ok && body.ok) return { ok: true, vorgang: body.vorgang };
    return { ok: false, error: body.fehler || `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Netzwerkfehler" };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Öffnet den `mailto:`-Link im Mailprogramm des Besuchers. */
export function openMailto(url: string): void {
  if (typeof window !== "undefined" && typeof window.location !== "undefined") {
    window.location.href = url;
  }
}

export interface StandRequestResult {
  /** Erfolg nur, wenn der Endpunkt die Anfrage angenommen hat */
  ok: boolean;
  relay: LeadRelayResult;
  /** mailto-Link ohne Ausnahme geöffnet */
  mailto: boolean;
}

/**
 * Ablauf hinter handleContactSubmit: Relay und mailto parallel.
 * Der Relay startet zuerst (fetch geht sofort raus, keepalive), dann öffnet sich
 * das Mailprogramm; danach wird auf die Antwort des Endpunkts gewartet. Wirft nie.
 */
export async function submitStandRequest(args: {
  payload: LeadPayload;
  mailtoUrl: string;
  relay?: (payload: LeadPayload) => Promise<LeadRelayResult>;
  open?: (url: string) => void;
}): Promise<StandRequestResult> {
  const relay = args.relay ?? ((p: LeadPayload) => relayLeadToHub(p));
  const open = args.open ?? openMailto;

  const fehler = (e: unknown): LeadRelayResult => ({
    ok: false,
    error: e instanceof Error ? e.message : "unbekannter Fehler",
  });

  let laufend: Promise<LeadRelayResult>;
  try {
    laufend = relay(args.payload).catch(fehler);
  } catch (e) {
    laufend = Promise.resolve(fehler(e));
  }

  let mailto = false;
  try {
    open(args.mailtoUrl);
    mailto = true;
  } catch {
    mailto = false;
  }

  const ergebnis = await laufend;
  // Spieltheoretiker 0130 S2: ein geöffneter mailto-Link ist keine gesendete Mail; Erfolg nur über den Endpunkt.
  return { ok: ergebnis.ok, relay: ergebnis, mailto };
}
