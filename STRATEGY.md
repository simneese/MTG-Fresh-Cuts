# MTG Fresh Cuts — Product Strategy

## 1. Product vision

MTG Fresh Cuts is a web-based deck analysis tool for Magic: The Gathering players. A player pastes a deck list, selects a format, and receives a clear view of the deck's structure, mana profile, themes, and likely candidates for removal or addition.

The product should help players make informed decisions rather than present its recommendations as objectively correct. Every score or suggested cut should include a concise explanation of the factors that produced it.

## 2. Primary goals

1. Make importing and reviewing a deck fast and approachable.
2. Identify whether the deck meets its format's card-count requirements.
3. Present useful structural information such as card types, mana curve, mana sources, and casting-color demand.
4. Estimate card synergy using repeatable, explainable rules.
5. Help players create a shortlist of potential cuts without automatically changing their deck.
6. Minimize traffic to Scryfall through batching, caching, and responsible request handling.
7. Establish a foundation that can later support semantic comparison of cards with similar effects.

## 3. Guiding principles

- **Explain recommendations:** Show why a card received a score or appeared as a cut candidate.
- **Keep players in control:** Suggestions are advisory; players choose which changes to make.
- **Load useful results quickly:** Display cached information immediately when possible.
- **Avoid false precision:** Label heuristic synergy scores as estimates.
- **Respect Scryfall:** Cache data, batch lookups, throttle requests, and stop on rate-limit responses.
- **Build incrementally:** Validate basic deck analysis before implementing semantic or AI-assisted comparisons.

## 4. Target user flow

1. The player pastes a deck list into a text area.
2. The player selects a supported format.
3. The application parses quantities, card names, and optional printing information.
4. If the format is Commander, the player selects the commander from eligible cards in the list.
5. Cached card records load immediately.
6. Missing or expired records are fetched from Scryfall in controlled batches.
7. The application displays deck-count status and analysis results.
8. The player groups or sorts the deck to explore it.
9. The player opens **Make Cuts**, selects a method, and reviews explained candidates.
10. The player marks cuts, reverses decisions, or exports the revised list.

## 5. MVP scope

### 5.1 Deck import

- Accept common lines such as `1 Sol Ring`, `1x Sol Ring`, and `Sol Ring`.
- Ignore blank lines and recognize common section headings where practical.
- Preserve quantities.
- Normalize names without losing the user's original input.
- Report lines that could not be parsed or matched.
- Prevent duplicate network lookups for repeated cards.

### 5.2 Format selection and deck size

Initial formats:

- Commander: exactly 100 cards including the commander.
- Standard: minimum 60 cards in the main deck.
- Modern: minimum 60 cards in the main deck.
- Custom: user-defined target or minimum.

The interface must show:

- Current main-deck card count.
- Target or minimum count.
- Number of cards to add or cut.
- A clear valid, under-count, or over-count state.

Format legality, sideboard rules, companions, banned lists, and card-copy limits may be added after the core workflow is validated.

### 5.3 Commander selection

- Prompt for a commander when Commander is selected.
- Show only cards that appear eligible based on available card data.
- Support partner/background-style commander combinations in a later iteration unless they are inexpensive to include safely in the MVP.
- Use commander color identity and keywords as inputs to analysis.

### 5.4 Deck browser

- Display card name, quantity, type, mana cost, mana value, and synergy estimate.
- Offer an optional compact card preview.
- Group cards by primary type:
  - Creature
  - Artifact
  - Instant
  - Sorcery
  - Enchantment
  - Land
  - Planeswalker
  - Battle
  - Other
- Sort by:
  - Name
  - Mana value
  - Synergy estimate
- Handle multi-type and double-faced cards consistently with documented rules.

### 5.5 Mana analysis

- Display the nonland spell mana curve by mana value.
- Compare the deck's curve with a bell-curve-like target distribution centered around mana value 2 or 3.
- Show the target curve and the deck's actual curve together so overrepresented and underrepresented mana-value bands are visible.
- Provide a clear rule for variable costs such as `X`.
- Calculate the percentage of colored mana available from mana-producing cards.
- Calculate the percentage of colored symbols present in spell casting costs.
- Treat colorless and generic mana separately.
- Explain limitations involving conditional, choice-based, treasure-producing, or text-defined mana sources.

The target curve is a recommendation rather than a universal rule. Its exact center and spread should be configurable so future versions can account for format, commander, archetype, ramp density, and other deck-building considerations. The MVP may begin with a documented general-purpose curve centered between mana values 2 and 3.

### 5.6 Initial synergy estimate

The MVP synergy model is a transparent heuristic based on structured card data and Oracle text. It should consider:

- Official keyword abilities shared with the commander.
- Mechanically meaningful terms or themes shared with the commander.
- Keywords and themes that recur across several cards in the deck.
- Commander color-identity compatibility.
- The rarity of a keyword or theme within the deck.

An initial conceptual formula is:

```text
synergy estimate =
  commander keyword overlap × high weight
  + recurring deck keyword frequency × medium weight
  + commander theme overlap × medium weight
  + supporting color-identity factors
```

Important safeguards:

