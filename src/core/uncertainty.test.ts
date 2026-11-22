import fc from 'fast-check';
import { expect, test } from 'vitest';
import { candidateSchema, DEFAULT_MISSION, type Candidate, type Mission } from './contracts';
import { candidates } from './demo';
import { checkConstraints, classify, DEPLOYMENT_MISSION, evaluateEnvelope, intervalLevel, resolvePrevalence } from './envelope';
import { precisionReference } from './reference';
import { clopperPearson } from './statistics';

function fromCounts(id: string, tp: number, fn: number, fp: number, tn: number, extra: Partial<Candidate> = {}): Candidate {
  const ratio = (n: number, d: number) => d ? n / d : null;
  return candidateSchema.parse({ ...candidates[0], id, tp, fn, fp, tn, sampleCount: tp + fn + fp + tn,
    precision: ratio(tp, tp + fp), recall: ratio(tp, tp + fn), falsePositiveRate: ratio(fp, fp + tn),
    precisionInterval: null, recallInterval: null, ...extra });
}
const quality: Mission = { minPrecision: 0.5, minRecall: 0.9, maxFalsePositiveRate: 0.1 };

test('audit regression: Balanced / 0.45 passes on its estimate but is not statistically verified', () => {
  const envelope = evaluateEnvelope(candidates, DEPLOYMENT_MISSION, 'min_fpr');
  expect(envelope.feasibleIds.has('balanced-t45')).toBe(true);
  expect(envelope.robustIds.has('balanced-t45')).toBe(false);
  expect(envelope.statuses.get('balanced-t45')).toBe('estimate-only');
  expect(envelope.recommendedBasis).toBe('estimate');
  const precision = envelope.checks.get('balanced-t45')!.find(gate => gate.key === 'minPrecision')!;
  expect(precision.observed).toBeCloseTo(0.5532, 4);
  expect(precision.passes).toBe(true);
  expect(precision.robust).toBe(false);
  expect(precision.pessimistic!).toBeLessThan(0.55);
  expect(precision.range![0]).toBeLessThan(precision.observed!);
  expect(precision.range![1]).toBeGreaterThan(precision.observed!);
  // Worst case is the exact formula at the rectangle corner (lowest TPR, highest FPR).
  const c = candidates.find(row => row.id === 'balanced-t45')!;
  const { level } = intervalLevel({ confidence: 0.95, scope: 'configuration' }, 27);
  const tpr = clopperPearson(c.tp, c.tp + c.fn, level)!, fpr = clopperPearson(c.fp, c.fp + c.tn, level)!;
  expect(precision.pessimistic).toBe(precisionReference(0.1, tpr.lower, fpr.upper));
  expect(precision.optimistic).toBe(precisionReference(0.1, tpr.upper, fpr.lower));
});

test('the same measured rates become robust when the sample is large enough', () => {
  const small = fromCounts('small', 96, 4, 40, 960);
  const large = fromCounts('large', 96_00, 4_00, 40_00, 960_00);
  const mission = { ...quality, targetPrevalence: 0.1 };
  expect(classify(checkConstraints(small, mission))).toBe('estimate-only');
  expect(classify(checkConstraints(large, mission))).toBe('robust');
});

test('low-sample perfection is not proof', () => {
  const tiny = fromCounts('tiny', 3, 0, 0, 3);
  const checks = checkConstraints(tiny, quality);
  expect(checks.every(gate => gate.passes)).toBe(true);
  expect(classify(checks)).toBe('estimate-only');
  expect(checks.find(gate => gate.key === 'minRecall')!.pessimistic).toBeCloseTo(0.0125 ** (1 / 3), 12); // 97.5% per interval after Bonferroni
});

test('zero false positives still leaves a positive worst-case false-positive rate', () => {
  const clean = fromCounts('clean', 950, 50, 0, 5000);
  const fpr = checkConstraints(clean, quality).find(gate => gate.key === 'maxFalsePositiveRate')!;
  expect(fpr.observed).toBe(0);
  expect(fpr.range![0]).toBe(0);
  expect(fpr.pessimistic!).toBeGreaterThan(0);
  expect(fpr.pessimistic!).toBeCloseTo(1 - 0.0125 ** (1 / 5000), 12);
});

test('one-class evidence is unknown rather than satisfied', () => {
  const negativesOnly = fromCounts('negatives', 0, 0, 3, 97);
  const checks = checkConstraints(negativesOnly, quality);
  expect(checks.find(gate => gate.key === 'minRecall')).toMatchObject({ observed: null, known: false, robust: false, passes: false });
  expect(classify(checks)).toBe('unknown');
});

test('an estimate exactly at the limit passes inclusively but is never robust at finite sample size', () => {
  const edge = fromCounts('edge', 9, 1, 1, 99);
  const recall = checkConstraints(edge, quality).find(gate => gate.key === 'minRecall')!;
  expect(recall).toMatchObject({ observed: 0.9, passes: true, robust: false, possible: true });
});

