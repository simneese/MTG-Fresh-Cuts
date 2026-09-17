# Synergy Scoring System — Implementation Strategy

## Purpose

This document is the implementation checklist for replacing the flat synergy-tag heuristic with an explainable, layered scoring system. It is intentionally separate from the general product strategy so individual engineering tasks can be checked off without losing the design rationale.

The finished system must answer four different questions without using one overloaded tag list:

1. **What does this card literally do?**
2. **Which game events and resources can it produce or consume?**
3. **Which deck engines does it enable, reward, or bridge?**
4. **How much should those relationships protect it from being cut?**

## Guiding rules

- Visible labels describe card text; inferred relationships stay in the background.
- Roles and themes remain separate.
- A shared word is not automatically a mechanical connection.
- A mechanical connection does not require identical wording.
- Unsupported incidental abilities never increase cut pressure.
- The strongest connections matter most; additional connections use diminishing returns.
- Engine membership is not immunity. Surplus and inefficient pieces can still be recommended as cuts.
- Every score must be reproducible from visible calculation details.
- Detection rules must be general language rules, not card-name exceptions.

## Target architecture

```text
Oracle text and card data
          ↓
Literal effect extraction
          ↓
Typed events, resources, conditions, and destinations
          ↓
Rules relationship graph
          ↓
Engine membership and enabler/payoff balance
          ↓
Theme fit + role fit + bounded protections
          ↓
Low Synergy and Overall cut scores
```

### Layer 1: literal effects

Literal effects closely match the card's wording and are suitable for display.

Examples:

- Creates Treasures
- Creature Sacrifice Trigger
- Sacrifice Outlet — Creature
- Token Leaves-the-Battlefield Trigger
- Creature Dies Trigger
- Forced Creature Sacrifice
- Returns Creature to Battlefield
- Grants Death Return
- Untaps Lands

### Layer 2: background signals

Signals describe events and resources passed between cards. They are normally not displayed as tags.

Examples:

- `creature-sacrificed`
- `creature-dies`
- `creature-ltb`
- `token-sacrificed`
- `token-ltb`
- `treasure-created`
- `artifact-created`
- `card-discarded`
- `card-drawn`
- `life-gained`
- `opponent-life-lost`

An effect can emit, listen for, consume, or transform signals.

### Layer 3: engine families

Engine families summarize related effects without exposing every implementation signal.

Initial families:

- Sacrifice
- Creature lifecycle
- Tokens
- Artifacts
- Treasure
- Clues
- Food
- Graveyard
- Lifegain
- Drain
- Combat damage
- Creature types
- Counters
- Spellslinger/cast triggers

### Layer 4: functional roles

Roles describe deck jobs and are scored separately from engine synergy.

- Land
- Mana ramp
- Card draw
- Removal
- Protection
- Recursion
- Tutor
- Board wipe
- Color fixing
- Cost reduction, contributing to Mana Ramp coverage

## Scoring model

### Theme cut pressure

```text
theme pressure = 1 − weighted strength of the card's best supported engines
```

- Use the strongest engine at full value.
- Use the second engine at 25%.
- Use the third engine at 10%.
- Ignore further engines for protection.
- Do not penalize unrelated keywords or incidental abilities.

### Engine balance

Each engine tracks enabler supply and payoff demand.

```text
enabler balance = min(1, payoff count × desired ratio ÷ enabler count)
payoff balance  = min(1, enabler count ÷ (payoff count × desired ratio))
```

The initial default is two enablers per payoff. Engine-specific ratios may replace this after testing.

A card that is both an enabler and payoff receives full balance credit before quality adjustments.

### Card quality within an engine

Quality considers only characteristics relevant to the effect being scored:

- Quantity produced or consumed
- Repeatability across turns
- Multiple uses in one turn
- Instant-speed availability
- Activation or mana cost
- Destination quality, such as battlefield recursion versus hand recursion
- Modal flexibility
- Scaling language such as “that much”

```text
relative efficiency = card effect quality ÷ average quality of comparable engine pieces
```

Inefficient cards on an oversupplied side of an engine should lose protection first.

### Role-fit pressure

Role targets remain independent from theme engines.

```text
role-fit pressure = raw role pressure ÷ relevant role quality modifier
```

Role modifiers do not create additional card slots; they only distinguish stronger and weaker cards after a role is sufficiently covered.

### Protection

Protections reduce Low Synergy by percentage rather than subtracting flat points.

- Engine protection: maximum 25%
- Commander protection: maximum 30%
- Efficiency protection: maximum 15%
- Combined protection: maximum 50%

```text
protected low synergy = base low synergy × (1 − combined protection)
```

Protection does not reduce Curve, Price, or Low Popularity scores.

## Implementation checklist

### Phase 0 — Preserve a comparison baseline (deferred by current product decision)

