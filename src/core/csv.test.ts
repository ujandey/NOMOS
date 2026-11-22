import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import fc from 'fast-check';
import { expect, test } from 'vitest';
import { DEFAULT_MISSION } from './contracts';
import { buildImportManifest, decodeFile, detectDelimiter, guessMapping, IMPORT_LIMITS, IMPORT_THRESHOLDS, inspectText,
  parseDelimited, sha256Hex, sha256Portable, validateTable, type Delimiter, type Mapping } from './csv';
import { manifest as fixture } from './demo';
import { evaluateEnvelope } from './envelope';

const encode = (text: string) => new TextEncoder().encode(text);
function inspect(text: string, mapping?: Partial<Mapping>, delimiter?: Delimiter) {
  const { table, errors, delimiter: chosen } = inspectText(text, delimiter);
  if (!table) return { errors, warnings: [] as string[], models: [], records: [], delimiter: chosen, table };
  return { ...validateTable(table, { ...guessMapping(table.header), ...mapping }), delimiter: chosen, table };
}
const sample = 'id,label,score\n1,1,0.9\n2,0,0.2\n3,1,0.7\n4,0,0.6\n';

test('detects comma, semicolon, tab and pipe delimiters and guesses columns', () => {
  for (const delimiter of [',', ';', '\t', '|'] as const) {
    const text = sample.replaceAll(',', delimiter);
    expect(detectDelimiter(text)).toBe(delimiter);
    const result = inspect(text);
    expect(result.errors).toEqual([]);
    expect(result.models).toEqual([{ id: 'imported', rows: 4, positives: 2, negatives: 2 }]);
  }
  expect(guessMapping(['Transaction ID', 'is-fraud', 'Fraud Probability', 'Model'])).toEqual({
    label: 'is-fraud', score: 'Fraud Probability', model: 'Model', id: 'Transaction ID' });
});

test('wrong delimiter, empty input and header-only files are explained', () => {
  expect(inspect('id label score\n1 1 0.9\n').errors[0]).toMatch(/Only one column/);
  expect(inspect(sample, {}, ';').errors[0]).toMatch(/Only one column/);
  expect(inspect('').errors).toEqual(['The file is empty.']);
  expect(inspect('\n\n  \n').errors).toEqual(['The file is empty.']);
  expect(inspect('label,score\n').errors).toContain('The file has a header but no data rows.');
});

test('quoted fields keep delimiters, quotes and newlines and report malformed quoting', () => {
  const parsed = parseDelimited('id,label,score\r\n"a,1",1,0.5\r\n"say ""hi""\nthere",0,".25"\r\n', ',');
  expect(parsed.table!.rows).toEqual([['a,1', '1', '0.5'], ['say "hi"\nthere', '0', '.25']]);
  expect(parsed.table!.lines).toEqual([2, 3]);
  expect(parseDelimited('a,b\n"open,1\n', ',').errors[0]).toMatch(/never closed/);
  expect(parseDelimited('a,b\nx"y,1\n', ',').errors[0]).toMatch(/inside an unquoted field/);
  expect(parseDelimited('a,b\n"x"y,1\n', ',').errors[0]).toMatch(/follows a closing quote/);
});

test('malformed rows, labels, probabilities and identifiers are rejected with line numbers', () => {
  const bad = inspect('id,label,score\n1,1,0.9\n2,0\n3,fraud,0.5\n4,1,1.5\n5,0,\n6,1,abc\n,0,0.1\n');
  const text = bad.errors.join('\n');
  expect(text).toMatch(/1 row with the wrong number of fields\. Line 3: expected 3 fields, found 2/);
  expect(text).toMatch(/Line 4: label "fraud"/);
  expect(text).toMatch(/Line 5: score "1.5"/);
  expect(text).toMatch(/Line 6: score ""/);
  expect(text).toMatch(/Line 7: score "abc"/);
  expect(text).toMatch(/Convert logits or percentages/);
  expect(text).toMatch(/Line 8: the row identifier is empty/);
});

test('duplicate identifiers are errors and exact duplicate rows are warnings', () => {
  expect(inspect('id,label,score\n7,1,0.9\n7,0,0.1\n8,0,0.2\n9,1,0.8\n').errors.join(' ')).toMatch(/Line 3: row "7" repeats line 2/);
  // The same row id is allowed once per model in long format.
  const long = inspect('id,model,label,score\n7,a,1,0.9\n7,b,1,0.8\n8,a,0,0.1\n8,b,0,0.3\n');
  expect(long.errors).toEqual([]);
  expect(long.models.map(m => m.id)).toEqual(['a', 'b']);
  const noIds = inspect('label,score\n1,0.9\n1,0.9\n0,0.1\n');
  expect(noIds.errors).toEqual([]);
  expect(noIds.warnings.join(' ')).toMatch(/1 row exactly repeats an earlier row and is counted/);
});

