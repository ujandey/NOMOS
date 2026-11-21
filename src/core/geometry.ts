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
  return top + k / positive(value) - k;
}

export function reciprocalFromY(y: number, { top, k }: Calibration) {
  return k / (k + (y - top));
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
  return { x, y: (1 - t) * a.y + t * b.y };
}

export function solve(leftY: number, rightY: number, inverse: (y: number) => number, axes: Axes): Alignment {
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
  return productFromGeometry(requests, price, REQUEST_BASE, PRICE_BASE, cal, axes);
}

export function productFromGeometry(a: number, b: number, aBase: number, bBase: number, cal: Calibration, axes = AXES) {
  return scaledProductFromGeometry(a, b, aBase, bBase, aBase * bBase, cal, axes);
}

export function scaledProductFromGeometry(a: number, b: number, aBase: number, bBase: number, outputBase: number, cal: Calibration, axes = AXES) {
  return solve(logToY(a, aBase, cal), logToY(b, bBase, cal),
    y => logFromY(y, outputBase, { ...cal, k: cal.k / 2 }), axes);
}

export function logit(probability: number) {
  if (!(probability > 0 && probability < 1)) throw new RangeError('Log-odds requires a probability strictly between zero and one.');
  return Math.log(probability) - Math.log1p(-probability);
}

export function logistic(odds: number) {
  const exponential = Math.exp(-Math.abs(odds));
  return odds >= 0 ? 1 / (1 + exponential) : exponential / (1 + exponential);
}

export type LogOddsPlate = { prior: Calibration; ratio: Calibration; result: Calibration };

export function prevalenceFromGeometry(prevalence: number, logRatio: number, plate: LogOddsPlate, axes = AXES) {
  return solve(plate.prior.top + plate.prior.k * logit(prevalence),
    plate.ratio.top + plate.ratio.k * logRatio,
    y => logistic((y - plate.result.top) / plate.result.k), axes);
}

export function collinearityResidual({ left, right, intersection }: Alignment) {
  const dx = right.x - left.x, dy = right.y - left.y;
  return Math.abs(dx * (intersection.y - left.y) - dy * (intersection.x - left.x)) / Math.hypot(dx, dy);
}

export function reciprocalCalibration(min: number): Calibration {
  return { top: TOP, k: (BOTTOM - TOP) * min / (1 - min) };
}

export function costCalibration(minLog = -3, maxLog = 2): Calibration {
  const k = (BOTTOM - TOP) / (maxLog - minLog);
  return { top: TOP - k * minLog, k };
}