- [ ] Add a representative fixture deck for each major engine.
- [ ] Capture current card tags, roles, score components, and final scores as snapshots.
- [ ] Include known edge-case cards in fixtures.
- [ ] Add a developer switch that can compare legacy and new calculations during migration.
- [ ] Define acceptable score-delta thresholds before removing legacy behavior.

Acceptance criteria:

- A test run can show exactly which cards changed and why.
- No migration step requires relying only on visual inspection.

### Phase 1 — Define structured effect types

- [x] Create a dedicated synergy-engine module instead of continuing to grow `CutWorkspace.tsx`.
- [x] Define `CardEffect`, `EffectSubject`, `EffectEvent`, `EffectDirection`, `EffectTiming`, and `EffectQuantity` types.
- [x] Define typed zones: library, hand, battlefield, graveyard, exile, stack, command zone.
- [x] Define typed subjects: card, spell, permanent, creature, artifact, land, token, and named token types.
- [x] Define effect directions: emits, listens, consumes, creates, grants, transforms.
- [x] Preserve source evidence for every effect: text paragraph, matched phrase, and detector name.
- [x] Add a schema version so cached analysis can be invalidated safely.

Acceptance criteria:

- Every extracted effect can explain which text produced it.
- Effects can be serialized for tests and debugging.

### Phase 2 — Extract literal effects by ability paragraph

- [x] Strip reminder text before effect detection.
- [x] Keep newline-delimited abilities separate for timing analysis.
- [ ] Split modal instructions and quoted/granted abilities without leaking conditions between paragraphs.
- [x] Extract subject, action, quantity, destination, controller, and timing from each ability.
- [x] Detect triggered, activated, static, replacement, and spell effects separately.
- [x] Detect “only once each turn,” tap costs, sorcery-speed restrictions, and unrestricted activation.
- [x] Detect self-reference, “this creature,” “that card,” and named-card references.
- [x] Store exact front-facing labels independently from engine families.

Acceptance criteria:

- Mushroom Watchdogs keeps its sorcery-speed restriction attached to the correct ability.
- A continuous unrelated paragraph cannot make a one-shot producer repeatable.
- Granted abilities retain their internal trigger and result.

### Phase 3 — Build the rules relationship graph

- [x] Connect creature sacrifice to creature dies and creature LTB.
- [x] Connect token sacrifice to token LTB.
- [x] Connect destroy-creature effects to creature dies and creature LTB.
- [x] Connect exile/bounce creature effects to creature LTB without treating them as dies.
- [x] Connect token LTB listeners to relevant sacrifice and removal events.
- [x] Connect Treasure, Clue, Food, Blood, Map, Gold, Powerstone, and Incubator events to Artifact and Token parent types.
- [x] Connect investigate to Clue creation.
- [x] Connect creature-token creation to Token Count and Creature Count consumers.
- [x] Connect discard costs/effects to discard and graveyard payoffs.
- [x] Connect mill/surveil/self-mill to graveyard-resource payoffs without calling them recursion.
- [x] Connect life gain, opponent life loss, and paired drain conversions.
- [x] Connect cast, ETB, attack, combat-damage, dies, sacrifice, and LTB event families.
- [x] Model Overload as target-to-each expansion for the affected effect.
- [ ] Add graph tests proving invalid implications do not occur.

Acceptance criteria:

- Nadier's Nightblade connects to token sacrifice, token death, exile, and bounce enablers.
- Exile does not trigger Creature Dies.
- Treasure creation supports Artifact Count without inheriting reminder-text sacrifice effects.

### Phase 4 — Canonical engine families

- [x] Canonicalize sacrifice/death/LTB-related tags for engine-balance scoring.
- [x] Prevent related sacrifice tags from counting as several independent engines.
- [x] Add canonical count/resource engine identifiers.
- [x] Move all family definitions into a data-driven registry.
- [x] Define which signals qualify a card as an enabler, payoff, both, or neutral for each family.
- [x] Define engine-specific desired enabler/payoff ratios where the default 2:1 is inappropriate.
- [x] Distinguish creature-type membership from creature-type payoff functionality.
- [x] Prevent functional roles from becoming theme engines automatically.

Acceptance criteria:

- Sacrifice, Creature Sacrificed, Creature Dies, and LTB relationships form one connected engine rather than four protection sources.
- Ramp, Removal, and Protection role counts do not create theme synergy by themselves.

### Phase 5 — Engine balance and card efficiency

- [x] Count enablers and payoffs separately.
- [x] Reduce protection for cards on an oversupplied side.
- [x] Compare a card's effect modifier with comparable cards in the same engine position.
- [x] Support multiple engines with 100% / 25% / 10% diminishing returns.
- [x] Weight engine supply by effect quantity rather than card count alone.
- [x] Treat optional, conditional, and once-per-turn production distinctly.
- [x] Account for multiplayer quantities such as “each player” and “each opponent.”
- [x] Avoid counting the same ability twice through parent and child engine families.
- [x] Add configurable engine ratio and quality weights.

