import { describe, expect, it } from 'vitest';
import { extractCardEffects } from '../src/synergy-engine/extract-effects';
import { buildEngineSignals } from '../src/synergy-engine/relationship-graph';
import {
  engineParticipation,
  engineSpecializationParticipation,
  engineSpecializationRoles,
} from '../src/synergy-engine/engine-registry';
import { fixtureCard } from './fixtures';
import {
  cardFillsRole,
  creatureTypeSynergyRoles,
  selfRecurringSacrificeCapacity,
  structuredRolesForCard,
  synergyPreviewRoles,
  synergyTags,
} from '../src/CutWorkspace';

const effectsFor = (name: string, text: string, type?: string) =>
  extractCardEffects(fixtureCard(name, text, type));

describe('corrected named card regressions', () => {
  it('captures Traveling Botanist tap, land-draw, and graveyard effects', () => {
    const card = fixtureCard(
      'Traveling Botanist',
      "Whenever this creature becomes tapped, look at the top card of your library. If it's a land card, you may reveal it and put it into your hand. If you don't put the card into your hand, you may put it into your graveyard.",
      'Creature — Dog Scout',
    );
    const effects = extractCardEffects(card);
    expect(effects.map((effect) => effect.label)).toEqual(
      expect.arrayContaining([
        'Becomes Tapped Trigger',
        'Looks at Top Card of Library',
        'Puts Top Land into Hand',
        'Puts Top Card into Graveyard',
      ]),
    );
    expect(structuredRolesForCard(card, effects)).toContain('Card draw');
    expect(buildEngineSignals(effects).emits).toContain('graveyard-stocked');
  });

  it('captures Dog Umbra timing, restriction, and protection effects', () => {
    const card = fixtureCard(
      'Dog Umbra',
      "Flash\nEnchant creature\nAs long as another player controls enchanted creature, it can't attack or block. Otherwise, this Aura has umbra armor.",
      'Enchantment — Aura',
    );
    const effects = extractCardEffects(card);
    expect(effects.map((effect) => effect.label)).toEqual(
      expect.arrayContaining([
        'Has Flash',
        'Enchants Creature',
        'Prevents Attacking or Blocking',
        'Grants Umbra Armor',
      ]),
    );
    const roles = structuredRolesForCard(card, effects);
    expect(roles).toContain('Removal');
    expect(roles).toContain('Protection');
  });

  it('captures both K-9, Mark I abilities and its protection role', () => {
    const card = fixtureCard(
      'K-9, Mark I',
      "Negative — As long as K-9 is untapped, other legendary creatures you control have ward {1}.\nAffirmative — {1}{U}, {T}: Target legendary creature can't be blocked this turn.\nDoctor's companion",
      'Legendary Artifact Creature — Robot Dog',
    );
    const effects = extractCardEffects(card);
    expect(effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Grants Ward',
          event: 'keyword-granted',
          direction: 'grants',
          timing: expect.objectContaining({ abilityKind: 'static' }),
        }),
        expect.objectContaining({
          label: 'Grants Unblockable',
          event: 'combat-damage',
          direction: 'grants',
          timing: expect.objectContaining({
            abilityKind: 'activated',
            requiresTap: true,
          }),
        }),
      ]),
    );
    expect(structuredRolesForCard(card, effects)).toContain('Protection');
  });

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
    expect(signals.emits).toContain('clue-sacrificed');
    expect(signals.listens).toContain('clue-created');
    expect(effects.map((effect) => effect.label)).toContain('Animates Clues');
    expect(signals.emits).toContain('clue-animation-enabled');
    expect(signals.listens).toContain('animatable-clue');
  });

  it('uses a self-sacrificing permanent subtype for its specific sacrifice engine', () => {
    const effects = effectsFor(
      'Five Hundred Year Diary',
      '{2}, {T}, Sacrifice Five Hundred Year Diary: Draw a card.',
      'Artifact — Clue',
    );
    const signals = buildEngineSignals(effects);
    expect(signals.emits).toContain('clue-sacrificed');
    expect(signals.emits).toContain('artifact-sacrificed');
  });

  it('Inspiring Statuary listens to artifact count through improvise', () => {
    const signals = buildEngineSignals(effectsFor('Inspiring Statuary', 'Nonartifact spells you cast have improvise.', 'Artifact'));
    expect(signals.listens).toContain('artifact-count-increased');
  });

  it('Rise and Shine marks Overload as multi-artifact animation', () => {
    const effects = effectsFor('Rise and Shine', 'Target noncreature artifact you control becomes a 0/0 artifact creature. Overload {4}{U}{U}.', 'Sorcery');
    const signals = buildEngineSignals(effects);
    expect(effects.map((effect) => effect.label)).toContain('Animates Artifact');
    expect(signals.emits).toContain('artifact-animation-enabled');
    expect(signals.emits).toContain('multi:artifact-animated');
    expect(signals.listens).toContain('animatable-artifact');
  });

  it('captures Case of the Filched Falcon as artifact animation', () => {
    const effects = effectsFor(
      'Case of the Filched Falcon',
      "When this Case enters, investigate.\nTo solve — You control three or more artifacts.\nSolved — {2}{U}, Sacrifice this Case: Put four +1/+1 counters on target noncreature artifact. It becomes a 0/0 Bird creature with flying in addition to its other types.",
      'Enchantment — Case',
    );
    const animation = effects.find(
      (effect) => effect.evidence[0].detectorId === 'artifact-animation',
    );
    expect(animation).toMatchObject({
      label: 'Animates Artifact',
      event: 'animated',
      direction: 'transforms',
      subject: { kind: 'artifact' },
    });
    const signals = buildEngineSignals(effects);
    expect(signals.emits).toContain('artifact-animation-enabled');
    expect(signals.emits).toContain('creature-count-increased');
    expect(signals.listens).toContain('animatable-artifact');
  });

  it('treats noncreature artifact-token production as animation support', () => {
    const clueSignals = buildEngineSignals(
      effectsFor('Deduce', 'Draw a card. Investigate.', 'Instant'),
    );
    const treasureSignals = buildEngineSignals(
      effectsFor('Big Score', 'Create two Treasure tokens.', 'Instant'),
    );
    const servoSignals = buildEngineSignals(
      effectsFor(
        'Servo Maker',
        'Create a 1/1 colorless Servo artifact creature token.',
        'Sorcery',
      ),
    );
    expect(clueSignals.support).toContain('artifact-animation-supported');
    expect(treasureSignals.support).toContain('artifact-animation-supported');
    expect(servoSignals.support).not.toContain('artifact-animation-supported');
  });

  it('projects broad capabilities into an ignored active child engine', () => {
    const artifactAnimation = buildEngineSignals(
      effectsFor(
        'Generic Animator',
        'Target noncreature artifact you control becomes a 3/3 artifact creature.',
        'Sorcery',
      ),
    );
    const broadSpellCopy = buildEngineSignals(
      effectsFor('Broad Copier', 'Copy target spell.', 'Instant'),
    );
    expect(
      engineSpecializationParticipation(
        artifactAnimation,
        'engine:clue-animation',
      ),
    ).toBe(true);
    expect(
      engineSpecializationParticipation(
        broadSpellCopy,
        'engine:creature-spell-copy',
      ),
    ).toBe(true);
    expect(
      engineSpecializationRoles(artifactAnimation, 'engine:clue-animation'),
    ).toEqual({ enabler: true, payoff: true });
    expect(
      engineSpecializationRoles(broadSpellCopy, 'engine:creature-spell-copy'),
    ).toEqual({ enabler: true, payoff: true });
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

  it('captures Ainok Bond-Kin as a counter enabler and payoff', () => {
    const effects = effectsFor(
      'Ainok Bond-Kin',
      'Outlast {1}{W}\nEach creature you control with a +1/+1 counter on it has first strike.',
      'Creature — Dog Soldier',
    );
    expect(effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Places +1/+1 Counter with Outlast',
          event: 'counter-added',
          timing: expect.objectContaining({
            abilityKind: 'keyword',
            requiresTap: true,
            sorcerySpeedOnly: true,
          }),
        }),
        expect.objectContaining({
          label: 'Grants First Strike to Creatures with +1/+1 Counters',
          event: 'keyword-granted',
          direction: 'grants',
        }),
      ]),
    );
    const signals = buildEngineSignals(effects);
    expect(signals.emits).toContain('creature-counter-added');
    expect(signals.listens).toContain('creature-counter-added');
  });

  it('captures Rex, Cyber-Hound graveyard control and ability inheritance', () => {
    const card = fixtureCard(
      'Rex, Cyber-Hound',
      'Whenever Rex, Cyber-Hound deals combat damage to a player, they mill two cards and you get {E}{E}.\nPay {E}{E}: Choose target creature card in a graveyard. Exile it with a brain counter on it. Activate only as a sorcery.\nRex has all activated abilities of all cards in exile with brain counters on them.',
      'Legendary Artifact Creature — Robot Dog',
    );
    const effects = extractCardEffects(card);
    expect(effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Combat Damage Trigger' }),
        expect.objectContaining({
          label: 'Mills Cards',
          subject: expect.objectContaining({ controller: 'target-player' }),
        }),
        expect.objectContaining({ label: 'Generates Energy' }),
        expect.objectContaining({
          label: 'Exiles Graveyard Card with Brain Counter',
          sourceZone: 'graveyard',
          destinationZone: 'exile',
        }),
        expect.objectContaining({
          label: 'Gains Activated Abilities from Exiled Cards',
          direction: 'listens',
        }),
      ]),
    );
    expect(structuredRolesForCard(card, effects)).toContain(
      'Graveyard control',
    );
    const signals = buildEngineSignals(effects);
    expect(signals.emits).toContain('card-exiled');
    expect(signals.listens).not.toContain('card-exiled');
    expect(engineParticipation(signals, 'engine:exile')).toMatchObject({
      enabler: true,
      payoff: false,
    });
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
