import fc from 'fast-check';
import { expect, test } from 'vitest';
import { DEFAULT_MISSION } from './contracts';
import { candidates } from './demo';
import { checkConstraints, dominates, evaluateEnvelope, paretoFrontier, resolveSelection } from './envelope';

const EPSILON = 1e-9;

test('near-equal trade-offs cannot cycle and remove the entire Pareto frontier', () => {
  const offset = EPSILON * 0.75;
  const point = (id: string, p: number, r: number, inverseLatency: number) => ({
    ...candidates[0], id, precision: 0.5 + p * offset, recall: 0.5 + r * offset,
    p95LatencyMs: 50 - inverseLatency * offset,
  });
  const points = [point('a', 2, 1, 0), point('b', 0, 2, 1), point('c', 1, 0, 2)];
  expect(paretoFrontier(points)).toEqual(['a', 'b', 'c']);
  expect(paretoFrontier([...points, { ...points[0], id: 'better', precision: points[0].precision + offset }]))
    .toEqual(['b', 'better', 'c']);
});

test('demo default and tight latency invariants and dominance', () => {
  const baseline = evaluateEnvelope(candidates, DEFAULT_MISSION, 'min_latency');
  expect(baseline.feasibleIds.size).toBeGreaterThan(0);
  expect(baseline.recommendedId).toBe('balanced-t50');
  const tight = evaluateEnvelope(candidates, { ...DEFAULT_MISSION, maxP95LatencyMs: 50 }, 'min_latency');
  expect(tight.feasibleIds.size).toBe(0);
  expect(tight.recommendedId).toBeNull();
  expect(tight.alternatives[0].failures[0]).toMatchObject({ key: 'maxP95LatencyMs', observed: 77.87 });
  expect(baseline.globalParetoIds.size).toBeLessThan(candidates.length);
  expect(resolveSelection(candidates, 'absent', baseline.recommendedId)?.id).toBe(baseline.recommendedId);
  expect(resolveSelection([], 'absent', null)).toBeNull();
});

test('inclusive checks, missing metrics and direction of dominance', () => {
  const equal = { ...candidates[0], precision: 0.8, recall: 0.9, p95LatencyMs: 100, costPer1kUsd: 5 };
  expect(checkConstraints(equal, DEFAULT_MISSION).every(g => g.passes)).toBe(true);
  expect(checkConstraints({ ...equal, p95LatencyMs: null }, DEFAULT_MISSION).find(g => g.key === 'maxP95LatencyMs')?.passes).toBe(false);
  const better = { ...equal, precision: 0.9, id: 'better' };
  expect(dominates(better, equal)).toBe(true);
  expect(dominates(equal, { ...equal, id: 'identical' })).toBe(false);
  expect(dominates({ ...better, p95LatencyMs: 101 }, equal)).toBe(false);
  expect(dominates({ ...better, datasetId: 'different' }, equal)).toBe(false);
  expect(paretoFrontier([equal, { ...better, costPer1kUsd: null }])).toEqual([equal.id]);
});

test('constraint monotonicity, comparable Pareto soundness and order invariance', () => {
  const ratio = fc.double({ min: 0, max: 1, noNaN: true });
  const metrics = fc.array(fc.record({
    precision: fc.option(ratio, { nil: null }), recall: fc.option(ratio, { nil: null }),
    p95LatencyMs: fc.option(fc.integer({ min: 1, max: 150 }), { nil: null }),
    costPer1kUsd: fc.option(fc.integer({ min: 0, max: 8 }), { nil: null }),
  }), { maxLength: 26 });
  fc.assert(fc.property(metrics, ratio, fc.integer({ min: 1, max: 150 }), fc.integer({ min: 0, max: 25 }), (rows, recall, p95LatencyMs, offset) => {
    const points = rows.map((row, i) => ({ ...candidates[0], ...row, id: String(i) }));
    const permuted = [...points.slice(offset), ...points.slice(0, offset)].reverse();
    const mission = { ...DEFAULT_MISSION, minRecall: recall, maxP95LatencyMs: p95LatencyMs };
    const baseline = evaluateEnvelope(points, mission, 'min_latency');
    const reordered = evaluateEnvelope(permuted, mission, 'min_latency');
    expect(reordered.feasibleIds).toEqual(baseline.feasibleIds);
    expect(reordered.globalParetoIds).toEqual(baseline.globalParetoIds);
    expect(reordered.feasibleParetoIds).toEqual(baseline.feasibleParetoIds);
    expect(reordered.recommendedId).toBe(baseline.recommendedId);
    const tighter = evaluateEnvelope(points, { ...mission, minRecall: (1 + recall) / 2, maxP95LatencyMs: p95LatencyMs / 2 }, 'min_latency');
    const looser = evaluateEnvelope(points, { ...mission, minRecall: recall / 2, maxP95LatencyMs: p95LatencyMs * 2 }, 'min_latency');
    for (const id of tighter.feasibleIds) expect(baseline.feasibleIds.has(id)).toBe(true);
    for (const point of points) {
      if (baseline.feasibleIds.has(point.id)) {
        expect(looser.feasibleIds.has(point.id)).toBe(true);
        expect(point.precision).not.toBeNull();
        expect(point.recall).not.toBeNull();
        expect(point.p95LatencyMs).not.toBeNull();
        expect(point.costPer1kUsd).not.toBeNull();
        expect(point.precision!).toBeGreaterThanOrEqual(mission.minPrecision - 1e-9);
        expect(point.recall!).toBeGreaterThanOrEqual(mission.minRecall - 1e-9);
        expect(point.p95LatencyMs!).toBeLessThanOrEqual(mission.maxP95LatencyMs! + 1e-9);
        expect(point.costPer1kUsd!).toBeLessThanOrEqual(mission.maxCostPer1kUsd! + 1e-9);
      }
      if (baseline.globalParetoIds.has(point.id)) expect(points.some(other => dominates(other, point))).toBe(false);
    }
  }), { numRuns: 500 });
});