test('one-class data, missing mappings and small classes', () => {
  expect(inspect('label,score\n0,0.1\n0,0.4\n').errors.join(' ')).toMatch(/only one class \(0 fraud, 2 legitimate\)/);
  expect(inspect('id,model,label,score\n1,a,1,0.9\n2,a,0,0.1\n3,b,1,0.8\n').errors.join(' ')).toMatch(/Model "b" has only one class/);
  expect(inspect('id,target,p\n1,1,0.9\n', { label: '', score: '' }).errors).toEqual([
    'Choose the column that holds the ground-truth label.', 'Choose the column that holds the predicted fraud probability.']);
  expect(inspect(sample, { score: 'label' }).errors).toContain('Each column can serve only one role.');
  expect(inspect(sample).warnings.join(' ')).toMatch(/Uncertainty ranges will be wide/);
  expect(inspect('a,a\n1,0.5\n').errors.join(' ')).toMatch(/repeats the column name "a"/);
});

test('large and non-UTF-8 files are refused before parsing', () => {
  expect(() => decodeFile(new Uint8Array(IMPORT_LIMITS.maxBytes + 1))).toThrow(/at most 20 MB/);
  expect(() => decodeFile(new Uint8Array())).toThrow(/empty/);
  expect(() => decodeFile(new Uint8Array([0x6c, 0xff, 0xfe, 0x0a]))).toThrow(/UTF-8/);
  expect(decodeFile(encode('﻿label,score\n'))).toBe('label,score\n');
  const rows = 'label,score\n' + '1,0.5\n0,0.5\n'.repeat(IMPORT_LIMITS.maxRows / 2 + 1);
  expect(inspect(rows).errors.join(' ')).toMatch(/supports at most 500,000/);
});

test('portable SHA-256 matches Node crypto and Web Crypto', async () => {
  for (const length of [0, 1, 55, 56, 63, 64, 65, 1000]) {
    const bytes = new Uint8Array(randomBytes(length));
    const expected = createHash('sha256').update(bytes).digest('hex');
    expect(sha256Portable(bytes)).toBe(expected);
    expect(await sha256Hex(bytes)).toBe(expected);
  }
});

test('importing the fixture scores reproduces the Python evaluator exactly', async () => {
  const [header, ...lines] = readFileSync(new URL('../../data/seed/fraud.csv', import.meta.url), 'utf8').trim().split('\n');
  const models = header.split(',').slice(2);
  const long = 'transaction_id,model,label,score\n' + lines.flatMap(line => {
    const [id, label, ...scores] = line.split(',');
    return scores.map((score, i) => [id, models[i], label, score].join(','));
  }).join('\n');
  const bytes = encode(long);
  const result = inspect(long);
  expect(result.errors).toEqual([]);
  const manifest = await buildImportManifest(bytes, 'fixture-long.csv', ',', guessMapping(result.table!.header), result, new Date('2026-11-21T00:00:00Z'));
  expect(manifest).toMatchObject({ origin: 'browser-import', sampleCount: 3 * 1200, seed: null, benchmarkSha256: null,
    datasetSha256: createHash('sha256').update(bytes).digest('hex') });
  expect(manifest.candidates).toHaveLength(3 * IMPORT_THRESHOLDS.length);
  for (const expected of fixture.candidates) {
    const imported = manifest.candidates.find(c => c.id === expected.id.replace('high_recall', 'high-recall'))!;
    expect({ tp: imported.tp, fp: imported.fp, tn: imported.tn, fn: imported.fn, recall: imported.recall })
      .toEqual({ tp: expected.tp, fp: expected.fp, tn: expected.tn, fn: expected.fn, recall: expected.recall });
    expect(imported).toMatchObject({ p95LatencyMs: null, costPer1kUsd: null, metricProvenance: { latency: 'unknown', cost: 'unknown' } });
    expect(imported.performance).toBeUndefined();
  }
  // Unsupported constraints are never reported as satisfied for imported models.
  const envelope = evaluateEnvelope(manifest.candidates, DEFAULT_MISSION, 'min_fpr');
  expect(envelope.feasibleIds.size).toBe(0);
  expect(envelope.robustIds.size).toBe(0);
  for (const c of manifest.candidates) expect(['unknown', 'infeasible']).toContain(envelope.statuses.get(c.id));
});

test('parsing never throws on arbitrary text', () => {
  fc.assert(fc.property(fc.string({ maxLength: 300 }), fc.constantFrom<Delimiter>(',', ';', '\t', '|'), (text, delimiter) => {
    const result = inspectText(text, delimiter);
    if (result.table) validateTable(result.table, guessMapping(result.table.header));
  }), { numRuns: 500 });
});
