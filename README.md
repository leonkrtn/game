# Rien ne va plus

Ein kleines 3D-Roguelite im Browser, lose inspiriert von CloverPit: Du hast Schulden bei den
falschen Leuten und versuchst in einem kleinen Casino am Roulettetisch genug Geld zu machen.

## Spielprinzip

- **Echtes Geld setzen.** Du wählst einen Jeton-Wert ($1, $5, $25 …) und setzt dein Bargeld auf
  Felder, Linien und Ecken: Plein, Cheval, Transversale, Carré, Sechserreihe, Dutzend, Kolonne und
  einfache Chancen. Verlorene Einsätze sind weg.
- **Gewinn = Summe × Mult.** Summe ist Einsatz × Auszahlung der gewinnenden Wetten, Talismane und
  Fächer erhöhen den Mult.
- **Alle 5 Runden ist eine Rate fällig.** Die Geldeintreiber warten an der **Kasse**. Kannst du
  nicht zahlen, ist das Spiel vorbei. 8 Raten = frei (danach endlos).
- **Kasse:** Einzahlen sichert Geld für die Rate und bringt Zinsen nach jeder Runde. Wer früher
  zahlt, bekommt mehr **Glücksmarken**.
- **Vitrine „Kuriositäten":** Talismane und Rad-Umbauten gegen Glücksmarken. Talismane stehen als
  Figuren auf deinem Tisch (anfangs 4 Plätze) und springen, wenn sie wirken. Die Reihenfolge zählt.
- **Rad-Umbauten:** Fächer umnummerieren, Farbe tauschen, Gold-, Kristall-, Flammen- oder schwere
  Fächer.
- **Glück:** Mit etwas Glück hüpft die Kugel noch in ein Nachbarfach, das dir mehr bringt.
- **Das rote Telefon:** Nach jeder Rate ruft der Boss an und bietet dir einen von drei Deals an.
- **Hausregeln:** Ab Rate 2 gilt je Zyklus eine Regel (Tischlimit, Roter Fluch, Zeitdruck …).
- **Sammlung:** Erfolge schalten neue Talismane und Startausrüstungen frei (im Browser gespeichert).

## Steuerung

| Taste | Aktion |
| --- | --- |
| WASD / Pfeile, Shift | laufen, rennen |
| E | Tisch, Kasse, Vitrine, Telefon |
| Linksklick / Rechtsklick | Jeton setzen / zurücknehmen |
| 1–6, Mausrad | Jeton-Wert wählen |
| Leertaste | drehen (halten = schneller) |
| R / C | letzte Einsätze wiederholen / abräumen |
| V | Rad mit Wahrscheinlichkeiten ansehen |
| Esc | aufstehen / schließen |
| M | Ton an/aus |

## Entwicklung

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # Unit-Tests der Spiellogik
npm run sim          # Balancing-Simulation mit Bots
npm run build        # Produktions-Build nach dist/
npm run build:single # alles in einer einzigen dist-single/index.html
```

## Aufbau

- `src/game/`: reine Spiellogik ohne 3D, testbar
  - `content.ts`: Talismane, Rad-Umbauten, Hausregeln, Telefon-Deals, Raten, Startausrüstung
  - `fields.ts`: alle Wettfelder inkl. Innenwetten
  - `scoring.ts`: Auswertung eines Drehs (Summe, Mult, Wahrscheinlichkeiten)
  - `run.ts`: Ablauf eines Spiels (Einsätze, Kasse, Zinsen, Vitrine, Telefon, Glück)
  - `meta.ts`: Erfolge, Freischaltungen, gespeicherter Fortschritt
- `src/world/`: Three.js-Szene (Casino, Tisch, Rad, Figuren, Talisman-Figuren, Effekte)
- `src/ui/`: HTML-Oberfläche (Seitenleiste, Jetons, Kasse, Vitrine, Telefon, Bildschirme)
- `src/game.ts`: verbindet Logik, Welt und Oberfläche
