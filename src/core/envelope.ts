import { DEFAULT_UNCERTAINTY, type Candidate, type Mission, type Ranking, type UncertaintySettings } from './contracts';
import { DAILY_REQUESTS, prevalenceReading } from './deployment';
import { instrumentReading } from './instruments';
import { precisionReference } from './reference';
import { bonferroniLevel, clopperPearson, type Interval } from './statistics';

export const GATES = [
  { key: 'minPrecision', metric: 'precision', label: 'Precision', direction: 1, scale: 1, unit: '%', statistical: true },
  { key: 'minRecall', metric: 'recall', label: 'Recall', direction: 1, scale: 1, unit: '%', statistical: true },
  { key: 'maxFalsePositiveRate', metric: 'falsePositiveRate', label: 'False-positive rate', direction: -1, scale: 1, unit: '%', statistical: true },
  { key: 'maxP95LatencyMs', metric: 'p95LatencyMs', label: 'P95 latency', direction: -1, scale: 100, unit: 'ms', statistical: false },
  { key: 'maxDailyCostUsd', metric: 'dailyCostUsd', label: 'Daily cost', direction: -1, scale: 3000, unit: 'USD/day', statistical: false },
  { key: 'maxCostPer1kUsd', metric: 'costPer1kUsd', label: 'Cost / 1k', direction: -1, scale: 5, unit: 'USD', statistical: false },
  { key: 'minThroughputRps', metric: 'throughputRps', label: 'Measured throughput', direction: 1, scale: 100, unit: 'req/s', statistical: false },
] as const;
export type Gate = typeof GATES[number];
export type Violation = Gate & {
  observed: number | null; limit: number; margin: number | null; passes: boolean; precisionRounded: boolean;
  /** Plausible range under the simultaneous confidence level, for measured classification rates only. */
  range: [number, number] | null;
  /** The value at the unfavourable end of the range (equals the estimate for non-statistical gates). */
  pessimistic: number | null;
  optimistic: number | null;
  robust: boolean;
  possible: boolean;
  known: boolean;
};
export const DEPLOYMENT_MISSION: Mission = {
  minPrecision: 0.55, minRecall: 0.95, maxFalsePositiveRate: 0.1, maxP95LatencyMs: 100,
  maxDailyCostUsd: 3500, maxCostPer1kUsd: 5, targetPrevalence: 0.1,
};

export type Status = 'robust' | 'estimate-only' | 'uncertain' | 'infeasible' | 'unknown';
export const STATUS_TEXT: Record<Status, string> = {
  robust: 'Robustly feasible',
  'estimate-only': 'Passes on estimate only',
  uncertain: 'Misses on estimate, could pass',
  infeasible: 'Fails the mission',
  unknown: 'Evidence unavailable',
};

/** One tolerance rule for every gate: a few ulps of the compared magnitudes absorb scale-inversion roundoff. */
export function limitTolerance(limit: number, observed: number) {
  return 64 * Number.EPSILON * Math.max(Math.abs(limit), Math.abs(observed));
}

export function samplePrevalence(candidate: Candidate) {
  const total = candidate.tp + candidate.fp + candidate.tn + candidate.fn;
  return total ? (candidate.tp + candidate.fn) / total : null;
}

/**
 * The single source of the prevalence used for expected precision. A mission target wins.
 * Without one, precision is evaluated in a population like the evaluation sample, and NOMOS says so.
 */
export function resolvePrevalence(mission: Mission, candidate: Candidate | null) {
  if (mission.targetPrevalence !== undefined) return { value: mission.targetPrevalence, source: 'target' } as const;
  return { value: candidate ? samplePrevalence(candidate) : null, source: 'sample' } as const;
}

export function intervalLevel(settings: UncertaintySettings, familySize: number) {
  // TPR and FPR are the two estimated quantities behind every classification gate.
  const intervals = 2 * (settings.scope === 'all' ? Math.max(1, familySize) : 1);
  return { level: bonferroniLevel(settings.confidence, intervals), intervals };
}

export type RateEvidence = {
  positives: number; negatives: number; level: number;
  tpr: Interval | null; fpr: Interval | null;
  precision: { pessimistic: number | null; optimistic: number | null } | null;
  prevalence: number | null; prevalenceSource: 'target' | 'sample';
};

