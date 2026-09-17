import type { EngineSignals } from './types';

export type EngineDefinition = {
  id: string;
  label: string;
  desiredEnablersPerPayoff: number;
  legacyTags: string[];
  legacyTagPatterns?: RegExp[];
  enablerSignals: string[];
  payoffSignals: string[];
  requiresFunctionalPayoff?: boolean;
  parentEngineIds?: string[];
};

export const ENGINE_SCORING_CONFIG = {
  optionalAvailability: 0.75,
  conditionalAvailability: 0.7,
  oncePerTurnAvailability: 0.85,
  repeatableSupplyMultiplier: 1.5,
  multiUseSupplyMultiplier: 1.2,
  maximumQuantityCredit: 4,
} as const;

const definitions: EngineDefinition[] = [
  {
    id: 'engine:sacrifice',
    label: 'Sacrifice',
    desiredEnablersPerPayoff: 2,
    legacyTags: ['sacrifice', 'type-event: creature dies'],
    legacyTagPatterns: [/^type-event: .+ sacrificed$/],
    enablerSignals: [
      '*-sacrificed',
      'creature-dies',
      'creature-leaves-battlefield',
      'token-leaves-battlefield',
    ],
    payoffSignals: [
      '*-sacrificed',
      'creature-dies',
      'creature-leaves-battlefield',
      'token-leaves-battlefield',
    ],
  },
  {
    id: 'engine:token-count',
    label: 'Token Count',
    desiredEnablersPerPayoff: 3,
    legacyTags: ['token count'],
    enablerSignals: ['token-created', 'token-count-increased'],
    payoffSignals: ['token-count-increased'],
  },
  {
    id: 'engine:creature-count',
    label: 'Creature Count',
    desiredEnablersPerPayoff: 3,
    legacyTags: ['creature count'],
    enablerSignals: ['creature-created', 'creature-count-increased'],
    payoffSignals: ['creature-count-increased'],
  },
  {
    id: 'engine:artifact-count',
    label: 'Artifact Count',
    desiredEnablersPerPayoff: 3,
    legacyTags: ['artifact count'],
    enablerSignals: ['artifact-created', 'artifact-count-increased'],
    payoffSignals: ['artifact-count-increased'],
  },
  {
    id: 'engine:treasure-count',
    label: 'Treasure Count',
    desiredEnablersPerPayoff: 3,
    legacyTags: ['treasure count'],
    enablerSignals: ['treasure-created'],
    payoffSignals: ['treasure-created'],
    parentEngineIds: ['engine:artifact-count', 'engine:token-count'],
  },
  {
    id: 'engine:clue-count',
    label: 'Clue Count',
    desiredEnablersPerPayoff: 3,
    legacyTags: ['clue count'],
    enablerSignals: ['clue-created', 'investigated'],
    payoffSignals: ['clue-created'],
    parentEngineIds: ['engine:artifact-count', 'engine:token-count'],
  },
  {
    id: 'engine:food-count',
    label: 'Food Count',
    desiredEnablersPerPayoff: 3,
    legacyTags: ['food count'],
    enablerSignals: ['food-created'],
    payoffSignals: ['food-created'],
    parentEngineIds: ['engine:artifact-count', 'engine:token-count'],
  },
  {
    id: 'engine:life-gain',
    label: 'Life Gain',
    desiredEnablersPerPayoff: 2,
    legacyTags: ['life gain'],
    enablerSignals: ['life-gained', 'player-life-gained'],
    payoffSignals: ['life-gained', 'player-life-gained'],
  },
  {
    id: 'engine:burn',
    label: 'Burn',
    desiredEnablersPerPayoff: 2,
    legacyTags: ['burn'],
    enablerSignals: ['opponent-life-lost', 'player-life-lost'],
    payoffSignals: ['opponent-life-lost', 'player-life-lost'],
  },
  {
    id: 'engine:drain',
    label: 'Drain',
    desiredEnablersPerPayoff: 1.5,
    legacyTags: ['drain'],
    enablerSignals: [
      'life-gained',
      'player-life-gained',
      'opponent-life-lost',
      'player-life-lost',
    ],
    payoffSignals: [
      'life-gained',
      'player-life-gained',
      'opponent-life-lost',
      'player-life-lost',
    ],
  },
  {
    id: 'engine:graveyard',
    label: 'Graveyard',
    desiredEnablersPerPayoff: 2,
    legacyTags: ['surveil', 'discard', 'recursion'],
    enablerSignals: ['graveyard-stocked', 'card-discarded', 'card-milled'],
    payoffSignals: ['graveyard-stocked'],
  },
];

const definitionById = new Map(
  definitions.map((definition) => [definition.id, definition] as const),
);

const FUNCTIONAL_ROLE_TAGS = new Set([
  'board wipe',
  'card draw',
  'color fixing',
  'cost reduction',
  'counterspell',
  'land',
  'mana ramp',
  'protection',
  'recursion',
  'removal',
  'tutor',
]);

function matchesSignal(pattern: string, signal: string) {
  if (!pattern.includes('*')) return pattern === signal;
  const [prefix, suffix] = pattern.split('*');
  return signal.startsWith(prefix) && signal.endsWith(suffix);
}

export function engineDefinitionForId(id: string) {
  if (id.startsWith('engine:type:')) {
    const type = id.slice('engine:type:'.length);
    return {
      id,
      label: `${type.replace(/\b\w/g, (letter) => letter.toUpperCase())} Typal`,
      desiredEnablersPerPayoff: 3,
      legacyTags: [`type: ${type}`],
      enablerSignals: [],
      payoffSignals: [],
      requiresFunctionalPayoff: true,
    } satisfies EngineDefinition;
  }
  return definitionById.get(id);
}

export function engineFamilyForLegacyTag(tag: string) {
  const normalized = tag.trim().toLowerCase();
  if (FUNCTIONAL_ROLE_TAGS.has(normalized)) return null;
  if (normalized.startsWith('type: '))
    return `engine:type:${normalized.slice(6)}`;
  const definition = definitions.find(
    (candidate) =>
      candidate.legacyTags.includes(normalized) ||
      candidate.legacyTagPatterns?.some((pattern) => pattern.test(normalized)),
  );
  return definition?.id ?? `engine:theme:${normalized}`;
}

export function engineParticipation(
  signals: EngineSignals,
  engineId: string,
) {
  const definition = engineDefinitionForId(engineId);
  if (!definition) return { enabler: false, payoff: false };
  return {
    enabler: definition.enablerSignals.some((pattern) =>
      [...signals.emits].some((signal) => matchesSignal(pattern, signal)),
    ),
    payoff: definition.payoffSignals.some((pattern) =>
      [...signals.listens].some((signal) => matchesSignal(pattern, signal)),
    ),
  };
}

export function engineDefinitions() {
  return [...definitions];
}

export function dedupeEngineFamilies(engineIds: string[]) {
  const result = new Set(engineIds);
  engineIds.forEach((engineId) => {
    engineDefinitionForId(engineId)?.parentEngineIds?.forEach((parentId) =>
      result.delete(parentId),
    );
  });
  return [...result];
}
