import type { Candidate, Mission, Ranking } from './contracts';
import { DAILY_REQUESTS, prevalenceReading } from './deployment';
import { instrumentReading } from './instruments';

export const EPSILON = 1e-9;
export const GATES = [
  { key: 'minPrecision', metric: 'precision', label: 'Precision', direction: 1, scale: 1, unit: '%' },
  { key: 'minRecall', metric: 'recall', label: 'Recall', direction: 1, scale: 1, unit: '%' },
  { key: 'maxFalsePositiveRate', metric: 'falsePositiveRate', label: 'False-positive rate', direction: -1, scale: 1, unit: '%' },
  { key: 'maxP95LatencyMs', metric: 'p95LatencyMs', label: 'P95 latency', direction: -1, scale: 100, unit: 'ms' },
  { key: 'maxDailyCostUsd', metric: 'dailyCostUsd', label: 'Daily cost', direction: -1, scale: 3000, unit: 'USD/day' },
  { key: 'maxCostPer1kUsd', metric: 'costPer1kUsd', label: 'Cost / 1k', direction: -1, scale: 5, unit: 'USD' },
  { key: 'minThroughputRps', metric: 'throughputRps', label: 'Measured throughput', direction: 1, scale: 100, unit: 'req/s' },
] as const;
export type Gate = typeof GATES[number];
export type Violation = Gate & { observed: number | null; limit: number; margin: number | null; passes: boolean; precisionRounded: boolean };
export const DEPLOYMENT_MISSION: Mission = {
  minPrecision: 0.55, minRecall: 0.95, maxFalsePositiveRate: 0.1, maxP95LatencyMs: 100,
  maxDailyCostUsd: 3500, maxCostPer1kUsd: 5, targetPrevalence: 0.1,
};

function metrics(candidate: Candidate, mission: Mission, requests: number) {
  const adjusted = mission.targetPrevalence === undefined ? null
    : prevalenceReading(mission.targetPrevalence, candidate.recall, candidate.falsePositiveRate, undefined, false);
  return {
    precision: adjusted ? adjusted.value : candidate.precision,
    exactPerfectPrecision: adjusted ? adjusted.state === 'boundary' && adjusted.value === 1 : candidate.precision === 1,
    recall: candidate.recall, falsePositiveRate: candidate.falsePositiveRate, p95LatencyMs: candidate.p95LatencyMs,
    costPer1kUsd: candidate.costPer1kUsd,
    dailyCostUsd: mission.maxDailyCostUsd === undefined ? null : instrumentReading('cost', requests,
      candidate.costPer1kUsd === null ? null : candidate.costPer1kUsd / 1000, false).value,
    throughputRps: candidate.performance?.provenance === 'measured' ? candidate.performance.requestsPerSecond : null,
  };
}

type Metrics = ReturnType<typeof metrics>;

function check(values: Metrics, gates: readonly Gate[], mission: Mission): Violation[] {
  return gates.flatMap(gate => {
    const observed = values[gate.metric], limit = mission[gate.key];
    if (limit === undefined) return [];
    const margin = observed === null ? null : gate.direction * (observed - limit);
    // A few ulps absorb arithmetic roundoff from scale inversion at a gate.
    const tolerance = mission.targetPrevalence === undefined ? EPSILON
      : 64 * Number.EPSILON * Math.max(Math.abs(limit), Math.abs(observed ?? 0));
    const roundedToPerfect = mission.targetPrevalence !== undefined && gate.key === 'minPrecision' && limit === 1 && !values.exactPerfectPrecision;
    return [{ ...gate, observed, limit, margin, precisionRounded: roundedToPerfect && observed === 1,
      passes: margin !== null && margin >= -tolerance && !roundedToPerfect }];
  });
}

const activeGates = (mission: Mission) => GATES.filter(gate => mission[gate.key] !== undefined);

export function checkConstraints(candidate: Candidate, mission: Mission, requests = DAILY_REQUESTS) {
  return check(metrics(candidate, mission, requests), activeGates(mission), mission);
}