- Do not penalize essential lands and general-purpose mana sources using the same scale as spells.
- Do not describe the score as an objective measure of card quality.
- Show a short explanation such as “Shares Flying with the commander and 11 other cards.”
- Keep scoring weights configurable so they can be tuned from playtesting feedback.

### 5.7 Make Cuts

The MVP should generate candidates using:

- Deviation from the recommended mana curve.
- Selected card type.
- Lowest synergy estimate.

Mana-curve recommendations must not simply rank cards from highest to lowest mana value. The application should:

1. Compare the number or percentage of spells in each mana-value bucket with the recommended bell-curve-like distribution.
2. Identify buckets that contain more cards than the target curve recommends.
3. Suggest potential cuts from those overrepresented buckets.
4. Avoid suggesting cuts from buckets that are already at or below the target merely because those spells have a high mana value.
5. Explain each suggestion, for example: “Your mana value 4 slot is three cards above the recommended curve.”

When several cards occupy an overrepresented bucket, the application may use low synergy or another player-selected secondary sort to rank candidates within that bucket. Lands should be excluded from the spell curve, and variable or unusual mana costs must follow the documented mana-curve rules.

The player must be able to:

- Choose a desired number of cuts.
- Combine or change filters.
- See why each card was suggested.
- Protect or lock cards from suggestions.
- Select, deselect, and undo cuts.
- Review the resulting count before exporting.

Comparing cards that perform similar functions is deferred until a reliable semantic model is designed and tested.

### 5.8 Local persistence

- Store cached card records in IndexedDB.
- Store saved decks and user preferences in IndexedDB or local storage.
- Reference shared cached card records from saved decks rather than duplicating full card objects in every deck.
- Do not use cookies for card data; cookies are too small and add unnecessary request overhead.
- Allow users to clear saved decks and cached data.
- Make it clear that browser-stored decks remain on the current device unless a future account feature is introduced.

## 6. Scryfall integration rules

The implementation must follow current Scryfall documentation and re-check it before release.

### Required behavior

- Use HTTPS endpoints.
- Send a descriptive application `User-Agent` and an appropriate `Accept` header from the development catalog builder or any future server-side integration. Browser fallback requests use the browser-controlled user agent and an explicit `Accept` header.
- Route requests through one controlled queue.
- Maintain at least 100 milliseconds between Scryfall API requests and remain below 10 requests per second.
- Never send parallel requests to Scryfall.
- Use the card collection endpoint for batch resolution, with no more than 75 identifiers per request.
- Look up only records missing from the cache or due for refresh.
- Cache downloaded card data for at least 24 hours.
- Stop and back off when Scryfall returns HTTP 429; do not attempt to power through the limit.
- Avoid redundant searches and per-card calls when a batch or bulk-data workflow is appropriate.
- Consider Scryfall bulk data if the product begins performing database-scale operations.
- Preserve card and artist attribution when displaying Scryfall imagery.

### Cache design

Use layered card data in the static application:

1. **Bundled catalog:** A committed JSON file provides known cards without a network request. A development script updates this file from Scryfall in controlled batches.
2. **Browser cache:** IndexedDB gives the player fast repeat loads and prevents repeat requests from that device.
3. **Browser fallback:** Only cards absent from both layers are requested from Scryfall in sequential batches. Browser JavaScript cannot set an application-specific `User-Agent`, so expanding the bundled catalog is preferred.
4. **Optional future shared cache:** A separate edge function may later provide shared caching and centrally enforced request headers, throttling, and backoff without changing the static frontend.

A temporary server file is not a durable production cache and should not be relied on in serverless hosting. Card images should normally remain on Scryfall's image CDN and use standard HTTP/browser caching rather than being copied into the application cache.

### Proposed card-cache record

```text
cache key: Scryfall card ID or normalized card identifier
fields:
  card data needed for analysis
  Scryfall URI and image references
  fetched timestamp
  schema version
```

The application may return stale cached data immediately while scheduling a controlled refresh. Data that affects legality or time-sensitive values should use a shorter refresh policy than stable Oracle text.

## 7. Technical direction

### MVP architecture

- Responsive static single-page web application built as HTML, CSS, and JavaScript assets.
- Client-side deck parsing, grouping, sorting, charts, and analysis.
- Bundled card catalog generated by a reusable, Scryfall-compliant development script.
- Sequential browser fallback for cards missing from the bundled catalog and browser cache.
- Browser IndexedDB for card and deck persistence.
- No user account or permanent cloud deck storage in the MVP.
- No card-price dependency in the initial analysis.

### Suggested internal modules

- Deck-list parser and normalizer.
- Format rules and count validator.
- Card-data repository with bundled-catalog and browser-cache adapters.
- Scryfall request queue and batch resolver.
- Card type classifier.
- Mana-symbol parser.
- Mana-source analyzer.
- Keyword and theme extractor.
- Synergy scoring engine.
- Cut-candidate engine.
- Saved-deck repository.

Business logic should be separated from interface components so it can be tested independently.

## 8. Delivery phases

### Phase 0 — Product foundation

