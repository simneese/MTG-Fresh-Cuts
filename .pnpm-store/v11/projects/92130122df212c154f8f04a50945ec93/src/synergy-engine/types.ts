// Version 15 keeps specific event listeners exact while producers imply broader events.
// Older cached analysis must rebuild.
export const SYNERGY_ANALYSIS_SCHEMA_VERSION = 28;

export type EffectZone =
  | 'library'
  | 'hand'
  | 'battlefield'
  | 'graveyard'
  | 'exile'
  | 'stack'
  | 'command-zone';

export type EffectSubjectKind =
  | 'card'
  | 'spell'
  | 'permanent'
  | 'creature'
  | 'artifact'
  | 'enchantment'
  | 'land'
  | 'planeswalker'
  | 'battle'
  | 'token'
  | 'player';

export type NamedTokenType =
  | 'blood'
  | 'clue'
  | 'food'
  | 'gold'
  | 'incubator'
  | 'map'
  | 'powerstone'
  | 'treasure';

export type EffectController =
  | 'you'
  | 'opponent'
  | 'each-opponent'
  | 'each-player'
  | 'target-player'
  | 'owner'
  | 'controller'
  | 'any';

export type EffectSubject = {
  kind: EffectSubjectKind;
  controller?: EffectController;
  tokenType?: NamedTokenType;
  creatureTypes?: string[];
  qualifiers?: string[];
};

export type EffectEvent =
  | 'attacks'
  | 'animated'
  | 'attached'
  | 'cast'
  | 'combat-damage'
  | 'copied'
  | 'countered'
  | 'counter-added'
  | 'count-increased'
  | 'created'
  | 'damaged'
  | 'discarded'
  | 'dies'
  | 'drawn'
  | 'enters-battlefield'
  | 'exiled'
  | 'leaves-battlefield'
  | 'life-gained'
  | 'life-lost'
  | 'milled'
  | 'accessed'
  | 'investigated'
  | 'keyword-granted'
  | 'played'
  | 'power-increased'
  | 'returned'
  | 'restricted'
  | 'sacrificed'
  | 'searched'
  | 'surveilled'
  | 'tapped'
  | 'untapped';

export type EffectDirection =
  | 'emits'
  | 'listens'
  | 'consumes'
  | 'creates'
  | 'grants'
  | 'transforms';

export type EffectAbilityKind =
  | 'spell'
  | 'activated'
  | 'triggered'
  | 'static'
  | 'replacement'
  | 'keyword';

export type EffectTiming = {
  abilityKind: EffectAbilityKind;
  repeatable: boolean;
  multiUsePerTurn: boolean;
  instantSpeed: boolean;
  oncePerTurn: boolean;
  requiresTap: boolean;
  sorcerySpeedOnly: boolean;
};

export type EffectQuantity = {
  minimum: number;
  expected: number;
  unbounded: boolean;
  scalesWithPlayers: boolean;
  expression?: string;
};

export type EffectEvidence = {
  detectorId: string;
  paragraphIndex: number;
  paragraphText: string;
  matchedText: string;
  start: number;
  end: number;
  inferred: boolean;
};

export type CardEffect = {
  id: string;
  label: string;
  direction: EffectDirection;
  event: EffectEvent;
  subject: EffectSubject;
  sourceZone?: EffectZone;
  destinationZone?: EffectZone;
  timing: EffectTiming;
  quantity: EffectQuantity;
  conditions: string[];
  evidence: [EffectEvidence, ...EffectEvidence[]];
};

export type EngineSignals = {
  emits: Set<string>;
  listens: Set<string>;
  eligible: Set<string>;
  support: Set<string>;
};

export type SerializedEngineSignals = {
  emits: string[];
  listens: string[];
  eligible: string[];
  support: string[];
};

export type CardSynergyAnalysis = {
  schemaVersion: typeof SYNERGY_ANALYSIS_SCHEMA_VERSION;
  cardKey: string;
  effects: CardEffect[];
  signals: SerializedEngineSignals;
};

export function serializeEngineSignals(
  signals: EngineSignals,
): SerializedEngineSignals {
  return {
    emits: [...signals.emits].sort(),
    listens: [...signals.listens].sort(),
    eligible: [...signals.eligible].sort(),
    support: [...signals.support].sort(),
  };
}

export function deserializeEngineSignals(
  signals: SerializedEngineSignals,
): EngineSignals {
  return {
    emits: new Set(signals.emits),
    listens: new Set(signals.listens),
    eligible: new Set(signals.eligible ?? []),
    support: new Set(signals.support ?? []),
  };
}
