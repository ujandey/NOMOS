import { expect, test } from 'vitest';
import { DEFAULT_MISSION } from './contracts';
import { parseOffline, proposePatch } from './mission';

test('offline full mission, partial patch and strict-to-inclusive note', () => {
  expect(parseOffline('Recall must be at least 90 percent, precision at least 80 percent, p95 under 100 milliseconds, cost below $5 per thousand.', DEFAULT_MISSION).mission).toEqual(DEFAULT_MISSION);
  const rescue = parseOffline('Keep recall at least 90%, but prioritize latency under 50 ms.', DEFAULT_MISSION);
  expect(rescue).toMatchObject({ changes: [{ key: 'maxP95LatencyMs', from: 100, to: 50 }], source: 'fallback' });
  expect(rescue.warnings).toHaveLength(1);
  expect(parseOffline('Keep the other constraints, but make latency under 50 ms.', DEFAULT_MISSION).mission).toEqual(rescue.mission);
  expect(parseOffline('precision >= .85; cost <= $3/1k', DEFAULT_MISSION).mission).toMatchObject({ minPrecision: 0.85, maxCostPer1kUsd: 3 });
});

test.each(['Make it safe and cheap.', 'recall at least 101%', 'latency under 0 ms', 'cost under $5 per request',
  'precision at least 85', 'recall at least 90%, recall at least 50%', 'recall at least 90%, cost in EUR', 'recall at least 0.9e2'])('rejects ambiguous or invalid input %s', text => {
  expect(() => parseOffline(text, DEFAULT_MISSION)).toThrow();
});
test('strict tool output rejects added fields and out-of-range values', () => {
  expect(() => proposePatch({ minRecall: 0.8, deploy: true }, DEFAULT_MISSION, 'llm')).toThrow();
  expect(() => proposePatch({ maxP95LatencyMs: Infinity }, DEFAULT_MISSION, 'llm')).toThrow();
  expect(() => proposePatch({ minRecall: -1 }, DEFAULT_MISSION, 'llm')).toThrow();
});

test.each([
  ['daily budget under $3,500 per day', { maxDailyCostUsd: 3500 }],
  ['budget at most $1,250,000.50 per day', { maxDailyCostUsd: 1250000.5 }],
  ['catch 95% of fraud', { minRecall: 0.95 }],
  ['Detect 90 percent of all fraudulent transactions', { minRecall: 0.9 }],
  ['catch at least 97.5% of fraud cases', { minRecall: 0.975 }],
  ['latency under 0.05 s', { maxP95LatencyMs: 50 }],
  ['p95 latency at most 0.07 seconds', { maxP95LatencyMs: 70 }],
  ['latency below 1.5 sec', { maxP95LatencyMs: 1500 }],
  ['latency under 80 ms', { maxP95LatencyMs: 80 }],
])('audit regression: %s', (text, expected) => {
  expect(parseOffline(text, DEFAULT_MISSION).mission).toMatchObject(expected);
});

test('seconds conversion is announced and malformed separators are rejected', () => {
  expect(parseOffline('latency under 0.05 s', DEFAULT_MISSION).warnings.join(' ')).toMatch(/converted to 50 ms/);
  for (const text of ['daily budget under $35,00 per day', 'daily budget under $3,5000 per day', 'catch 95 of fraud', 'latency under 5 minutes']) {
    expect(() => parseOffline(text, DEFAULT_MISSION)).toThrow();
  }
});
