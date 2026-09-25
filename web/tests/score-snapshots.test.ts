import { describe, expect, it } from 'vitest';
import { engineDefinitions, engineParticipation } from '../src/synergy-engine/engine-registry';
import { extractCardEffects } from '../src/synergy-engine/extract-effects';
import { buildEngineSignals } from '../src/synergy-engine/relationship-graph';
import { fixtureCard } from './fixtures';

function engineSnapshot(cards: ReturnType<typeof fixtureCard>[]) {
  return engineDefinitions()
    .map((engine) => {
      const members = cards.map((card) => engineParticipation(buildEngineSignals(extractCardEffects(card)), engine.id));
      return {
        engine: engine.id,
        enablers: members.filter((member) => member.enabler).length,
        payoffs: members.filter((member) => member.payoff).length,
      };
    })
    .filter((entry) => entry.enablers || entry.payoffs);
}

describe('representative deck engine snapshots', () => {
  it('snapshots sacrifice, clue, and graveyard packages', () => {
    expect(engineSnapshot([
      fixtureCard('Outlet', 'Sacrifice a creature: Draw a card.'),
      fixtureCard('Artist', 'Whenever a creature dies, each opponent loses 1 life.'),
      fixtureCard('Detective', 'Whenever you attack, investigate.'),
      fixtureCard('Kelp', 'At the beginning of each combat, other Clues you control become 6/6 creatures.'),
      fixtureCard('Surveil', 'Surveil 2.'),
      fixtureCard('Return', 'Return target creature card from your graveyard to the battlefield.'),
    ])).toMatchInlineSnapshot(`
      [
        {
          "enablers": 1,
          "engine": "engine:sacrifice",
          "payoffs": 0,
        },
        {
          "enablers": 1,
          "engine": "engine:death",
          "payoffs": 1,
        },
        {
          "enablers": 1,
          "engine": "engine:leaves-battlefield",
          "payoffs": 0,
        },
        {
          "enablers": 1,
          "engine": "engine:token-count",
          "payoffs": 0,
        },
        {
          "enablers": 1,
          "engine": "engine:creature-count",
          "payoffs": 0,
        },
        {
          "enablers": 2,
          "engine": "engine:enters-battlefield",
          "payoffs": 0,
        },
        {
          "enablers": 1,
          "engine": "engine:enters-battlefield:creature",
          "payoffs": 0,
        },
        {
          "enablers": 1,
          "engine": "engine:enters-battlefield:artifact",
          "payoffs": 0,
        },
        {
          "enablers": 1,
          "engine": "engine:enters-battlefield:token",
          "payoffs": 0,
        },
        {
          "enablers": 1,
          "engine": "engine:enters-battlefield:clue",
          "payoffs": 0,
        },
        {
          "enablers": 1,
          "engine": "engine:self-enters-battlefield",
          "payoffs": 0,
        },
        {
          "enablers": 1,
          "engine": "engine:clue-animation",
          "payoffs": 1,
        },
        {
          "enablers": 0,
          "engine": "engine:combat-advantage",
          "payoffs": 1,
        },
        {
          "enablers": 1,
          "engine": "engine:artifact-count",
          "payoffs": 0,
        },
        {
          "enablers": 1,
          "engine": "engine:clue-count",
          "payoffs": 1,
        },
        {
          "enablers": 1,
          "engine": "engine:burn",
          "payoffs": 0,
        },
        {
          "enablers": 1,
          "engine": "engine:drain",
          "payoffs": 0,
        },
        {
          "enablers": 1,
          "engine": "engine:graveyard",
          "payoffs": 1,
        },
        {
          "enablers": 1,
          "engine": "engine:sacrifice:creature",
          "payoffs": 0,
        },
      ]
    `);
  });
});
