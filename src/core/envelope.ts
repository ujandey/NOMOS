import type { Candidate, Mission, Ranking } from './contracts';

export const EPSILON = 1e-9;
export const GATES = [
  { key: 'minPrecision', metric: 'precision', label: 'Precision', direction: 1, scale: 1, unit: '%' },
  { key: 'minRecall', metric: 'recall', label: 'Recall', direction: 1, scale: 1, unit: '%' },
  { key: 'maxP95LatencyMs', metric: 'p95LatencyMs', label: 'p95 latency', direction: -1, scale: 100, unit: 'ms' },
  { key: 'maxCostPer1kUsd', metric: 'costPer1kUsd', label: 'Cost / 1k', direction: -1, scale: 5, unit: 'USD' },
] as const;
export type Gate = typeof GATES[number];
export type Violation = ReturnType<typeof checkConstraints>[number];

export function checkConstraints(candidate: Candidate, mission: Mission) {
  return GATES.map(gate => {
    const observed = candidate[gate.metric];
    const limit = mission[gate.key];
    const margin = observed === null ? null : gate.direction * (observed - limit);
    return { ...gate, observed, limit, margin, passes: margin !== null && margin >= -EPSILON };
  });
}

export function dominates(a: Candidate, b: Candidate) {
  if (a.datasetId !== b.datasetId || a.datasetSha256 !== b.datasetSha256) return false;
  let better = false;
  for (const gate of GATES) {
    const av = a[gate.metric], bv = b[gate.metric];
    if (av === null || bv === null) return false;
    const diff = gate.direction * (av - bv);
    // Pairwise tolerance can introduce dominance cycles. Mission limits have their own tolerance.
    if (diff < 0) return false;
    if (diff > 0) better = true;
  }
  return better;
}

export function paretoFrontier(candidates: readonly Candidate[]) {
  const complete = candidates.filter(candidate => GATES.every(gate => candidate[gate.metric] !== null));
  return complete.filter(candidate => !complete.some(other => dominates(other, candidate)))
    .map(candidate => candidate.id).sort();
}

export function evaluateEnvelope(candidates: readonly Candidate[], mission: Mission, ranking: Ranking) {
  const checks = new Map(candidates.map(candidate => [candidate.id, checkConstraints(candidate, mission)]));
  const feasible = candidates.filter(candidate => checks.get(candidate.id)!.every(gate => gate.passes));
  const priority = { min_latency: 'p95LatencyMs', min_cost: 'costPer1kUsd', max_recall: 'recall', max_precision: 'precision' } as const;
  const direction = ranking.startsWith('max') ? -1 : 1;
  const compare = (a: Candidate, b: Candidate) =>
    direction * (a[priority[ranking]]! - b[priority[ranking]]!) || a.costPer1kUsd! - b.costPer1kUsd! || a.id.localeCompare(b.id);
  const failedCounts = GATES.map(gate => ({
    label: gate.label,
    count: [...checks.values()].filter(result => result.some(check => check.key === gate.key && !check.passes)).length,
  })).sort((a, b) => b.count - a.count);
  const alternatives = candidates.flatMap(candidate => {
    const gates = checks.get(candidate.id)!;
    if (gates.some(gate => gate.margin === null) || gates.every(gate => gate.passes)) return [];
    const failures = gates.filter(gate => !gate.passes);
    return [{ candidate, failures, distance: failures.reduce((sum, gate) => sum + Math.abs(gate.margin!) / gate.scale, 0) }];
  }).sort((a, b) => a.failures.length - b.failures.length || a.distance - b.distance || a.candidate.id.localeCompare(b.candidate.id));
  return {
    checks, feasibleIds: new Set(feasible.map(candidate => candidate.id)),
    globalParetoIds: new Set(paretoFrontier(candidates)), feasibleParetoIds: new Set(paretoFrontier(feasible)),
    recommendedId: [...feasible].sort(compare)[0]?.id ?? null,
    failedCounts, alternatives,
  };
}

export function resolveSelection(candidates: readonly Candidate[], selectedId: string | null, fallback: string | null) {
  return candidates.find(candidate => candidate.id === selectedId) ??
    candidates.find(candidate => candidate.id === fallback) ?? candidates[0] ?? null;
}

