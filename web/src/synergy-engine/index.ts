export {
  SYNERGY_ANALYSIS_SCHEMA_VERSION,
  deserializeEngineSignals,
  serializeEngineSignals,
} from './types';
export {
  extractCardEffects,
  clearCardEffectCache,
  oracleParagraphs,
  oracleTextWithoutReminderText,
} from './extract-effects';
export type { OracleParagraph } from './extract-effects';
export { buildEngineSignals, signalPathsBetween } from './relationship-graph';
export {
  ENGINE_SCORING_CONFIG,
  dedupeEngineFamilies,
  engineDefinitionForId,
  engineDefinitions,
  engineFamilyForLegacyTag,
  engineParticipation,
} from './engine-registry';
export type { EngineDefinition } from './engine-registry';
export {
  SYNERGY_SCORING_CONFIG,
  combinedProtectionRate,
  engineSideBalance,
  lowSynergyScore,
} from './scoring';
export {
  ROLE_DEFINITIONS,
  calculateRoleTargets,
  roleDefinition,
} from './role-registry';
export type {
  DeckRoleContext,
  RoleDefinition,
  RoleName,
} from './role-registry';

export type {
  CardEffect,
  CardSynergyAnalysis,
  EffectAbilityKind,
  EffectController,
  EffectDirection,
  EffectEvent,
  EffectEvidence,
  EffectQuantity,
  EffectSubject,
  EffectSubjectKind,
  EffectTiming,
  EffectZone,
  EngineSignals,
  NamedTokenType,
  SerializedEngineSignals,
} from './types';
