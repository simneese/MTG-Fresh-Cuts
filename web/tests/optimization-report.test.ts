import { describe, expect, it } from 'vitest';
import {
  buildOptimizationComparisonReport,
  serializeOptimizationComparisonReport,
  type OptimizationCardReport,
} from '../src/synergy-engine/optimization-report';

const card = (name: string, totalCutScore: number): OptimizationCardReport => ({
  name,
  totalCutScore,
  curveCutScore: 10,
  synergyCutScore: 20,
  roleFitCutScore: 30,
  priceCutScore: 0,
  popularityCutScore: 40,
  themes: ['Example Theme'],
  roles: ['Removal'],
  effects: ['Exiles Creature'],
  engineProtectionPercent: 25,
  efficiencyProtectionPercent: 10,
  commanderProtectionPercent: 5,
});

describe('engine optimization comparison reports', () => {
  it('records the observed ordering and complete score inputs deterministically', () => {
    const report = buildOptimizationComparisonReport({
      deck: 'Test deck',
      commander: 'Test Commander',
      activeCardCount: 100,
      generatedAt: '2026-09-25T00:00:00.000Z',
      cards: [card('Preferred Card', 18), card('Cuttable Card', 47)],
    });
    expect(report.observedOrdering).toBe(
      'Preferred Card is currently more protected than Cuttable Card',
    );
    expect(report.scoreGap).toBe(29);
    expect(JSON.parse(serializeOptimizationComparisonReport(report))).toEqual(
      report,
    );
  });
});
