export const SYNERGY_SCORING_CONFIG = {
  themePressureWeight: 0.3,
  rolePressureWeight: 0.7,
  engineProtectionMaximum: 0.25,
  efficiencyProtectionMaximum: 0.15,
  indirectCommanderProtectionMaximum: 0.3,
  combinedProtectionMaximum: 0.5,
  manualThemeFirstProtection: 0.25,
  manualThemeSecondProtection: 0.15,
  manualThemeAdditionalProtection: 0.1,
  manualThemeProtectionMaximum: 0.5,
  secondaryEngineWeight: 0.25,
  tertiaryEngineWeight: 0.1,
  payoffEnginePrevalenceFloor: 0.65,
} as const;

export function manualThemeProtectionRate(boostedThemeCount: number) {
  if (boostedThemeCount <= 0) return 0;
  const protection =
    SYNERGY_SCORING_CONFIG.manualThemeFirstProtection +
    (boostedThemeCount >= 2
      ? SYNERGY_SCORING_CONFIG.manualThemeSecondProtection
      : 0) +
    Math.max(0, boostedThemeCount - 2) *
      SYNERGY_SCORING_CONFIG.manualThemeAdditionalProtection;
  return Math.min(
    SYNERGY_SCORING_CONFIG.manualThemeProtectionMaximum,
    protection,
  );
}

export function engineSideBalance({
  side,
  enablers,
  payoffs,
  desiredRatio,
}: {
  side: 'enabler' | 'payoff' | 'both' | 'none';
  enablers: number;
  payoffs: number;
  desiredRatio: number;
}) {
  if (side === 'both') return 1;
  if (side === 'none') return 0;
  return side === 'enabler'
    ? Math.min(1, (payoffs * desiredRatio) / Math.max(1, enablers))
    : Math.min(1, enablers / Math.max(1, payoffs * desiredRatio));
}

export function combinedProtectionRate({
  engine,
  efficiency,
  indirectCommander,
}: {
  engine: number;
  efficiency: number;
  indirectCommander: number;
}) {
  const uncapped =
    1 -
    (1 - engine) *
      (1 - efficiency) *
      (1 - indirectCommander);
  return {
    uncapped,
    combined: Math.min(
      SYNERGY_SCORING_CONFIG.combinedProtectionMaximum,
      uncapped,
    ),
  };
}

export function lowSynergyScore({
  themeMismatch,
  roleSurplus,
  engineProtection,
  efficiencyProtection,
  indirectCommanderProtection,
}: {
  themeMismatch: number;
  roleSurplus: number;
  engineProtection: number;
  efficiencyProtection: number;
  indirectCommanderProtection: number;
}) {
  const base =
    themeMismatch * SYNERGY_SCORING_CONFIG.themePressureWeight +
    roleSurplus * SYNERGY_SCORING_CONFIG.rolePressureWeight;
  const protection = combinedProtectionRate({
    engine: engineProtection,
    efficiency: efficiencyProtection,
    indirectCommander: indirectCommanderProtection,
  }).combined;
  return { base, protection, score: base * (1 - protection) };
}

export function protectedOverallCutScore({
  curve,
  synergyBeforeProtections,
  price,
  popularity,
  priceIsActive,
  standardProtectionRate,
  manualThemeProtectionRate = 0,
}: {
  curve: number;
  synergyBeforeProtections: number;
  price: number;
  popularity: number;
  priceIsActive: boolean;
  standardProtectionRate: number;
  manualThemeProtectionRate?: number;
}) {
  const synergyAfterManualThemeProtection =
    synergyBeforeProtections * (1 - manualThemeProtectionRate);
  const beforeProtection = priceIsActive
    ? curve * 0.4 +
      synergyAfterManualThemeProtection * 0.3 +
      price * 0.2 +
      popularity * 0.1
    : curve * 0.5 +
      synergyAfterManualThemeProtection * 0.375 +
      popularity * 0.125;
  return {
    synergyAfterManualThemeProtection,
    beforeProtection,
    score: beforeProtection * (1 - standardProtectionRate),
  };
}
