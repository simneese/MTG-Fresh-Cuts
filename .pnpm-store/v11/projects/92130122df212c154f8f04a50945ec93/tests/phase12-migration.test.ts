import { describe, expect, it } from 'vitest';
import {
  engineDefinitionForId,
  engineDefinitions,
  engineFamilyForLegacyTag,
  engineParticipation,
} from '../src/synergy-engine/engine-registry';
import { extractCardEffects } from '../src/synergy-engine/extract-effects';
import { buildEngineSignals } from '../src/synergy-engine/relationship-graph';
import { synergyTags } from '../src/CutWorkspace';
import { fixtureCard } from './fixtures';

const migrationFixtures = [
  fixtureCard('Fumulus', 'Whenever a creature is sacrificed, put a +1/+1 counter on Fumulus.'),
  fixtureCard('Blood Artist', 'Whenever Blood Artist or another creature dies, target player loses 1 life and you gain 1 life.'),
  fixtureCard("Nadier's Nightblade", 'Whenever a token you control leaves the battlefield, each opponent loses 1 life.'),
  fixtureCard('Tangletrove Kelp', 'At the beginning of each combat, other Clues you control become 6/6 Plant creatures.\n{2}{U}, Sacrifice Tangletrove Kelp: Draw a card.', 'Artifact Creature — Clue Plant'),
  fixtureCard('Inspiring Statuary', 'Nonartifact spells you cast have improvise.', 'Artifact'),
  fixtureCard('Rise and Shine', 'Target noncreature artifact you control becomes a 0/0 artifact creature. Overload {4}{U}{U}.', 'Sorcery'),
  fixtureCard('Wilderness Reclamation', 'At the beginning of your end step, untap all lands you control.', 'Enchantment'),
  fixtureCard('Brood of Cockroaches', 'When Brood of Cockroaches is put into your graveyard from the battlefield, at the beginning of the next end step, return Brood of Cockroaches to your hand.'),
  fixtureCard('Gravecrawler', 'You may cast Gravecrawler from your graveyard as long as you control a Zombie.', 'Creature — Zombie'),
  fixtureCard('Nine-Lives Familiar', 'This creature enters with eight revival counters on it if you cast it.\nWhen this creature dies, if it had a revival counter on it, return it to the battlefield with one fewer revival counter on it at the beginning of the next end step.', 'Creature — Cat'),
  fixtureCard('Mushroom Watchdogs', '{1}, Sacrifice a Food: Draw a card. Activate only as a sorcery.'),
  fixtureCard('Gingerbread Cabin', 'When Gingerbread Cabin enters, create a Food token. (It’s an artifact with “{2}, {T}, Sacrifice this artifact: You gain 3 life.”)', 'Land — Forest'),
  fixtureCard('Swarmyard', '{T}: Add {C}.\n{T}: Regenerate target Insect, Rat, Spider, or Squirrel.', 'Land'),
  fixtureCard('Killing Wave', 'For each creature, its controller sacrifices it unless they pay X life.', 'Sorcery'),
  fixtureCard('Animate Dead', 'Enchant creature card in a graveyard\nWhen this Aura enters, if it’s on the battlefield, it loses “enchant creature card in a graveyard” and gains “enchant creature put onto the battlefield with this Aura.” Return enchanted creature card to the battlefield under your control and attach this Aura to it. When this Aura leaves the battlefield, that creature’s controller sacrifices it.\nEnchanted creature gets -1/-0.', 'Enchantment — Aura'),
  fixtureCard('Blade of the Bloodchief', 'Whenever a creature dies, put a +1/+1 counter on equipped creature. If equipped creature is a Vampire, put two +1/+1 counters on it instead.\nEquip {1}', 'Artifact — Equipment'),
];

function registeredLegacyEngines(card: ReturnType<typeof fixtureCard>) {
  return [...new Set(
    synergyTags(card)
      .map(engineFamilyForLegacyTag)
      .filter((engine): engine is string => Boolean(engine && engineDefinitionForId(engine))),
  )].sort();
}

function structuredEngines(card: ReturnType<typeof fixtureCard>) {
  const effects = extractCardEffects(card);
  const signals = buildEngineSignals(effects);
  const registered = engineDefinitions()
    .filter((engine) => {
      const membership = engineParticipation(signals, engine.id);
      return membership.enabler || membership.payoff;
    })
    .map((engine) => engine.id);
  const [, subtypeText = ''] = (card.cardData?.typeLine ?? '').split('—');
  const literalTypes = subtypeText
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((type) => type.toLowerCase());
  const referencedTypes = effects.flatMap(
    (effect) => effect.subject.creatureTypes ?? [],
  );
  return [...new Set([
    ...registered,
    ...literalTypes.map((type) => `engine:type:${type}`),
    ...referencedTypes.map((type) => `engine:type:${type}`),
  ])].sort();
}

