export type RoleName =
  | 'Tutor'
  | 'Removal'
  | 'Card draw'
  | 'Mana ramp'
  | 'Protection'
  | 'Recursion'
  | 'Graveyard control'
  | 'Land';

export type DeckRoleContext = {
  surveilCount: number;
  sacrificeThemeCount: number;
  xSpellCount: number;
  xPayoffCount: number;
  averageManaValue: number;
};

export type RoleDefinition = {
  name: RoleName;
  minimum: number;
  maximum: number;
  qualityTags: string[];
  comparisonGroups: string[];
  themeDrivers: string[];
  adjustment?: (context: DeckRoleContext) => number;
  adjustmentReasons?: (context: DeckRoleContext) => string[];
};

export const ROLE_DEFINITIONS: readonly RoleDefinition[] = [
  {
    name: 'Tutor',
    minimum: 1,
    maximum: 3,
    qualityTags: ['tutor'],
    comparisonGroups: ['unrestricted tutor', 'typed tutor', 'top-of-library tutor'],
    themeDrivers: [],
  },
  {
    name: 'Removal',
    minimum: 6,
    maximum: 10,
    qualityTags: ['removal'],
    comparisonGroups: ['destroy', 'exile', 'forced sacrifice', 'bounce'],
    themeDrivers: [],
  },
  {
    name: 'Card draw',
    minimum: 8,
    maximum: 12,
    qualityTags: ['card draw'],
    comparisonGroups: ['burst draw', 'repeatable draw', 'conditional draw'],
    themeDrivers: [],
  },
  {
    name: 'Mana ramp',
    minimum: 8,
    maximum: 12,
    qualityTags: ['mana ramp', 'cost reduction'],
    comparisonGroups: [
      'land ramp',
      'mana permanent',
      'cost reduction',
      'land untap',
    ],
    themeDrivers: ['X-cost spells', 'high average mana value'],
    adjustment: ({
      xSpellCount,
      xPayoffCount,
      averageManaValue,
    }) => {
      const curveAdjustment =
        averageManaValue >= 4
          ? 2
          : averageManaValue >= 3.3
            ? 1
            : averageManaValue > 0 && averageManaValue < 2.4
              ? -2
              : averageManaValue > 0 && averageManaValue < 2.8
                ? -1
                : 0;
      return Math.max(
        -2,
        Math.min(
          5,
          Math.round(xSpellCount * 0.4 + xPayoffCount * 0.6) +
            curveAdjustment,
        ),
      );
    },
    adjustmentReasons: ({
      xSpellCount,
      xPayoffCount,
      averageManaValue,
    }) => [
      `${xSpellCount} X-cost spell${xSpellCount === 1 ? '' : 's'}`,
      `${xPayoffCount} major X payoff${xPayoffCount === 1 ? '' : 's'}`,
      `average spell MV ${averageManaValue.toFixed(2)}`,
    ],
  },
  {
    name: 'Protection',
    minimum: 3,
    maximum: 6,
    qualityTags: ['protection', 'counterspell'],
    comparisonGroups: [
      'counterspell',
      'hexproof or protection',
      'indestructible',
      'regeneration',
    ],
    themeDrivers: [],
  },
  {
    name: 'Recursion',
    minimum: 2,
    maximum: 5,
    qualityTags: ['recursion'],
    comparisonGroups: [
      'to battlefield',
      'to hand',
      'to library',
      'self recursion',
      'cast from graveyard',
    ],
    themeDrivers: ['Surveil', 'Sacrifice'],
    adjustment: ({ surveilCount, sacrificeThemeCount }) =>
      Math.min(5, Math.round(surveilCount / 6 + sacrificeThemeCount / 5)),
    adjustmentReasons: ({ surveilCount, sacrificeThemeCount }) => [
      `${surveilCount} Surveil card${surveilCount === 1 ? '' : 's'}`,
      `${sacrificeThemeCount} sacrifice-theme card${sacrificeThemeCount === 1 ? '' : 's'}`,
    ],
  },
  {
    name: 'Graveyard control',
    minimum: 1,
    maximum: 3,
    qualityTags: ['graveyard control'],
    comparisonGroups: [
      'single-card graveyard control',
      'repeatable graveyard control',
      'graveyard wipe',
    ],
    themeDrivers: [],
  },
  {
    name: 'Land',
    minimum: 34,
    maximum: 40,
    qualityTags: ['land'],
    comparisonGroups: ['basic land', 'color source', 'utility land', 'MDFC land'],
    themeDrivers: [],
  },
] as const;

const definitionByName = new Map(
  ROLE_DEFINITIONS.map((definition) => [definition.name, definition] as const),
);

export function roleDefinition(name: RoleName) {
  return definitionByName.get(name)!;
}

export function calculateRoleTargets(context: DeckRoleContext) {
  return ROLE_DEFINITIONS.map((role) => {
    const adjustment = role.adjustment?.(context) ?? 0;
    return {
      ...role,
      baseMinimum: role.minimum,
      baseMaximum: role.maximum,
      minimum: Math.max(0, role.minimum + adjustment),
      maximum: Math.max(1, role.maximum + adjustment),
      adjustment,
      reasons: role.adjustmentReasons?.(context) ?? [],
    };
  });
}
