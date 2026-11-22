/**
 * Exact binomial confidence bounds for measured classification rates.
 *
 * NOMOS uses the Clopper–Pearson interval because its coverage is guaranteed to be at least
 * the nominal level for every true rate and every sample size, including zero-event and
 * all-event samples. It is conservative (wider than Wilson or Jeffreys), which is the
 * appropriate direction for a feasibility claim.
 */

const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];

export function logGamma(x: number): number {
  if (!(x > 0) || !Number.isFinite(x)) throw new RangeError('logGamma expects a finite positive value.');
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  const z = x - 1;
  let sum = LANCZOS[0];
  for (let i = 1; i < 9; i++) sum += LANCZOS[i] / (z + i);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(sum);
}

function betaContinuedFraction(x: number, a: number, b: number) {
  const tiny = 1e-300;
  let c = 1, d = 1 - (a + b) * x / (a + 1);
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 100_000; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (a + b + m) * x / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-15) return h;
  }
  throw new RangeError('Incomplete beta continued fraction did not converge.');
}

/** Regularized incomplete beta function I_x(a, b). */
export function regularizedBeta(x: number, a: number, b: number): number {
  if (!(a > 0 && b > 0)) throw new RangeError('Beta parameters must be positive.');
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log1p(-x));
  return x < (a + 1) / (a + b + 2)
    ? front * betaContinuedFraction(x, a, b) / a
    : 1 - front * betaContinuedFraction(1 - x, b, a) / b;
}

/** Inverse of I_x(a, b) by bisection. I is monotone in x, so bisection cannot miss the root. */
export function betaQuantile(probability: number, a: number, b: number): number {
  if (!(probability >= 0 && probability <= 1)) throw new RangeError('Probability must lie in [0, 1].');
  if (probability === 0) return 0;
  if (probability === 1) return 1;
  let lo = 0, hi = 1;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (mid === lo || mid === hi) break;
    if (regularizedBeta(mid, a, b) < probability) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export type Interval = { lower: number; upper: number };
const cache = new Map<string, Interval>();

/**
 * Two-sided Clopper–Pearson interval for `successes` out of `trials` at the given confidence.
 * Returns null when there are no trials: the data contain no information about the rate.
 */
export function clopperPearson(successes: number, trials: number, confidence: number): Interval | null {
  if (!Number.isInteger(successes) || !Number.isInteger(trials) || successes < 0 || successes > trials) {
    throw new RangeError('Expected integer counts with 0 ≤ successes ≤ trials.');
  }
  if (!(confidence > 0 && confidence < 1)) throw new RangeError('Confidence must lie strictly between 0 and 1.');
  if (trials === 0) return null;
  const key = successes + '/' + trials + '@' + confidence;
  const known = cache.get(key);
  if (known) return known;
  const tail = (1 - confidence) / 2;
  const interval = {
    // Closed forms at the edges avoid evaluating a degenerate beta distribution.
    lower: successes === 0 ? 0 : successes === trials ? tail ** (1 / trials) : betaQuantile(tail, successes, trials - successes + 1),
    upper: successes === trials ? 1 : successes === 0 ? 1 - tail ** (1 / trials) : betaQuantile(1 - tail, successes + 1, trials - successes),
  };
  if (cache.size > 20_000) cache.clear();
  cache.set(key, interval);
  return interval;
}

/** Bonferroni: m two-sided intervals at 1 − α/m hold simultaneously with probability ≥ 1 − α. */
export function bonferroniLevel(confidence: number, intervals: number) {
  if (!(confidence > 0 && confidence < 1) || !Number.isInteger(intervals) || intervals < 1) {
    throw new RangeError('Expected a confidence in (0, 1) and a positive integer number of intervals.');
  }
  return 1 - (1 - confidence) / intervals;
}
