# Spieltheoretiker: Lead-Relay 3D-Standkonfigurator, Prüfung vor live

Stand 11.10.2026 01:2x bis 01:4x. Prüfziel eingefroren und nachgemessen: `betrieb/eingefroren-0130/diff.patch` md5 b774a5c0441c162678a359aa1d43eb4f, `herkunft-freigeben.py` md5 983be331fd826effbfb9b10879d9c85a. `git diff HEAD` im Worktree hat dieselbe md5 wie diff.patch, Zeilennummern unten beziehen sich deshalb auf die Dateien im Worktree. Kein Request an den Endpunkt; gelesen wurden dienst.py, kunden.json und die Unit auf sunds-hub per sudo.

live: nein

Am Client-Code selbst liegt kein MUSS. Die zwei MUSS betreffen die Freigabe der Herkunft; beide kosten zusammen unter einer Stunde. Danach live: ja.

## MUSS

| Nr | Fund | Datei:Zeile | Was zu tun ist |
|---|---|---|---|
| M1 | Die Freigabe schreibt nur die Server-Datei. Quelle der Server-Datei ist `leadmaschine/zentrale/lead-endpunkt/kunden.json` (Ablauf „eintragen und auf sunds-hub ausrollen“, neukunde.py:548; das Website-Deploy überschreibt kunden.json ebenfalls, deploy-sunds-hub.sh:26 und 38 bis 44). Heute sind die Herkunftslisten in Quelle und Server gleich (gemessen). Der nächste Rollout nimmt die Freigabe also still wieder heraus; der Relay bekommt dann 403 und fällt auf mailto zurück, ohne dass jemand es merkt. | herkunft-freigeben.py:16 bis 18 und 57 bis 67; _HUB/connect/leadmaschine/zentrale/lead-endpunkt/kunden.json | Herkunft zuerst in der Quelle eintragen (Commit im leadmaschine-Repo, Baustelle mit connect abstimmen), dann auf dem Server. |
| M2 | Die Freigabe hat keine Gegenprobe, die ihren Fall zeigen kann. Die CORS-Vorabfrage antwortet schon heute 204 für sundsoffice-tech.github.io, weil OPTIONS gegen die Vereinigung aller Kunden prüft (dienst.py:630 bis 641 und 721 bis 725; die Herkunft steht bei connect und kge). `--stand` liest nur die Datei, nicht den geladenen Dienst. Dazu startet das Skript einen Dienst neu, an dem vier Kunden hängen, und prüft nur den Exit-Code von `systemctl restart`; bei Type=simple und Restart=always (gemessen) ist der auch bei einer Absturzschleife 0. | herkunft-freigeben.py:67 bis 69 | Nach dem Neustart `systemctl is-active` und GET 127.0.0.1/gesund; scheitert das, Sicherung zurück und erneut starten. Als trennende Probe ein POST mit Origin https://sundsoffice-tech.github.io, kunde messebau, gefülltem `botcheck`: vorher 403 (dienst.py:844 bis 847), nachher 200 ohne Ablage und ohne Mail (dienst.py:593 und 859 bis 862). Die Probe ist kein Test-Lead, verbraucht aber einen der 5 Plätze je IP und Stunde; ob sie läuft, entscheidet das Fenster. |

## SOLLTE

