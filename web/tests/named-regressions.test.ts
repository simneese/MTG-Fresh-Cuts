import { describe, expect, it } from 'vitest';
import { extractCardEffects } from '../src/synergy-engine/extract-effects';
import { buildEngineSignals } from '../src/synergy-engine/relationship-graph';
import { fixtureCard } from './fixtures';
import {
  cardFillsRole,
  creatureTypeSynergyRoles,
  selfRecurringSacrificeCapacity,
  synergyPreviewRoles,
  synergyTags,
} from '../src/CutWorkspace';

const effectsFor = (name: string, text: string, type?: string) =>
  extractCardEffects(fixtureCard(name, text, type));

describe('corrected named card regressions', () => {
  it('Fumulus watches creature sacrifice', () => {
    const effects = effectsFor('Fumulus, the Infestation', 'Whenever a creature is sacrificed, put a +1/+1 counter on Fumulus.');
    expect(effects.some((effect) => effect.event === 'sacrificed' && effect.direction === 'listens')).toBe(true);
  });

  it('Blood Artist detects both halves of target-player drain', () => {
    const effects = effectsFor('Blood Artist', 'Whenever Blood Artist or another creature dies, target player loses 1 life and you gain 1 life.');
    expect(effects.map((effect) => effect.event)).toEqual(expect.arrayContaining(['dies', 'life-lost', 'life-gained']));
  });

  it('Nadier’s Nightblade listens for token LTB', () => {
    const effects = effectsFor("Nadier's Nightblade", 'Whenever a token you control leaves the battlefield, each opponent loses 1 life.');
    expect(effects.some((effect) => effect.event === 'leaves-battlefield' && effect.subject.kind === 'token')).toBe(true);
  });

  it('Tangletrove Kelp sacrifices an artifact creature and listens to Clue count', () => {
    const effects = effectsFor('Tangletrove Kelp', 'At the beginning of each combat, other Clues you control become 6/6 Plant creatures.\n{2}{U}, Sacrifice Tangletrove Kelp: Draw a card.', 'Artifact Creature — Clue Plant');
    const signals = buildEngineSignals(effects);
    expect(signals.emits).toContain('artifact-sacrificed');
    expect(signals.emits).toContain('creature-sacrificed');
    expect(signals.listens).toContain('clue-created');
  });

  it('Inspiring Statuary listens to artifact count through improvise', () => {
    const signals = buildEngineSignals(effectsFor('Inspiring Statuary', 'Nonartifact spells you cast have improvise.', 'Artifact'));
    expect(signals.listens).toContain('artifact-count-increased');
  });

  it('Rise and Shine marks Overload as multi-artifact payoff', () => {
    const signals = buildEngineSignals(effectsFor('Rise and Shine', 'Target noncreature artifact you control becomes a 0/0 artifact creature. Overload {4}{U}{U}.', 'Sorcery'));
    expect([...signals.listens, ...signals.emits].some((signal) => signal.includes('artifact'))).toBe(true);
  });

  it('Wilderness Reclamation is repeatable land untap ramp', () => {
    const effects = effectsFor('Wilderness Reclamation', 'At the beginning of your end step, untap all lands you control.', 'Enchantment');
    expect(effects.some((effect) => effect.event === 'untapped' && effect.timing.repeatable)).toBe(true);
  });

  it('Brood of Cockroaches is delayed recursion without intra-turn repeatability', () => {
    const effects = effectsFor('Brood of Cockroaches', 'When Brood of Cockroaches is put into your graveyard from the battlefield, at the beginning of the next end step, return Brood of Cockroaches to your hand.');
    const recursion = effects.find((effect) => effect.event === 'returned');
    expect(recursion?.timing.multiUsePerTurn).toBe(false);
  });

  it('Gravecrawler can repeatedly cast from the graveyard', () => {
    const effects = effectsFor('Gravecrawler', 'You may cast Gravecrawler from your graveyard as long as you control a Zombie.');
    const recursion = effects.find((effect) => effect.sourceZone === 'graveyard');
    expect(recursion?.label).toBe('Casts from Graveyard');
  });

  it('Nine-Lives Familiar exposes all counter-limited sacrifice bodies', () => {
    const card = fixtureCard(
      'Nine-Lives Familiar',
      'This creature enters with eight revival counters on it if you cast it.\nWhen this creature dies, if it had a revival counter on it, return it to the battlefield with one fewer revival counter on it at the beginning of the next end step.',
      'Creature — Cat',
    );
    const effects = extractCardEffects(card);
    const selfReturn = effects.find(
      (effect) =>
        effect.evidence[0].detectorId === 'counter-limited-self-return',
    );
    expect(selfReturn).toMatchObject({
      sourceZone: 'graveyard',
      destinationZone: 'battlefield',
      quantity: { expected: 8 },
      timing: { repeatable: true, multiUsePerTurn: false },
    });
    expect(selfRecurringSacrificeCapacity(card)).toBe(9);
    expect(
      synergyPreviewRoles(card, 'type-event: creature dies').enabler,
    ).toBe(true);
  });

  it('Mushroom Watchdogs is not instant-speed', () => {
    const effects = effectsFor('Mushroom Watchdogs', '{1}, Sacrifice a Food: Draw a card. Activate only as a sorcery.');
    expect(effects.find((effect) => effect.event === 'sacrificed')?.timing.instantSpeed).toBe(false);
  });

  it('Gingerbread Cabin ignores Food reminder-text sacrifice', () => {
    const effects = effectsFor('Gingerbread Cabin', 'When Gingerbread Cabin enters, create a Food token. (It’s an artifact with “{2}, {T}, Sacrifice this artifact: You gain 3 life.”)', 'Land — Forest');
    expect(effects.some((effect) => effect.event === 'sacrificed')).toBe(false);
  });

  it('Swarmyard exposes regeneration as creature protection', () => {
    const effects = effectsFor('Swarmyard', '{T}: Add {C}.\n{T}: Regenerate target Insect, Rat, Spider, or Squirrel.', 'Land');
    expect(effects.some((effect) => effect.label === 'Protects Creature')).toBe(true);
  });

  it('Killing Wave resolves “it” to each creature and scales the sacrifice', () => {
    const effects = effectsFor(
      'Killing Wave',
      'For each creature, its controller sacrifices it unless they pay X life.',
      'Sorcery',
    );
    const sacrifice = effects.find((effect) => effect.event === 'sacrificed');
    expect(sacrifice?.label).toBe('Sacrifices Creature');
    expect(sacrifice?.subject.kind).toBe('creature');
    expect(sacrifice?.quantity.unbounded).toBe(true);
    expect(buildEngineSignals(effects).emits).toEqual(
      expect.objectContaining(
        new Set([
          'creature-sacrificed',
          'creature-dies',
          'creature-leaves-battlefield',
        ]),
      ),
    );
    expect(
      cardFillsRole(
        fixtureCard(
          'Killing Wave',
          'For each creature, its controller sacrifices it unless they pay X life.',
          'Sorcery',
        ),
        'Board wipe',
        ['removal', 'board wipe'],
      ),
    ).toBe(true);
  });

  it('Animate Dead links its graveyard Aura target, returned creature, and later sacrifice', () => {
    const text =
      'Enchant creature card in a graveyard\nWhen this Aura enters, if it’s on the battlefield, it loses “enchant creature card in a graveyard” and gains “enchant creature put onto the battlefield with this Aura.” Return enchanted creature card to the battlefield under your control and attach this Aura to it. When this Aura leaves the battlefield, that creature’s controller sacrifices it.\nEnchanted creature gets -1/-0.';
    const effects = effectsFor('Animate Dead', text, 'Enchantment — Aura');
    const recursion = effects.find(
      (effect) => effect.evidence[0].detectorId === 'aura-recursion',
    );
    const sacrifice = effects.find(
      (effect) =>
        effect.event === 'sacrificed' && effect.subject.kind === 'creature',
    );
    expect(recursion).toMatchObject({
      sourceZone: 'graveyard',
      destinationZone: 'battlefield',
      subject: { kind: 'creature' },
    });
    expect(recursion?.evidence[0].inferred).toBe(true);
    expect(sacrifice?.label).toBe('Sacrifices Creature');
    expect(buildEngineSignals(effects).emits).toEqual(
      expect.objectContaining(
        new Set([
          'creature-returned',
          'creature-sacrificed',
          'creature-dies',
          'creature-leaves-battlefield',
        ]),
      ),
    );
  });

  it('Blade of the Bloodchief is a Vampire typal payoff without being a Vampire', () => {
    const card = fixtureCard(
      'Blade of the Bloodchief',
      'Whenever a creature dies, put a +1/+1 counter on equipped creature. If equipped creature is a Vampire, put two +1/+1 counters on it instead.\nEquip {1}',
      'Artifact — Equipment',
    );
    const effects = extractCardEffects(card);
    const typal = effects.find(
      (effect) => effect.evidence[0].detectorId === 'typal-conditional-bonus',
    );
    expect(typal).toMatchObject({
      label: 'Vampire Typal Bonus',
      direction: 'listens',
      subject: { kind: 'creature', creatureTypes: ['vampire'] },
    });
    expect(synergyTags(card, [])).toContain('type: vampire');
    expect(creatureTypeSynergyRoles(card, 'type: vampire')).toEqual({
      enabler: false,
      payoff: true,
    });
  });
});
