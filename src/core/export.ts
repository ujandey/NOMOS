import { stringify } from 'yaml';
import { type Manifest, type Mission, type Ranking, missionSchema } from './contracts';
import { checkConstraints, evaluateEnvelope } from './envelope';
import { instrumentReading } from './instruments';
import { AXES, PRICE_BASE, REQUEST_BASE } from './geometry';

function decisionId() {
  if (globalThis.crypto.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}

export function exportDecision(manifest: Manifest, candidateId: string, missionInput: Mission, rankingPolicy: Ranking, monthlyRequests: number) {
  const mission = missionSchema.parse(missionInput);
  const candidate = manifest.candidates.find(row => row.id === candidateId);
  if (!candidate) throw new Error('The selected candidate is absent from this evaluation.');
  if (!Number.isSafeInteger(monthlyRequests) || monthlyRequests < 0) throw new Error('Monthly requests must be a nonnegative integer.');
  const { id, modelId, modelName, modelVersion, threshold, inferenceProfile, datasetId, datasetSha256, evaluationRunId,
    evaluatedAt, evaluationCodeVersion, metricProvenance, sampleCount, tp, fp, tn, fn, precision, recall, p95LatencyMs, costPer1kUsd,
    falsePositiveRate, precisionInterval, recallInterval } = candidate;
  const envelope = evaluateEnvelope(manifest.candidates, mission, rankingPolicy);
  const constraints = checkConstraints(candidate, mission);
  const unitPriceUsd = costPer1kUsd === null ? null : costPer1kUsd / 1000;
  const feasible = constraints.every(gate => gate.passes);
  return {
    schemaVersion: '2.0', decisionId: decisionId(), generatedAt: new Date().toISOString(),
    candidateId: id, modelId, modelName, modelVersion, threshold, inferenceProfile, mission,
    metrics: { precision, recall, p95LatencyMs, costPer1kUsd, falsePositiveRate, precisionInterval, recallInterval },
    confusionMatrix: { tp, fp, tn, fn }, sampleCount, feasible,
    status: feasible ? 'feasible_under_demo_mission' : 'review_only',
    constraints, violations: constraints.filter(gate => !gate.passes),
    rankingPolicy, globalPareto: envelope.globalParetoIds.has(id), feasiblePareto: envelope.feasibleParetoIds.has(id),
    datasetId, datasetSha256, datasetSeed: manifest.seed, evaluationRunId, evaluatedAt, evaluationCodeVersion,
    evaluationSha256: manifest.evaluationSha256, evaluationSourceSha256: manifest.evaluationSourceSha256,
    benchmarkSha256: manifest.benchmarkSha256, metricProvenance,
    benchmarkMethod: manifest.benchmarkMethod, costMethod: manifest.costMethod, intervalMethod: manifest.intervalMethod,
    instruments: {
      axes: AXES,
      f1: { inputs: { precision, recall }, ...instrumentReading('f1', precision, recall, true) },
      cost: { inputs: { monthlyRequests, unitPriceUsd }, references: { requests: REQUEST_BASE, unitPriceUsd: PRICE_BASE },
        ...instrumentReading('cost', monthlyRequests, unitPriceUsd, true) },
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

