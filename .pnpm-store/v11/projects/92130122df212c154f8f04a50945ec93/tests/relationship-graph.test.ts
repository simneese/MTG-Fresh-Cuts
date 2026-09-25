import { describe, expect, it } from 'vitest';
import { extractCardEffects } from '../src/synergy-engine/extract-effects';
import { buildEngineSignals, signalPathsBetween } from '../src/synergy-engine/relationship-graph';
import {
  dedupeEngineFamilies,
  engineSpecializationIsAvailable,
} from '../src/synergy-engine/engine-registry';
import {
  engineIsActive,
  engineParticipation,
} from '../src/synergy-engine/engine-registry';
import { fixtureCard } from './fixtures';

function signals(text: string) {
  return buildEngineSignals(extractCardEffects(fixtureCard(text, text)));
}

describe('relationship graph implications', () => {
  it('connects creature sacrifice to dies and LTB listeners', () => {
    const producer = signals('Sacrifice a creature: Draw a card.');
    expect(producer.emits).toContain('creature-dies');
    expect(producer.emits).toContain('creature-leaves-battlefield');
    expect(signalPathsBetween(producer, signals('Whenever a creature dies, draw a card.'))).toContain('creature-dies');
  });

  it('treats Gravestorm as a creature-death payoff', () => {
    const result = signals('Gravestorm');

    expect(result.listens).toContain('creature-dies');
    expect(
      engineParticipation(result, 'engine:death').payoff,
    ).toBe(true);
    expect(result.listens).not.toContain('creature-exiled');
    expect(result.listens).not.toContain('creature-leaves-battlefield');
  });

  it('connects investigate to Clue, artifact, and token creation', () => {
    const result = signals('Investigate.');
    expect(result.emits).toEqual(expect.objectContaining(new Set([
      'investigated',
      'clue-created',
      'artifact-created',
      'token-created',
    ])));
  });

  it('does not translate exile into dies', () => {
    const result = signals('Exile target creature.');
    expect(result.emits).toContain('creature-leaves-battlefield');
    expect(result.emits).not.toContain('creature-dies');
  });

  it('does not translate graveyard recursion into leaving the battlefield', () => {
    const result = signals(
      'Return target creature card from your graveyard to the battlefield.',
    );
    expect(result.emits).toContain('creature-enters-battlefield');
    expect(result.emits).not.toContain('creature-leaves-battlefield');
    expect(result.emits).not.toContain('creature-dies');
  });

  it('connects battlefield-entry producers to ETB payoffs', () => {
    const reanimation = signals(
      'Return target creature card from your graveyard to the battlefield.',
    );
    const tokenProducer = signals('Create two creature tokens.');
    const broadPayoff = signals(
      'Whenever another creature enters the battlefield under your control, you gain 1 life.',
    );
    const selfEtbPayoff = signals(
      'When this creature enters, draw a card.',
    );

    expect(
      engineParticipation(reanimation, 'engine:enters-battlefield'),
    ).toMatchObject({ enabler: true, payoff: false });
    expect(
      engineParticipation(tokenProducer, 'engine:enters-battlefield'),
    ).toMatchObject({ enabler: true });
    expect(
      engineParticipation(broadPayoff, 'engine:enters-battlefield'),
    ).toMatchObject({ payoff: true });
    expect(
      engineParticipation(selfEtbPayoff, 'engine:enters-battlefield'),
    ).toMatchObject({ enabler: false, payoff: false });
    expect(
      engineParticipation(selfEtbPayoff, 'engine:self-enters-battlefield'),
    ).toMatchObject({ enabler: false, payoff: true });
    expect(
      engineParticipation(reanimation, 'engine:self-enters-battlefield'),
    ).toMatchObject({ enabler: true, payoff: false });
    expect(
      engineParticipation(broadPayoff, 'engine:enters-battlefield:creature'),
    ).toMatchObject({ payoff: true });
  });

  it('uses blink as a self-ETB retrigger enabler', () => {
    const blink = signals(
      'Exile target creature you control, then return it to the battlefield under its owner’s control.',
    );
    expect(
      engineParticipation(blink, 'engine:self-enters-battlefield'),
    ).toMatchObject({ enabler: true });
  });

  it('keeps subtype ETB signals directional', () => {
    const clueEntry = signals('Create a Clue token.');
    const clueWatcher = signals(
      'Whenever a Clue enters the battlefield under your control, draw a card.',
    );
    const artifactWatcher = signals(
      'Whenever an artifact enters the battlefield under your control, draw a card.',
    );
    [
      'clue-enters-battlefield',
      'artifact-enters-battlefield',
      'token-enters-battlefield',
      'permanent-enters-battlefield',
    ].forEach((signal) => expect(clueEntry.emits).toContain(signal));
    expect(
      engineParticipation(clueWatcher, 'engine:enters-battlefield:clue'),
    ).toMatchObject({ payoff: true });
    expect(
      engineParticipation(artifactWatcher, 'engine:enters-battlefield:clue'),
    ).toMatchObject({ payoff: false });
  });

  it('classifies ETB engines from the trigger subject, not the resulting effect', () => {
    const landTrigger = signals(
      'Whenever a land enters the battlefield under your control, create a 1/1 creature token.',
    );
    const creatureTrigger = signals(
      'Whenever a creature enters the battlefield under your control, you may put a land card from your hand onto the battlefield.',
    );
    expect(
      engineParticipation(landTrigger, 'engine:enters-battlefield:land'),
    ).toMatchObject({ payoff: true });
    expect(
      engineParticipation(landTrigger, 'engine:enters-battlefield:creature'),
    ).toMatchObject({ payoff: false });
    expect(
      engineParticipation(creatureTrigger, 'engine:enters-battlefield:creature'),
    ).toMatchObject({ payoff: true });
    expect(
      engineParticipation(creatureTrigger, 'engine:enters-battlefield:land'),
    ).toMatchObject({ payoff: false });
  });

  it('marks a creature that casts itself from the graveyard as recurring fodder', () => {
    const card = fixtureCard(
      'Gravecrawler',
      'You may cast Gravecrawler from your graveyard as long as you control a Zombie.',
      'Creature — Zombie',
    );
    const result = buildEngineSignals(extractCardEffects(card));
    expect(result.emits).toContain('self-recurring-creature');
  });

  it('does not treat typal condition metadata as creature creation', () => {
    const result = signals(
      'If equipped creature is a Vampire, put two +1/+1 counters on it instead.',
    );
    expect(result.listens).toContain('type:vampire-present');
    expect(result.listens).not.toContain('creature-created');
    expect(result.listens).not.toContain('creature-count-increased');
  });

  it('treats copied creature spells as additional creature, permanent, and token output', () => {
    const result = signals(
      'Whenever you cast a nonlegendary creature spell, copy that spell.',
    );
    expect(result.listens).toContain('creature-cast');
    expect(result.emits).toContain('spell-copied');
    expect(result.emits).toContain('creature-created');
    expect(result.emits).toContain('permanent-created');
    expect(result.emits).toContain('token-created');
    expect(result.emits).toContain('creature-count-increased');
    expect(result.emits).toContain('token-count-increased');
  });

  it('connects creature-power enablers and payoffs while retaining the count inference', () => {
    const counterProducer = signals(
      'Distribute two +1/+1 counters among one or two target creatures you control.',
    );
    const powerPayoff = signals(
      'Creatures you control have total power 8 or greater.',
    );
    expect(counterProducer.emits).toContain('creature-power-increased');
    expect(powerPayoff.listens).toContain('creature-power-increased');
    expect(powerPayoff.listens).toContain('creature-count-increased');
    expect(signalPathsBetween(counterProducer, powerPayoff)).toContain(
      'creature-power-increased',
    );
  });

  it('keeps creature-spell copies distinct from casts while integrating copy outputs', () => {
    const result = signals(
      'Whenever you cast a nonlegendary creature spell, copy that spell. The copy becomes a token.',
    );
    expect(result.listens).toContain('creature-cast');
    expect(result.listens).not.toContain('copyable-spell-cast');
    expect(result.listens).toContain('copyable-nonlegendary-creature-spell-cast');
    expect(result.listens).not.toContain('copyable-creature');
    expect(result.emits).toContain('spell-copied');
    expect(result.emits).toContain('creature-created');
    expect(result.emits).toContain('token-created');
    expect(
      engineParticipation(result, 'engine:spell-copy'),
    ).toEqual({ enabler: false, payoff: false, eligible: false, support: false });
    expect(
      engineParticipation(result, 'engine:creature-spell-copy'),
    ).toMatchObject({ enabler: true, payoff: true });
    expect(
      engineParticipation(result, 'engine:creature-copy'),
    ).toEqual({ enabler: false, payoff: false, eligible: false, support: false });
    expect(result.emits).not.toContain('creature-cast');
  });

  it('only gives token output to creature-copy effects that create tokens', () => {
    const tokenCopy = signals('Create a creature token that is a copy of target creature.');
    const transformedCopy = signals('Target creature becomes a copy of another creature.');
    expect(tokenCopy.emits).toContain('token-created');
    expect(tokenCopy.emits).toContain('creature-created');
    expect(transformedCopy.emits).toContain('creature-copied');
    expect(transformedCopy.emits).not.toContain('token-created');
    expect(transformedCopy.emits).not.toContain('creature-created');
  });

  it('prefers the specific creature-spell-copy theme over broad spell copy', () => {
    expect(
      dedupeEngineFamilies([
        'engine:spell-copy',
        'engine:creature-spell-copy',
      ]),
    ).toEqual(['engine:creature-spell-copy']);
  });

  it('keeps true subtype engines alongside their parent engines', () => {
    expect(
      dedupeEngineFamilies([
        'engine:artifact-count',
        'engine:token-count',
        'engine:clue-count',
      ]),
    ).toEqual([
      'engine:artifact-count',
      'engine:token-count',
      'engine:clue-count',
    ]);
    expect(
      engineSpecializationIsAvailable('engine:clue-count', () => false),
    ).toBe(true);
    expect(
      engineSpecializationIsAvailable(
        'engine:creature-spell-copy',
        () => false,
      ),
    ).toBe(false);
    expect(
      dedupeEngineFamilies([
        'engine:sacrifice',
        'engine:sacrifice:artifact',
        'engine:sacrifice:token',
        'engine:sacrifice:clue',
      ]),
    ).toEqual([
      'engine:sacrifice',
      'engine:sacrifice:artifact',
      'engine:sacrifice:token',
      'engine:sacrifice:clue',
    ]);
  });

  it('does not turn source-scoped exile references into generic exile payoffs', () => {
    const scoped = buildEngineSignals([
      {
        id: 'scoped-exile',
        label: 'Uses Cards Exiled by This Artifact',
        direction: 'listens',
        event: 'exiled',
        subject: { kind: 'card' },
        timing: {
          abilityKind: 'static',
          repeatable: false,
          multiUsePerTurn: false,
          instantSpeed: false,
          oncePerTurn: false,
          requiresTap: false,
          sorcerySpeedOnly: false,
        },
        quantity: {
          minimum: 1,
          expected: 1,
          unbounded: false,
          scalesWithPlayers: false,
        },
        conditions: [],
        evidence: [{
          detectorId: 'scoped-exile-reference',
          paragraphIndex: 0,
          paragraphText: 'this artifact has the activated abilities of cards exiled by this artifact.',
          matchedText: 'cards exiled by this artifact',
          start: 0,
          end: 31,
          inferred: false,
        }],
      },
    ]);
    expect(scoped.listens).not.toContain('card-exiled');
  });

  it('recognizes chosen creature types as unrestricted creature-spell copying', () => {
    const card = fixtureCard(
      'Reflections of Littjara',
      'As this enchantment enters, choose a creature type.\nWhenever you cast a spell of the chosen type, copy that spell.',
      'Enchantment',
    );
    const result = buildEngineSignals(extractCardEffects(card));
    expect(result.listens).toContain('copyable-creature-spell-cast');
    expect(result.listens).not.toContain(
      'copyable-nonlegendary-creature-spell-cast',
    );
    expect(result.emits).toContain('creature-created');
    expect(result.emits).toContain('token-created');
  });

  it('keeps sacrifice, death, exile, and leaves-battlefield participation separate', () => {
    const sacrificed = signals('Sacrifice a creature: Draw a card.');
    const destroyed = signals('Destroy target creature.');
    const exiled = signals('Exile target creature.');

    expect(engineParticipation(sacrificed, 'engine:sacrifice:creature').enabler).toBe(true);
    expect(engineParticipation(sacrificed, 'engine:death').enabler).toBe(true);
    expect(engineParticipation(sacrificed, 'engine:leaves-battlefield').enabler).toBe(true);
    expect(engineParticipation(destroyed, 'engine:sacrifice').enabler).toBe(false);
    expect(engineParticipation(destroyed, 'engine:death').enabler).toBe(true);
    expect(engineParticipation(destroyed, 'engine:leaves-battlefield').enabler).toBe(true);
    expect(engineParticipation(exiled, 'engine:sacrifice').enabler).toBe(false);
    expect(engineParticipation(exiled, 'engine:death').enabler).toBe(false);
    expect(engineParticipation(exiled, 'engine:exile').enabler).toBe(true);
    expect(engineParticipation(exiled, 'engine:leaves-battlefield').enabler).toBe(true);
  });

  it('keeps permanent, card-type, and subtype sacrifice themes together', () => {
    expect(
      dedupeEngineFamilies([
        'engine:sacrifice',
        'engine:sacrifice:artifact',
        'engine:sacrifice:token',
        'engine:sacrifice:clue',
      ]),
    ).toEqual([
      'engine:sacrifice',
      'engine:sacrifice:artifact',
      'engine:sacrifice:token',
      'engine:sacrifice:clue',
    ]);
  });

  it('does not broaden a Clue-sacrifice listener into other sacrifice or LTB events', () => {
    const result = signals('Whenever you sacrifice a Clue, draw a card.');
    expect(result.listens).toEqual(new Set(['clue-sacrificed']));
    expect(engineParticipation(result, 'engine:sacrifice:clue').payoff).toBe(true);
    expect(engineParticipation(result, 'engine:sacrifice:creature').payoff).toBe(false);
    expect(engineParticipation(result, 'engine:sacrifice:artifact').payoff).toBe(false);
    expect(engineParticipation(result, 'engine:leaves-battlefield').payoff).toBe(false);
  });

  it('classifies Clue production as indirect Clue-sacrifice support', () => {
    const result = signals('Investigate twice.');
    const participation = engineParticipation(
      result,
      'engine:sacrifice:clue',
    );
    expect(result.support).toContain('clue-sacrifice-supported');
    expect(participation.support).toBe(true);
    expect(participation.enabler).toBe(false);
    expect(participation.payoff).toBe(false);
  });

  it('does not infer sacrifice support for tokens without an intrinsic sacrifice ability', () => {
    const result = signals('Create a 1/1 green Saproling creature token.');
    expect(result.support.size).toBe(0);
    expect(engineParticipation(result, 'engine:sacrifice:token').support).toBe(
      false,
    );
  });

  it('only activates engines with a payoff and usable supply', () => {
    const clueProducer = signals('Investigate.');
    const cluePayoff = signals(
      'Whenever you sacrifice a Clue, put a +1/+1 counter on this creature.',
    );
    const leavesOnly = signals('Sacrifice a creature: Draw a card.');

    expect(
      engineIsActive([leavesOnly], 'engine:leaves-battlefield'),
    ).toBe(false);
    expect(
      engineIsActive([cluePayoff], 'engine:sacrifice:clue'),
    ).toBe(false);
    expect(
      engineIsActive(
        [clueProducer, cluePayoff],
        'engine:sacrifice:clue',
      ),
    ).toBe(true);
  });

  it('activates the Land ETB engine when landfall payoffs have lands available', () => {
    const landfallPayoff = signals(
      'Landfall — Whenever a land enters the battlefield under your control, draw a card.',
    );
    const landParticipant = signals('');
    landParticipant.eligible.add('land-enters-battlefield');

    expect(
      engineParticipation(
        landfallPayoff,
        'engine:enters-battlefield:land',
      ).payoff,
    ).toBe(true);
    expect(
      engineIsActive(
        [landfallPayoff, landParticipant],
        'engine:enters-battlefield:land',
      ),
    ).toBe(true);
  });

  it('treats additional land plays and land fetching as Land ETB enablers', () => {
    const additionalPlay = signals(
      'You may play one additional land this turn.',
    );
    const landFetch = signals(
      'Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.',
    );
    const landToHand = signals(
      'Search your library for a basic land card, reveal it, put it into your hand, then shuffle.',
    );

    [additionalPlay, landFetch, landToHand].forEach((result) => {
      expect(result.emits).toContain('land-enters-battlefield');
      expect(
        engineParticipation(
          result,
          'engine:enters-battlefield:land',
        ).enabler,
      ).toBe(true);
    });
  });

  it('connects combat-access effects to combat-damage payoffs', () => {
    const evasion = signals(
      "Target legendary creature can't be blocked this turn.",
    );
    const payoff = signals(
      'Whenever this creature deals combat damage to a player, draw a card.',
    );
    expect(evasion.emits).toContain('combat-damage-enabled');
    expect(
      engineParticipation(evasion, 'engine:combat-damage').enabler,
    ).toBe(true);
    expect(
      engineParticipation(payoff, 'engine:combat-damage').payoff,
    ).toBe(true);
    expect(engineIsActive([evasion], 'engine:combat-damage')).toBe(false);
    expect(engineIsActive([evasion, payoff], 'engine:combat-damage')).toBe(true);
  });

  it('treats granted first strike as Combat Damage support, not an enabler', () => {
    const firstStrike = signals(
      'Target creature gains first strike until end of turn.',
    );
    expect(firstStrike.support).toContain('combat-damage-supported');
    expect(
      engineParticipation(firstStrike, 'engine:combat-damage'),
    ).toEqual({
      enabler: false,
      payoff: false,
      eligible: false,
      support: true,
    });
  });

  it('connects combat advantages to attack and combat-damage incentives', () => {
    const firstStrike = signals(
      'Target creature gains first strike until end of turn.',
    );
    const attackPayoff = signals(
      'Whenever this creature attacks, draw a card.',
    );
    expect(
      engineParticipation(firstStrike, 'engine:combat-advantage').enabler,
    ).toBe(true);
    expect(
      engineParticipation(attackPayoff, 'engine:combat-advantage').payoff,
    ).toBe(true);
    expect(
      engineIsActive(
        [firstStrike, attackPayoff],
        'engine:combat-advantage',
      ),
    ).toBe(true);
  });
});
