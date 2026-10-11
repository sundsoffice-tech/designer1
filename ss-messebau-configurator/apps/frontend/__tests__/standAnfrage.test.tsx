/**
 * Komponententest des Anfrageformulars in SidebarControls (Programmierer 0300 MUSS 1, SOLLTE 6).
 *
 * Prüft die Verdrahtung Formular -> Lead-Relay: fetch an den Lead-Endpunkt, Anzeigen bei Erfolg und
 * Fehler, Sperre gegen Doppelsendung und die Rückmeldung von „Anfrage kopieren“.
 * Module mit import.meta (configStore, config/ai, lib/apiBase) laden unter ts-jest/CommonJS nicht und
 * werden deshalb hier gemockt; schwere Kinder (Sitzplätze, Kamera) ebenso.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import SidebarControls from "../src/components/SidebarControls";
import { ERFOLG_SATZ, LEAD_ENDPOINT } from "../src/lib/leadRelay";

const mockOpen = jest.fn();

jest.mock("../src/store/configStore", () => {
  const { collisionPlayground } = jest.requireActual("../src/lib/playgrounds");
  const state = {
    config: collisionPlayground,
    price: 12345,
    setConfig: jest.fn(),
    applyPreset: jest.fn(),
    replaceConfig: jest.fn(),
    undo: jest.fn(),
    redo: jest.fn(),
    history: [],
    future: [],
  };
  return {
    DEFAULT_LIGHTING: {
      ambientColor: "#ffffff",
      ambientIntensity: 0.35,
      environmentIntensity: 1.2,
      emissiveIntensity: 1,
      materialRoughness: 1,
      materialMetalness: 1,
      hdri: "hall",
      background: false,
      exposure: 1,
      toneMapping: "agx",
      bloom: true,
      bloomIntensity: 0.35,
      dof: false,
      dofFocus: 0.02,
      dofBokehScale: 3,
      envMapIntensity: 1.2,
    },
    useConfigStore: (sel?: (s: typeof state) => unknown) => (sel ? sel(state) : state),
  };
});
jest.mock("../src/config/ai", () => ({ aiAssistantEnabled: false, voiceAssistantEnabled: false }));
jest.mock("../src/lib/apiBase", () => ({
  apiBaseUrl: "",
  buildApiUrl: (p: string) => p,
  runtimeApiDisabled: true,
  runtimeApiEnabled: false,
}));
jest.mock("../src/components/SeatingControls", () => ({ __esModule: true, default: () => null }));
jest.mock("../src/components/sidebar/CameraPanel", () => ({ CameraPanel: () => null }));
// mailto-Öffnen stubben: der echte Ablauf bleibt, nur das Mailprogramm wird nicht geöffnet
jest.mock("../src/lib/leadRelay", () => {
  const actual = jest.requireActual("../src/lib/leadRelay");
  return {
    ...actual,
    openMailto: (url: string) => mockOpen(url),
    submitStandRequest: (args: Parameters<typeof actual.submitStandRequest>[0]) =>
      actual.submitStandRequest({ ...args, open: (url: string) => mockOpen(url) }),
  };
});

type FetchStub = jest.Mock<Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>, [string, RequestInit]>;

const antwort = (status: number, body: unknown) =>
  Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });

let fetchStub: FetchStub;
const originalFetch = globalThis.fetch;
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");

const setClipboard = (value: unknown) =>
  Object.defineProperty(navigator, "clipboard", { value, configurable: true, writable: true });

const ausfuellenUndSenden = () => {
  render(<SidebarControls drawerOpen onClose={() => undefined} />);
  fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Erika Muster" } });
  fireEvent.change(screen.getByLabelText(/^E-Mail/), { target: { value: "erika@example.de" } });
  fireEvent.change(screen.getByLabelText(/^Messe/), { target: { value: "boot Düsseldorf" } });
  const knopf = screen.getByRole("button", { name: /Anfrage per E-Mail erstellen/ });
  fireEvent.click(knopf);
  return knopf;
};

beforeEach(() => {
  mockOpen.mockReset();
  fetchStub = jest.fn() as FetchStub;
  (globalThis as { fetch: unknown }).fetch = fetchStub;
});

afterEach(() => {
  (globalThis as { fetch: unknown }).fetch = originalFetch;
  if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
  else setClipboard(undefined);
});

describe("Anfrageformular -> Lead-Relay", () => {
  it("sendet an den Lead-Endpunkt mit kunde messebau und öffnet die Mail", async () => {
    fetchStub.mockImplementation(() => antwort(200, { ok: true, vorgang: "V-1" }));
    ausfuellenUndSenden();

    await waitFor(() => expect(fetchStub).toHaveBeenCalledTimes(1));
    const [url, init] = fetchStub.mock.calls[0];
    expect(url).toBe(LEAD_ENDPOINT);
    expect(url).toBe("https://leads.sundsconnect.de/lead");
    expect(init.method).toBe("POST");
    const body = JSON.parse(String(init.body));
    expect(body.kunde).toBe("messebau");
    expect(body.name).toBe("Erika Muster");
    expect(body.email).toBe("erika@example.de");
    expect(body.nachricht).toContain("Messe/Event: boot Düsseldorf");
    expect(mockOpen).toHaveBeenCalledTimes(1);
    expect(String(mockOpen.mock.calls[0][0])).toMatch(/^mailto:/);
  });

  it("zeigt bei ok den Erfolgskasten, sperrt den Knopf und sendet kein zweites Mal", async () => {
    fetchStub.mockImplementation(() => antwort(200, { ok: true, vorgang: "V-2" }));
    ausfuellenUndSenden();

    const erfolg = await screen.findByText((_, el) => el?.classList.contains("form-success") ?? false);
    expect(erfolg).toHaveTextContent(ERFOLG_SATZ);
    const knopf = screen.getByRole("button", { name: /Anfrage gesendet/ });
    expect(knopf).toBeDisabled();

    fireEvent.click(knopf);
    // auch ein direktes Absenden des Formulars (Enter-Taste) darf keinen zweiten Lead erzeugen
    fireEvent.submit(knopf.closest("form") as HTMLFormElement);
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchStub).toHaveBeenCalledTimes(1);
    expect(mockOpen).toHaveBeenCalledTimes(1);
  });

  it("zeigt bei HTTP 500 den Mail-Hinweis und den Knopf Anfrage kopieren", async () => {
    fetchStub.mockImplementation(() => antwort(500, {}));
    ausfuellenUndSenden();

    expect(await screen.findByText(/Bitte senden Sie die vorbereitete E-Mail/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Anfrage kopieren" })).toBeInTheDocument();
    expect(screen.queryByText(ERFOLG_SATZ, { exact: false })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Anfrage per E-Mail erstellen/ })).toBeEnabled();
  });
});

describe("Anfrage kopieren", () => {
  const bisKopierKnopf = async () => {
    fetchStub.mockImplementation(() => antwort(500, {}));
    ausfuellenUndSenden();
    return screen.findByRole("button", { name: "Anfrage kopieren" });
  };

  it("meldet Kopiert, wenn die Zwischenablage annimmt", async () => {
    const writeText = jest.fn(() => Promise.resolve());
    setClipboard({ writeText });
    fireEvent.click(await bisKopierKnopf());
    expect(await screen.findByRole("button", { name: "Kopiert" })).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("Neue Standanfrage"));
  });

  it("meldet Kopieren nicht möglich, wenn die Zwischenablage ablehnt", async () => {
    setClipboard({ writeText: jest.fn(() => Promise.reject(new Error("verweigert"))) });
    fireEvent.click(await bisKopierKnopf());
    expect(await screen.findByRole("button", { name: "Kopieren nicht möglich" })).toBeInTheDocument();
  });

  it("meldet Kopieren nicht möglich, wenn es keine Zwischenablage gibt", async () => {
    setClipboard(undefined);
    fireEvent.click(await bisKopierKnopf());
    expect(await screen.findByRole("button", { name: "Kopieren nicht möglich" })).toBeInTheDocument();
  });
});
