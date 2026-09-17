import { describe, expect, it } from 'vitest';
import { extractCardEffects } from '../src/synergy-engine/extract-effects';
import { fixtureCard } from './fixtures';

describe('negative extraction cases', () => {
  it('does not treat reminder text on a created Food as the source card sacrificing itself', () => {
    const effects = extractCardEffects(
      fixtureCard(
        'Gingerbread Cabin',
        'When Gingerbread Cabin enters, create a Food token. (It’s an artifact with “{2}, {T}, Sacrifice this artifact: You gain 3 life.”)',
        'Land — Forest',
      ),
    );
    expect(effects.some((effect) => effect.event === 'sacrificed')).toBe(false);
    expect(effects.some((effect) => effect.label === 'Creates Food')).toBe(true);
  });

  it('does not leak a continuous paragraph into a one-shot producer', () => {
    const effects = extractCardEffects(
      fixtureCard('Paragraphs', 'Create a Treasure token.\nCreatures you control get +1/+1.'),
    );
    const treasure = effects.find((effect) => effect.label === 'Creates Treasure');
    expect(treasure?.timing.repeatable).toBe(false);
  });

  it('keeps sorcery-speed restriction with its activated paragraph', () => {
    const effects = extractCardEffects(
      fixtureCard('Mushroom Watchdogs', '{1}, Sacrifice a Food: Draw a card. Activate only as a sorcery.'),
    );
    const sacrifice = effects.find((effect) => effect.event === 'sacrificed');
    expect(sacrifice?.timing.sorcerySpeedOnly).toBe(true);
    expect(sacrifice?.timing.instantSpeed).toBe(false);
  });
});
