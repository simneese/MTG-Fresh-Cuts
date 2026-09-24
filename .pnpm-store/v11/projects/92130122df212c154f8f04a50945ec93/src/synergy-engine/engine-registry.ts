import type { EngineSignals } from './types';

export type EngineDefinition = {
  id: string;
  label: string;
  desiredEnablersPerPayoff: number;
  legacyTags: string[];
  legacyTagPatterns?: RegExp[];
  enablerSignals: string[];
  payoffSignals: string[];
  eligibilitySignals?: string[];
  supportSignals?: string[];
  requiresFunctionalPayoff?: boolean;
  parentEngineIds?: string[];
  specializationEnablerSignals?: string[];
  specializationPayoffSignals?: string[];
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
    legacyTags: ['sacrifice'],
    enablerSignals: ['permanent-sacrificed'],
    payoffSignals: ['permanent-sacrificed'],
  },
  {
    id: 'engine:death',
    label: 'Creature Death',
    desiredEnablersPerPayoff: 2,
    legacyTags: ['type-event: creature dies'],
    enablerSignals: ['creature-dies'],
    payoffSignals: ['creature-dies'],
  },
  {
    id: 'engine:exile',
    label: 'Exile',
    desiredEnablersPerPayoff: 2,
    legacyTags: [],
    enablerSignals: ['permanent-exiled', 'card-exiled'],
    payoffSignals: ['permanent-exiled', 'card-exiled'],
  },
  {
    id: 'engine:leaves-battlefield',
    label: 'Leaves the Battlefield',
    desiredEnablersPerPayoff: 2,
    legacyTags: [],
    enablerSignals: ['permanent-leaves-battlefield'],
    payoffSignals: ['permanent-leaves-battlefield'],
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
    id: 'engine:creature-cast',
    label: 'Creature Cast',
    desiredEnablersPerPayoff: 6,
    legacyTags: [],
    enablerSignals: ['creature-cast-enabled'],
    payoffSignals: ['creature-cast'],
    eligibilitySignals: ['creature-cast'],
  },
  {
    id: 'engine:spell-copy',
    label: 'Spell Copy',
    desiredEnablersPerPayoff: 8,
    legacyTags: [],
    enablerSignals: ['spell-copy-enabled'],
    payoffSignals: ['copyable-spell-cast'],
    eligibilitySignals: ['copyable-spell-cast'],
    requiresFunctionalPayoff: true,
  },
  {
    id: 'engine:creature-spell-copy',
    label: 'Creature Spell Copy',
    desiredEnablersPerPayoff: 8,
    legacyTags: [],
    enablerSignals: ['creature-spell-copy-enabled'],
    specializationEnablerSignals: ['creature-spell-copy-compatible'],
    specializationPayoffSignals: ['copyable-spell-cast'],
    payoffSignals: [
      'copyable-creature-spell-cast',
      'copyable-nonlegendary-creature-spell-cast',
    ],
    eligibilitySignals: [
      'copyable-creature-spell-cast',
      'copyable-nonlegendary-creature-spell-cast',
    ],
    requiresFunctionalPayoff: true,
    parentEngineIds: ['engine:spell-copy'],
  },
  {
    id: 'engine:creature-copy',
    label: 'Creature Copy',
    desiredEnablersPerPayoff: 6,
    legacyTags: [],
    enablerSignals: ['creature-copy-enabled'],
    payoffSignals: ['copyable-creature'],
    eligibilitySignals: ['copyable-creature'],
    requiresFunctionalPayoff: true,
  },
  {
    id: 'engine:artifact-animation',
    label: 'Artifact Animation',
    desiredEnablersPerPayoff: 4,
    legacyTags: [],
    enablerSignals: ['artifact-animation-enabled'],
    payoffSignals: ['animatable-artifact'],
    eligibilitySignals: ['animatable-artifact'],
    supportSignals: ['artifact-animation-supported'],
    requiresFunctionalPayoff: true,
  },
  {
    id: 'engine:clue-animation',
    label: 'Clue Animation',
    desiredEnablersPerPayoff: 4,
    legacyTags: [],
    enablerSignals: ['clue-animation-enabled'],
    specializationEnablerSignals: ['artifact-animation-enabled'],
    specializationPayoffSignals: ['animatable-artifact'],
    payoffSignals: ['animatable-clue'],
    eligibilitySignals: ['animatable-clue'],
    supportSignals: ['clue-animation-supported'],
    requiresFunctionalPayoff: true,
    parentEngineIds: ['engine:artifact-animation'],
  },
  {
    id: 'engine:creature-power',
    label: 'Creature Power',
    desiredEnablersPerPayoff: 3,
    legacyTags: [],
    enablerSignals: ['creature-power-increased'],
    payoffSignals: ['creature-power-increased'],
  },
  {
    id: 'engine:combat-damage',
    label: 'Combat Damage',
    desiredEnablersPerPayoff: 2,
    legacyTags: ['combat damage'],
    enablerSignals: ['combat-damage-enabled'],
    payoffSignals: ['*-combat-damage'],
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

const COMMON_SACRIFICE_TYPES = [
  'artifact',
  'battle',
  'blood',
  'clue',
  'creature',
  'enchantment',
  'food',
  'gold',
  'incubator',
  'land',
  'map',
  'planeswalker',
  'powerstone',
  'token',
  'treasure',
] as const;

const INTRINSIC_SACRIFICE_TOKEN_TYPES = new Set([
  'blood',
  'clue',
  'food',
  'gold',
  'map',
  'treasure',
]);

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
  'graveyard control',
  'removal',
  'tutor',
]);

