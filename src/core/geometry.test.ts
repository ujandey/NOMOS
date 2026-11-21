import { describe, expect, test } from 'vitest';
import fc from 'fast-check';
import { AXES, costCalibration, costFromGeometry, f1FromGeometry, intersectLineAtX, logFromY, logToY, reciprocalCalibration, reciprocalFromY, reciprocalToY } from './geometry';
import { instrumentReading } from './instruments';

const reciprocal = reciprocalCalibration(0.5);
const logarithmic = costCalibration();
describe('reciprocal alignment', () => {
  test.each([[0.8, 0.9], [1, 1], [0.5, 0.5], [0.6, 0.95]])('reads %s and %s', (p, r) => {
    const result = f1FromGeometry(p, r, reciprocal);
    const expected = (2 * p * r) / (p + r);
    expect(result.geometryValue).toBeCloseTo(expected, 13);
    expect(result.intersection.y).toBeCloseTo(reciprocalToY(expected, reciprocal), 9);
  });
  test('matches an independent harmonic mean, monotonicity and axis inversion', () => {
    fc.assert(fc.property(fc.double({ min: 0.5, max: 1, noNaN: true }), fc.double({ min: 0.5, max: 1, noNaN: true }), (p, r) => {
      const value = f1FromGeometry(p, r, reciprocal).geometryValue;
      expect(Math.abs(value - 2 * p * r / (p + r))).toBeLessThan(1e-10);
      expect(f1FromGeometry((p + 1) / 2, r, reciprocal).geometryValue + 1e-14).toBeGreaterThanOrEqual(value);
      expect(reciprocalFromY(reciprocalToY(p, reciprocal), reciprocal)).toBeCloseTo(p, 13);
    }), { numRuns: 1000 });
  });
  test('expands for smaller values and handles zero and missing inputs', () => {
    expect(instrumentReading('f1', 0.08, 0.9, false).minimum).toBe(0.01);
    expect(instrumentReading('f1', 0, 0, true)).toMatchObject({ alignment: null, state: 'zero', value: 0 });
    expect(instrumentReading('f1', null, 0.9, true)).toMatchObject({ value: null, state: 'missing' });
    expect(() => f1FromGeometry(0, 0.9, reciprocal)).toThrow(RangeError);
  });
});
describe('logarithmic alignment', () => {
  test.each([[1e6, 0.003, 3000], [50_000, 0.0004, 20], [1e3, 5 / 1000, 5]])('multiplies %s by %s', (n, c, total) => {
    expect(costFromGeometry(n, c, logarithmic).geometryValue).toBeCloseTo(total, 9);
  });
  test('matches independent multiplication over decades and with reference checks off', () => {
    fc.assert(fc.property(fc.double({ min: 3, max: 7, noNaN: true }), fc.double({ min: -5, max: -1, noNaN: true }), (a, b) => {
      const n = 10 ** a;
      const c = 10 ** b;
      const reading = instrumentReading('cost', n, c, false);
      expect(reading.verification).toBeNull();
      expect(Math.abs(reading.value! - n * c) / (n * c)).toBeLessThan(1e-10);
      expect(Math.abs(logFromY(logToY(c, 0.001, logarithmic), 0.001, logarithmic) - c) / c).toBeLessThan(1e-10);
    }), { numRuns: 1000 });
  });
  test('rejects invalid logarithms and reports explicit zero boundaries', () => {
    expect(() => costFromGeometry(0, 0.01, logarithmic)).toThrow(RangeError);
    expect(() => costFromGeometry(10, -0.01, logarithmic)).toThrow(RangeError);
    expect(instrumentReading('cost', 10, 0, false)).toMatchObject({ value: 0, state: 'zero', alignment: null });
  });
});
test('intersection is independent of view scale and rejects degenerate/outside axes', () => {
  expect(intersectLineAtX({ x: 0, y: 30 }, { x: 4, y: 14 }, 1)).toEqual({ x: 1, y: 26 });
  const base = f1FromGeometry(0.8, 0.9, reciprocal);
  const scaled = f1FromGeometry(0.8, 0.9, { top: reciprocal.top * 3, k: reciprocal.k * 3 },
    { left: AXES.left * 3, center: AXES.center * 3, right: AXES.right * 3 });
  expect(scaled.geometryValue).toBeCloseTo(base.geometryValue, 14);
  expect(() => intersectLineAtX({ x: 1, y: 3 }, { x: 1, y: 9 }, 1)).toThrow();
  expect(() => intersectLineAtX({ x: 0, y: 3 }, { x: 1, y: 9 }, 2)).toThrow();
});

test('adaptive F1 calibration agrees with an independent reference over the full input range', () => {
  const logRatio = fc.double({ min: -12, max: 0, noNaN: true });
  const pocket = { left: 57, center: 180, right: 303 };
  fc.assert(fc.property(logRatio, logRatio, (a, b) => {
    const precision = 10 ** a, recall = 10 ** b;
    const reference = 2 * precision * recall / (precision + recall);
    const reading = instrumentReading('f1', precision, recall, true, pocket);
    expect(Math.abs(reading.value! / reference - 1)).toBeLessThan(1e-12);
    expect(reading.verification?.passes).toBe(true);
    expect(reading.alignment!.intersection.y).toBeCloseTo(
      (reading.alignment!.left.y + reading.alignment!.right.y) / 2, 11);
    expect(reading.alignment!.intersection.x).toBe(180);
  }), { numRuns: 1000 });
});

test('cost geometry uses the same intersection with frozen calibration and broad domains', () => {
  fc.assert(fc.property(fc.integer({ min: 1, max: 1e12 }), fc.double({ min: -12, max: 3, noNaN: true }), (n, logPrice) => {
    const price = 10 ** logPrice;
    const reading = instrumentReading('cost', n, price, true);
    expect(Math.abs(reading.value! / (n * price) - 1)).toBeLessThan(1e-12);
    expect(reading.verification?.passes).toBe(true);
    const shifted = instrumentReading('cost', n * 0.95, price, false, AXES, reading);
    expect(shifted.calibration).toBe(reading.calibration);
    expect(Math.abs(shifted.value! / (n * 0.95 * price) - 1)).toBeLessThan(1e-12);
  }), { numRuns: 1000 });
});
