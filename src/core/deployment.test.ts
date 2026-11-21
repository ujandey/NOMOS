import fc from 'fast-check';
import { expect, test } from 'vitest';
import { candidates, manifest } from './demo';
import { capacityReading, oddsPlate, prevalenceReading } from './deployment';
import { DEPLOYMENT_MISSION, evaluateEnvelope } from './envelope';
import { exportDecision } from './export';
import { collinearityResidual, logistic, logit, prevalenceFromGeometry } from './geometry';
import { parseOffline } from './mission';

const interior = fc.double({ min: 0.0000001, max: 0.9999999, noNaN: true });

test('log-odds center inverts the plotted crossing for independent rates and priors', () => {
  fc.assert(fc.property(interior, interior, interior, (prior, tpr, fpr) => {
    const logRatio = Math.log(tpr) - Math.log(fpr);
    const plate = oddsPlate(prior, logRatio);
    const reading = prevalenceFromGeometry(prior, logRatio, plate, { left: 20, center: 55, right: 90 });
    const expected = prior * tpr / (prior * tpr + (1 - prior) * fpr);
    expect(reading.intersection).toEqual({ x: 55, y: (reading.left.y + reading.right.y) / 2 });
    expect(collinearityResidual(reading)).toBeLessThan(2e-13);
    expect(reading.geometryValue).toBeCloseTo(expected, 12);
    expect(logistic(logit(prior))).toBeCloseTo(prior, 14);
    expect(prevalenceReading(prior, tpr, fpr, plate, false).verification).toBeNull();
  }), { numRuns: 1000 });
});

test('prevalence limits are explicit and finite log LR survives ratio overflow', () => {
  expect(prevalenceReading(0.1, 0.8, 0)).toMatchObject({ state: 'boundary', value: 1, alignment: null, ratioState: 'unbounded' });
  expect(prevalenceReading(0.1, 0, 0.8)).toMatchObject({ state: 'boundary', value: 0, ratio: 0 });
  expect(prevalenceReading(0.1, 0, 0)).toMatchObject({ state: 'no-alerts', value: null, ratioState: 'undefined' });
  expect(prevalenceReading(0, 0.9, 0)).toMatchObject({ state: 'no-alerts', value: null });
  expect(prevalenceReading(1, 0, 0.9)).toMatchObject({ state: 'no-alerts', value: null });
  expect(prevalenceReading(0, 0.9, 0.1).value).toBe(0);
  expect(prevalenceReading(1, 0.9, 0.1).value).toBe(1);
  expect(prevalenceReading(0.1, null, 0.2).state).toBe('missing');
  expect(() => prevalenceReading(0.1, 0, NaN)).toThrow(RangeError);
  const overflow = prevalenceReading(Number.MIN_VALUE, 1, Number.MIN_VALUE);
  expect(overflow).toMatchObject({ ratioState: 'overflow', state: 'aligned', verification: { passes: true } });
  expect(overflow.value).toBeCloseTo(0.5, 11);
  expect(prevalenceReading(1 - Number.EPSILON, 0.8, 0.4).verification?.passes).toBe(true);
});

test('Little’s Law uses mean milliseconds and independently verifies the geometric product', () => {
  const input = fc.double({ min: -3, max: 7, noNaN: true });
  fc.assert(fc.property(input, input, (left, right) => {
    const rate = 10 ** left, mean = 10 ** right;
    const reading = capacityReading(rate, mean);
    expect(Math.abs(reading.value! / (rate * mean / 1000) - 1)).toBeLessThan(1e-12);
    expect(reading.verification?.passes).toBe(true);
    expect(reading.verification?.residual).toBeLessThan(1e-12);
  }), { numRuns: 1000 });
  expect(capacityReading(100, 80).value).toBeCloseTo(8);
  expect(capacityReading(null, 80)).toMatchObject({ state: 'missing', value: null });
  expect(capacityReading(0, 80)).toMatchObject({ state: 'zero', value: 0 });
  expect(capacityReading(1e300, 1e300)).toMatchObject({ state: 'invalid', value: null });
});

