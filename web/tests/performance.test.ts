import { describe, expect, it } from 'vitest';
import { clearCardEffectCache, extractCardEffects } from '../src/synergy-engine/extract-effects';
import { buildEngineSignals } from '../src/synergy-engine/relationship-graph';
import { fixtureCard } from './fixtures';

describe('structured analysis performance', () => {
  it.each([100, 200, 500])('analyzes %i unique cards within the regression budget', (size) => {
    clearCardEffectCache();
    const cards = Array.from({ length: size }, (_, index) =>
      fixtureCard(`Card ${index}`, `Whenever a creature dies, create ${index + 1} Treasure tokens, then draw a card.`),
    );
    const started = performance.now();
    cards.forEach((card) => buildEngineSignals(extractCardEffects(card)));
    expect(performance.now() - started).toBeLessThan(1500);
  });

  it('returns the cached analysis for unchanged card data', () => {
    const card = fixtureCard('Cached', 'Create a Treasure token.');
    expect(extractCardEffects(card)).toBe(extractCardEffects(card));
  });
});
