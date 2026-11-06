# Programmierer 1900: Lead-Relay 3D-Standkonfigurator, zweite und letzte Runde

Prüfabdruck: betrieb/eingefroren-1900/diff.patch md5 9d2c6a5848972c431f862b3ca265e554 (nachgemessen gegen git diff 6c234f1, gleich), herkunft-freigeben.py md5 09fc755fb9bbe69392dfc08c997419e8 (Worktree, sunds-hub /opt/messebau-konfigurator und /tmp gleich, gemessen 11.10.2026 gegen 20:10).

Commit: ja

Die Änderung ist fertig für den Commit. Beim Nutzer kommt der Relay erst an, wenn die Herkunft freigegeben ist (Punkt 2).

## Erledigt aus Runde 0300

| Punkt | Beleg |
|---|---|
| MUSS 1 | __tests__/standAnfrage.test.tsx, 6 Fälle; contabo-ci gruen-0300.log 48 von 49 grün (rot nur collision, auch in basis.log); rot-0300.log 6 von 6 rot mit "Received number of calls: 0", also echte Mutation, kein Kompilierfehler; Baum auf contabo-ci md5-gleich mit Worktree (5 Dateien) |
| SOLLTE 2 | herkunft-freigeben.py:98 bis :103, :144 bis :148 |
| SOLLTE 3 | :87 bis :91 vergleicht NRestarts |
| SOLLTE 4 | :152 bis :153 |
| SOLLTE 5 | SidebarControls.tsx:801, alter Satz weg (grep leer) |
| SOLLTE 6 | :784 bis :799, Knopftext; zwei Tests |
| KANN 7 | leadRelay.ts:84 direkt über buildLeadPayload |
| KANN 9 | /opt/messebau-konfigurator, 0750 root |

## Offen

1. KANN 8 nicht erledigt: styles.css:310 (0,3,0) gibt dem gesperrten Knopf im Hochkontrast weiter einen Schatten gegen styles.css:1121 (0,2,0). Kleinigkeit.
2. M1 offen: connect/leadmaschine/zentrale/lead-endpunkt/kunden.json, Block messebau (Zeilen 20 bis 38) ohne github.io; sunds-hub frei = False. Bis dahin endet jede Anfrage im Zustand mailto (403). Tragbar für den Commit, muss vor --setzen.
3. Zustände sending (Sperre während des Laufs, SidebarControls.tsx:858 und :2351) und fehler (:2379) hat kein Test gesehen. Tragbar, benennen.
4. herkunft-freigeben.py:74 bis :76: scheitert systemctl show, ist "" gleich "", der Vergleich wird wahr. is-active und /gesund fangen das meist. Kleinigkeit.
5. Rotprobe 0300 liegt nicht als Skript vor (rotprobe.sh ist von 01:14, nur leadRelay.ts). Kleinigkeit.

## Neu gemessen

ESLint auf den 4 geänderten Dateien auf contabo-ci: Exit 0 (lint-programmierer-1900.log).

## Eigener Fehler

Ich habe im Worktree versehentlich git add -N . ausgeführt und mit git rm --cached auf die neu eingetragenen Pfade zurückgenommen; git status ist danach zeichengleich wie vorher (3 A, 2 M, Rest ungetrackt).

## Nicht geprüft (gehört in den PR unter Offen)

- Notebook-First, kein Beleg gesehen.
- Playwright-E2E, echter Browser, keepalive bei mailto in Firefox und Safari.
- Bilder des Stands 1900 (Künstler).
- herkunft-freigeben.py --setzen und --rueckweg am echten Dienst; nur Code gelesen.
- Ob die Berichte von Spieltheoretiker und Künstler den Stand 1900 decken.
