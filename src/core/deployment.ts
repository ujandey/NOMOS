import { AXES, BOTTOM, TOP, TOLERANCE, collinearityResidual, costCalibration, logit, prevalenceFromGeometry,
  scaledProductFromGeometry, type Alignment, type Axes, type Calibration, type LogOddsPlate } from './geometry';
import type { Candidate } from './contracts';
import { instrumentReading } from './instruments';
import { occupancyReference, precisionReference } from './reference';

export const RATE_STABILITY = 'Target precision assumes the evaluated true-positive and false-positive rates hold in the deployment population.';
export const STEADY_STATE = 'Little’s Law assumes a stable system, consistent request boundaries, and long-run averages.';
export const DAILY_REQUESTS = 1_000_000;
export const THROUGHPUT_BASE = 10;
export const SECONDS_BASE = 0.1;

export function verifyAlignment(alignment: Alignment | null, value: number, referenceValue: number | null, relative = false) {
  const absoluteError = referenceValue === null ? null : Math.abs(value - referenceValue);
  const error = absoluteError !== null && relative && referenceValue ? absoluteError / Math.abs(referenceValue) : absoluteError;
  return { referenceValue, absoluteError, error, criterion: relative ? 'relative' : 'absolute',
    tolerance: TOLERANCE, passes: error !== null && error <= TOLERANCE,
    residual: alignment === null ? null : collinearityResidual(alignment) };
}

export function oddsPlate(prior: number, logRatio: number): LogOddsPlate {
  const transformed = prior > 0 && prior < 1 ? logit(prior) : 0;
  const lower = Math.min(-Math.log(999), Math.floor(transformed) - 1);
  const upper = Math.max(0, Math.ceil(transformed) + 0.05);
  const ratioLower = Math.min(0, Math.floor(logRatio));
  const ratioUpper = Math.max(Math.log(1000), Math.ceil(logRatio));
  const span = Math.max(upper - lower, ratioUpper - ratioLower);
  const k = -(BOTTOM - TOP) / span;
  const priorTop = TOP - k * upper, ratioTop = TOP - k * ratioUpper;
  return { prior: { top: priorTop, k }, ratio: { top: ratioTop, k }, result: { top: (priorTop + ratioTop) / 2, k: k / 2 } };
}

export function prevalenceReading(prior: number, tpr: number | null, fpr: number | null, fixedPlate?: LogOddsPlate, verify = true, axes = AXES) {
  if (![prior, tpr, fpr].every(value => value === null || Number.isFinite(value) && value >= 0 && value <= 1)) {
    throw new RangeError('Prevalence and conditional rates must lie in [0, 1].');
  }
  const finiteRatio = tpr !== null && fpr !== null && tpr > 0 && fpr > 0;
  const logRatio = finiteRatio ? Math.log(tpr) - Math.log(fpr) : null;
  const ratio = logRatio !== null ? Math.exp(logRatio) : tpr === null || fpr === null || (tpr === 0 && fpr === 0)
    ? null : fpr === 0 ? Infinity : 0;
  const plate = fixedPlate ?? oddsPlate(prior, logRatio ?? 0);
  const base = { ratio: Number.isFinite(ratio) ? ratio : null,
    ratioState: ratio === Infinity ? logRatio === null ? 'unbounded' : 'overflow' : ratio === null ? 'undefined' : 'finite', logRatio, plate } as const;
  if (tpr === null || fpr === null) return { ...base, state: 'missing', value: null, alignment: null, verification: null } as const;
  const reference = verify ? precisionReference(prior, tpr, fpr) : null;
  if (prior === 0 && fpr === 0 || prior === 1 && tpr === 0 || tpr === 0 && fpr === 0) {
    return { ...base, state: 'no-alerts', value: null, alignment: null, verification: null } as const;
  }
  if (!finiteRatio || prior === 0 || prior === 1) {
    const value = prior === 0 || tpr === 0 ? 0 : 1;
    return { ...base, state: 'boundary', value, alignment: null, verification: verify ? verifyAlignment(null, value, reference) : null } as const;
  }
  const alignment = prevalenceFromGeometry(prior, logRatio!, plate, axes);
  const value = alignment.geometryValue;
  return { ...base, state: 'aligned', value, alignment, verification: verify ? verifyAlignment(alignment, value, reference) : null } as const;
}

export function capacityReading(rate: number | null, meanMs: number | null, verify = true, axes: Axes = AXES, fixed?: Calibration) {
  if ([rate, meanMs].some(value => value !== null && (!Number.isFinite(value) || value < 0))) {
    throw new RangeError('Throughput and mean response time must be finite and nonnegative.');
  }
  const rateLog = Math.log10(rate || THROUGHPUT_BASE) - Math.log10(THROUGHPUT_BASE);
  const meanLog = Math.log10(meanMs || 100) - 2;
  const calibration = fixed ?? costCalibration(Math.min(-2, Math.floor(rateLog), Math.floor(meanLog)),
    Math.max(3, Math.ceil(rateLog), Math.ceil(meanLog)));
  if (rate === null || meanMs === null) return { state: 'missing', value: null, alignment: null, verification: null, calibration } as const;
  const alignment = rate === 0 || meanMs === 0 ? null
    : scaledProductFromGeometry(rate, meanMs, THROUGHPUT_BASE, SECONDS_BASE * 1000, THROUGHPUT_BASE * SECONDS_BASE, calibration, axes);
  const value = alignment?.geometryValue ?? 0;
  if (!Number.isFinite(value) || (value === 0 && alignment)) return { state: 'invalid', value: null, alignment: null, verification: null, calibration } as const;
  return { state: alignment ? 'aligned' : 'zero', value, alignment, calibration,
    verification: verify ? verifyAlignment(alignment, value, occupancyReference(rate, meanMs), true) : null };
}

export function deploymentReadings(candidate: Candidate, prior: number, requests = DAILY_REQUESTS, verify = true) {
  const precision = prevalenceReading(prior, candidate.recall, candidate.falsePositiveRate, undefined, verify);
  const f1 = instrumentReading('f1', precision.value, candidate.recall, verify);
  const price = candidate.costPer1kUsd === null ? null : candidate.costPer1kUsd / 1000;
  const cost = instrumentReading('cost', requests, price, verify);
  const throughput = candidate.performance?.requestsPerSecond ?? null;
  const meanMs = candidate.performance?.meanResponseMs ?? null;
  return { precision, f1, cost, capacity: capacityReading(throughput, meanMs, verify) };
}
