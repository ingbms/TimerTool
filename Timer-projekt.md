Timer-projekt, 
- wir nennen es timertool
- gui - Material, ähnlich VS-Code
- erstelle mir eine architektur, stelle ggf fragen
- push nach github
- hosten mit github-pages
- lizenz CC BY-NC-SA
- ersteller INGBMS - S.M.Art

Ich benötige ein zeitmanagementsystem, eher einen flexiblen timer, welcher serverlos im browser läuft. 
Funktionen:
- zeitabfrage per ntp, nur wenn verfügbar!, sonst nimm die systemzeit. abfrage beim start und nach einer einstellbaren dauer, standard 30minuten
- auflösung und animation 0,1 Sekunden Genauigkeit
- drift vermeiden!
- Konfigurationen per cookies speichern, per json lokal speichern und abrufen (Buttons zum speichern/abrufen)
- bis zu 5 timer definierbar
- globale reset funktion mit bestätigung
- timer soll mehrere funktionen zur auswahl bieten
  - optionaler, einzeln konfigurierbarer ton bei ablauf, ton wählbar, dauer wählbar, anzahl wählbar, pausendauer zwischen tonbursts wählbar, lautstärke wählbar.
  - ablauf zu einer festen zeit mit optionaler Wiederholung, z,b, 5:00 minuten (z.b. Start 11:00, dann ton bei 11:05, 11:10, 11:15, usw.)
  - wenn multible einer zeit gewählt wird, dann offset vorsehen, wieviel zeit er vorher triggern soll (ist zwar widersinnig, aber wenn der timer z.b. zur vollen stunde auslösen soll, dann soll dem user zeit (z.b. x sekunden ) gegeben werden um zeitig  aktionen einzuleiten)
  - endzeit wählbar
  - anzahl der auslösungen wählbar.
  - start sofort, ablauf nach zeit
  - 