describe('phase 12 structured-versus-legacy migration audit', () => {
  it('records every required named fixture side by side', () => {
    const audit = migrationFixtures.map((card) => {
      const legacy = registeredLegacyEngines(card);
      const structured = structuredEngines(card);
      return {
        card: card.name,
        legacy,
        structured,
        onlyLegacy: legacy.filter((engine) => !structured.includes(engine)),
        onlyStructured: structured.filter((engine) => !legacy.includes(engine)),
      };
    });
    expect(audit).toMatchInlineSnapshot(`
      [
        {
          "card": "Fumulus",
          "legacy": [
            "engine:sacrifice",
            "engine:type:test",
          ],
          "onlyLegacy": [],
          "onlyStructured": [],
          "structured": [
            "engine:sacrifice",
            "engine:type:test",
          ],
        },
        {
          "card": "Blood Artist",
          "legacy": [
            "engine:drain",
            "engine:life-gain",
            "engine:sacrifice",
            "engine:type:test",
          ],
          "onlyLegacy": [],
          "onlyStructured": [
            "engine:burn",
          ],
          "structured": [
            "engine:burn",
            "engine:drain",
            "engine:life-gain",
            "engine:sacrifice",
            "engine:type:test",
          ],
        },
        {
          "card": "Nadier's Nightblade",
          "legacy": [
            "engine:burn",
            "engine:sacrifice",
            "engine:type:test",
          ],
          "onlyLegacy": [],
          "onlyStructured": [
            "engine:drain",
          ],
          "structured": [
            "engine:burn",
            "engine:drain",
            "engine:sacrifice",
            "engine:type:test",
          ],
        },
        {
          "card": "Tangletrove Kelp",
          "legacy": [
            "engine:clue-count",
            "engine:sacrifice",
            "engine:type:clue",
            "engine:type:plant",
          ],
          "onlyLegacy": [],
          "onlyStructured": [
            "engine:artifact-count",
            "engine:token-count",
          ],
          "structured": [
            "engine:artifact-count",
            "engine:clue-count",
            "engine:sacrifice",
            "engine:token-count",
            "engine:type:clue",
            "engine:type:plant",
          ],
        },
        {
          "card": "Inspiring Statuary",
          "legacy": [
            "engine:artifact-count",
          ],
          "onlyLegacy": [],
          "onlyStructured": [],
          "structured": [
            "engine:artifact-count",
          ],
        },
        {
          "card": "Rise and Shine",
          "legacy": [
            "engine:artifact-count",
            "engine:creature-count",
          ],
          "onlyLegacy": [
            "engine:creature-count",
          ],
          "onlyStructured": [],
          "structured": [
            "engine:artifact-count",
          ],
        },
        {
          "card": "Wilderness Reclamation",
          "legacy": [],
          "onlyLegacy": [],
          "onlyStructured": [],
          "structured": [],
        },
        {
          "card": "Brood of Cockroaches",
          "legacy": [
            "engine:type:test",
          ],
          "onlyLegacy": [],
          "onlyStructured": [
            "engine:graveyard",
            "engine:sacrifice",
          ],
          "structured": [
            "engine:graveyard",
            "engine:sacrifice",
            "engine:type:test",
          ],
        },
        {
          "card": "Gravecrawler",
          "legacy": [
            "engine:type:zombie",
          ],
          "onlyLegacy": [],
          "onlyStructured": [
            "engine:graveyard",
            "engine:sacrifice",
          ],
          "structured": [
            "engine:graveyard",
            "engine:sacrifice",
            "engine:type:zombie",
          ],
        },
        {
          "card": "Nine-Lives Familiar",
          "legacy": [
            "engine:sacrifice",
            "engine:type:cat",
          ],
          "onlyLegacy": [],
          "onlyStructured": [
            "engine:graveyard",
          ],
          "structured": [
            "engine:graveyard",
            "engine:sacrifice",
            "engine:type:cat",
          ],
        },
        {
          "card": "Mushroom Watchdogs",
          "legacy": [
            "engine:sacrifice",
            "engine:type:test",
          ],
          "onlyLegacy": [],
          "onlyStructured": [],
          "structured": [
            "engine:sacrifice",
            "engine:type:test",
          ],
        },
        {
          "card": "Gingerbread Cabin",
          "legacy": [
            "engine:artifact-count",
            "engine:food-count",
            "engine:token-count",
            "engine:type:forest",
          ],
          "onlyLegacy": [],
          "onlyStructured": [],
          "structured": [
            "engine:artifact-count",
            "engine:food-count",
            "engine:token-count",
            "engine:type:forest",
          ],
        },
        {
          "card": "Swarmyard",
          "legacy": [],
          "onlyLegacy": [],
          "onlyStructured": [],
          "structured": [],
        },
        {
          "card": "Killing Wave",
          "legacy": [
            "engine:creature-count",
            "engine:sacrifice",
          ],
          "onlyLegacy": [
            "engine:creature-count",
          ],
          "onlyStructured": [],
          "structured": [
            "engine:sacrifice",
          ],
        },
        {
          "card": "Animate Dead",
          "legacy": [
            "engine:sacrifice",
            "engine:type:aura",
          ],
          "onlyLegacy": [],
          "onlyStructured": [
            "engine:graveyard",
          ],
          "structured": [
            "engine:graveyard",
            "engine:sacrifice",
            "engine:type:aura",
          ],
        },
        {
          "card": "Blade of the Bloodchief",
          "legacy": [
            "engine:sacrifice",
            "engine:type:equipment",
            "engine:type:vampire",
          ],
          "onlyLegacy": [],
          "onlyStructured": [],
          "structured": [
            "engine:sacrifice",
            "engine:type:equipment",
            "engine:type:vampire",
          ],
        },
      ]
    `);
  });
});
