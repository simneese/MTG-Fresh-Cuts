import { describe, expect, it } from 'vitest';
import { extractCardEffects } from '../src/synergy-engine/extract-effects';
import { fixtureCard } from './fixtures';

const detectorCases = [
  ['sacrifice-effect', 'Sacrifice a creature: Draw a card.'],
  ['dies-trigger', 'Whenever another creature dies, draw a card.'],
  ['gravestorm', 'Gravestorm'],
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
  ['graveyard-control', "Put up to one target card from a graveyard on the bottom of its owner's library."],
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

  it('does not reinterpret a creature-cast trigger as an ETB trigger', () => {
    const effects = extractCardEffects(
      fixtureCard(
        'Cast trigger with entry instructions',
        'Whenever you cast a creature spell, it enters the battlefield with an additional +1/+1 counter on it.',
      ),
    );
    const detectorIds = effects.map((effect) => effect.evidence[0].detectorId);

    expect(detectorIds).toContain('cast-event');
    expect(detectorIds).not.toContain('etb-event');
  });

  it.each([
    ['Draw X cards.', 'draw'],
    ['Create X Treasure tokens.', 'token-create'],
    ['Target opponent discards X cards.', 'discard'],
    ['Sacrifice X creatures: Draw a card.', 'sacrifice-effect'],
  ])('gives scalable quantity credit to %s', (text, detectorId) => {
    const effect = extractCardEffects(fixtureCard(text, text)).find(
      (candidate) => candidate.evidence[0].detectorId === detectorId,
    );

    expect(effect).toMatchObject({
      quantity: {
        minimum: 0,
        expected: 4,
        unbounded: true,
      },
    });
  });

  it('extracts the literal effects from Case of the Gateway Express', () => {
    const effects = extractCardEffects(
      fixtureCard(
        'Case of the Gateway Express',
        "When this Case enters, choose target creature you don't control. Each creature you control deals 1 damage to that creature.\nTo solve — Three or more creatures attacked this turn.\nSolved — Creatures you control get +1/+0.",
        'Enchantment — Case',
      ),
    );
    const detectorIds = effects.map((effect) => effect.evidence[0].detectorId);

    expect(detectorIds).toEqual(
      expect.arrayContaining([
        'self-etb-event',
        'damage-removal',
        'attack-threshold',
        'creature-anthem',
      ]),
    );
  });

  it('extracts the literal effects from Case of the Locked Hothouse', () => {
    const effects = extractCardEffects(
      fixtureCard(
        'Case of the Locked Hothouse',
        'You may play an additional land on each of your turns.\nTo solve — You control seven or more lands.\nSolved — You may look at the top card of your library any time, and you may play lands and cast creature and enchantment spells from the top of your library.',
        'Enchantment — Case',
        4,
      ),
    );
    const detectorIds = effects.map((effect) => effect.evidence[0].detectorId);

    expect(detectorIds).toEqual(
      expect.arrayContaining([
        'additional-land-play',
        'land-count-threshold',
        'top-library-visibility',
        'top-library-play',
      ]),
    );
  });

  it('extracts the literal effects from Case of the Trampled Garden', () => {
    const effects = extractCardEffects(
      fixtureCard(
        'Case of the Trampled Garden',
        'When this Case enters, distribute two +1/+1 counters among one or two target creatures you control.\nTo solve — Creatures you control have total power 8 or greater.\nSolved — Whenever you attack, put a +1/+1 counter on target attacking creature. It gains trample until end of turn.',
        'Enchantment — Case',
        3,
      ),
    );
    const detectorIds = effects.map((effect) => effect.evidence[0].detectorId);

    expect(detectorIds).toEqual(
      expect.arrayContaining([
        'self-etb-event',
        'counter-placement',
        'creature-power-threshold',
        'attack-event',
        'keyword-grant',
      ]),
    );
  });

  it('extracts the literal effects from Case of the Shifting Visage', () => {
    const effects = extractCardEffects(
      fixtureCard(
        'Case of the Shifting Visage',
        'At the beginning of your upkeep, surveil 1.\nTo solve — There are fifteen or more cards in your graveyard.\nSolved — Whenever you cast a nonlegendary creature spell, copy that spell.',
        'Enchantment — Case',
        3,
      ),
    );
    const detectorIds = effects.map((effect) => effect.evidence[0].detectorId);

    expect(detectorIds).toEqual(
      expect.arrayContaining([
        'surveil',
        'graveyard-count-threshold',
        'cast-event',
        'spell-copy',
      ]),
    );
    expect(
      effects.find(
        (effect) => effect.evidence[0].detectorId === 'graveyard-count-threshold',
      )?.sourceZone,
    ).toBeUndefined();
    expect(
      effects.find((effect) => effect.evidence[0].detectorId === 'cast-event')
        ?.direction,
    ).toBe('listens');
    expect(
      effects.find((effect) => effect.evidence[0].detectorId === 'spell-copy'),
    ).toMatchObject({
      label: 'Copies Creature Spells',
      subject: { kind: 'creature' },
    });
  });

  it('carries a chosen creature type into Reflections of Littjara copy effects', () => {
    const effects = extractCardEffects(
      fixtureCard(
        'Reflections of Littjara',
        'As this enchantment enters, choose a creature type.\nWhenever you cast a spell of the chosen type, copy that spell.',
        'Enchantment',
        5,
      ),
    );
    const castTrigger = effects.find(
      (effect) => effect.evidence[0].detectorId === 'cast-event',
    );
    const copy = effects.find(
      (effect) => effect.evidence[0].detectorId === 'spell-copy',
    );
    expect(castTrigger).toMatchObject({
      label: 'Creature Cast Trigger',
      direction: 'listens',
      subject: { kind: 'creature' },
    });
    expect(copy).toMatchObject({
      label: 'Copies Creature Spells',
      subject: { kind: 'creature' },
    });
  });

  it('keeps Martha Jones scoped to Clue sacrifice', () => {
    const effects = extractCardEffects(
      fixtureCard(
        'Martha Jones',
        "Woman Who Walked the Earth — When Martha Jones enters, investigate.\nWhenever you sacrifice a Clue, Martha Jones and up to one other target creature can't be blocked this turn.",
        'Legendary Creature — Human Cleric',
        3,
      ),
    );
    const sacrifice = effects.find(
      (effect) => effect.evidence[0].detectorId === 'sacrifice-effect',
    );
    expect(sacrifice).toMatchObject({
      label: 'Clue Sacrifice Trigger',
      direction: 'listens',
      subject: { kind: 'token', tokenType: 'clue' },
    });
  });
});
