# Rien ne va plus

Ein kleines 3D-Roguelite im Browser: Du hast dir Geld bei den falschen Leuten geliehen und
versuchst es in einem kleinen Casino am Roulettetisch zurückzugewinnen.

## Spielprinzip

- **Alle 5 Runden** (= 5 Drehs) warten die Geldeintreiber an der **Kasse** auf ihre Rate.
  Kannst du nicht zahlen, ist das Spiel vorbei. 8 Raten abbezahlt = frei (danach endlos).
- Am **Roulettetisch** setzt du deine **Jetons** per Maus auf die Felder.
  Jeder Jeton hat einen Wert und oft einen Effekt (Rot-Jeton, Ketten-Jeton, Magnet, Glas …).
- Gewinn eines Drehs = **Summe** (Wert × Auszahlung der gewinnenden Jetons) × **Mult**.
- An der **Kasse** kaufst du mit deinem Gewinn:
  - **Talismane** (max. 5): passive Effekte, die sich gegenseitig verstärken
  - **Jetons** für deinen Beutel, oder du entfernst schwache
  - **Umbauten fürs Rad**: Fächer umnummerieren, Farbe tauschen, Gold/Kristall/Flamme/Schwer
- Ab Rate 2 gilt pro Zyklus eine zufällige **Hausregel** (z. B. „Roter Fluch", Zeitlimit).
- Im Raum liegen **Glücksmünzen**: aufheben gibt Mult für den nächsten Dreh.

## Steuerung

| Taste | Aktion |
| --- | --- |
| WASD / Pfeile, Shift | laufen, rennen |
| E | an den Tisch treten / Kasse |
| Linksklick / Rechtsklick | Jeton setzen / zurücknehmen |
| 1–5, Mausrad | Jeton wählen |
| Leertaste | drehen (halten = schneller) |
| R | Hand neu ziehen |
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

- `src/game/`: reine Spiellogik ohne 3D (Regeln, Inhalte, Punkte, Shop), testbar
  - `content.ts`: alle Jetons, Talismane, Rad-Umbauten, Hausregeln, Raten → hier wird balanciert
  - `scoring.ts`: Berechnung eines Drehs
  - `run.ts`: Ablauf eines Spiels (Runden, Raten, Kasse)
- `src/world/`: Three.js-Szene (Casino, Tisch, Rad mit Kugel-Animation, Figuren)
- `src/ui/`: HTML-Oberfläche (HUD, Kasse, Rad-Ansicht, Bildschirme)
- `src/game.ts`: verbindet Logik, Welt und Oberfläche
