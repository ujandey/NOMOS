import fc from 'fast-check';
import { expect, test } from 'vitest';
import { stepCount } from './instruments';

test('audit regression: integer request steps never stick', () => {
  expect(stepCount(2, 1)).toBe(3);
  expect(stepCount(2, -1)).toBe(1);
  expect(stepCount(1, -1)).toBe(0);
  expect(stepCount(0, 1)).toBe(1);
  expect(stepCount(0, -1)).toBe(0);
  expect(stepCount(1_000_000, 1)).toBe(1_122_018);
  expect(stepCount(1e12, 1, 1e12)).toBe(1e12);
  fc.assert(fc.property(fc.integer({ min: 0, max: 1e11 }), fc.constantFrom(-1, 1), (value, direction) => {
    const next = stepCount(value, direction, 1e12);
    expect(Number.isInteger(next)).toBe(true);
    if (direction > 0) expect(next).toBeGreaterThan(value);
    else if (value > 0) expect(next).toBeLessThan(value);
    else expect(next).toBe(0);
  }), { numRuns: 1000 });
});
