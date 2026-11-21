import { AXES, costCalibration, costFromGeometry, f1FromGeometry, PRICE_BASE, reciprocalCalibration, REQUEST_BASE, TOLERANCE, type Calibration } from './geometry';
import { collinearityResidual } from './geometry';
import { f1Reference, costReference } from './reference';

export type Instrument = 'f1' | 'cost';
export type InstrumentDomain = { calibration: Calibration; minimum: number; minLog: number; maxLog: number };

export { f1Reference, costReference } from './reference';

function calibrationFor(kind: Instrument, left: number | null, right: number | null): InstrumentDomain {
  const positiveInputs = [left, right].filter((value): value is number => value !== null && value > 0);
  const smallest = Math.min(0.5, ...positiveInputs);
  const minimum = kind === 'f1' && smallest < 0.5 ? 10 ** Math.floor(Math.log10(smallest)) || smallest : 0.5;
  const logs = [left && left > 0 ? Math.log10(left) - Math.log10(REQUEST_BASE) : 0,
    right && right > 0 ? Math.log10(right) - Math.log10(PRICE_BASE) : 0];
  const minLog = Math.min(-3, Math.floor(Math.min(...logs)));
  const maxLog = Math.max(2, Math.ceil(Math.max(...logs)));
  const calibration = kind === 'f1' ? reciprocalCalibration(minimum) : costCalibration(minLog, maxLog);
  return { calibration, minimum, minLog, maxLog };
}

export function instrumentReading(kind: Instrument, left: number | null, right: number | null, verify: boolean, axes = AXES, fixedDomain?: InstrumentDomain) {
  const { calibration, minimum, minLog, maxLog } = fixedDomain ?? calibrationFor(kind, left, right);
  const domain = { calibration, minimum, minLog, maxLog };
  if (left === null || right === null) {
    return { alignment: null, value: null, verification: null, state: 'missing', ...domain } as const;
  }
  if ([left, right].some(value => !Number.isFinite(value) || value < 0 || (kind === 'f1' && value > 1))) {
    return { alignment: null, value: null, verification: null, state: 'invalid', ...domain } as const;
  }
  if (left === 0 || right === 0) {
    return { alignment: null, value: 0, verification: verify ? {
      referenceValue: kind === 'f1' ? f1Reference(left, right) : costReference(left, right),
      absoluteError: 0, error: 0, tolerance: TOLERANCE, criterion: 'absolute', passes: true, residual: null,
    } : null, state: 'zero', ...domain } as const;
  }
  const alignment = kind === 'f1'
    ? f1FromGeometry(left, right, calibration, axes) : costFromGeometry(left, right, calibration, axes);
  const value = alignment.geometryValue;
  if (!Number.isFinite(value) || value <= 0) {
    return { alignment: null, value: null, verification: null, state: 'invalid', ...domain } as const;
  }
  if (!verify) return { alignment, value, verification: null, state: 'aligned', ...domain } as const;
  const referenceValue = kind === 'f1' ? f1Reference(left, right) : costReference(left, right);
  const absoluteError = Math.abs(value - referenceValue);
  const error = kind === 'cost' ? absoluteError / Math.abs(referenceValue) : absoluteError;
  const verification = {
    referenceValue, absoluteError, error, tolerance: TOLERANCE,
    criterion: kind === 'f1' ? 'absolute' : 'relative', passes: error < TOLERANCE, residual: collinearityResidual(alignment),
  };
  return { alignment, value, verification, state: 'aligned', ...domain } as const;
}