| Nr | Fund | Datei:Zeile | Was zu tun ist |
|---|---|---|---|
| S1 | Telefon wird im Konfigurator nicht geprüft, der Endpunkt prüft es, sobald es gefüllt ist (`[0-9+()/\s.-]{6,}`). Eine Eingabe wie „0172 1234567 mobil“ führt zu 400; der Relay scheitert still, der Besucher landet im alten mailto-Weg. | dienst.py:584 und 603 bis 606; leadRelay.ts:97 (`telefon` ungeprüft) | In buildLeadPayload: passt die Nummer nicht, `telefon` leer lassen und die Rohangabe als Zeile in die Nachricht schreiben (E-Mail ist Pflicht und gültig, telefon_pflicht ist bei messebau false). Test dazu. |
| S2 | „Erfolg, wenn einer klappt“ mischt ein prüfbares und ein unprüfbares Signal. `mailto = true` heißt nur „keine Ausnahme“, nicht „Mail gesendet“; damit ist `ok` praktisch immer wahr und der Zustand „fehler“ kaum erreichbar. Wer kein Mailprogramm hat und dessen Relay scheitert, liest „Ihr E-Mail-Programm wurde geöffnet“, was nicht stimmt. | leadRelay.ts:188, 189 und 195; SidebarControls.tsx:777 und 2328 | Erfolg nur bei `relay.ok` (Vorgangsnummer vom Server). Im mailto-Zustand die Adresse dazuschreiben („Falls sich kein E-Mail-Programm geöffnet hat: …“). `ok` umbenennen oder streichen, damit keine spätere Kennzahl darauf zählt. |
| S3 | Doppelanfragen: Das Mailprogramm öffnet sich vor der Antwort des Endpunkts und liegt im Vordergrund; die Entwarnung steht dahinter im Browser. Der Knopf heißt weiter „Anfrage per E-Mail erstellen“. Ein Besucher, der eine Stufe denkt, sendet, was vor ihm liegt. Die zwei Kopien landen in verschiedenen Postfächern (Relay an Info@sundsmessebau.com, mailto an sunds-messebau@gmx.de). | SidebarControls.tsx:764, 2318 und 2322 | Erste Zeile im mailto-Text: „Steht auf der Seite ‚Ihre Anfrage ist bei uns eingegangen‘, müssen Sie diese E-Mail nicht senden.“ Damit steht der Hinweis dort, wo der Besucher hinsieht. Knopftext entscheidet der Künstler. |
| S4 | Jedes unbekannte Argument ändert live: ein Tippfehler wie `--trockn` setzt die Herkunft und startet den Dienst neu. | herkunft-freigeben.py:39 bis 53 | Erlaubte Modi fest aufzählen (leer, --trocken, --rueckweg, --stand), sonst Exit 2. |

## KANN

| Nr | Fund | Datei:Zeile | Was zu tun ist |
|---|---|---|---|
| K1 | Der Honigtopf schützt bei JS-Absendern null: `botcheck` ist fest leer und kommt aus keinem DOM-Feld. Das gilt genauso für die Website. | leadRelay.ts:103 | Verstecktes Eingabefeld (tabindex -1, autocomplete off), dessen Wert in `botcheck` geht. Fängt nur Formular-Bots, die ein WebGL-SPA ausführen; Nutzen klein. |
| K2 | `--stand` zählt Konfigurator-Leads am Text „Formular: konfigurator“; den kann jeder setzen. | herkunft-freigeben.py:29 | Zusätzlich das gespeicherte Feld `herkunft` (dienst.py:868) auf https://sundsoffice-tech.github.io prüfen. Fälschbar bleibt es, aber nur mit Absicht. |
| K3 | Nach „eingegangen“ ist der Knopf wieder frei; jedes erneute Absenden ist ein weiterer Lead und eine weitere Mail. | SidebarControls.tsx:777 und 822 | Nach Erfolg Knopftext „Weitere Anfrage senden“ oder kurze Sperre. |
| K4 | Realoption: Nach 6 bis 8 Wochen mit gemessener Relay-Quote über 95 Prozent auf „Relay zuerst, mailto nur als Knopf bei Fehler“ umstellen. Erst dann sind Doppelanfragen und das Mailprogramm-Fenster für Webmail-Nutzer weg. | leadRelay.ts:165 bis 195 | Jetzt nicht bauen; Messung abwarten. |

## Die vier Fragen

Spam und Missbrauch: Die Freigabe ändert die Angriffsfläche praktisch nicht. dienst.py:844 lehnt nur ab, wenn ein fremder Origin-Kopf mitkommt; ohne Origin-Kopf geht ein POST mit kunde messebau schon heute durch. Die Herkunftsliste ist ein Schutz gegen fremde Webseiten im Browser des Besuchers, kein Spamschutz. sundsoffice-tech ist ein Benutzerkonto (gemessen: Type User) mit 11 Repos mit Pages; posten kann darüber nur, wer dort veröffentlichen darf, und der könnte ebenso gut curl nehmen. Was Spam tatsächlich bremst: 5 Anfragen je IP und Stunde mit nicht fälschbarer IP aus dem rechten X-Forwarded-For-Eintrag (dienst.py:51, 569 bis 580, 704 bis 717), 16 KB Grenze, und der geringe Ertrag: die Mail geht nur an Info@, `kopie` ist bei messebau leer, an den Besucher geht keine Mail (verschicke, dienst.py:407 bis 423). Der Endpunkt taugt also nicht als Mailbombe gegen Dritte. Die Annahme im Auftrag (Zeile 69, „Bestätigungsmail an die angegebene Adresse“) ist überholt.

