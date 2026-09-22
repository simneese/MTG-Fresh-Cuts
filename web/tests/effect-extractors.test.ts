import { describe, expect, it } from 'vitest';
import { extractCardEffects } from '../src/synergy-engine/extract-effects';
import { fixtureCard } from './fixtures';

const detectorCases = [
  ['sacrifice-effect', 'Sacrifice a creature: Draw a card.'],
  ['dies-trigger', 'Whenever another creature dies, draw a card.'],
  ['typal-conditional-bonus', 'If equipped creature is a Vampire, put two counters on it instead.'],
  ['typal-group-bonus', 'Other Vampires you control get +1/+1.'],
  ['typal-event-payoff', 'Whenever another Vampire dies, draw a card.'],
  ['named-token-payoff', 'Other Clues you control become creatures.'],
  ['improvise', 'Nonartifact spells you cast have improvise.'],
  ['overload-target', 'Target artifact becomes a creature. Overload {4}{U}{U}.'],
  ['ltb-trigger', 'Whenever a token leaves the battlefield, draw a card.'],
  ['token-create', 'Create two Treasure tokens.'],
  ['untap-lands', 'Untap all lands you control.'],
  ['regeneration-protection', 'Regenerate target Insect.'],
  ['draw', 'Draw two cards.'],
  ['discard', 'Discard a card.'],
  ['recursion', 'Return target creature card from your graveyard to the battlefield.'],
  ['grants-death-return', 'Target creature gains “When this creature dies, return it to the battlefield.”'],
  ['removal', 'Destroy all creatures.'],
  ['counterspell', 'Counter target spell.'],
  ['tutor', 'Search your library for a card, put it into your hand, then shuffle.'],
  ['life-gain', 'You gain 2 life.'],
  ['life-loss', 'Each opponent loses 2 life.'],
  ['life-gain-trigger', 'Whenever you gain life, draw a card.'],
  ['life-loss-trigger', 'Whenever an opponent loses life, draw a card.'],
  ['investigate', 'Investigate.'],
  ['mill', 'Target player mills three cards.'],
  ['surveil', 'Surveil 2.'],
  ['cast-event', 'Whenever you cast an artifact spell, draw a card.'],
  ['etb-event', 'Whenever a creature enters the battlefield, draw a card.'],
  ['attack-event', 'Whenever this creature attacks, draw a card.'],
  ['combat-damage-event', 'Whenever this creature deals combat damage, draw a card.'],
] as const;

describe('literal effect extractors', () => {
  it.each(detectorCases)('extracts %s', (detectorId, text) => {
    const effects = extractCardEffects(fixtureCard(detectorId, text));
    expect(effects.some((effect) => effect.evidence[0].detectorId === detectorId)).toBe(true);
  });

  it('keeps evidence and timing on every extracted effect', () => {
    const effects = extractCardEffects(
      fixtureCard('Evidence', 'Whenever a creature dies, you gain 1 life.'),
    );
    expect(effects.length).toBeGreaterThan(0);
    effects.forEach((effect) => {
      expect(effect.evidence[0].paragraphText).toBeTruthy();
      expect(effect.evidence[0].matchedText).toBeTruthy();
      expect(effect.timing.abilityKind).toBeTruthy();
    });
  });
});
