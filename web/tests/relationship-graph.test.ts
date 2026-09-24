import { describe, expect, it } from 'vitest';
import { extractCardEffects } from '../src/synergy-engine/extract-effects';
import { buildEngineSignals, signalPathsBetween } from '../src/synergy-engine/relationship-graph';
import { dedupeEngineFamilies } from '../src/synergy-engine/engine-registry';
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

  it('deduplicates specific sacrifice themes over their umbrellas', () => {
    expect(
      dedupeEngineFamilies([
        'engine:sacrifice',
        'engine:sacrifice:artifact',
        'engine:sacrifice:token',
        'engine:sacrifice:clue',
      ]),
    ).toEqual(['engine:sacrifice:clue']);
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
});