Anreize der Besucher: siehe S3. Heute zahlt der Besucher die Kosten des Absendens selbst; durch kommt nur, wer ein eingerichtetes Mailprogramm hat und dranbleibt (4 Mails, letzte 27.11.2025). Das ist Auslese nach Mailprogramm, nicht nach Kaufabsicht. Der Relay senkt die Kosten auf null und macht den Trichter erstmals messbar; das ist der eigentliche Gewinn. Doppelanfragen sind der Preis der Redundanz, bei unter einer Anfrage je Monat ein paar Minuten.

Erfolg, wenn einer klappt: Für die Ausfallsicherheit richtig, denn mailto öffnet sich synchron in der Klick-Geste (leadRelay.ts:179 bis 191, vor dem ersten await in Zeile 194), der schlechteste Fall ist der heutige Stand. Als Erfolgsmeldung falsch, siehe S2.

Freigabe vor oder nach Merge: vor dem Merge, und zwar in der Reihenfolge Quelle, Server mit Gegenprobe (M2), dann Merge. Beide Reihenfolgen verlieren gegenüber heute keinen Lead. Freigabe zuerst schließt aber den Zustand „Konfigurator live, Freigabe vergessen“ aus und macht den Merge von einer gemessenen Bedingung abhängig (Commitment, Schelling 1960). Merge zuerst brächte nur 403-Warnungen im Journal, die niemand liest.

## Spiel und Gleichgewicht

Spieler: Besucher (will ein Angebot mit wenig Aufwand, denkt null bis eine Stufe, liest Knopftext statt Statuszeile), Bearbeiter bei Info@ und am GMX-Postfach (wollen jede Anfrage einmal beantworten), Spam-Absender (will Text vor Menschen bringen, nimmt curl, nicht den Browser), spätere Sitzungen, die kunden.json aus der Quelle ausrollen (wissen von der Server-Änderung nichts; der wahrscheinlichste Gegenspieler dieses Zugs), Browser und Werbeblocker (entscheiden über keepalive und Blockade), der gemeinsame Dienst für vier Kunden.

Gleichgewicht heute: ein Pooling-Gleichgewicht, in dem das Haus nur sieht, wer selbst absendet; die anderen verschwinden ohne Spur. Tragende Annahme ist, dass Absenden den Besucher etwas kostet. Der Relay nimmt diese Annahme weg. Am Spamgleichgewicht ändert die Freigabe nichts, weil die Kosten des Angreifers (curl ohne Origin) gleich bleiben.

Information: Prüfbar sind `relay.ok` mit Vorgangsnummer und Datei auf der Platte sowie die IP am Endpunkt. Unprüfbar und damit Cheap Talk (Crawford/Sobel 1982) sind `mailto = true`, der Origin-Kopf außerhalb des Browsers, `botcheck` und die Zeile „Formular: konfigurator“.

## Züge

| Zug | Konzept (Autor, Jahr) | p(Erfolg) | Nutzen je Aufwand | schlechtester Fall | Glaubwürdigkeit | Gegenzug | ohne den Zug |
|---|---|---|---|---|---|---|---|
| M1 Quelle zuerst | Pfadabhängigkeit, Premortem (Klein 2007) | 0,95 bis 0,99 | hoch, 15 min | Konflikt mit offener connect-Baustelle | besteht, Datei im Repo prüfbar | Rollout aus altem Zweig | Freigabe verschwindet beim nächsten Rollout, 20 bis 50 Prozent in drei Monaten (Schätzung) |
| M2 Gegenprobe und Gesundheit | Wert der Information (Howard 1966), Maximin (Wald 1945) | 0,9 bis 0,98 | hoch, 30 min | Probe verbraucht einen Ratenplatz | besteht, 403 gegen 200 trennt | keiner | „frei: ja“ in der Datei, Dienst ungeprüft, vier Kunden ohne Wächter beim Neustart |
| S1 Telefon abgleichen | Mechanismusdesign (Hurwicz 1972) | 0,9 | mittel, 30 min | keiner | besteht, Test | keiner | ein Teil der Relays scheitert still |
| S2 Erfolg = relay.ok | Signaling (Spence 1973) | 0,9 | mittel, 20 min | keiner | besteht, Vorgangsnummer vom Server | keiner | falsche Meldung für Besucher ohne Mailprogramm |
| S3 Hinweis im mailto-Text | begrenzte Rationalität (Simon 1955) | 0,5 bis 0,8 weniger Doppel | mittel, 10 min | Besucher liest ihn nicht | besteht, kostet nichts | keiner | 30 bis 70 Prozent Doppelanfragen (Hypothese) |
| K4 später Relay zuerst | Realoption (Dixit/Pindyck 1994) | offen | hoch nach Messung | mailto nach await blockiert, deshalb nur als Knopf | besteht nach Messung | Werbeblocker sperrt leads.* | Doppel und Mailprogramm-Fenster bleiben |

