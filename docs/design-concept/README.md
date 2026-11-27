# Designkonzept „Etikett“

Neues Erscheinungsbild für BazarPro. Leitidee: **das Preisetikett** – das eine Objekt, das Orga, Verkäufer und Kasse verbindet. Fokus: Jede Rolle sieht auf jedem Screen sofort, **was als Nächstes zu tun ist**.

Mockups: `landing.html`, `organizer.html`, `cashdesk.html`, `seller-phone.html`, `logo-sheet.html` · Screenshots in `shots/`.

## Marke

| | |
|---|---|
| Logo | Preisetikett mit ausgestanztem „B“ und gelbem Faden (`logo.svg`), Dunkel-Variante (`logo-dark.svg`), Favicon ohne Faden/Loch (`logo-small.svg`) |
| Primär | Petrol `#0e5e63` – die *einzige* Aktionsfarbe |
| Akzent | Etikett-Gelb `#f6c445` – „jetzt dran“, Marke, Schrittnummern |
| Signal | Koralle `#d1452a` (Text: `#a8341c`) – Rabatt, Warnung |
| Status | Blatt `#2f7d32` (Text: `#24622a`) – nur Status, nie Haupt-Button |
| Neutral | Papier `#faf7f2`, Tinte `#1b2326`, `ink-3 #5f686b` (≥ 5:1), Control-Rahmen `#8a8378` (≥ 3:1) |
| Schrift | Bricolage Grotesque (Überschriften, Beträge ≥ 20 px) + Inter (UI) |

## Userflow-Prinzipien

1. **Eine Primäraktion pro Screen.** Alles andere ist Ghost oder Text.
2. **Fahrplan statt Menü.** Orga: 5 Phasen (Einrichten → Anmeldung → Annahme → Verkauf → Abrechnung), Navigation nach Phasen gruppiert, aktuelle Phase markiert. Verkäufer: 5 Schritte (Erfassen → Drucken → Abgeben → Verkauf → Geld).
3. **„Dein nächster Schritt“-Karte** mit gelber Lasche: Titel als Ergebnis formuliert, ein Fortschritt, ein Button.
4. **Kasse als nummerierte Strecke:** 1 Scannen → 2 Geld annehmen (Gegeben/Rückgeld, Checkbox „… € erhalten“ bleibt) → 3 Abschließen. Eigener Kassen-Modus ohne Seitenleiste.
5. **Einstieg nach Absicht:** Landing fragt „Was hast du vor?“ statt zwei gleichrangiger Buttons.

## Bewertung durch Sub-Agents (1–10)

| Perspektive | Vorher | Runde 1 | Runde 2 |
|---|---|---|---|
| UX / Userflow | 5 | 7,5 | 8,3 |
| Marke / Visuell | 5 | 7 | 8 |
| Ehrenamtliche Orga (52) | 5 | 8 | 8,5 |
| Barrierefreiheit (WCAG AA) | 6 | 5,5 | 8 |

Die Punkte aus Runde 2 sind danach noch eingearbeitet (FAB entfernt, Kasse neu gegliedert, letzte Kontraste, Favicon).

## Umsetzung im Code (Vorschlag, schrittweise)

1. **Tokens:** Werte in `src/styles/index.css` (`--primary`, `--background`, `--muted-foreground`, `--border`, `--ring`, …) auf die Palette oben umstellen, `--radius` auf 14 px, Buttons `rounded-full`. Dunkelmodus separat ableiten (Petrol-900 als Fläche, Gelb als Akzent).
2. **Logo:** `src/components/layout/BrandLogo.tsx` (heute Lucide `ShoppingBag`) durch das SVG ersetzen, `public/favicon.svg` durch `logo-small.svg`.
3. **Schrift:** `@fontsource/bricolage-grotesque` ergänzen, als `--font-display` für h1–h3 und Beträge.
4. **Flow-Bausteine:** `PhaseRoadmap` + `NextStepCard` für die Orga-Übersicht, `SellerJourney` für Verkäufer, Kassen-Modus mit Schritten.
5. Danach Seiten einzeln umziehen und `npm run screenshots` neu erzeugen.

Offen: Dunkelmodus-Mockups, Katalog-/Besucheransicht, Abrechnung.