test('a tenfold prior change invalidates the demo decision and budget, evidence and Pareto stay linked', () => {
  const initial = evaluateEnvelope(candidates, DEPLOYMENT_MISSION, 'min_latency');
  expect([...initial.feasibleIds]).toEqual(['balanced-t45']);
  expect([...initial.feasibleParetoIds]).toEqual(['balanced-t45']);
  const rare = { ...DEPLOYMENT_MISSION, targetPrevalence: 0.01 };
  expect(evaluateEnvelope(candidates, rare, 'min_latency').feasibleIds.size).toBe(0);
  const adapted = { ...rare, minPrecision: 0.1 };
  expect([...evaluateEnvelope(candidates, adapted, 'min_latency').feasibleIds]).toEqual(['balanced-t45']);
  expect(evaluateEnvelope(candidates, adapted, 'min_latency', 2e6).feasibleIds.size).toBe(0);
  const record = exportDecision(manifest, 'balanced-t45', adapted, 'min_latency', 1e6);
  expect(record).toMatchObject({ schemaVersion: '3.0', feasible: true, deployment: { expectedPrecision: expect.closeTo(0.10118, 4),
    expectedDailyCostUsd: expect.closeTo(3000, 7), capacity: 'unknown' }, instruments: { prevalence: { verification: { passes: true } },
    throughput: { value: null, state: 'missing' }, f1: { verification: { passes: true } }, cost: { verification: { passes: true } } } });
});

test('a throughput requirement uses measured evidence only', () => {
  const source = candidates.find(c => c.id === 'balanced-t45')!;
  const mission = { ...DEPLOYMENT_MISSION, minThroughputRps: 100 };
  const demo = { ...source, performance: { requestsPerSecond: 120, meanResponseMs: 80, provenance: 'synthetic-demo' as const, method: 'fixture' } };
  expect(evaluateEnvelope([demo], mission, 'min_latency').feasibleIds.size).toBe(0);
  expect(evaluateEnvelope([{ ...demo, performance: { ...demo.performance, provenance: 'measured' } }], mission, 'min_latency').feasibleIds.size).toBe(1);
});

test('precision rounded to one cannot pass an exactly perfect requirement', () => {
  const source = candidates.find(c => c.id === 'balanced-t45')!;
  const mission = { ...DEPLOYMENT_MISSION, minPrecision: 1, targetPrevalence: 1 - Number.EPSILON / 2 };
  const checked = evaluateEnvelope([source], mission, 'min_fpr');
  expect(checked.checks.get(source.id)?.find(c => c.key === 'minPrecision')).toMatchObject({
    observed: 1, precisionRounded: true, passes: false,
  });
  expect(evaluateEnvelope([source], { ...mission, targetPrevalence: 1 }, 'min_fpr').feasibleIds.has(source.id)).toBe(true);
});

test('offline compiler recognizes the fraud brief and requires clarification for unsupported metrics', () => {
  const proposal = parseOffline('Catch at least 95% of fraud, keep expected precision above 80%, and respond within 100 milliseconds.', DEPLOYMENT_MISSION);
  expect(proposal.mission).toMatchObject({ minRecall: 0.95, minPrecision: 0.8, maxP95LatencyMs: 100 });
  expect(proposal.warnings).toHaveLength(2);
  expect(parseOffline('FPR at most 4%, target prevalence 1%, daily budget at most $4000 per day, measured throughput at least 100 requests per second.', DEPLOYMENT_MISSION).mission)
    .toMatchObject({ maxFalsePositiveRate: 0.04, targetPrevalence: 0.01, maxDailyCostUsd: 4000, minThroughputRps: 100 });
  expect(() => parseOffline('recall at least 95%, GPU utilization below 40%', DEPLOYMENT_MISSION)).toThrow(/gpu utilization/);
});
