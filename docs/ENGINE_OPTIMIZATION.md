# Engine optimization comparison protocol

This process converts card comparisons into explainable, reusable scoring regressions without hard-coding individual card names.

## Comparison lifecycle

1. **Submit a pair.** Name two cards in the currently loaded deck whose relative cut scores appear wrong. Do not initially prescribe a formula change.
2. **Capture the live report.** In **Make cuts → Engine optimization lab**, select both cards and copy the diagnostic report. It records every score category, effect, theme, role, and protection rate using the deck after selected cuts.
3. **Make an independent judgment.** Before changing code, determine which card should normally be retained in this deck and explain why: role scarcity, efficiency, engine participation, commander interaction, flexibility, reliability, and opportunity cost.
4. **Confirm the premise.** The user confirms that judgment or supplies missing deck-building intent. No formula changes before agreement.
5. **Classify the mismatch.** Use one or more categories:
   - missing or incorrect Oracle-text extraction;
   - incorrect enabler/payoff/support relationship;
   - missing role or removal coverage;
   - incorrect quantity, repeatability, flexibility, or efficiency weighting;
   - engine-balance or commander-protection error;
   - curve, popularity, price, or overall-weighting error;
   - a preference that belongs in manual theme controls rather than global logic.
6. **Fix the general rule.** Change reusable language, graph, or scoring logic. Card names may appear in tests but never as production scoring exceptions.
7. **Add a regression.** Preserve the confirmed behavior with an extraction, relationship, named-card, representative-deck, or pairwise-ordering test.
8. **Check collateral behavior.** Run all tests and inspect related cards so improving one archetype does not distort unrelated decks.

## Required comparison record

Each confirmed case retains the deck and commander, both cards and their relevant Oracle text, the expected ordering, the agreed reason, scores before and after, the diagnosed failure category, the general rule changed, and the regression test.

## Interpretation rule

A lower cut score means greater protection. A comparison passes when the expected card has a meaningfully lower cut score, not merely a rounding difference. The default regression margin is five points unless the confirmed case calls for another threshold.
