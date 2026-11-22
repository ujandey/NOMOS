import { parse } from 'yaml';
import fc from 'fast-check';
import { expect, test } from 'vitest';
import { DEFAULT_MISSION } from './contracts';
import { DEPLOYMENT_MISSION } from './envelope';
import { candidates, manifest } from './demo';
import { decisionFiles, exportDecision } from './export';

test('exports exact selected point, fixture evidence and both independent checks', () => {
  const selection = candidates.find(candidate => candidate.id === 'balanced-t50')!;
  const decision = exportDecision(manifest, selection.id, DEFAULT_MISSION, 'min_latency', 1_000_000);
  expect(decision).toMatchObject({
    candidateId: selection.id, threshold: selection.threshold, modelVersion: selection.modelVersion, pointEstimateFeasible: true,
    datasetSha256: selection.datasetSha256, evaluationRunId: selection.evaluationRunId, datasetSeed: manifest.seed,
    metricProvenance: selection.metricProvenance, benchmarkSha256: manifest.benchmarkSha256,
    confusionMatrix: { tp: selection.tp, fp: selection.fp, tn: selection.tn, fn: selection.fn },
    metrics: { precision: selection.precision, recall: selection.recall, p95LatencyMs: selection.p95LatencyMs, costPer1kUsd: selection.costPer1kUsd },
  });
  expect(decision.instruments.f1.verification?.passes).toBe(true);
  expect(decision.instruments.cost.value).toBeCloseTo(3000, 10);
  expect(decision.instruments.cost.verification?.passes).toBe(true);
  const infeasible = exportDecision(manifest, selection.id, { ...DEFAULT_MISSION, maxP95LatencyMs: 50 }, 'min_latency', 1e6);
  expect(infeasible).toMatchObject({ pointEstimateFeasible: false, robustlyFeasible: false, statisticalStatus: 'infeasible' });
  expect(infeasible.violations).toHaveLength(1);
  expect(() => exportDecision(manifest, 'unknown', DEFAULT_MISSION, 'min_latency', 1)).toThrow();
});

test('JSON and YAML round-trip exact decisions over candidate and volume changes', () => {
  fc.assert(fc.property(fc.constantFrom(...candidates), fc.nat(10 ** 9), (c, n) => {
    const decision = exportDecision(manifest, c.id, DEFAULT_MISSION, 'max_precision', n);
    const { json, yaml } = decisionFiles(decision);
    expect(JSON.parse(json)).toEqual(decision);
    expect(parse(yaml)).toEqual(decision);
  }), { numRuns: 80 });
});

test('exports separate point and statistical verdicts and always labels volume as daily', () => {
  const { targetPrevalence, ...withoutTarget } = DEPLOYMENT_MISSION;
  expect(targetPrevalence).toBe(0.1);
  const legacy = exportDecision(manifest, 'balanced-t45', withoutTarget, 'min_fpr', 1_000_000);
  expect(legacy.instruments.cost.inputs).toEqual({ requestsPerDay: 1_000_000, unitPriceUsd: 0.003 });
  expect(JSON.stringify(legacy)).not.toContain('monthly');
  const demo = exportDecision(manifest, 'balanced-t45', DEPLOYMENT_MISSION, 'min_fpr', 1_000_000);
  expect(demo).toMatchObject({ schemaVersion: '3.1', pointEstimateFeasible: true, robustlyFeasible: false,
    statisticalStatus: 'passes_on_estimate_only', unconfirmed: ['minPrecision', 'maxFalsePositiveRate'],
    uncertainty: { confidence: 0.95, scope: 'configuration', simultaneousIntervals: 2, perIntervalConfidence: 0.975,
      positives: 293, negatives: 907, expectedPrecision: { prevalence: 0.1, prevalenceSource: 'target' } } });
  expect(demo).not.toHaveProperty('feasible');
  const [low, high] = demo.uncertainty.expectedPrecision.interval as [number, number];
  expect(low).toBeLessThan(0.55);
  expect(high).toBeGreaterThan(0.55);
  const family = exportDecision(manifest, 'balanced-t45', DEPLOYMENT_MISSION, 'min_fpr', 1e6, { confidence: 0.95, scope: 'all' });
  expect(family.uncertainty).toMatchObject({ simultaneousIntervals: 54, configurationsInFamily: 27 });
});