- Establish application structure and visual direction.
- Define the normalized deck and card models.
- Implement the deck-list parser with unit tests.
- Implement format count rules.
- Create fixture card data so interface work does not depend on live API calls.

### Phase 1 — First testable MVP

- Paste and parse a deck.
- Select format and commander.
- Resolve cards through the cache-aware Scryfall layer.
- Show count status.
- Display and group the deck.
- Sort by name and mana value.
- Save and reload decks locally.
- Provide useful loading, partial-success, unmatched-card, offline, and rate-limit states.

### Phase 2 — Mana analysis

- Mana curve chart.
- Bell-curve-like target distribution centered around mana value 2 or 3.
- Actual-versus-target curve comparison and per-bucket deviation calculations.
- Spell color-demand chart.
- Mana-source color chart.
- Explanations and known limitations.
- Tests for hybrid, Phyrexian, split, adventure, transform, and `X` costs.

### Phase 3 — Explainable synergy

- Keyword extraction.
- Commander overlap.
- Deck-wide frequency analysis.
- Configurable scoring weights.
- Per-card explanations.
- Sorting by synergy estimate.

### Phase 4 — Make Cuts MVP

- Cut candidates based on overrepresented mana-curve buckets, type, and low synergy.
- Candidate explanations that identify the relevant actual-versus-target curve deviation.
- Protected-card controls.
- Desired cut count.
- Review, undo, and export flow.

### Phase 5 — Advanced recommendations

- Compare cards with similar effects or deck roles.
- Identify categories such as ramp, removal, card draw, protection, and board wipes.
- Detect redundancy and missing deck functions.
- Evaluate whether semantic embeddings, curated rules, external tags, or a hybrid approach provide sufficiently reliable explanations.

### Phase 6 — Expanded product features

- Format legality and banned-list checks.
- Sideboards, companions, and advanced Commander combinations.
- Import/export integrations.
- Shareable decks or user accounts.
- Optional price and collection information.
- Advanced mana-base and land recommendations.

## 9. MVP acceptance criteria

The MVP is ready for player testing when:

- A typical 60-card or 100-card pasted list parses without manual cleanup.
- Unmatched or ambiguous cards are clearly identified and can be corrected.
- Commander selection works for a normal single-commander deck.
- The displayed deck count and add/cut message are correct.
- Cards can be grouped by type and sorted by name or mana value.
- Cached cards do not trigger another Scryfall request within the cache lifetime.
- An uncached Commander deck is resolved using controlled batches rather than one request per card.
- Scryfall requests are sequential and correctly throttled.
- HTTP 429 produces a helpful paused state rather than an aggressive retry loop.
- A deck can be saved locally, closed, and reopened on the same device.
- The interface is usable on desktop and mobile widths.
- Core parser, count, mana-symbol, caching, and request-queue behavior has automated tests.

## 10. Testing strategy

### Automated tests

- Deck-line formats, quantities, headings, comments, and malformed input.
- Duplicate names and alternate printings.
- Format count calculations.
- Commander-inclusive counts.
- Card type classification.
- Mana-value buckets and variable costs.
- Target mana-curve generation and per-bucket deviation calculations.
- Mana-curve cut candidates originate only from overrepresented buckets.
- Colored pip counting, including hybrid and Phyrexian symbols.
- Mana-source detection edge cases.
- Cache hits, misses, expiration, and schema changes.
- Batch sizes, request spacing, and 429 handling.
- Deterministic synergy and cut-candidate scoring.

All network tests should use mocked Scryfall responses. Live Scryfall calls should be limited to a small, explicit smoke test rather than run during routine development.

### Player testing questions

- Did the importer understand the player's existing deck-list format?
- Was the count status immediately clear?
- Were mana charts understandable without explanation?
- Did synergy explanations feel plausible and transparent?
- Did suggested cuts provide a useful starting point?
- Which cards were obviously misclassified or poorly scored?
- Would the player trust the tool enough to use it while editing a real deck?

## 11. Known risks

- Oracle text is complex and cannot be fully understood through simple keyword matching.
- Mana sources can be conditional or depend on choices, other cards, or game state.
- Multi-faced cards and unusual layouts complicate type and mana analysis.
- Commander color identity does not by itself measure synergy.
- A popular public app needs a shared cache and carefully enforced request limits.
- Browser-only saved decks can be lost when site data is cleared.
- Recommendation scores may appear more authoritative than they are unless explanations and limitations remain visible.

## 12. Success measures

Early success should be measured by product usefulness rather than traffic:

- Percentage of pasted decks imported without correction.
- Time from paste to first useful analysis.
- Cache hit rate and Scryfall requests per loaded deck.
- Percentage of users who interact with grouping, sorting, or mana analysis.
- Percentage of users who open Make Cuts and select at least one candidate.
- Player ratings of recommendation usefulness and explanation clarity.
- Frequency and categories of incorrect card analysis reported during testing.

## 13. Immediate next step

Build Phase 0 and the smallest portion of Phase 1 using fixture card data first. The first working slice should let a player paste a deck, choose a format, see parsed cards, and understand the deck-count status. Add the cache-aware Scryfall resolver only after the parser and normalized data model are covered by tests.
