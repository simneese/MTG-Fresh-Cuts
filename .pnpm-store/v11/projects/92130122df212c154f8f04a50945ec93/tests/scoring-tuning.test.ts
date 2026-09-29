import { describe, expect, it } from 'vitest';
import {
  combinedProtectionRate,
  engineSideBalance,
  lowSynergyScore,
  manualThemeProtectionRate,
  protectedOverallCutScore,
} from '../src/synergy-engine/scoring';

describe('deck-level scoring outcomes', () => {
  it('fully supports a commander-backed typal payoff at the desired ratio', () => {
    expect(
      engineSideBalance({
        side: 'payoff',
        enablers: 4,
        payoffs: 1.3,
        desiredRatio: 3,
      }),
    ).toBe(1);
  });

  it('reduces protection for a heavily oversupplied enabler side', () => {
    expect(
      engineSideBalance({
        side: 'enabler',
        enablers: 10,
        payoffs: 1,
        desiredRatio: 2,
      }),
    ).toBeCloseTo(0.2);
  });

  it('caps combined protections at half the low-synergy pressure', () => {
    expect(
      combinedProtectionRate({
        engine: 0.25,
        efficiency: 0.15,
        indirectCommander: 0.3,
      }).combined,
    ).toBe(0.5);
  });

  it('weights role surplus more heavily than theme mismatch', () => {
    const themeOnly = lowSynergyScore({
      themeMismatch: 1,
      roleSurplus: 0,
      engineProtection: 0,
      efficiencyProtection: 0,
      indirectCommanderProtection: 0,
    });
    const roleOnly = lowSynergyScore({
      themeMismatch: 0,
      roleSurplus: 1,
      engineProtection: 0,
      efficiencyProtection: 0,
      indirectCommanderProtection: 0,
    });
    expect(themeOnly.score).toBe(0.3);
    expect(roleOnly.score).toBe(0.7);
  });

  it('gives manually boosted themes meaningful protection with diminishing returns', () => {
    expect(manualThemeProtectionRate(0)).toBe(0);
    expect(manualThemeProtectionRate(1)).toBe(0.25);
    expect(manualThemeProtectionRate(2)).toBe(0.4);
    expect(manualThemeProtectionRate(3)).toBe(0.5);
    expect(manualThemeProtectionRate(8)).toBe(0.5);
  });

  it('protects a confirmed commander-fed payoff over a generic flexible card', () => {
    const tangletroveKelp = protectedOverallCutScore({
      curve: 0.46,
      synergyBeforeProtections: 0.14 / 0.75,
      price: 0,
      popularity: 0.48,
      priceIsActive: false,
      standardProtectionRate: 0.25,
    }).score;
    const seaGateRestoration = protectedOverallCutScore({
      curve: 0.46,
      synergyBeforeProtections: 0.14,
      price: 0,
      popularity: 0.45,
      priceIsActive: false,
      standardProtectionRate: 0,
    }).score;

    expect(seaGateRestoration - tangletroveKelp).toBeGreaterThanOrEqual(0.05);
  });
});
