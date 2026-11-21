import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { candidateSchema, manifestSchema } from './contracts';
import { candidates, manifest } from './demo';
import { evaluateOperatingPoint } from './evaluation';

const csv = readFileSync('data/seed/fraud.csv', 'utf8');
const [header, ...rows] = csv.trimEnd().split('\n').map(row => row.split(','));
const ids = rows.map(row => row[0]);
const labels = rows.map(row => Number(row[1]));
const timings = JSON.parse(readFileSync('data/seed/benchmarks.json', 'utf8')) as
  Record<string, { latencySamplesMs: number[]; unitPriceUsd: number }>;

describe('evaluation', () => {
  test('classification outcomes and undefined ratios', () => {
    expect(evaluateOperatingPoint([1, 0], [0.5, 0.49], 0.5)).toMatchObject({ tp: 1, tn: 1, precision: 1, recall: 1, falsePositiveRate: 0 });
    expect(evaluateOperatingPoint([1, 0], [0, 0], 0.5)).toMatchObject({ precision: null, recall: 0 });
    expect(evaluateOperatingPoint([0], [1], 0.5)).toMatchObject({ precision: 0, recall: null });
    expect(() => evaluateOperatingPoint([1], [NaN], 0.5)).toThrow();
    expect(() => evaluateOperatingPoint([1], [Infinity], 0.5)).toThrow();
    expect(() => evaluateOperatingPoint([1], [1.1], 0.5)).toThrow();
    expect(() => evaluateOperatingPoint([2], [1], 0.5)).toThrow();
    expect(() => evaluateOperatingPoint([1], [], 0.5)).toThrow();
  });
  test('independently recomputes every operating point from CSV and timing fixture', () => {
    expect(rows.length).toBeGreaterThanOrEqual(500);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(candidates.map(c => c.modelId)).size).toBeGreaterThanOrEqual(3);
    expect(candidates.length).toBeGreaterThanOrEqual(15);
    const hash = (content: string | Buffer) => createHash('sha256').update(content).digest('hex');
    expect(hash(csv)).toBe(manifest.datasetSha256);
    expect(hash(readFileSync('data/seed/benchmarks.json'))).toBe(manifest.benchmarkSha256);
    for (const candidate of candidates) {
      const column = header.indexOf(candidate.modelId);
      const scores = rows.map(row => Number(row[column]));
      const result = evaluateOperatingPoint(labels, scores, candidate.threshold);
      expect(candidate).toMatchObject(result);
      const fixture = timings[candidate.inferenceProfile];
      const sorted = [...fixture.latencySamplesMs].sort((a, b) => a - b);
      expect(candidate.p95LatencyMs).toBe(sorted[Math.ceil(sorted.length * 0.95) - 1]);
      expect(candidate.costPer1kUsd).toBe(fixture.unitPriceUsd * 1000);
    }
  });
  test('rejects inconsistent or unsafe evidence', () => {
    expect(manifestSchema.safeParse({ ...manifest, candidates: [candidates[0], candidates[0]] }).success).toBe(false);
    expect(manifestSchema.safeParse({ ...manifest, candidates: [{ ...candidates[0], datasetId: 'other' }] }).success).toBe(false);
    expect(candidateSchema.safeParse({ ...candidates[0], fp: -1 }).success).toBe(false);
    expect(candidateSchema.safeParse({ ...candidates[0], sampleCount: 0 }).success).toBe(false);
    expect(candidateSchema.safeParse({ ...candidates[0], p95LatencyMs: Infinity }).success).toBe(false);
  });
  test('arbitrary confusion counts yield valid ratios when defined', () => {
    fc.assert(fc.property(fc.tuple(fc.nat(40), fc.nat(40), fc.nat(40), fc.nat(40)), counts => {
      const [tp, fp, tn, fn] = counts;
      const labels = [...Array(tp).fill(1), ...Array(fp).fill(0), ...Array(tn).fill(0), ...Array(fn).fill(1)];
      const scores = [...Array(tp + fp).fill(1), ...Array(tn + fn).fill(0)];
      const result = evaluateOperatingPoint(labels, scores, 0.5);
      expect(result).toMatchObject({ tp, fp, tn, fn });
      for (const value of [result.precision, result.recall, result.falsePositiveRate]) {
        if (value !== null) { expect(value).toBeGreaterThanOrEqual(0); expect(value).toBeLessThanOrEqual(1); }
      }
    }));
  });
});
