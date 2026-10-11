"""Herkunft des Konfigurators (GitHub Pages) für kunde messebau im Lead-Endpunkt freigeben.

Läuft auf sunds-hub als root:
  sudo python3 herkunft-freigeben.py --trocken    zeigt die neue Liste, ändert nichts
  sudo python3 herkunft-freigeben.py --setzen     Sicherung, setzen, Neustart, Gesundheitsprobe, bei Fehler zurück
  sudo python3 herkunft-freigeben.py --rueckweg   nimmt die Herkunft heraus (gleiche Sicherung und Probe)
  sudo python3 herkunft-freigeben.py --stand      zählt Konfigurator-Leads in der Ablage, Exit 2 wenn nicht frei
  sudo python3 herkunft-freigeben.py --probe      POST mit Origin github.io und gefülltem botcheck: 403 heißt nicht frei,
                                                  200 heißt frei; der Endpunkt legt dabei nichts ab und schickt keine Mail
                                                  (Honigtopf, dienst.py pruefe()). Belegt einen von 5 Plätzen je IP und Stunde.
Andere Argumente: Exit 64, nichts geändert (Spieltheoretiker 0130 S4).
Die Quelle der Datei ist connect/leadmaschine/zentrale/lead-endpunkt/kunden.json; ohne Eintrag dort nimmt der nächste
Rollout die Freigabe wieder heraus (Spieltheoretiker 0130 M1). Deshalb zuerst dort eintragen.
"""
import glob
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request

KUNDEN = "/opt/sunds-leads/kunden.json"
DATEN = "/opt/sunds-leads/daten"
HERKUNFT = "https://sundsoffice-tech.github.io"
KUNDE = "messebau"
DIENST = "sunds-leads"
LEAD_URL = "https://leads.sundsconnect.de/lead"
GESUND_URL = "https://leads.sundsconnect.de/gesund"
MODI = ("--trocken", "--setzen", "--rueckweg", "--stand", "--probe")


def frei():
    d = json.load(open(KUNDEN, encoding="utf-8"))
    return HERKUNFT in d[KUNDE].get("herkunft", [])


def stand():
    n, letzte = 0, None
    for pfad in sorted(glob.glob(os.path.join(DATEN, f"*_{KUNDE}_*.json"))):
        try:
            d = json.load(open(pfad, encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if (d.get("nachricht") or "").rstrip().endswith("Formular: konfigurator"):
            n += 1
            letzte = os.path.basename(pfad)[:19]
    ist = frei()
    print(f"Konfigurator-Leads {n}, letzter {letzte or '-'}; Herkunft frei: {'ja' if ist else 'nein'}")
    return 0 if ist else 2


def http(url, daten=None, kopf=None):
    anfrage = urllib.request.Request(url, data=daten, headers=kopf or {}, method="POST" if daten else "GET")
    try:
        with urllib.request.urlopen(anfrage, timeout=10) as antwort:
            return antwort.status
    except urllib.error.HTTPError as fehler:
        return fehler.code
    except (urllib.error.URLError, OSError):
        return None


def probe():
    roh = json.dumps({"kunde": KUNDE, "name": "Probe", "email": "probe@example.org", "nachricht": "Probe",
                      "botcheck": "probe-herkunft"}).encode("utf-8")
    code = http(LEAD_URL, roh, {"Content-Type": "application/json", "Origin": HERKUNFT})
    print(f"Probe POST mit Origin {HERKUNFT} und Honigtopf: HTTP {code}")
    return 0 if code == 200 else 2


def neustarts():
    return subprocess.run(["systemctl", "show", DIENST, "-p", "NRestarts", "--value"], capture_output=True,
                          text=True).stdout.strip()


def gesund(sekunden=20):
    """Dienst aktiv, /gesund 200, und zwischen zwei Proben im Abstand von 3 s kein automatischer Neustart
    (NRestarts gleich), sonst hängt er in einer Absturzschleife (Programmierer 0300 SOLLTE 3)."""
    ende = time.time() + sekunden
    while time.time() < ende:
        time.sleep(2)
        aktiv = subprocess.run(["systemctl", "is-active", DIENST], capture_output=True, text=True).stdout.strip()
        if aktiv == "active" and http(GESUND_URL) == 200:
            vorher = neustarts()
            time.sleep(3)
            aktiv = subprocess.run(["systemctl", "is-active", DIENST], capture_output=True, text=True).stdout.strip()
            nachher = neustarts()
            if aktiv == "active" and http(GESUND_URL) == 200 and vorher == nachher:
                print(f"gesund: active, /gesund 200, NRestarts {nachher} unverändert")
                return True
    print("NICHT gesund nach Neustart")
    return False


def neu_starten():
    """Neustart ohne Ausnahme; ein Fehlschlag führt in den Rückweg statt in einen Traceback (Programmierer 0300 SOLLTE 2)."""
    r = subprocess.run(["systemctl", "restart", DIENST], capture_output=True, text=True)
    if r.returncode != 0:
        print(f"Neustart fehlgeschlagen (Exit {r.returncode}): {r.stderr.strip()[:200]}")
    return r.returncode == 0


def schreiben(d, sicherung):
    neu = KUNDEN + ".neu"
    with open(neu, "w", encoding="utf-8") as fh:
        json.dump(d, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    shutil.copymode(sicherung, neu)
    st = os.stat(sicherung)
    os.chown(neu, st.st_uid, st.st_gid)
    os.replace(neu, KUNDEN)


def main():
    modus = sys.argv[1] if len(sys.argv) == 2 else ""
    if modus not in MODI:
        print(f"Aufruf: {' | '.join(MODI)}; nichts geändert")
        return 64
    if modus == "--stand":
        return stand()
    if modus == "--probe":
        return probe()
    d = json.load(open(KUNDEN, encoding="utf-8"))
    liste = d[KUNDE].setdefault("herkunft", [])
    if modus == "--rueckweg":
        if HERKUNFT not in liste:
            print("nichts zu tun: Herkunft nicht freigegeben")
            return 0
        liste.remove(HERKUNFT)
    else:
        if HERKUNFT in liste:
            print("nichts zu tun: Herkunft schon freigegeben")
            return stand()
        liste.append(HERKUNFT)
    if modus == "--trocken":
        print("würde setzen:", liste)
        return 0
    sicherung = f"{KUNDEN}.vor-konfigurator-{time.strftime('%Y%m%d-%H%M%S')}"
    shutil.copy2(KUNDEN, sicherung)
    schreiben(d, sicherung)
    if not (neu_starten() and gesund()):
        shutil.copy2(sicherung, KUNDEN)
        neu_starten()
        print("zurückgesetzt auf", sicherung, "; gesund danach:", gesund())
        return 1
    print("gesetzt:", liste, "Sicherung:", sicherung)
    ist = stand()
    # Programmierer 0300 SOLLTE 4: der Rückweg ist erfolgreich, wenn die Herkunft danach NICHT frei ist
    if modus == "--rueckweg":
        return 0 if ist == 2 else 1
    return ist


if __name__ == "__main__":
    sys.exit(main())
