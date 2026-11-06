# Programmierer 0300: Lead-Relay 3D-Standkonfigurator, letzte Instanz vor dem Commit

Prüfabdruck: betrieb/eingefroren-0300/diff.patch md5 58e57307ff59e6f86dcc522739ee64bf gegen 6c234f1 (nachgemessen: git diff 6c234f1 | md5sum gleich), herkunft-freigeben.py md5 42129fc393a4f98b8c1feb1d743c5a26 (Worktree gleich, sunds-hub /tmp/herkunft-freigeben.py gleich, gemessen 11.10.2026).

Commit: nein

Grund: Kein Zeuge berührt die Verdrahtung im Formular. Der Auftrag (AN-messebau-konfigurator-lead-relay-2026-10-09.md, Bau 4) verlangt E2E mit gestubbtem fetch; es gibt keinen. Alles andere ist tragbar.

## MUSS (vor dem Commit)

1. Verdrahtung ungetestet. SidebarControls.tsx:847 (`void sendStandRequest(contact)`), :800 (Zustandswahl), :846 und :2339 (Sperre K3) und die Anzeigen :2348 bis :2368 hat kein Test gesehen. tests/e2e/configurator.spec.ts erwähnt das Formular nicht; __tests__/leadRelay.test.ts prüft nur das Modul. Streicht man Zeile 847, bleiben alle 23 Tests grün. Folge: ein Rückfall auf null Leads fiele niemandem auf. Zeuge: RTL-Test wie __tests__/languageSwitcher.test.tsx oder Playwright mit gestubbtem fetch und window.location; Zustände relay, mailto, sending, Doppelklick. Rotprobe: Zeile 847 auskommentiert ergibt rot. Tests auf contabo-ci (lauf.sh).

## SOLLTE

2. herkunft-freigeben.py:130 `systemctl restart` mit check=True: Schlägt der Neustart mit Exit ungleich 0 fehl (start-limit-hit, maskiert), endet das Skript mit Traceback, die neue kunden.json bleibt, kein Rückweg. Der Docstring (Zeile 5) verspricht "bei Fehler zurück". Vor `--setzen` beheben: check=False und Exit-Code in die Gesundheitsentscheidung.
3. herkunft-freigeben.py:75 verspricht "nicht neu gestartet seit der Prüfung", :82 bis :86 liest NRestarts nur und gibt es aus, vergleicht nicht. Kommentar und Code widersprechen sich (Restart=always, Type=simple, gemessen).
4. herkunft-freigeben.py:137 mit :52: Ein erfolgreicher `--rueckweg` endet mit Exit 2, weil stand() "nicht frei" meldet. Ein Aufrufer liest das als Fehler.
5. SidebarControls.tsx:782 Kommentar "Erfolg, wenn einer der beiden Wege klappt" widerspricht dem Code nach S2 (leadRelay.ts:212, SidebarControls.tsx:800) und steht über copyRequest statt über sendStandRequest.
6. SidebarControls.tsx:784 bis :788: Ohne navigator.clipboard oder bei abgelehntem writeText passiert beim Klick auf "Anfrage kopieren" nichts, ohne Meldung. Der Weg aus Künstler SOLLTE 5 endet für diesen Fall stumm. Vorschlag: Text sichtbar und markierbar zeigen oder Meldung "Kopieren nicht möglich".

## KANN

7. leadRelay.ts:73 JSDoc von buildLeadPayload steht verwaist über ERFOLG_SATZ.
8. styles.css:310 (Hochkontrast, Spezifität 0,3,0) gibt dem gesperrten Knopf wieder einen Schatten (styles.css:1121, 0,2,0).
9. Skript liegt auf sunds-hub in /tmp und läuft als root; nach Neustart weg. Für die Ausführung egal, für Rückweg später nicht.

## HÄLT

- mailto öffnet synchron vor dem ersten await (SidebarControls.tsx:794 bis :799, leadRelay.ts:196 bis :208), auch im Ausnahmepfad (:802 bis :805). Die Klick-Geste bleibt erhalten.
- setState in buildMailtoUrl (:775) läuft nicht im Render: einzige Aufrufer :799 und :804 im Ereignispfad.
- Keine Reste: sendEmailRequest hat keinen Aufrufer mehr (grep).
- --success existiert (styles.css:54, :78, :102).
- packages/shared: LeadPayload ist nur Frontend (leadRelay.ts:20 begründet), ContactRequest kommt aus @ss/shared.
- kunden.json auf sunds-hub 644 root:root, keine Rechteverschärfung durch .neu; schreiben() übernimmt Modus und Eigentümer.
- Eingearbeitet: Spieltheoretiker M2 (gesund, Rückweg, --probe), S1 (leadRelay.ts:96 bis :98, Test Zeile 114), S2 (:212, :800), S3 (MAIL_HINWEIS :78), S4 (MODI, Exit 64), K3 (:846, :2339). M1 als Antrag sitzungen/AN-connect-leadmaschine-herkunft-konfigurator-2026-10-11.md, Status zugestellt, nicht erledigt. Künstler MUSS 1 (:2338 bis :2346, styles.css:1121), MUSS 2 (.form-success, Text wörtlich), MUSS 3 (MAIL_HINWEIS zitiert ERFOLG_SATZ), SOLLTE 5 (Knopf kopieren), SOLLTE 7 (Fehlertext, Knopfname offen wegen SOLLTE 4).

## Nicht geprüft (gehört in den PR unter "Offen")

- Tests, typecheck und Build nicht selbst gefahren; Angaben des Auftrags übernommen.
- ESLint (`pnpm --filter @ss/frontend lint`) ist im Auftrag nicht als gelaufen genannt.
- Notebook-First (CLAUDE.md des Repos): nicht prüfbar, kein Beleg gesehen.
- keepalive-fetch beim Setzen von location.href auf mailto in Firefox und Safari.
- Bilder des eingefrorenen Stands nicht angesehen; Zustände sending und fehler hat laut Künstler niemand gesehen.
- Ob collision.test.ts auf 6c234f1 schon rot war.
