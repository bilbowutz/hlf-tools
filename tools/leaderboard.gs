/**
 * HLF-Trainer · Rangliste
 *
 * Einrichtung (einmalig, am PC):
 *  1. Neue Google Tabelle anlegen (sheets.new), z. B. „HLF Rangliste“.
 *  2. Erweiterungen → Apps Script. Alles im Editor löschen, diese Datei komplett einfügen, speichern.
 *  3. Bereitstellen → Neue Bereitstellung → Zahnrad → „Web-App“.
 *     Ausführen als: „Ich“ · Zugriff: „Jeder“ → Bereitstellen → Zugriff autorisieren.
 *     (Warnung „App nicht überprüft“ → Erweitert → „Zu … wechseln“.)
 *  4. Die Web-App-URL (endet auf /exec) in die App eintragen lassen.
 *
 * Die Tabelle bekommt ein Blatt „Rangliste“ mit: Datum | Nickname | Punkte.
 * Unsinnige Einträge einfach dort löschen.
 */

var SHEET_NAME = 'Rangliste';
var MAX_SCORE = 6000; // Wettkampf: 50 s, 100 Punkte pro Gerät × 2 (seltene) – großzügige Obergrenze
var TOP_N = 10;

function doGet(e) {
  return json_({ top: topList_(readRows_()) });
}

function doPost(e) {
  var data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ error: 'Ungültige Anfrage' });
  }
  var nick = cleanNick_(data.nick);
  var score = Math.round(Number(data.score));
  if (!nick) return json_({ error: 'Nickname fehlt' });
  if (!(score >= 0 && score <= MAX_SCORE)) return json_({ error: 'Ungültige Punktzahl' });

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    sheet_().appendRow([new Date(), nick, score]);
  } finally {
    lock.releaseLock();
  }
  var rows = readRows_();
  return json_({ top: topList_(rows), rank: rankOf_(rows, nick) });
}

// Nickname: 1–20 Zeichen, keine Formeln (Tabellen-Injection)
function cleanNick_(nick) {
  var s = String(nick || '').replace(/\s+/g, ' ').trim().slice(0, 20);
  return s.replace(/^[=+\-@]+/, '').trim();
}

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(['Datum', 'Nickname', 'Punkte']);
    sh.setFrozenRows(1);
  }
  return sh;
}

function readRows_() {
  var values = sheet_().getDataRange().getValues().slice(1);
  return values
    .filter(function (r) { return r[1] !== '' && r[2] !== ''; })
    .map(function (r) { return { date: new Date(r[0]).getTime() || 0, nick: String(r[1]), score: Number(r[2]) || 0 }; });
}

// Bester Eintrag pro Nickname (Groß-/Kleinschreibung egal), absteigend; bei Gleichstand zählt der frühere
function bestPerNick_(rows) {
  var best = {};
  rows.forEach(function (r) {
    var k = r.nick.toLowerCase();
    var b = best[k];
    if (!b || r.score > b.score || (r.score === b.score && r.date < b.date)) best[k] = r;
  });
  return Object.keys(best).map(function (k) { return best[k]; })
    .sort(function (a, b) { return b.score - a.score || a.date - b.date; });
}

function topList_(rows) {
  return bestPerNick_(rows).slice(0, TOP_N).map(function (r) { return { nick: r.nick, score: r.score }; });
}

function rankOf_(rows, nick) {
  var list = bestPerNick_(rows);
  for (var i = 0; i < list.length; i++) if (list[i].nick.toLowerCase() === nick.toLowerCase()) return i + 1;
  return null;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
