import type { Candidate } from './contracts';

export const percent = (value: number | null, digits = 1) => value === null ? 'Unknown' : (100 * value).toFixed(digits) + '%';
export function dollars(value: number | null) {
  if (value === null) return 'Unknown';
  if (value > 0 && value < 0.01) return '$' + value.toExponential(2);
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}
export const latencyValue = (value: number | null) => value === null ? 'Unknown' : value.toFixed(2) + ' ms';
export const candidateLabel = (candidate: Candidate) => candidate.modelName + ' · ' + candidate.threshold.toFixed(2);

const RATIO_KEYS = ['minPrecision', 'minRecall', 'maxFalsePositiveRate', 'targetPrevalence'];
export function gateValue(key: string, value: number | null | undefined) {
  if (value === undefined) return 'Off';
  if (value === null) return 'Unknown';
  if (RATIO_KEYS.includes(key)) return percent(value, 2);
  if (key === 'maxP95LatencyMs') return latencyValue(value);
  if (key === 'minThroughputRps') return value.toLocaleString() + ' req/s';
  return dollars(value);
}