const legacyMission: Mission = { minRecall: 0, minPrecision: 0, maxP95LatencyMs: 100, maxCostPer1kUsd: 5 };

function outranks(a: Candidate, b: Candidate, av: Metrics, bv: Metrics, gates: readonly Gate[]) {
  if (a.datasetId !== b.datasetId || a.datasetSha256 !== b.datasetSha256) return false;
  let better = false;
  for (const gate of gates) {
    const x = av[gate.metric], y = bv[gate.metric];
    if (x === null || y === null) return false;
    const diff = gate.direction * (x - y);
    if (diff < 0) return false;
    if (diff > 0) better = true;
  }
  return better;
}

export function dominates(a: Candidate, b: Candidate) {
  return outranks(a, b, metrics(a, legacyMission, DAILY_REQUESTS), metrics(b, legacyMission, DAILY_REQUESTS), activeGates(legacyMission));
}

export function paretoFrontier(candidates: readonly Candidate[], mission = legacyMission, requests = DAILY_REQUESTS,
  values = new Map(candidates.map(candidate => [candidate.id, metrics(candidate, mission, requests)]))) {
  const gates = activeGates(mission);
  const complete = candidates.filter(candidate => gates.every(gate => values.get(candidate.id)![gate.metric] !== null));
  return complete.filter(candidate => !complete.some(other => outranks(other, candidate, values.get(other.id)!, values.get(candidate.id)!, gates)))
    .map(candidate => candidate.id).sort();
}

export function evaluateEnvelope(candidates: readonly Candidate[], mission: Mission, ranking: Ranking, requests = DAILY_REQUESTS) {
  const gates = activeGates(mission);
  const values = new Map(candidates.map(candidate => [candidate.id, metrics(candidate, mission, requests)]));
  const checks = new Map(candidates.map(candidate => [candidate.id, check(values.get(candidate.id)!, gates, mission)]));
  const feasible = candidates.filter(candidate => checks.get(candidate.id)!.every(gate => gate.passes));
  const priority = { min_fpr: 'falsePositiveRate', min_latency: 'p95LatencyMs', min_cost: 'costPer1kUsd',
    max_recall: 'recall', max_precision: 'precision' } as const;
  const direction = ranking.startsWith('max') ? -1 : 1;
  const sortValue = (c: Candidate) => {
    const metric = values.get(c.id)![priority[ranking]];
    return metric === null ? Infinity : metric * direction;
  };
  const compare = (a: Candidate, b: Candidate) => sortValue(a) - sortValue(b) ||
    a.costPer1kUsd! - b.costPer1kUsd! || a.id.localeCompare(b.id);
  const failedCounts = gates.map(gate => ({
    label: gate.label, count: [...checks.values()].filter(result => result.some(item => item.key === gate.key && !item.passes)).length,
  })).sort((a, b) => b.count - a.count);
  const alternatives = candidates.flatMap(candidate => {
    const failures = checks.get(candidate.id)!.filter(gate => !gate.passes);
    if (!failures.length) return [];
    return [{ candidate, failures, distance: failures.reduce((sum, gate) => sum + (gate.margin === null ? Infinity : Math.abs(gate.margin) / gate.scale), 0) }];
  }).sort((a, b) => a.failures.length - b.failures.length || a.distance - b.distance || a.candidate.id.localeCompare(b.candidate.id));
  return {
    values, checks, feasibleIds: new Set(feasible.map(candidate => candidate.id)),
    globalParetoIds: new Set(paretoFrontier(candidates, mission, requests, values)),
    feasibleParetoIds: new Set(paretoFrontier(feasible, mission, requests, values)),
    recommendedId: [...feasible].sort(compare)[0]?.id ?? null,
    failedCounts, alternatives,
  };
}

export function resolveSelection(candidates: readonly Candidate[], selectedId: string | null, fallback: string | null) {
  return candidates.find(candidate => candidate.id === selectedId) ??
    candidates.find(candidate => candidate.id === fallback) ?? candidates[0] ?? null;
}
