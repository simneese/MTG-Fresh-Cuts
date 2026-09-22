import { describe, expect, it } from 'vitest';
import { extractCardEffects } from '../src/synergy-engine/extract-effects';
import { buildEngineSignals, signalPathsBetween } from '../src/synergy-engine/relationship-graph';
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
});
