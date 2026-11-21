import { parse } from 'yaml';
import fc from 'fast-check';
import { expect, test } from 'vitest';
import { DEFAULT_MISSION } from './contracts';
import { candidates, manifest } from './demo';
import { decisionFiles, exportDecision } from './export';

test('exports exact selected point, fixture evidence and both independent checks', () => {
  const selection = candidates.find(candidate => candidate.id === 'balanced-t50')!;
  const decision = exportDecision(manifest, selection.id, DEFAULT_MISSION, 'min_latency', 1_000_000);
  expect(decision).toMatchObject({
    candidateId: selection.id, threshold: selection.threshold, modelVersion: selection.modelVersion, feasible: true,
    datasetSha256: selection.datasetSha256, evaluationRunId: selection.evaluationRunId, datasetSeed: manifest.seed,
    metricProvenance: selection.metricProvenance, benchmarkSha256: manifest.benchmarkSha256,
    confusionMatrix: { tp: selection.tp, fp: selection.fp, tn: selection.tn, fn: selection.fn },
    metrics: { precision: selection.precision, recall: selection.recall, p95LatencyMs: selection.p95LatencyMs, costPer1kUsd: selection.costPer1kUsd },
  });
  expect(decision.instruments.f1.verification?.passes).toBe(true);
  expect(decision.instruments.cost.value).toBeCloseTo(3000, 10);
  expect(decision.instruments.cost.verification?.passes).toBe(true);
  const infeasible = exportDecision(manifest, selection.id, { ...DEFAULT_MISSION, maxP95LatencyMs: 50 }, 'min_latency', 1e6);
  expect(infeasible.status).toBe('review_only');
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
