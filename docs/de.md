# Monica

Die Geburtstage und Erinnerungen deines [Monica](https://www.monicahq.com)
(das freie persönliche CRM) in Gladys: wer heute Geburtstag hat, wer in dieser
Woche feiert, welche Erinnerungen auf heute fallen. Eine Szene kann dir am
Morgen eines Geburtstags eine Nachricht schicken, dich eine Woche vorher an
das Geschenk erinnern, und Gladys kann die Geburtstage der Woche vorlesen.

> **Rückmeldungen willkommen.** Diese Integration wurde mit einem echten
> Monica-4-Server getestet (offizielles Docker-Image `monica:4`, Oktober 2026),
> aber noch nicht im Alltag. Wenn etwas nicht wie beschrieben funktioniert,
> schreib es im [Gladys-Forum](https://community.gladysassistant.com) oder in
> den [Issues](https://github.com/guim31/gladys-monica/issues).

## Was du brauchst

- Gladys Assistant 5.1.0 oder neuer.
- Ein **selbst gehostetes Monica 4** (das Docker-Image `monica:4` oder eine
  4.x-Installation), von Gladys aus erreichbar. Monica 5 („chandler“) hat noch
  keine API: Es wird nicht unterstützt.
- Ein **persönliches Zugriffstoken** eines Monica-Benutzers. In Monica:
  **Settings** → **API** → **Personal access tokens** → **Create new token**,
  gib ihm einen Namen (`Gladys`) und kopiere es: Monica zeigt es nur einmal an.
  Die Integration liest nur und ändert nie etwas in Monica.

## Einrichtung

1. In Gladys, **Integrationen** → installiere **Monica**.
2. Im Bildschirm **Konfiguration** der Integration:
   - **Adresse**: die Adresse von Monica wie im Browser, z. B.
     `http://192.168.1.20:8080` oder `https://monica.example.org`;
   - **Persönliches Zugriffstoken**: das oben erstellte Token;
   - **Uhrzeit der Szenenereignisse** (standardmäßig 08:00): wann die
     Geburtstage und Erinnerungen des Tages ihre Szenen auslösen;
   - **Aktualisierungsintervall** (standardmäßig 1 Stunde, 15 Minuten bis
     6 Stunden);
   - **Selbstsignierte Zertifikate akzeptieren**: nur für deinen eigenen
     Server mit `https://` und selbstsigniertem Zertifikat;
   - **Sprache der Funktionsnamen**: standardmäßig Französisch.
3. **Verbindung testen**: Gladys liest Monica und meldet, wie viele
   Geburtstage und Erinnerungen es gefunden hat.
4. Füge im Tab **Entdecken** das Gerät **Monica** hinzu.

Monica erlaubt 60 Anfragen pro Minute und Token. Ein Lesevorgang braucht eine
Anfrage pro 100 Kontakte und pro 100 Erinnerungen, plus eine: weit darunter,
auch bei einem großen Adressbuch.

## Geräte

Ein Gerät **Monica** pro Monica-Konto, mit diesen Funktionen:

| Funktion                | Was sie anzeigt                                                    |
| ----------------------- | ------------------------------------------------------------------ |
| Geburtstage heute       | Kontakte, die heute Geburtstag haben                               |
| Geburtstage in 7 Tagen  | Geburtstage von heute bis in 6 Tagen                               |
| Erinnerungen heute      | Monica-Erinnerungen, die auf heute fallen (ohne Geburtstage)       |
| Tage bis zum Geburtstag | Tage bis zum nächsten Geburtstag, 0 wenn er heute ist              |
| Nächster Geburtstag     | der Name der nächsten Person, die feiert, „Keiner“ ohne Geburtstag |

Was als Geburtstag zählt:

- ein Kontakt mit bekanntem Geburtsdatum; sind nur Tag und Monat bekannt,
  gibt es kein Alter;
- verstorbene, archivierte und partielle Kontakte (Angehörige ohne eigene
  Seite) werden ausgelassen, ebenso ein nur als Alter eingegebenes
  Geburtsdatum („etwa 40 Jahre“);
- am 29. Februar geboren: in einem Gemeinjahr am 28. Februar gefeiert.

Was als Erinnerung zählt: alle Erinnerungen von Monica (einmalig, alle N
Wochen, Monate oder Jahre), außer denen verstorbener oder archivierter Kontakte und den
Erinnerungen „Wish happy birthday“, die Monica für jeden Geburtstag anlegt und die schon als Geburtstage zählen. Eine
monatliche Erinnerung am 31. fällt auf den letzten Tag kürzerer Monate.

## Dashboard

Das Widget **Nächste Geburtstage** zeigt zwei Kacheln (Geburtstage und
Erinnerungen von heute), die nächsten sechs Geburtstage mit Datum und
erreichtem Alter und die Erinnerungen der nächsten 7 Tage mit ihrem Kontakt.
Füge es über **Bearbeiten** → **Widget hinzufügen** einem Dashboard hinzu.
Antwortet Monica nicht, behält das Widget die zuletzt bekannten Daten mit
einem kurzen Hinweis.

## Szenen

### Auslöser

Die Ereignisse des Tages lösen **einmal am Tag** aus, zur in der
Konfiguration gewählten **Uhrzeit der Szenenereignisse** (oder beim ersten
Lesen danach, wenn Gladys oder Monica gestoppt waren). Ein später am Tag
hinzugefügter Geburtstag oder eine Erinnerung löst beim nächsten Lesen aus.
Die Variablen enthalten Namen: Denk daran, wer die damit gesendeten
Nachrichten liest.

- **Geburtstag heute (Monica)**: Ein Kontakt hat heute Geburtstag.
  Optionaler Filter: **Name** (Vor- und Nachname genau wie in Monica).
  Variablen: Name, Vorname, erreichtes Alter (leer, wenn das Jahr unbekannt
  ist), Datum des Geburtstags, Nummer des Monica-Kontakts.
- **Geburtstag in N Tagen (Monica)**: Der Geburtstag eines Kontakts ist in N
  Tagen. Pflichtfeld **Tage vor dem Geburtstag**, von 1 (am Vortag) bis 30;
  optionaler Filter **Name**. Dieselben Variablen, dazu die verbleibenden
  Tage.
- **Erinnerung heute (Monica)**: Eine Erinnerung fällt auf heute. Optionaler
  Filter: **Titel der Erinnerung** (genauer Titel). Variablen: Titel der
  Erinnerung, Name des Kontakts, Nummer der Monica-Erinnerung, Nummer des
  Monica-Kontakts.

### Aktionen

- **Geburtstage der Woche lesen (Monica)**: Monica wird neu gelesen, dann
  liefert die Aktion einen **Satz**, z. B. „4 Geburtstage in den nächsten 7
  Tagen: Alice Martin (36 Jahre) heute, Bruno heute, Chloé Durand (10 Jahre)
  Samstag und Inès Montag.“, und die **Anzahl der Geburtstage**, zum
  Versenden oder Vorlesen. Der Satz folgt der in der Konfiguration gewählten
  Sprache.

### Szenen-Ideen

- **Geburtstagsnachricht**: Auslöser „Geburtstag heute (Monica)“ → Nachricht
  „Heute hat {{name}} Geburtstag“ (und das Alter, wenn bekannt).
- **An das Geschenk denken**: Auslöser „Geburtstag in N Tagen (Monica)“ mit
  7 Tagen → Nachricht „{{name}} feiert in einer Woche: Denk an das Geschenk“.
- **Montagmorgen**: jeden Montag um 08:00 → „Geburtstage der Woche lesen
  (Monica)“ → den Satz auf dem Küchenlautsprecher sagen oder versenden.
- **Anruf-Erinnerung**: Auslöser „Erinnerung heute (Monica)“ → Nachricht
  „Erinnerung: {{title}} ({{contact_name}})“.

## Fehlerbehebung

- **„Monica antwortet nicht“**: Prüfe die Adresse (mit Port) und dass Gladys
  sie erreicht: Gladys läuft in Docker, `localhost` ist nicht dein Server.
- **„Zugriffstoken abgelehnt (widerrufen oder abgelaufen?)“**: Erstelle in
  Monica ein neues persönliches Zugriffstoken und füge es in der
  Konfiguration ein.
- **„keine Monica-4-API unter dieser Adresse“**: Die Adresse zeigt auf etwas
  anderes oder auf Monica 5, das keine API hat.
- **„die Adresse leitet um“**: Monica erzwingt HTTPS: Gib die
  `https://`-Adresse ein.
- **„Zertifikat abgelehnt“**: Aktiviere „Selbstsignierte Zertifikate
  akzeptieren“ für deinen eigenen Server.
- **Ein Geburtstag fehlt**: Prüfe in Monica, dass der Kontakt ein
  Geburtsdatum hat (nicht nur ein Alter) und weder archiviert noch verstorben
  ist.
- **Kein Szenenereignis**: Die Ereignisse kommen einmal am Tag zur in der
  Konfiguration gewählten Uhrzeit; die Protokolle zeigen nie Namen
  (`LOG_LEVEL=debug` für die Details eines Lesevorgangs).

## Grenzen

- Nur Monica 4; Monica 5 wird nicht unterstützt (keine API).
- Nur Lesen: Aus Gladys wird kein Kontakt, Geburtstag oder keine Erinnerung
  angelegt oder geändert.
- Die Ereignisse des Tages kommen einmal am Tag, nicht zur Uhrzeit der
  Erinnerung (eine Monica-Erinnerung hat ein Datum, keine Uhrzeit).
- Das nächste Vorkommen einer Erinnerung berechnet die Integration aus
  Startdatum und Häufigkeit.
- Ein Monica-Konto pro Integration (das des Tokens).
