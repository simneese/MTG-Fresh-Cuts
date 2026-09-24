import { describe, expect, it } from 'vitest';
import { structuredRolesForCard } from '../src/CutWorkspace';
import { extractCardEffects } from '../src/synergy-engine/extract-effects';
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

  it('keeps graveyard denial separate from recursion', () => {
    const card = fixtureCard(
      'Chrome Companion',
      "When Chrome Companion enters, put up to one target card from a graveyard on the bottom of its owner's library.",
      'Artifact Creature — Robot Dog',
    );
    expect(structuredRolesForCard(card)).not.toContain('Recursion');
    expect(structuredRolesForCard(card)).toContain('Graveyard control');
    expect(extractCardEffects(card)).toContainEqual(
      expect.objectContaining({
        label: 'Moves Graveyard Card to Bottom of Library',
        sourceZone: 'graveyard',
        destinationZone: 'library',
      }),
    );
  });

  it('allows broad graveyard access to fill recursion and graveyard control', () => {
    const card = fixtureCard(
      'Reanimate',
      'Put target creature card from a graveyard onto the battlefield under your control.',
      'Sorcery',
    );
    const roles = structuredRolesForCard(card);
    expect(roles).toContain('Recursion');
    expect(roles).toContain('Graveyard control');
  });

  it('does not treat your-graveyard-only recursion as graveyard control', () => {
    const card = fixtureCard(
      'Raise Dead',
      'Return target creature card from your graveyard to your hand.',
      'Sorcery',
    );
    expect(structuredRolesForCard(card)).toContain('Recursion');
    expect(structuredRolesForCard(card)).not.toContain('Graveyard control');
  });
});
