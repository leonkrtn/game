# Rien ne va plus

Ein kleines 3D-Roguelite im Browser, lose inspiriert von CloverPit: Du hast Schulden bei den
falschen Leuten und versuchst in einem kleinen Casino am Roulettetisch genug Geld zu machen.

## Spielprinzip

- **Echtes Geld setzen.** Du wählst einen Jeton-Wert ($1, $5, $25 …) und setzt dein Bargeld auf
  Felder, Linien und Ecken: Plein, Cheval, Transversale, Carré, Sechserreihe, Dutzend, Kolonne und
  einfache Chancen. Verlorene Einsätze sind weg.
- **Gewinn = Summe × Mult.** Summe ist Einsatz × Auszahlung der gewinnenden Wetten, Talismane und
  Fächer erhöhen den Mult.
- **Nach je 3 Drehs ist eine Rate fällig.** Nach jedem Dreh stehst du vom Tisch auf. Die
  Geldeintreiber warten an der **Kasse**. Kannst du nicht zahlen, ist das Spiel vorbei. 8 Raten = frei
  (danach endlos).
- **Kredithai:** Bist du pleite oder kannst die Rate nicht zahlen, kommt einmal pro Spiel ein Mann in
  Weiß und leiht dir Geld – danach sind alle Raten 40 % höher.
- **Kasse:** Einzahlen sichert Geld für die Rate und bringt Zinsen nach jeder Runde. Wer früher
  zahlt, bekommt mehr **Glücksmarken**.
- **Vitrine „Kuriositäten":** Talismane und Rad-Umbauten gegen Glücksmarken. Talismane stehen als
  Figuren auf deinem Tisch (anfangs 4 Plätze) und springen, wenn sie wirken. Die Reihenfolge zählt.
- **Rad-Umbauten:** Fächer umnummerieren, Farbe tauschen, Gold-, Kristall-, Flammen- oder schwere
  Fächer.
- **Goldene Talismane:** Ein zweites Exemplar macht deinen Talisman golden und stärker.
- **Sets:** Drei zusammengehörige Talismane (z. B. Walkman + Mixtape + Pager) geben einen Extra-Bonus.
- **Zigarettenautomat:** Sachen für einen Dreh (Glückszigarette, Gezinkte Kugel, Kaugummi …), bezahlt mit Bargeld.
- **Croupier bestechen:** Die Kugel fällt öfter in Fächer, die dir etwas bringen – wenn der Saalchef
  nichts merkt.
- **Hochrisiko:** Der letzte Dreh vor der Rate kann auf Alles oder nichts gespielt werden (×2 Mult,
  doppelter Verlust).
- **Duelle:** Alle 7–10 Drehs setzt sich ein Stammgast an den Tisch. Gewinnst du mehr als er, gibt es
  Marken und seinen Einsatz, sonst steigt die Rate.
- **Fernsehnachrichten:** Zu jeder Rate läuft eine Meldung mit Effekt (Börsencrash, Hitzewelle, Razzia …).
- **Kugeln:** Stahl, Elfenbein, Glas, Blei, Kupfer, Onyx – über Erfolge freischaltbar, vor dem Spiel wählbar.
- **Glück:** Mit etwas Glück hüpft die Kugel noch in ein Nachbarfach, das dir mehr bringt.
- **Das rote Telefon:** Nach jeder Rate ruft der Boss an und bietet dir einen von drei Deals an.
- **Hausregeln:** Ab Rate 2 gilt je Zyklus eine Regel (Tischlimit, Roter Fluch, Zeitdruck …).
- **Schuldenstufen:** Wer alle 8 Raten zahlt, schaltet die nächste von sechs Stufen frei – jede
  mit einer zusätzlichen Härte (höhere Raten, teurere Vitrine, halbe Zinsen, kürzere Frist …).
- **Sammlung:** 33 Erfolge schalten neue Talismane und Startausrüstungen frei (im Browser gespeichert).

## Look

Oktober 1987, Überwachungsband: Lichtkegel im Zigarettenrauch, Staub im Lampenlicht, echte Rig-Figuren mit Mixamo-Animationen, PBR-Materialien,
Ambient Occlusion und Bloom, darüber ein VHS-Shader (Chroma-Verschmierung, Tracking-Streifen,
Kopfumschaltung, Rauschen). Gesichter werden wie auf zensiertem Bandmaterial verpixelt.
Menüs und HUD sind im Stil eines Videorekorder-OSD gehalten.

## Steuerung

| Taste | Aktion |
| --- | --- |
| WASD / Pfeile, Shift | laufen, rennen |
| E | Tisch, Kasse, Vitrine, Telefon, Zigarettenautomat |
| Tab | Übersicht: Talismane, Sets, Tasche, Boni, Rate |
| Linksklick / Rechtsklick | Jeton setzen / zurücknehmen |
| 1–6, Mausrad | Jeton-Wert wählen |
| Leertaste | drehen (halten = schneller) |
| R / C | letzte Einsätze wiederholen / abräumen |
| B / H | Croupier bestechen / Hochrisiko (letzter Dreh) |
| 7–9 | Sachen aus der Tasche benutzen |
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
- `scripts/build-assets.mjs`, `scripts/retarget.mjs`: laden, komprimieren und retargeten die 3D-Assets
  nach `public/assets/`

## Assets & Lizenzen

- Figur: Ready-Player-Me-Avatar aus den three.js-Beispielen; Animationen: Mixamo (über three.js `Xbot.glb`)
- Khronos glTF Sample Assets (CC BY 4.0): ChairDamaskPurplegold, SunglassesKhronos, GlassHurricaneCandleHolder
- Holztexturen: three.js-Beispiele (hardwood2)
- Schrift: VT323 (SIL Open Font License)