Acceptance criteria:

- An inefficient 15th sacrifice outlet receives less protection than a repeatable low-cost outlet.
- A unique payoff with abundant enablers remains protected.
- Three aliases for one sacrifice interaction cannot create three-engine protection.

### Phase 6 — Roles and theme-driven role targets

- [x] Keep roles separate from themes in scoring and presentation.
- [x] Apply role quality to role-fit pressure rather than adding virtual role slots.
- [x] Include Counterspell in Protection and Cost Reduction in Mana Ramp.
- [x] Treat lands as the Land role rather than generic ramp.
- [x] Move role definitions and targets into a dedicated registry.
- [x] Replace hard-coded theme adjustments with declared theme-to-role relationships.
- [x] Define bounded adjustments for sacrifice/graveyard themes increasing Recursion demand.
- [x] Define X-spell and high-curve demand increasing Mana Ramp demand.
- [x] Add role-specific comparability groups for future card-versus-card decisions.

Acceptance criteria:

- A deck can have enough ramp while an efficient ramp card still scores better than an inefficient one.
- Self-recurring sacrifice fodder is valued for its engine interaction, not merely its Recursion role.

### Phase 7 — Commander relationships

- [x] Represent commander connections as graph paths rather than shared tag names.
- [x] Give direct commander producer/payoff relationships more weight than incidental shared abilities.
- [x] Scale tribal membership by actual tribal payoff support.
- [x] Separate “protects the commander” from “shares a theme with the commander.”
- [x] Prevent commander protection from exceeding its 30% cap.
- [x] Show the strongest commander connection and its evidence.

Acceptance criteria:

- Swarmyard recognizes an Insect commander protection relationship.
- A vanilla creature sharing only the commander's creature type receives little protection unless tribal payoffs exist.

### Phase 8 — User-facing tag cleanup

- [x] Hide generic Sacrifice when a specific sacrificed-type effect is available.
- [x] Hide redundant Artifact/Token count labels when a named token label is available.
- [x] Hide generic Artifact/Token sacrifice labels when a named-token sacrifice label is available.
- [x] Replace raw internal tags with literal effect labels in card previews.
- [x] Show no more than the most important three or four effects by default.
- [x] Keep Roles in a separate section.
- [x] Group the synergy browser by engine family, then show specific effects within the preview.
- [x] Add an expandable “Why this connects” view for inferred graph paths.
- [x] Ensure ignored and boosted settings target stable engine IDs rather than display strings.
- [x] Migrate saved ignored/boosted tag preferences.

Acceptance criteria:

- A Treasure producer does not display Artifact Count, Token Count, Treasure Count, and several sacrifice aliases simultaneously.
- Users can still inspect every inferred connection when requested.

### Phase 9 — Calculation explanations

- [x] Show engine balance in the Low Synergy explanation.
- [x] Show direct effect-connection counts.
- [x] Show percentage-based protections and the combined cap.
- [x] Show the top contributing interaction paths with card examples.
- [x] Show enabler supply, payoff demand, desired ratio, and card-side efficiency separately.
- [x] Explain why a surplus card lost protection.
- [x] Explain when an interaction was inferred rather than literally printed.
- [x] Keep the default popup concise and place technical detail behind expansion.

Acceptance criteria:

- A user can reproduce the displayed Low Synergy result from the popup.
- The explanation identifies both the strongest protection and the strongest cut pressure.

### Phase 10 — Performance and caching

- [x] Cache raw synergy-tag extraction per card.
- [x] Defer deck-wide rescoring so the next-card preview updates first.
- [ ] Cache structured effect extraction by card-data version.
- [ ] Pre-index cards by signal, engine family, and role.
- [ ] Precompute peer quality averages once per deck rather than inside every card loop.
- [ ] Recompute only curve-dependent fields after a cut when engine membership is unchanged.
- [ ] Move heavy preparation to a Web Worker if indexed calculations remain perceptible.
- [ ] Add timing instrumentation for import, Make Cuts preparation, and each decision.

Acceptance criteria:

- Advancing after Keep/Cut feels immediate on a 100-card deck.
- A single cut does not repeat full Oracle-text parsing for every peer comparison.

### Phase 11 — Regression suite

- [ ] Add unit tests for every effect extractor.
- [ ] Add graph implication tests.
- [ ] Add negative tests for reminder text and unrelated paragraphs.
- [ ] Add score snapshots for representative decks.
- [ ] Add UI tests for theme/role separation and overflow menus.
- [ ] Add performance tests for 100-, 200-, and 500-card inputs.
- [ ] Require a regression test for every corrected card edge case.

