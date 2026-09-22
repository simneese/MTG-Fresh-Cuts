import { describe, expect, it } from 'vitest';
import {
  combinedProtectionRate,
  engineSideBalance,
  lowSynergyScore,
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
});