export function rateEvidence(candidate: Candidate, mission: Mission, level: number): RateEvidence {
  const positives = candidate.tp + candidate.fn, negatives = candidate.fp + candidate.tn;
  const tpr = clopperPearson(candidate.tp, positives, level);
  const fpr = clopperPearson(candidate.fp, negatives, level);
  const prior = resolvePrevalence(mission, candidate);
  // Precision rises with TPR and falls with FPR for any prevalence in (0, 1), so the joint
  // rectangle's corners bound it: worst at (low TPR, high FPR), best at (high TPR, low FPR).
  const precision = tpr && fpr && prior.value !== null ? {
    pessimistic: precisionReference(prior.value, tpr.lower, fpr.upper),
    optimistic: precisionReference(prior.value, tpr.upper, fpr.lower),
  } : null;
  return { positives, negatives, level, tpr, fpr, precision, prevalence: prior.value, prevalenceSource: prior.source };
}

function metrics(candidate: Candidate, mission: Mission, requests: number, level: number) {
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
    evidence: rateEvidence(candidate, mission, level),
  };
}

type Metrics = ReturnType<typeof metrics>;

function exactlyPerfect(prior: number | null, tpr: number, fpr: number) {
  return prior !== null && tpr > 0 && (prior === 1 || (prior > 0 && fpr === 0));
}

function bounds(gate: Gate, values: Metrics) {
  const { tpr, fpr, precision, prevalence } = values.evidence;
  if (gate.metric === 'recall') return tpr && { pessimistic: tpr.lower, optimistic: tpr.upper, range: [tpr.lower, tpr.upper] as [number, number] };
  if (gate.metric === 'falsePositiveRate') return fpr && { pessimistic: fpr.upper, optimistic: fpr.lower, range: [fpr.lower, fpr.upper] as [number, number] };
  if (gate.metric === 'precision') return precision && tpr && fpr && {
    pessimistic: precision.pessimistic, optimistic: precision.optimistic,
    range: precision.pessimistic === null || precision.optimistic === null ? null : [precision.pessimistic, precision.optimistic] as [number, number],
    perfectAtWorst: exactlyPerfect(prevalence, tpr.lower, fpr.upper), perfectAtBest: exactlyPerfect(prevalence, tpr.upper, fpr.lower),
  };
  return null;
}

function check(values: Metrics, gates: readonly Gate[], mission: Mission): Violation[] {
  return gates.flatMap((gate): Violation[] => {
    const observed = values[gate.metric], limit = mission[gate.key];
    if (limit === undefined) return [];
    const satisfies = (value: number | null) => value !== null && gate.direction * (value - limit) >= -limitTolerance(limit, value);
    const margin = observed === null ? null : gate.direction * (observed - limit);
    // An exactly perfect requirement cannot be met by a value that merely rounds to one.
    const perfect = gate.key === 'minPrecision' && limit === 1;
    const roundedToPerfect = perfect && !values.exactPerfectPrecision;
    const passes = satisfies(observed) && !roundedToPerfect;
    if (!gate.statistical) {
      return [{ ...gate, observed, limit, margin, precisionRounded: false, passes, range: null,
        pessimistic: observed, optimistic: observed, robust: passes, possible: passes, known: observed !== null }];
    }
    const stats = bounds(gate, values);
    const pessimistic = stats?.pessimistic ?? null, optimistic = stats?.optimistic ?? null;
    const perfectWorst = stats && 'perfectAtWorst' in stats ? stats.perfectAtWorst === true : true;
    const perfectBest = stats && 'perfectAtBest' in stats ? stats.perfectAtBest === true : true;
    return [{ ...gate, observed, limit, margin, precisionRounded: roundedToPerfect && observed === 1, passes,
      range: stats?.range ?? null, pessimistic, optimistic,
      robust: satisfies(pessimistic) && (!perfect || perfectWorst),
      possible: satisfies(optimistic) && (!perfect || perfectBest),
      known: observed !== null && pessimistic !== null && optimistic !== null }];
  });
}

export function classify(checks: readonly Violation[]): Status {
  if (checks.some(gate => gate.known && !gate.possible)) return 'infeasible';
  if (checks.some(gate => !gate.known)) return 'unknown';
  if (checks.every(gate => gate.robust)) return 'robust';
  return checks.every(gate => gate.passes) ? 'estimate-only' : 'uncertain';
}

const activeGates = (mission: Mission) => GATES.filter(gate => mission[gate.key] !== undefined);

