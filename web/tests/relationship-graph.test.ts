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
});
