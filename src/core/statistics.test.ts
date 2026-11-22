import fc from 'fast-check';
import { expect, test } from 'vitest';
import { bonferroniLevel, clopperPearson, logGamma, regularizedBeta } from './statistics';

// Independent reference: exact binomial tail sums in log space. This never touches the beta function.
function logChoose(n: number, k: number) {
  let total = 0;
  for (let i = 1; i <= k; i++) total += Math.log(n - k + i) - Math.log(i);
  return total;
}
function binomialPmf(k: number, n: number, p: number) {
  if (p === 0) return k === 0 ? 1 : 0;
  if (p === 1) return k === n ? 1 : 0;
  return Math.exp(logChoose(n, k) + k * Math.log(p) + (n - k) * Math.log1p(-p));
}
const cdf = (x: number, n: number, p: number) => Array.from({ length: x + 1 }, (_, k) => binomialPmf(k, n, p)).reduce((a, b) => a + b, 0);

test('log-gamma and incomplete beta match closed forms', () => {
  for (let n = 1; n < 30; n++) {
    let factorial = 0;
    for (let i = 2; i < n; i++) factorial += Math.log(i);
    expect(logGamma(n)).toBeCloseTo(factorial, 10);
  }
  expect(logGamma(0.5)).toBeCloseTo(Math.log(Math.sqrt(Math.PI)), 12);
  // I_x(1, b) = 1 − (1 − x)^b and I_x(a, 1) = x^a.
  fc.assert(fc.property(fc.double({ min: 0.001, max: 0.999, noNaN: true }), fc.integer({ min: 1, max: 400 }), (x, k) => {
    expect(regularizedBeta(x, 1, k)).toBeCloseTo(1 - (1 - x) ** k, 12);
    expect(regularizedBeta(x, k, 1)).toBeCloseTo(x ** k, 12);
  }), { numRuns: 300 });
});

test('Clopper–Pearson bounds solve the defining binomial tail equations', () => {
  fc.assert(fc.property(fc.integer({ min: 1, max: 300 }).chain(n => fc.tuple(fc.constant(n), fc.integer({ min: 0, max: n }))),
    fc.constantFrom(0.9, 0.95, 0.975, 0.99), ([n, x], confidence) => {
      const tail = (1 - confidence) / 2;
      const { lower, upper } = clopperPearson(x, n, confidence)!;
      expect(lower).toBeLessThanOrEqual(x / n);
      expect(upper).toBeGreaterThanOrEqual(x / n);
      // Upper bound: P(X ≤ x | upper) = α/2. Lower bound: P(X ≥ x | lower) = α/2.
      if (x < n) expect(cdf(x, n, upper)).toBeCloseTo(tail, 9);
      if (x > 0) expect(1 - cdf(x - 1, n, lower)).toBeCloseTo(tail, 9);
    }), { numRuns: 400 });
});

test('zero-event, all-event, no-trial and published reference intervals', () => {
  expect(clopperPearson(0, 10, 0.95)).toEqual({ lower: 0, upper: 1 - 0.025 ** (1 / 10) });
  expect(clopperPearson(10, 10, 0.95)).toEqual({ lower: 0.025 ** (1 / 10), upper: 1 });
  expect(clopperPearson(0, 10, 0.95)!.upper).toBeCloseTo(0.30850, 5);
  expect(clopperPearson(0, 0, 0.95)).toBeNull();
  // Reference values for 5/10 and 1/100 at 95% (Clopper & Pearson 1934, standard tables).
  const half = clopperPearson(5, 10, 0.95)!;
  expect(half.lower).toBeCloseTo(0.187086, 6);
  expect(half.upper).toBeCloseTo(0.812914, 6);
  const rare = clopperPearson(1, 100, 0.95)!;
  expect(rare.lower).toBeCloseTo(0.000253, 6);
  expect(rare.upper).toBeCloseTo(0.054460, 5);
  expect(() => clopperPearson(3, 2, 0.95)).toThrow(RangeError);
  expect(() => clopperPearson(1.5, 2, 0.95)).toThrow(RangeError);
  expect(() => clopperPearson(1, 2, 1)).toThrow(RangeError);
});

test('exact coverage is at least nominal for small samples at every tested true rate', () => {
  for (const n of [1, 2, 5, 12, 40]) {
    const intervals = Array.from({ length: n + 1 }, (_, x) => clopperPearson(x, n, 0.95)!);
    for (let i = 0; i <= 400; i++) {
      const p = i / 400;
      const coverage = intervals.reduce((sum, { lower, upper }, x) => sum + (lower <= p && p <= upper ? binomialPmf(x, n, p) : 0), 0);
      expect(coverage).toBeGreaterThanOrEqual(0.95 - 1e-12);
    }
  }
});

test('large samples stay fast, ordered and narrow', () => {
  const started = performance.now();
  const big = clopperPearson(4_321, 1_000_000, 0.975)!;
  expect(performance.now() - started).toBeLessThan(500);
  expect(big.lower).toBeLessThan(0.004321);
  expect(big.upper).toBeGreaterThan(0.004321);
  expect(big.upper - big.lower).toBeLessThan(0.0004);
});

test('Bonferroni allocates the error budget across simultaneous intervals', () => {
  expect(bonferroniLevel(0.95, 1)).toBeCloseTo(0.95, 15);
  expect(bonferroniLevel(0.95, 2)).toBeCloseTo(0.975, 15);
  expect(bonferroniLevel(0.95, 54)).toBeCloseTo(1 - 0.05 / 54, 15);
  expect(() => bonferroniLevel(0.95, 0)).toThrow(RangeError);
});
