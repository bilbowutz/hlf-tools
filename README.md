# HLF-Trainer

Gerätekunde als Minispiel fürs Handy: Ein zufälliges Gerät wird angesagt, man sucht am 3D-Modell
des HLF das richtige Fach und tippt das Gerät dann auf dem Foto des offenen Fachs an.

- **Training**: mit Tipps, ohne Zeitdruck
- **Challenge**: 10 Geräte auf Zeit, Highscore
- **Lernmodus**: Fächer öffnen und anschauen
- Geräte, die man oft falsch hat, kommen häufiger dran (Statistik bleibt lokal im Browser)
- Als App installierbar (Homescreen) und offline nutzbar

## Passwortschutz

Fotos und Beladeliste liegen nur **verschlüsselt** im Repo (`data/*.enc`, AES-256-GCM, Schlüssel per
PBKDF2 aus dem Passwort). Ohne Passwort sind sie weder über die Website noch über GitHub lesbar.
Das Passwort wird nirgends im Repo gespeichert.

**Niemals unverschlüsselte Fotos oder JSON-Backups hochladen** (`.gitignore` blockt `*.jpg` zur Sicherheit).

## Inhalte pflegen

Auf `admin.html` (Link: `…/hlf-tools/admin.html`) mit dem Passwort anmelden:

1. Fach wählen → **Foto ersetzen** (wird im Browser verkleinert und verschlüsselt)
2. Gerät auswählen oder **+ Neues Gerät** → Rechteck um das Gerät auf dem Foto ziehen
3. **Dateien herunterladen** → auf GitHub hochladen:
   - `content.enc` → Ordner `data/`
   - Fotos `g1.enc` … → Ordner `data/img/`

Alternativ per Kommandozeile:

```sh
node tools/encrypt.mjs --password '<PW>' --content beladung.json --images ordner-mit-fotos/
```

## Rangliste (Challenge)

Läuft über eine Google Tabelle mit Apps Script (`tools/leaderboard.gs`, Einrichtung steht oben in der Datei).
Die Web-App-URL steht nur in der verschlüsselten Beladeliste (`leaderboard` in `content.enc`),
eintragen können also nur Leute mit Passwort. Gespeichert werden nur Nickname, Punkte und Datum;
pro Nickname zählt der beste Eintrag. Einträge löschen = Zeile in der Tabelle löschen.

## Technik

Statische Seite ohne Build-Schritt (Vanilla JS, [three.js](https://threejs.org) liegt in `vendor/`).
Lokal testen: `python3 -m http.server` im Repo-Ordner, dann `http://localhost:8000`.

| Datei | Inhalt |
|---|---|
| `js/app.js` | Spielablauf, Modi, Statistik |
| `js/truck.js` | 3D-Modell (Fächer-Positionen in `SHUTTERS`) |
| `js/photo.js` | Foto-Ansicht mit Zoom und Hotspots |
| `js/crypto.js` | Ver-/Entschlüsselung |
| `js/admin.js` | Hotspot-Editor |
| `js/leaderboard.js` | Rangliste (Client) |
| `tools/leaderboard.gs` | Rangliste (Google Apps Script) |
| `sw.js` | Offline-Cache |
