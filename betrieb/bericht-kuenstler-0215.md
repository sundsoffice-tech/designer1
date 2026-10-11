# Künstler 0215: Standanfrage im 3D-Konfigurator

Prüfziel: betrieb/eingefroren-0215/diff.patch, md5 c7abad840f90f8374e5368517d31c3ae (gemessen, stimmt). Bilder: scratchpad/hinsehen/bilder (vor den letzten Textänderungen), 390 und 1280, hell und dunkel.

Freigabe: nein (drei MUSS-Punkte, alle nur Text und Stil)

Erster Eindruck aus den Bildern: Nach dem Klick ändert sich nur eine kleine graue Zeile unter dem Knopf. Sie sieht genauso aus wie der Datenschutzsatz darunter. Ob die Anfrage angekommen ist, sieht man nicht auf einen Blick.

## MUSS

1. Toter Knopf nach Erfolg. SidebarControls.tsx:2319-2322 sperrt den Knopf. In styles.css:1097-1118 gibt es aber keinen Stil für `.btn-primary:disabled`. Der Knopf sieht also weiter aktiv aus, hebt sich beim Darüberfahren und zeigt die Hand, aber ein Klick bewirkt nichts. Vorschlag: Bei „relay“ heißt der Knopf „Anfrage gesendet“ (mit Haken). Gesperrt sieht er blass aus, der Mauszeiger ist normal und es gibt keinen Hover.
2. Die Erfolgsmeldung geht unter. SidebarControls.tsx:2324-2328 nutzt `form-helper` (styles.css:1167, 12 px, grau), denselben Stil wie der Datenschutzsatz. Der Besucher kommt aus dem Mailprogramm zurück und muss diese Zeile erst suchen. Vorschlag: ein eigener Kasten mit Haken, grünem Rand und 14 px, direkt unter dem Knopf. Text: „Danke, Ihre Anfrage ist bei uns angekommen. Sie müssen nichts weiter tun. Die geöffnete E-Mail können Sie schließen.“
3. Die erste Zeile der Mail ist ein Rätsel. SidebarControls.tsx:752 nennt nur den Fall, in dem nichts zu tun ist, und schickt den Besucher zurück in den Browser. Vorschlag: „Diese E-Mail ist eine Kopie Ihrer Anfrage. Steht im Konfigurator „Danke, Ihre Anfrage ist bei uns angekommen“, ist alles erledigt und Sie können diese E-Mail schließen. Steht dort etwas anderes, senden Sie sie bitte ab.“ Das Zitat muss wörtlich zu Punkt 2 passen.

## SOLLTE

4. Knopftext (Stilfrage an Fabrice). Meine Empfehlung: „Anfrage senden“. Das passt zur Überschrift „Anfrage senden“ (Zeile 2243). „Per E-Mail erstellen“ stimmt im Erfolgsfall nicht, denn die Anfrage ist da schon gesendet. Darunter steht eine Zeile, die vorher sagt, was gleich passiert: „Zusätzlich öffnet sich Ihr E-Mail-Programm mit einer Kopie.“
5. Sackgasse im Zustand „mailto“ (Zeile 2330-2334). Hat sich kein Mailprogramm geöffnet, muss der Besucher alles abtippen. Vorschlag: ein Knopf „Anfrage kopieren“ neben dem Text, dazu der Satz „Hat sich kein E-Mail-Programm geöffnet, kopieren Sie Ihre Anfrage und senden Sie sie an …“.
6. Eine gmx.de-Adresse für eine Messebaufirma wirkt billig (Zeilen 767, 2333, 2338). Besser ist eine Adresse auf der eigenen Domain. Das ist Außenwirkung, also entscheidet Fabrice.
7. Fehlertext (Zeile 2336-2340) sagt, was zu tun ist: „Das hat nicht geklappt. Bitte klicken Sie noch einmal auf „Anfrage senden“ oder schreiben Sie uns an …“.

## KANN

8. Nach dem Erfolg bleibt der Knopf bis zum Neuladen gesperrt. Wer danach den Stand ändert, kann keine Ergänzung schicken. Vorschlag: „Noch etwas geändert? Neue Anfrage senden“ als Textlink.
9. Nebenbefunde außerhalb des Diffs, auf den Bildern zu sehen: „Menue schliessen“ und „Gespraeche.“ ohne Umlaute, „Debug-HUD anzeigen“ ist für Kunden sichtbar. Bei 390 bricht „ANFRAGE SENDEN“ zweizeilig um. Der Knopf ist etwa 40 px hoch, also unter 44. Hell und dunkel sind pixelgleich (je 520691 Bytes): Ein dunkles Thema gibt es nicht.

## GUT

Die Meldungen sind deutsch, ruhig und ohne Fachwörter. Der Datenschutzsatz ist knapp. Der Kontrast des Hinweistexts liegt bei 9,7:1 (#3b4556 auf Weiß).

## NICHT ANGESEHEN

Kein Bild zeigt den eingefrorenen Stand. In den vorhandenen Bildern ist der Knopf im Erfolgsfall noch nicht gesperrt (knopfAus false). Nicht angesehen habe ich außerdem die Zustände „sending“ und „fehler“, die Mail in einem echten Mailprogramm und Safari auf dem iPhone.