test('unavailable latency or cost blocks robustness until the constraint is removed', () => {
  const imported = fromCounts('imported', 9_900, 100, 100, 99_900, { p95LatencyMs: null, costPer1kUsd: null,
    metricProvenance: { classification: 'measured', latency: 'unknown', cost: 'unknown' } });
  const gated = checkConstraints(imported, { ...quality, maxP95LatencyMs: 100 });
  expect(gated.find(gate => gate.key === 'maxP95LatencyMs')).toMatchObject({ observed: null, passes: false, robust: false, known: false });
  expect(classify(gated)).toBe('unknown');
  expect(classify(checkConstraints(imported, quality))).toBe('robust');
});

test('one tolerance rule applies with and without a target prevalence', () => {
  const edge = { ...fromCounts('edge', 9, 1, 1, 99), recall: 0.9 - 1e-12 };
  const recallPasses = (mission: Mission) => checkConstraints(edge, mission).find(gate => gate.key === 'minRecall')!.passes;
  expect(recallPasses(quality)).toBe(false);
  expect(recallPasses({ ...quality, targetPrevalence: 0.1 })).toBe(false);
  const exact = { ...edge, recall: 0.9 };
  expect(checkConstraints(exact, quality).find(gate => gate.key === 'minRecall')!.passes).toBe(true);
  expect(checkConstraints(exact, { ...quality, targetPrevalence: 0.1 }).find(gate => gate.key === 'minRecall')!.passes).toBe(true);
});

test('missing target prevalence resolves to the evaluation sample everywhere', () => {
  const c = candidates[0];
  const { targetPrevalence: _, ...withoutTarget } = DEPLOYMENT_MISSION;
  void _;
  const sample = (c.tp + c.fn) / c.sampleCount;
  expect(resolvePrevalence(withoutTarget, c)).toEqual({ value: sample, source: 'sample' });
  expect(resolvePrevalence(DEPLOYMENT_MISSION, c)).toEqual({ value: 0.1, source: 'target' });
  expect(resolvePrevalence(withoutTarget, null)).toEqual({ value: null, source: 'sample' });
  const envelope = evaluateEnvelope(candidates, withoutTarget, 'min_fpr');
  expect(envelope.values.get(c.id)!.evidence).toMatchObject({ prevalence: sample, prevalenceSource: 'sample' });
});

test('statuses are consistent with estimates, nested by confidence and by simultaneous scope', () => {
  const ratio = fc.double({ min: 0, max: 1, noNaN: true });
  fc.assert(fc.property(ratio, ratio, ratio, fc.double({ min: 0.001, max: 0.5, noNaN: true }), (p, r, f, prior) => {
    const mission: Mission = { ...DEFAULT_MISSION, minPrecision: p, minRecall: r, maxFalsePositiveRate: f, targetPrevalence: prior };
    const at = (confidence: 0.9 | 0.95 | 0.99, scope: 'configuration' | 'all' = 'configuration') =>
      evaluateEnvelope(candidates, mission, 'min_fpr', 1e6, { confidence, scope });
    const base = at(0.95), strict = at(0.99), loose = at(0.9), family = at(0.95, 'all');
    for (const id of base.robustIds) expect(base.feasibleIds.has(id)).toBe(true);
    for (const id of strict.robustIds) expect(base.robustIds.has(id)).toBe(true);
    for (const id of base.robustIds) expect(loose.robustIds.has(id)).toBe(true);
    for (const id of family.robustIds) expect(base.robustIds.has(id)).toBe(true);
    for (const c of candidates) {
      const status = base.statuses.get(c.id)!;
      const point = base.feasibleIds.has(c.id);
      if (status === 'robust' || status === 'estimate-only') expect(point).toBe(true);
      if (status === 'uncertain' || status === 'infeasible') expect(point).toBe(false);
      for (const gate of base.checks.get(c.id)!) {
        if (gate.robust) expect(gate.passes).toBe(true);
        if (gate.passes) expect(gate.possible).toBe(true);
        if (gate.range && gate.observed !== null) {
          expect(gate.observed).toBeGreaterThanOrEqual(gate.range[0] - 1e-12);
          expect(gate.observed).toBeLessThanOrEqual(gate.range[1] + 1e-12);
        }
      }
    }
  }), { numRuns: 60 });
});

test('the recommendation prefers robust evidence and says when it relies on an estimate', () => {
  const strong = fromCounts('strong', 98_000, 2_000, 1_000, 99_000);
  const weak = fromCounts('weak', 10, 0, 0, 10);
  const envelope = evaluateEnvelope([weak, strong], { ...quality, targetPrevalence: 0.1 }, 'min_fpr');
  expect(envelope.recommendedId).toBe('strong');
  expect(envelope.recommendedBasis).toBe('robust');
  const onlyWeak = evaluateEnvelope([weak], { ...quality, targetPrevalence: 0.1 }, 'min_fpr');
  expect(onlyWeak).toMatchObject({ recommendedId: 'weak', recommendedBasis: 'estimate' });
});
