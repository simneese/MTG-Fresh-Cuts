export type OptimizationCardReport = {
  name: string;
  totalCutScore: number;
  curveCutScore: number;
  synergyCutScore: number;
  roleFitCutScore: number;
  priceCutScore: number;
  popularityCutScore: number;
  themes: string[];
  roles: string[];
  effects: string[];
  engineProtectionPercent: number;
  efficiencyProtectionPercent: number;
  commanderProtectionPercent: number;
};

export type OptimizationComparisonReport = {
  schemaVersion: 1;
  deck: string;
  commander: string;
  activeCardCount: number;
  generatedAt: string;
  cards: [OptimizationCardReport, OptimizationCardReport];
  observedOrdering: string;
  scoreGap: number;
};

export function buildOptimizationComparisonReport({
  deck,
  commander,
  activeCardCount,
  generatedAt = new Date().toISOString(),
  cards,
}: {
  deck: string;
  commander: string;
  activeCardCount: number;
  generatedAt?: string;
  cards: [OptimizationCardReport, OptimizationCardReport];
}): OptimizationComparisonReport {
  const [first, second] = cards;
  const scoreGap = Math.abs(first.totalCutScore - second.totalCutScore);
  const observedOrdering =
    first.totalCutScore === second.totalCutScore
      ? `${first.name} and ${second.name} are tied`
      : first.totalCutScore < second.totalCutScore
        ? `${first.name} is currently more protected than ${second.name}`
        : `${second.name} is currently more protected than ${first.name}`;
  return {
    schemaVersion: 1,
    deck,
    commander,
    activeCardCount,
    generatedAt,
    cards,
    observedOrdering,
    scoreGap,
  };
}

export function serializeOptimizationComparisonReport(
  report: OptimizationComparisonReport,
) {
  return JSON.stringify(report, null, 2);
}