function matchesSignal(pattern: string, signal: string) {
  if (!pattern.includes('*')) return pattern === signal;
  const [prefix, suffix] = pattern.split('*');
  return signal.startsWith(prefix) && signal.endsWith(suffix);
}

export function engineDefinitionForId(id: string) {
  if (id.startsWith('engine:sacrifice:')) {
    const type = id.slice('engine:sacrifice:'.length);
    const namedArtifactTokens = new Set([
      'blood',
      'clue',
      'food',
      'gold',
      'incubator',
      'map',
      'powerstone',
      'treasure',
    ]);
    return {
      id,
      label: `${type.replace(/\b\w/g, (letter) => letter.toUpperCase())} Sacrifice`,
      desiredEnablersPerPayoff: 2,
      legacyTags: [`type-event: ${type} sacrificed`],
      enablerSignals: [`${type}-sacrificed`],
      payoffSignals: [`${type}-sacrificed`],
      supportSignals: INTRINSIC_SACRIFICE_TOKEN_TYPES.has(type)
        ? [`${type}-sacrifice-supported`]
        : [],
      parentEngineIds: [
        'engine:sacrifice',
        ...(namedArtifactTokens.has(type)
          ? ['engine:sacrifice:artifact', 'engine:sacrifice:token']
          : []),
      ],
    } satisfies EngineDefinition;
  }
  if (id.startsWith('engine:type:')) {
    const type = id.slice('engine:type:'.length);
    return {
      id,
      label: `${type.replace(/\b\w/g, (letter) => letter.toUpperCase())} Typal`,
      desiredEnablersPerPayoff: 3,
      legacyTags: [`type: ${type}`],
      enablerSignals: [`type:${type}-present`],
      payoffSignals: [`type:${type}-present`],
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
  const sacrificedType = normalized.match(/^type-event: (.+) sacrificed$/)?.[1];
  if (sacrificedType) return `engine:sacrifice:${sacrificedType}`;
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
  if (!definition)
    return { enabler: false, payoff: false, eligible: false, support: false };
  return {
    enabler: definition.enablerSignals.some((pattern) =>
      [...signals.emits].some((signal) => matchesSignal(pattern, signal)),
    ),
    payoff: definition.payoffSignals.some((pattern) =>
      [...signals.listens].some((signal) => matchesSignal(pattern, signal)),
    ),
    eligible: (definition.eligibilitySignals ?? []).some((pattern) =>
      [...signals.eligible].some((signal) => matchesSignal(pattern, signal)),
    ),
    support: (definition.supportSignals ?? []).some((pattern) =>
      [...signals.support].some((signal) => matchesSignal(pattern, signal)),
    ),
  };
}

export function engineSpecializationParticipation(
  signals: EngineSignals,
  engineId: string,
) {
  const roles = engineSpecializationRoles(signals, engineId);
  return roles.enabler || roles.payoff;
}

export function engineSpecializationRoles(
  signals: EngineSignals,
  engineId: string,
) {
  const definition = engineDefinitionForId(engineId);
  return {
    enabler: Boolean(
      definition?.specializationEnablerSignals?.some((pattern) =>
      [...signals.emits].some((signal) => matchesSignal(pattern, signal)),
      ),
    ),
    payoff: Boolean(
      definition?.specializationPayoffSignals?.some((pattern) =>
        [...signals.listens].some((signal) => matchesSignal(pattern, signal)),
      ),
    ),
  };
}

export function engineIsActive(
  deckSignals: Iterable<EngineSignals>,
  engineId: string,
) {
  let hasEnabler = false;
  let hasPayoff = false;
  let hasSupport = false;
  let hasEligibleParticipant = false;
  for (const signals of deckSignals) {
    const participation = engineParticipation(signals, engineId);
    hasEnabler ||= participation.enabler;
    hasPayoff ||= participation.payoff;
    hasSupport ||= participation.support;
    hasEligibleParticipant ||= participation.eligible;
  }
  return (
    hasPayoff && (hasEnabler || hasSupport || hasEligibleParticipant)
  );
}

export function engineDefinitions() {
  return [
    ...definitions,
    ...COMMON_SACRIFICE_TYPES.map((type) =>
      engineDefinitionForId(`engine:sacrifice:${type}`),
    ).filter((definition): definition is EngineDefinition => Boolean(definition)),
  ];
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
