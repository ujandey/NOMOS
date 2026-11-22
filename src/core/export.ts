import { stringify } from 'yaml';
import { DEFAULT_UNCERTAINTY, type Manifest, type Mission, type Ranking, type UncertaintySettings, missionSchema, uncertaintySchema } from './contracts';
import { evaluateEnvelope, STATUS_TEXT } from './envelope';
import { instrumentReading } from './instruments';
import { AXES, PRICE_BASE, REQUEST_BASE } from './geometry';
import { deploymentReadings, RATE_STABILITY, STEADY_STATE } from './deployment';

function decisionId() {
  if (globalThis.crypto.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}

const STATUS_CODE = {
  robust: 'robustly_feasible', 'estimate-only': 'passes_on_estimate_only', uncertain: 'misses_on_estimate_uncertain',
  infeasible: 'infeasible', unknown: 'evidence_unavailable',
} as const;

export function exportDecision(manifest: Manifest, candidateId: string, missionInput: Mission, rankingPolicy: Ranking, requests: number,
  uncertaintyInput: UncertaintySettings = DEFAULT_UNCERTAINTY) {
  const mission = missionSchema.parse(missionInput);
  const uncertainty = uncertaintySchema.parse(uncertaintyInput);
  const candidate = manifest.candidates.find(row => row.id === candidateId);
  if (!candidate) throw new Error('The selected candidate is absent from this evaluation.');
  if (!Number.isSafeInteger(requests) || requests < 0) throw new Error('Request volume must be a nonnegative integer.');
  const { id, modelId, modelName, modelVersion, threshold, inferenceProfile, datasetId, datasetSha256, evaluationRunId,
    evaluatedAt, evaluationCodeVersion, metricProvenance, sampleCount, tp, fp, tn, fn, precision, recall, p95LatencyMs, costPer1kUsd,
    falsePositiveRate, precisionInterval, recallInterval } = candidate;
  const envelope = evaluateEnvelope(manifest.candidates, mission, rankingPolicy, requests, uncertainty);
  const constraints = envelope.checks.get(id)!;
  const evidence = envelope.values.get(id)!.evidence;
  const statisticalStatus = envelope.statuses.get(id)!;
  const deployed = mission.targetPrevalence === undefined ? null : deploymentReadings(candidate, mission.targetPrevalence, requests);
  const unitPriceUsd = costPer1kUsd === null ? null : costPer1kUsd / 1000;
  const pointEstimateFeasible = constraints.every(gate => gate.passes);
  const { statistics } = envelope;
  return {
    schemaVersion: '3.1', decisionId: decisionId(), generatedAt: new Date().toISOString(),
    datasetOrigin: manifest.origin ?? 'synthetic-fixture', datasetSource: manifest.source ?? null,
    candidateId: id, modelId, modelName, modelVersion, threshold, inferenceProfile, mission,
    metrics: { precision, recall, p95LatencyMs, costPer1kUsd, falsePositiveRate, precisionInterval, recallInterval },
    confusionMatrix: { tp, fp, tn, fn }, sampleCount,
    // The point estimate and the statistical verdict are separate. Only the latter supports a robustness claim.
    pointEstimateFeasible,
    robustlyFeasible: statisticalStatus === 'robust',
    statisticalStatus: STATUS_CODE[statisticalStatus],
    statisticalStatusText: STATUS_TEXT[statisticalStatus],
    uncertainty: {
      method: statistics.method,
      confidence: statistics.confidence,
      scope: statistics.scope,
      simultaneousIntervals: statistics.intervals,
      perIntervalConfidence: statistics.level,
      configurationsInFamily: statistics.familySize,
      positives: evidence.positives, negatives: evidence.negatives,
      truePositiveRate: { estimate: recall, interval: evidence.tpr && [evidence.tpr.lower, evidence.tpr.upper] },
      falsePositiveRate: { estimate: falsePositiveRate, interval: evidence.fpr && [evidence.fpr.lower, evidence.fpr.upper] },
      expectedPrecision: { prevalence: evidence.prevalence, prevalenceSource: evidence.prevalenceSource,
        interval: evidence.precision && [evidence.precision.pessimistic, evidence.precision.optimistic] },
      assumptions: [
        'Evaluation records are independent draws from the deployment population, conditional on class.',
        'Precision bounds use the corners of the simultaneous TPR × FPR rectangle; precision is monotone in each rate.',
        'Latency, cost and throughput limits are checked as point values with their stated provenance; no uncertainty model is applied to them.',
        ...(statistics.scope === 'configuration' ? ['Coverage is simultaneous within each configuration, not across the selection of one configuration from many.'] : []),
      ],
    },
    constraints, violations: constraints.filter(gate => !gate.passes), unconfirmed: constraints.filter(gate => !gate.robust).map(gate => gate.key),
    rankingPolicy, globalPareto: envelope.globalParetoIds.has(id), feasiblePareto: envelope.feasibleParetoIds.has(id),
    datasetId, datasetSha256, datasetSeed: manifest.seed, evaluationRunId, evaluatedAt, evaluationCodeVersion,
    evaluationSha256: manifest.evaluationSha256, evaluationSourceSha256: manifest.evaluationSourceSha256,
    benchmarkSha256: manifest.benchmarkSha256, metricProvenance,
    benchmarkMethod: manifest.benchmarkMethod, costMethod: manifest.costMethod, intervalMethod: manifest.intervalMethod,
    ...(deployed && { deployment: {
      requestsPerDay: requests, targetPrevalence: mission.targetPrevalence, expectedPrecision: deployed.precision.value,
      expectedF1: deployed.f1.value, expectedDailyCostUsd: deployed.cost.value, performance: candidate.performance ?? null,
      capacity: 'unknown', assumptions: [RATE_STABILITY, STEADY_STATE], feasibleCandidateIds: [...envelope.feasibleIds],
    } }),
    instruments: {
      axes: AXES,
      f1: { inputs: { precision: deployed ? deployed.precision.value : precision, recall }, ...(deployed?.f1 ?? instrumentReading('f1', precision, recall, true)) },
      cost: { inputs: { requestsPerDay: requests, unitPriceUsd }, references: { requests: REQUEST_BASE, unitPriceUsd: PRICE_BASE },
        ...(deployed?.cost ?? instrumentReading('cost', requests, unitPriceUsd, true)) },
      ...(deployed && { prevalence: { inputs: { targetPrevalence: mission.targetPrevalence, tpr: recall, fpr: falsePositiveRate }, ...deployed.precision },
        throughput: { inputs: { requestsPerSecond: candidate.performance?.requestsPerSecond ?? null, meanResponseMs: candidate.performance?.meanResponseMs ?? null }, ...deployed.capacity } }),
    },
  } as const;
}

export function decisionFiles(record: ReturnType<typeof exportDecision>) {
  return { json: JSON.stringify(record, null, 2) + '\n', yaml: stringify(record, { lineWidth: 0 }) };
}

export function download(text: string, filename: string, mime: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

