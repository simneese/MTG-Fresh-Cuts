import { describe, expect, it } from 'vitest';
import { structuredRolesForCard } from '../src/CutWorkspace';
import { fixtureCard } from './fixtures';

describe('structured role scoring inputs', () => {
  it.each([
    ['Counterspell', 'Counter target spell.', 'Instant', ['Protection']],
    ['Wilderness Reclamation', 'At the beginning of your end step, untap all lands you control.', 'Enchantment', ['Mana ramp']],
    ['Reanimate', 'Put target creature card from a graveyard onto the battlefield under your control.', 'Sorcery', ['Recursion']],
    ['Demonic Tutor', 'Search your library for a card, put that card into your hand, then shuffle.', 'Sorcery', ['Tutor']],
    ['Killing Wave', 'For each creature, its controller sacrifices it unless they pay X life.', 'Sorcery', ['Removal', 'Board wipe']],
  ] as const)('%s receives roles from structured effects', (name, text, type, expected) => {
    const roles = structuredRolesForCard(fixtureCard(name, text, type));
    expected.forEach((role) => expect(roles).toContain(role));
  });
});