Required named fixtures:

- [ ] Fumulus, the Infestation — watches creature sacrifice
- [ ] Blood Artist — target-player drain wording
- [ ] Nadier's Nightblade — token LTB payoff
- [ ] Tangletrove Kelp — Clue payoff and self-sacrifice relationships
- [ ] Inspiring Statuary — Improvise and Artifact Count
- [ ] Rise and Shine — Overload expansion
- [ ] Wilderness Reclamation — repeatable land-untap ramp
- [ ] Brood of Cockroaches — delayed recursion without intra-turn repeatability
- [ ] Gravecrawler — repeatable graveyard casting
- [ ] Mushroom Watchdogs — sorcery-speed restriction
- [ ] Gingerbread Cabin — reminder text must not tag the land as sacrificed
- [ ] Swarmyard — commander-type protection utility

### Phase 12 — Legacy removal and tuning

- [ ] Run new and legacy scoring side by side on all fixtures.
- [ ] Review the largest score changes manually.
- [ ] Tune weights using deck-level outcomes, not individual-card exceptions.
- [ ] Remove obsolete tag aliases from scoring.
- [ ] Remove obsolete parsing branches after equivalent structured detectors are tested.
- [ ] Increment the analysis schema version and invalidate stale cached analysis.
- [ ] Document the final formula in product-facing help text.

Acceptance criteria:

- No production score depends on the legacy flat-tag matcher.
- All user-facing labels originate from literal effects or stable engine/role registries.

## Definition of done

The migration is complete when:

- [ ] Literal effects, inferred signals, engine families, and roles are separate data structures.
- [ ] All synergy scoring uses graph relationships rather than shared display strings.
- [ ] Engine supply, payoff demand, efficiency, commander relevance, and role fit are independently visible.
- [ ] Redundant internal aliases cannot multiply engine protection.
- [ ] The card preview remains concise while detailed reasoning remains accessible.
- [ ] All named fixtures and negative cases pass.
- [ ] Make Cuts remains responsive during decisions.
- [ ] Legacy flat-tag scoring has been removed.

## Change log

- 2026-09-16: Created the implementation checklist.
- 2026-09-16: Marked completed groundwork for percentage protections, engine balance, diminishing-return multi-engine protection, initial lifecycle signals, tag condensation, tag caching, and deferred rescoring.
- 2026-09-16: Deferred Phase 0 and began Phase 1. Added the dedicated synergy-engine module, schema version, serializable analysis contract, typed subjects, events, directions, timing, quantities, zones, and signal serialization helpers. Existing lifecycle signals now consume the shared engine type.
- 2026-09-16: Began Phase 2. Added paragraph-scoped, reminder-text-free structured extraction with evidence offsets, literal labels, subject/controller/quantity/destination parsing, ability-kind and timing classification, self-reference, and initial sacrifice, dies, LTB, token creation, draw, discard, recursion, granted death-return, removal, counterspell, tutor, life-gain, and life-loss detectors. Wired extracted lifecycle effects into live engine signals while retaining legacy scoring compatibility.
- 2026-09-16: Began Phase 3. Added a data-driven relationship graph with transitive event expansion, parent token/artifact relationships, investigate-to-Clue creation, count-growth signals, graveyard stocking from discard/mill/surveil, graveyard consumer links, life-gain/loss listeners, cast/ETB/attack/combat event extraction, lifecycle implications, and Overload multi-target signals. Live engine connections now merge the graph output with legacy compatibility signals.
- 2026-09-16: Completed Phase 4. Added the engine registry with stable IDs, labels, legacy aliases, enabler/payoff signal declarations, engine-specific desired ratios, dynamic typal definitions that require functional payoffs, and an explicit role-tag boundary. Live engine balance now consumes registry participation and ratios instead of hard-coded family rules.
- 2026-09-16: Completed Phase 5. Engine supply and demand now use structured effect quantities, repeatability, multiple-use availability, optional/conditional/once-per-turn discounts, and multiplayer scaling. Added configurable scoring weights and parent-engine declarations to prevent named token effects from receiving duplicate Artifact/Token engine credit.
- 2026-09-16: Completed Phase 6. Added the role registry with base targets, quality tags, comparison groups, declared theme drivers, bounded target adjustments, and explanation reasons. Replaced hard-coded Recursion and Mana Ramp branches in the live scorer with registry-calculated targets.
- 2026-09-16: Completed Phase 7. Commander protection now prioritizes direct graph paths, separately recognizes functional commander protection, retains recurring sacrifice-fodder support, and treats shared themes as a weaker fallback. Typal overlap still requires complementary tribal functionality. The Low Synergy explanation now identifies the strongest commander connection, path details, and matched evidence while retaining the 30% commander cap.
