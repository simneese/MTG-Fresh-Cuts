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

## Confirmed comparisons

### Sophia, Dogged Detective: Tangletrove Kelp vs. Sea Gate Restoration

- **Expected ordering:** Tangletrove Kelp should be more protected.
- **Agreed reason:** Tangletrove is a commander-fed Clue payoff and potential win condition; Sea Gate is powerful and flexible but generic.
- **Original result:** 34–34 tie.
- **Diagnosis:** Engine protection was confined to the low-synergy subscore, so a maximum 25% engine rate had little influence on the weighted overall result. Sea Gate's legitimate MDFC role flexibility erased that small difference.
- **General correction:** Standard engine, efficiency, and indirect-commander protection now reduces the combined overall cut score. Manual theme boosting remains specific to the synergy input.
- **Regression:** The captured comparison inputs must protect Tangletrove by at least five points. The corrected model produces approximately 27 versus 34.

### Sophia, Dogged Detective: Officious Interrogation vs. Mushroom Watchdogs

- **Expected ordering:** Officious Interrogation should be more protected.
- **Agreed reason:** Officious Interrogation is a cheap, scalable Clue producer that directly feeds Sophia's Clue-count, Clue-sacrifice, and Clue-animation plan. Mushroom Watchdogs is a narrower Food outlet and Dog/+1/+1-counter card whose activated ability overlaps with Sophia's stronger team-wide outlet.
- **Original result:** 32–32 tie.
- **Diagnosis:** A card that creates an intrinsically sacrificial resource contributed support units to related engines globally, but those support relationships were not included among that card's own engine families. Scalable engine contribution quality also affected only engine balance, while the separate efficiency protection considered functional roles only.
- **General correction:** Active-engine support now counts as participation for the supporting card, remains visibly classified as support rather than a direct enabler/payoff, and can earn engine-efficiency protection when its contribution is stronger than comparable cards. Supply balance still limits both protections.
- **Regression:** Officious Interrogation's scalable Investigate effect must directly enable Clue Count and register support for both Clue Sacrifice and Clue Animation.

### Sophia, Dogged Detective: Rise and Shine vs. Follow the Bodies

- **Expected ordering:** Rise and Shine should be meaningfully more protected.
- **Agreed reason:** Rise and Shine converts the deck's accumulated Clues and other artifacts into a permanent, potentially game-ending army. Follow the Bodies is a valuable but conditional scalable producer that supplies more resources rather than serving as the payoff.
- **Original result:** Follow the Bodies was more protected, 33 versus 34.
- **Diagnosis:** Overload produced a multi-effect graph signal but left the extracted animation quantity at one, so engine quality valued animating every artifact like animating one. Parent-to-child specialization then discarded that quantity, and the generic top-three/prevalence path could exclude the functional Clue Animation payoff entirely.
- **General correction:** A targeted effect with Overload now receives an unbounded multi-object quantity with a conservative expected value of three, including through parent-to-child specialization. A functional payoff's balanced engine contribution directly establishes its engine protection; prevalence, graph connectivity, and the top-three display aggregation cannot re-penalize it after supply balance has confirmed support.
- **Regression:** Rise and Shine's animation effect must retain both Target and Overload conditions, an expected quantity of three, and unbounded scaling.

### Sophia, Dogged Detective: Academy Manufactor vs. Armed with Proof

- **Expected ordering:** Academy Manufactor should be meaningfully more protected.
- **Agreed reason:** Academy Manufactor persistently turns every Clue, Food, or Treasure event into all three resources, multiplying the output of Sophia and every other relevant producer. Armed with Proof is useful but narrower: it investigates twice once and gives Clues a mana-intensive combat use.
- **Original result:** 33–33 tie.
- **Diagnosis:** The generic token detector retained only the first named output of a bundled replacement effect, and replacement abilities were treated as non-repeatable. Engine quality then compared only the strongest single output, so it did not value the breadth of a persistent three-resource multiplier.
- **General correction:** Bundled “one of each” replacement effects now emit one structured effect for every named token, persistent replacement effects are repeatable and multi-use, and contribution quality receives bounded credit for distinct replacement outputs.
- **Corrected result:** Academy Manufactor scores 28 versus Armed with Proof at 33.
- **Regression:** Academy Manufactor must expose separate Clue, Food, and Treasure outputs, each with persistent replacement timing and one-per-application quantity.