Dynamik: Nach live liefert der Relay die erste echte Zahl zu Absendungen je Monat. Ein Wächter auf „Herkunft frei“ und Monatszählung stabilisiert den Zustand; ohne ihn erodiert er beim nächsten Rollout leise. Kommt Spam, wäre die Gegenreaktion ein Captcha, das echte Besucher mehr kostet als Bots; vorher Rate und K1.

## Meine Meinung

Meine Meinung: Der Parallelbetrieb ist für jetzt richtig, weil sein schlechtester Fall der heutige Stand ist und er den Trichter erstmals messbar macht. Die echten Risiken sind betrieblich (Freigabe nur auf dem Server, Neustart ohne Prüfung), nicht Spam. Ich würde nach M1 und M2 freigeben, S1 bis S3 vor dem Merge mitnehmen und nach acht Wochen anhand der Relay-Quote über K4 entscheiden. Das hängt an der Annahme, dass die Konfigurator-Seite für generische Formular-Bots unattraktiv bleibt.

## Modellkritik

Was fehlt: wie viele Besucher das Formular öffnen (heute nicht messbar), ob kunden.anfrage GMX-Mail und Endpunkt-Lead zusammenführt, wie Werbeblocker auf leads.sundsconnect.de reagieren. Kippt die Rangliste, wenn die Freigabe nie aus der Quelle ausgerollt wird: dann ist M1 Vorsorge ohne Ertrag, aber billig. Umstimmen würde mich eine Messung, dass ein Browser mit großem Anteil den keepalive-Request beim Setzen von location.href auf mailto abbricht; dann wäre Relay zuerst sofort besser. Ein Prüfer würde in einem Jahr sagen: vorhersehbar, dass ein Rollout die Server-Änderung überschreibt (M1).

## Nicht geprüft

| Was | Wie messen | Kosten |
|---|---|---|
| Ob ein Rollout-Weg kunden.json heute automatisch einspielt (deploy-sunds-hub.sh bricht ab, weil lead_endpunkt.py in der Quelle fehlt; der Weg vom 25.08. wurde nicht gefunden; md5 von Quelle und Server unterscheiden sich, die Herkunftslisten nicht) | Rollout-Skripte im leadmaschine-Repo suchen; `diff` Quelle gegen Server | 10 min |
| keepalive-Fetch bei location.href auf mailto in Firefox und Safari | Browsertest mit gestubbtem Endpunkt | 20 min |
| Doppelzusammenführung in kunden.anfrage und lead_eingang.py (liegt nur auf thinkpad) | Code auf thinkpad lesen | 15 min |
| Werbeblocker gegen leads.sundsconnect.de/lead | uBlock-Origin-Listen prüfen | 10 min |
| Datenschutzhinweis des Konfigurators zur neuen Übermittlung an sunds-hub | Seite lesen; Fachanwalt | Rolle |
| Ob ein Wächter /gesund von sunds-leads überwacht | sunds_waechter.py lesen | 10 min |
| Typecheck, Tests, Build des Patches | Programmierer-Rolle | Rolle |

## Nachtrag 01:5x (nach der Abgabe, Hintergrundsuche fertig)

Zu M1: `lead-endpunkt/kunden.json` liegt nicht nur in `_HUB/connect/leadmaschine/zentrale/`, sondern auch in `_HUB/connect/leadmaschine-wt-cockpit-live/zentrale/lead-endpunkt/` (Worktree) und in `_HUB/_handy-straenge/anfragen-sammler/leadmaschine/zentrale/lead-endpunkt/`. Jede dieser Kopien kann beim Ausrollen die Server-Datei ohne die neue Herkunft überschreiben; M1 gilt deshalb für jede Kopie, aus der noch ausgerollt wird (welche das sind, nicht geprüft). Die 11 Pages-Repos unter sundsoffice-tech sind alle öffentlich, darunter designer1, connect, kge-landingpage und kge-portal. An der Bewertung „Spam: Freigabe ändert die Angriffsfläche praktisch nicht“ ändert das nichts. Die md5 in der Abgabe (090073a1…) gilt für den Stand vor diesem Nachtrag.
