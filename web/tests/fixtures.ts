import type { WorkspaceCard } from '../src/DeckWorkspace';

export function fixtureCard(
  name: string,
  oracleText: string,
  typeLine = 'Creature — Test',
  manaValue = 2,
): WorkspaceCard {
  return {
    key: name.toLowerCase(),
    name,
    quantity: 1,
    cardData: {
      cacheKey: name.toLowerCase(),
      id: name.toLowerCase(),
      name,
      nameKey: name.toLowerCase(),
      type: typeLine.includes('Land') ? 'Land' : typeLine.split(' ')[0],
      typeLine,
      manaCost: '',
      manaValue,
      colors: [],
      colorIdentity: [],
      oracleText,
      scryfallUri: '',
      fetchedAt: 0,
    },
  };
}
