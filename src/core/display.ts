import type { Candidate, Mission } from './contracts';
import type { Violation } from './envelope';

export const percent = (value: number | null, digits = 1) => value === null ? 'Unknown' : (100 * value).toFixed(digits) + '%';
export function dollars(value: number | null) {
  if (value === null) return 'Unknown';
  if (value > 0 && value < 0.01) return '$' + value.toExponential(2);
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}
export const latencyValue = (value: number | null) => value === null ? 'Unknown' : value.toFixed(2) + ' ms';
export const candidateLabel = (candidate: Candidate) => candidate.modelName + ' · ' + candidate.threshold.toFixed(2);
export const missionDisplay = (key: keyof Mission, value: number) => key === 'minPrecision' || key === 'minRecall'
  ? percent(value) : key === 'maxP95LatencyMs' ? value + ' ms' : '$' + value + ' / 1k';

export function marginText(gate: Violation, precise = false) {
  if (gate.margin === null) return 'Unknown';
  const value = gate.direction === 1 ? gate.margin * 100 : gate.margin;
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  const magnitude = Math.abs(value);
  const formatted = precise ? Number(magnitude.toPrecision(10)).toString() : magnitude.toFixed(2);
  return sign + formatted + ' ' + (gate.direction === 1 ? 'pp' : gate.unit);
}
