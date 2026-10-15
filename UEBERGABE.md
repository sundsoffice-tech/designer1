# Übergabe: Konfigurator-Formular Runde 4 (fern-contabo-ci-s1, 15.10.2026)

Auftrag: AN-contabo-s1-messebau-formular-r4-2026-10-15 (projekte-cc), Zweig `fern/lead-relay-20261015`.

## Stand (19:31)

- Patch-Reihe 6c234f1..f22f4db per `git am` eingespielt (14 Commits, Kopf 94e3f2b; neue Hashes, gleicher Inhalt).
- Alle Auflagen gebaut, je ein Commit: S1 65a1ca0, S2 bf46fe2, S3 baee310, S4 9c4f4a5 (nachgemessen f88d9a3), S5 6416194, S6 0d28034, K7 8f02bf7, K8 783b5f8, K9 e9a7181; Funde programmierer 607d29c.
- Tests auf contabo-ci (Node 22.23.3): Typecheck rc 0, Jest 45/46 (vorher 42/43; rot nur `collision.test.ts`, Vorbestand), Build rc 0, eslint auf den geänderten Dateien rc 0.
- Bilder und Messungen im Lauf-Ordner `werk/bilder/`: vorher-*, nachher-* (unklar, angekommen, geändert in 390 und 1440 px), nachher2-* (dazu mailprogramm, abgelehnt 429, große Schrift), schmal-* (320, 360, 390, 1440 px).
- programmierer: Runde 1 „Ja mit Auflagen“ (Funde eingearbeitet), Runde 2 „Ja“, Kurzprüfung des CSS-Eingriffs „Ja mit Auflagen“ (Stilfrage unten).
- Rotproben: Fund 2 (alter Stand zeigt nach Änderung 8251, neuer 7471); Überlauf-Zeuge (nowrap: 31 px Überlauf bei 320 px).

## Offen in Reihenfolge

1. Leadmaschine: die Kurznummer (`kurzeNummer`, FNV-1a über UTF-8, 1000 + h % 9000) in Mail und Register führen; bis dahin findet das Haus einen Anruf mit „Ihre Nummer: 7471“ nur über Name oder E-Mail (Server-Teil laut Auftrag hier unverändert).
2. Künstler: Bei 320 px ist die Adresse rund 11 px groß, kleiner als die Nummer darunter (Bild `schmal-abgelehnt-320.png`); Alternative wäre ein Umbruch nach dem @ nur auf schmalen Telefonen.
3. Rollen kuenstler (Abnahme am Bild), spieltheoretiker und wissenschaftler vor live; Bundle prüfen, pushen, PR.
4. Nicht geprüft: Safari/iOS und Firefox (container-Einheiten ab Safari 16), echter `tel:`-Aufruf, Screenreader, Änderung einer Änderung im Browser.
5. Abweichung vom Auftrag: Warndreieck auch in den Zuständen mailprogramm und abgelehnt (dasselbe Element).

## Wartet auf Fabrice

- nichts

## Nicht anfassen

- Adresse, Telefonnummer, Datenschutz-Link, Server-Verhalten (leadmaschine), `.github/`.
