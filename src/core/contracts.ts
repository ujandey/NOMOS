import { z } from 'zod';

const ratio = z.number().min(0).max(1);
const latency = z.number().positive().max(1_000_000);
const cost = z.number().min(0).max(1_000_000);
const count = z.number().int().nonnegative();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const interval = z.tuple([ratio, ratio]).refine(([lo, hi]) => lo <= hi).nullable();
const provenance = z.enum(['measured', 'estimated', 'synthetic-demo']);

export const missionSchema = z.strictObject({
  minPrecision: ratio,
  minRecall: ratio,
  maxP95LatencyMs: latency,
  maxCostPer1kUsd: cost,
  maxFalsePositiveRate: ratio.optional(),
  maxDailyCostUsd: z.number().nonnegative().max(1e12).optional(),
  minThroughputRps: z.number().nonnegative().max(1e9).optional(),
  targetPrevalence: ratio.optional(),
});
export const missionPatchSchema = missionSchema.partial();
export type Mission = z.infer<typeof missionSchema>;
export const DEFAULT_MISSION: Mission = { minPrecision: 0.8, minRecall: 0.9, maxP95LatencyMs: 100, maxCostPer1kUsd: 5 };
export const RANKING = {
  min_fpr: 'Lowest false-positive rate', min_latency: 'Lowest latency', min_cost: 'Lowest cost',
  max_recall: 'Highest recall', max_precision: 'Highest precision',
} as const;
export type Ranking = keyof typeof RANKING;

export const candidateSchema = z.strictObject({
  id: z.string().min(1), modelId: z.string().min(1), modelName: z.string().min(1), modelVersion: z.string().min(1),
  threshold: ratio, inferenceProfile: z.string().min(1), datasetId: z.string().min(1),
  datasetSha256: hash, evaluationRunId: z.string().min(1), evaluatedAt: z.iso.datetime(), evaluationCodeVersion: z.string().min(1),
  sampleCount: count, tp: count, fp: count, tn: count, fn: count,
  precision: ratio.nullable(), recall: ratio.nullable(), falsePositiveRate: ratio.nullable(),
  precisionInterval: interval, recallInterval: interval,
  p95LatencyMs: latency.nullable(), costPer1kUsd: cost.nullable(),
  performance: z.strictObject({
    requestsPerSecond: z.number().nonnegative().nullable(),
    meanResponseMs: latency.nullable(),
    provenance: provenance,
    method: z.string().min(1),
  }).optional(),
  metricProvenance: z.strictObject({ classification: provenance, latency: provenance, cost: provenance }),
}).superRefine((candidate, context) => {
  const { tp, fp, tn, fn, sampleCount, precision, recall, falsePositiveRate } = candidate;
  const ratioOrNull = (n: number, d: number) => d ? n / d : null;
  if (tp + fp + tn + fn !== sampleCount || precision !== ratioOrNull(tp, tp + fp) ||
    recall !== ratioOrNull(tp, tp + fn) || falsePositiveRate !== ratioOrNull(fp, fp + tn)) {
    context.addIssue({ code: 'custom', message: 'Confusion counts and evaluated ratios are inconsistent.' });
  }
});
export type Candidate = z.infer<typeof candidateSchema>;
export const manifestSchema = z.strictObject({
  schemaVersion: z.literal('2.0'),
  datasetId: z.string(), datasetSha256: hash, benchmarkSha256: hash, evaluationSourceSha256: hash,
  evaluationSha256: hash, evaluationRunId: z.string(), seed: count, sampleCount: count,
  benchmarkMethod: z.string(), costMethod: z.string(), intervalMethod: z.string(),
  generation: z.strictObject({
    prevalence: ratio, thresholds: z.array(ratio),
    distributions: z.record(z.string(), z.strictObject({
      positive: z.tuple([ratio, ratio]), negative: z.tuple([ratio, ratio]),
      latency: z.tuple([latency, latency]), unitPriceUsd: cost,
    })),
  }),
  candidates: z.array(candidateSchema),
}).superRefine((manifest, context) => {
  const ids = new Set<string>();
  for (const candidate of manifest.candidates) {
    if (ids.has(candidate.id) || candidate.datasetId !== manifest.datasetId ||
      candidate.datasetSha256 !== manifest.datasetSha256 || candidate.evaluationRunId !== manifest.evaluationRunId ||
      candidate.sampleCount !== manifest.sampleCount) {
      context.addIssue({ code: 'custom', message: 'Duplicate candidate or inconsistent evaluation provenance.' });
    }
    ids.add(candidate.id);
  }
});
export type Manifest = z.infer<typeof manifestSchema>;
