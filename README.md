# MTG Fresh Cuts

MTG Fresh Cuts is a browser-based Magic: The Gathering deck workshop designed to make deck review—and especially deciding what to cut—more understandable. Paste in a deck list, choose a format and commander when applicable, and the tool turns the list into a visual workspace with card data, deck statistics, and explainable cut recommendations.

The project is currently an early MVP. Its recommendations are intended as deck-building guidance rather than authoritative judgments about individual cards.

## What it does

- Imports common plain-text deck-list formats, including quantities and optional set and collector numbers.
- Loads exact printings when supplied and otherwise selects the least-expensive available paper printing.
- Excludes cards listed after a `Sideboard:` marker from the main deck.
- Displays cards as artwork or text and supports grouping and sorting by type, rarity, name, mana value, and price.
- Shows deck size, target size, total price, mana curve, spell-color distribution, and available mana-source colors.
- Handles double-faced cards with front-face classification and a control for viewing the reverse face.
- Uses the selected commander, card keywords, creature types, rules-text themes, and repeated deck themes to estimate synergy.
- Provides an interactive Make Cuts workspace with Undecided, Keep, and Cut lists.
- Recalculates mana-curve recommendations as cards are added to the cut list.
- Supports optional budget-aware price scoring with a tiered budget control.
- Lets users inspect detected synergy connections and ignore irrelevant synergy tags.

## Card data and caching

Card details, artwork links, printing information, and prices come from the Scryfall API. Requests are batched or spaced where appropriate, and successfully loaded cards are cached in the browser using IndexedDB for 24 hours. The application also includes a bundled card catalog so previously collected data can be served without another API request.

Price information is a snapshot from the time the printing was loaded and may not reflect current market prices.

## Running locally

The application requires Node.js 22.13 or newer and pnpm 10.

```powershell
cd web
pnpm install --frozen-lockfile
pnpm dev
```

Open the local URL printed by Vite, normally `http://127.0.0.1:5173/` or `http://localhost:5173/`.

## Creating a static build

```powershell
cd web
pnpm build
```

The deployable static files are written to `web/dist`. To test the production build locally, run:

```powershell
pnpm preview
```

The repository includes a GitHub Pages workflow at `.github/workflows/pages.yml`. It builds the application on pushes to `main` and publishes `web/dist`.

## Project structure

- `web/` — React, TypeScript, and Vite application.
- `web/src/` — deck importing, deck workspace, cut workspace, card caching, and Scryfall integration.
- `web/public/card-catalog.json` — bundled card-data catalog.
- `web/scripts/update-card-catalog.mjs` — catalog update utility.
- `docs/STRATEGY.md` — product goals, planned features, and implementation strategy.

## Development commands

Run these commands from `web/`:

```text
pnpm dev             Start the development server
pnpm build           Create the production build
pnpm preview         Preview the production build
pnpm lint            Run the linter
pnpm format          Format the source
pnpm catalog:update  Update the bundled card catalog
```

## Disclaimer

MTG Fresh Cuts is an unofficial fan project. It is not affiliated with or endorsed by Wizards of the Coast or Scryfall. Magic: The Gathering and its related properties belong to Wizards of the Coast. Card information and imagery are provided through Scryfall.
