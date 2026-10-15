# Übergabe: Konfigurator-Formular Runde 4 (fern-contabo-ci-s1, 15.10.2026)

Auftrag: AN-contabo-s1-messebau-formular-r4-2026-10-15 (projekte-cc), Zweig `fern/lead-relay-20261015`.

## Stand (20:28, Safari 20:55)

- Patch-Reihe 6c234f1..f22f4db per `git am` eingespielt (14 Commits, Kopf 94e3f2b; neue Hashes, gleicher Inhalt).
- Alle Auflagen gebaut, je ein Commit: S1 65a1ca0, S2 bf46fe2, S3 baee310, S4 9c4f4a5 (nachgemessen f88d9a3), S5 6416194, S6 0d28034, K7 8f02bf7, K8 783b5f8, K9 e9a7181; Funde programmierer 607d29c.
- Rollen vor live (Folgelauf 2): kuenstler „nein“ (alle neun Auflagen erfüllt, Funde bei großer Schrift), behoben in 774e7e6 (Telefonnummer bricht statt abgeschnitten, Adresse wächst mit und bricht nur an @ und vor „.com“, eigener Dank nach Änderung). spieltheoretiker „nein, solange die Kurznummer gezeigt wird“, behoben im Commit nach 774e7e6: `KURZNUMMER_ZEIGEN = false` in SidebarControls.tsx. programmierer: beide Commits frei.
- Tests auf contabo-ci (Node 22.23.3): Typecheck rc 0, Jest 45/46 (rot nur `collision.test.ts`, Vorbestand), Build rc 0, eslint rc 0.
- Browser: Chromium und Firefox 142 alle Zustände bei 320, 390 und 1440 px durchgelaufen (Lauf-Ordner `werk/bilder/firefox-*`, `nachfk2-*`, `nummer-*`).
- Safari-Engine (Folgelauf 3, 20:55): WebKit 26.0 auf contabo-ci ohne root, Stand e8d0d9d frisch gebaut, alle sechs Zustände bei 320, 390 und 1440 px: 18 von 18 durchgelaufen, Titel, Knöpfe und Dank nach Änderung wie in Chromium, Adresse bei Normalschrift in einer Zeile (320 px: 11,2 px, 10 px Reserve), bei großer Schrift Umbruch nur nach @ und vor „.com“, 0 Seitenfehler (`werk/bilder/webkit3tls-*`). Aufbau: `werk/webkit-ohne-root.sh`.

## Offen in Reihenfolge

1. Leadmaschine: die Kurznummer (`kurzeNummer`, FNV-1a über UTF-8, 1000 + h % 9000) in Mail und Register führen; danach `KURZNUMMER_ZEIGEN` in SidebarControls.tsx auf `true` setzen. Bis dahin zeigt das Formular keine Nummer.
2. Bundle prüfen, pushen, PR (alle vier Rollen haben freigegeben: kuenstler und spieltheoretiker nach Behebung, programmierer, wissenschaftler „ja“).
3. Nicht geprüft: echtes iPhone (WebKit unter Linux ist dieselbe Engine, aber nicht Safari mit iOS-Systemschrift); Adresse in Safari mit Ausweichschrift: Ohne Manrope (WebKit ohne TLS, gemessen 20:51) bricht sie bei 320 und 390 px in zwei Zeilen, auf dem iPhone wäre die Ausweichschrift aber SF, nicht DejaVu, darum offen; echter `tel:`-Aufruf, Screenreader, Änderung einer Änderung im Browser. Korrektur: Bei Normalschrift und geladener Manrope bricht die Adresse bei keiner Breite, weil der Kasten innen nie unter 156 px fällt (`styles.css:1647`, clamp(260px, 78vw, 520px) minus 104 px; wissenschaftler). Die Angabe „unter etwa 314 px“ in Commit 774e7e6 ist falsch.
4. Klein, nach live: Eine gescheiterte Änderung heißt weiter „Ihre Anfrage ist vielleicht nicht angekommen.“; bei 429 fehlen „Anrufen“ und „Per E-Mail senden“ als Knöpfe; Nebenknöpfe wachsen nicht mit großer Schrift und sind rund 37 px hoch; kein Jest-Test für SidebarControls. Wissenschaftler: Die Kurznummer ist mit 9000 Werten ab 92 Anfragen im Suchzeitraum zu über 1 % mehrdeutig; vor dem Einschalten besser eine fortlaufende Nummer der Leadmaschine mit Damm-Prüfziffer. Der Änderungsabdruck enthält `location.pathname` und den Preis (ein Pfadwechsel gilt als Änderung). Bei langem Messe-Text verdrängt die Kappung auf 4000 Zeichen die Standzeilen.
5. Vorschläge außerhalb des Auftrags: Der feste Menüknopf (`App.tsx:132`) liegt auf schmalen Telefonen über dem Formularanfang; ohne WebGL (Firefox ohne GPU) wirft die 3D-Szene in fünf Sekunden über 22.000 Seitenfehler („e is not a function“ aus three.js).
6. Abweichung vom Auftrag: Warndreieck auch in den Zuständen mailprogramm und abgelehnt (dasselbe Element).

## Wartet auf Fabrice

- Adresse bei 320 px: heute 11,2 px in einer Zeile (S4 „kein Umbruch nach dem @“); Künstler empfiehlt stattdessen Umbruch nach dem @ bei 14 px. S4 steht im Auftrag, darum unverändert.

## Nicht anfassen

- Adresse, Telefonnummer, Datenschutz-Link, Server-Verhalten (leadmaschine), `.github/`.
