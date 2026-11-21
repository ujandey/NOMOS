export type Point = { x: number; y: number };
export type Calibration = { top: number; k: number };
export type Axes = { left: number; center: number; right: number };
export type Alignment = { left: Point; right: Point; intersection: Point; geometryValue: number };
export const AXES: Axes = { left: 116, center: 380, right: 644 };
export const TOP = 45;
export const BOTTOM = 253;
export const TOLERANCE = 1e-10;
export const REQUEST_BASE = 1_000_000;
export const PRICE_BASE = 0.001;
export const TOTAL_BASE = REQUEST_BASE * PRICE_BASE;

function positive(value: number) {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError('Expected a finite positive value.');
  return value;
}

export function reciprocalToY(value: number, { top, k }: Calibration) {
  return top + k * (1 / positive(value) - 1);
}

export function reciprocalFromY(y: number, { top, k }: Calibration) {
  return 1 / (1 + (y - top) / k);
}

export function logToY(value: number, reference: number, { top, k }: Calibration) {
  return top + k * (Math.log10(positive(value)) - Math.log10(positive(reference)));
}

export function logFromY(y: number, reference: number, { top, k }: Calibration) {
  return 10 ** (Math.log10(positive(reference)) + (y - top) / k);
}

export function intersectLineAtX(a: Point, b: Point, x: number): Point {
  if (![a.x, a.y, b.x, b.y, x].every(Number.isFinite) || a.x === b.x) {
    throw new RangeError('Intersection requires two finite endpoints with distinct x coordinates.');
  }
  const t = (x - a.x) / (b.x - a.x);
  if (t < 0 || t > 1) throw new RangeError('Target axis is outside the straightedge.');
  return { x, y: a.y + t * (b.y - a.y) };
}

function solve(leftY: number, rightY: number, inverse: (y: number) => number, axes: Axes): Alignment {
  if (axes.center !== (axes.left + axes.right) / 2) throw new RangeError('Axes must be equally spaced.');
  const left = { x: axes.left, y: leftY };
  const right = { x: axes.right, y: rightY };
  const intersection = intersectLineAtX(left, right, axes.center);
  return { left, right, intersection, geometryValue: inverse(intersection.y) };
}

export function f1FromGeometry(p: number, r: number, cal: Calibration, axes = AXES) {
  if (p > 1 || r > 1) throw new RangeError('Precision and recall must be at most one.');
  return solve(reciprocalToY(p, cal), reciprocalToY(r, cal), y => reciprocalFromY(y, cal), axes);
}

export function costFromGeometry(requests: number, price: number, cal: Calibration, axes = AXES) {
  return solve(logToY(requests, REQUEST_BASE, cal), logToY(price, PRICE_BASE, cal),
    y => logFromY(y, TOTAL_BASE, { ...cal, k: cal.k / 2 }), axes);
}

export function reciprocalCalibration(min: number): Calibration {
  return { top: TOP, k: (BOTTOM - TOP) / (1 / min - 1) };
}

export function costCalibration(minLog = -3, maxLog = 2): Calibration {
  const k = (BOTTOM - TOP) / (maxLog - minLog);
  return { top: TOP - k * minLog, k };
}