export function checkConstraints(candidate: Candidate, mission: Mission, requests = DAILY_REQUESTS,
  level = intervalLevel(DEFAULT_UNCERTAINTY, 1).level) {
  return check(metrics(candidate, mission, requests, level), activeGates(mission), mission);
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

const defaultLevel = () => intervalLevel(DEFAULT_UNCERTAINTY, 1).level;

export function dominates(a: Candidate, b: Candidate) {
  return outranks(a, b, metrics(a, legacyMission, DAILY_REQUESTS, defaultLevel()), metrics(b, legacyMission, DAILY_REQUESTS, defaultLevel()), activeGates(legacyMission));
}

export function paretoFrontier(candidates: readonly Candidate[], mission = legacyMission, requests = DAILY_REQUESTS,
  values = new Map(candidates.map(candidate => [candidate.id, metrics(candidate, mission, requests, defaultLevel())]))) {
  const gates = activeGates(mission);
  const complete = candidates.filter(candidate => gates.every(gate => values.get(candidate.id)![gate.metric] !== null));
  return complete.filter(candidate => !complete.some(other => outranks(other, candidate, values.get(other.id)!, values.get(candidate.id)!, gates)))
    .map(candidate => candidate.id).sort();
}

export function evaluateEnvelope(candidates: readonly Candidate[], mission: Mission, ranking: Ranking, requests = DAILY_REQUESTS,
  settings: UncertaintySettings = DEFAULT_UNCERTAINTY) {
  const gates = activeGates(mission);
  const { level, intervals } = intervalLevel(settings, candidates.length);
  const values = new Map(candidates.map(candidate => [candidate.id, metrics(candidate, mission, requests, level)]));
  const checks = new Map(candidates.map(candidate => [candidate.id, check(values.get(candidate.id)!, gates, mission)]));
  const statuses = new Map(candidates.map(candidate => [candidate.id, classify(checks.get(candidate.id)!)]));
  // Point-estimate feasibility is preserved as its own result. It is never a statistical verdict.
  const feasible = candidates.filter(candidate => checks.get(candidate.id)!.every(gate => gate.passes));
  const robust = candidates.filter(candidate => statuses.get(candidate.id) === 'robust');
  const priority = { min_fpr: 'falsePositiveRate', min_latency: 'p95LatencyMs', min_cost: 'costPer1kUsd',
    max_recall: 'recall', max_precision: 'precision' } as const;
  const direction = ranking.startsWith('max') ? -1 : 1;
  const sortValue = (c: Candidate) => {
    const metric = values.get(c.id)![priority[ranking]];
    return metric === null ? Infinity : metric * direction;
  };
  const cost = (c: Candidate) => c.costPer1kUsd ?? Infinity;
  const compare = (a: Candidate, b: Candidate) => sortValue(a) - sortValue(b) || cost(a) - cost(b) || a.id.localeCompare(b.id);
  const failedCounts = gates.map(gate => ({
    label: gate.label, count: [...checks.values()].filter(result => result.some(item => item.key === gate.key && !item.passes)).length,
  })).sort((a, b) => b.count - a.count);
  const alternatives = candidates.flatMap(candidate => {
    const failures = checks.get(candidate.id)!.filter(gate => !gate.passes);
    if (!failures.length) return [];
    return [{ candidate, failures, distance: failures.reduce((sum, gate) => sum + (gate.margin === null ? Infinity : Math.abs(gate.margin) / gate.scale), 0) }];
  }).sort((a, b) => a.failures.length - b.failures.length || a.distance - b.distance || a.candidate.id.localeCompare(b.candidate.id));
  const recommendedRobust = [...robust].sort(compare)[0]?.id ?? null;
  const recommendedEstimate = [...feasible].sort(compare)[0]?.id ?? null;
  return {
    values, checks, statuses, feasibleIds: new Set(feasible.map(candidate => candidate.id)),
    robustIds: new Set(robust.map(candidate => candidate.id)),
    globalParetoIds: new Set(paretoFrontier(candidates, mission, requests, values)),
    feasibleParetoIds: new Set(paretoFrontier(feasible, mission, requests, values)),
    recommendedId: recommendedRobust ?? recommendedEstimate,
    recommendedBasis: recommendedRobust ? 'robust' as const : recommendedEstimate ? 'estimate' as const : null,
    statistics: { ...settings, level, intervals, familySize: candidates.length,
      method: 'Clopper–Pearson exact binomial intervals with Bonferroni adjustment' },
    failedCounts, alternatives,
  };
}

export type Envelope = ReturnType<typeof evaluateEnvelope>;

export function resolveSelection(candidates: readonly Candidate[], selectedId: string | null, fallback: string | null) {
  return candidates.find(candidate => candidate.id === selectedId) ??
    candidates.find(candidate => candidate.id === fallback) ?? candidates[0] ?? null;
}
