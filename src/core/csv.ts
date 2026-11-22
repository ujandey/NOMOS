import { manifestSchema, type Candidate, type Manifest } from './contracts';
import { evaluateOperatingPoint } from './evaluation';

/**
 * Browser-local CSV import. Nothing in this module performs network I/O: the file is read,
 * validated, hashed and evaluated inside the tab.
 */
export const IMPORT_LIMITS = { maxBytes: 20 * 1024 * 1024, maxRows: 500_000, maxModels: 12, smallClass: 30 } as const;
export const IMPORT_THRESHOLDS = Array.from({ length: 19 }, (_, i) => Number(((i + 1) * 0.05).toFixed(2)));
export const DELIMITERS = { ',': 'Comma', ';': 'Semicolon', '\t': 'Tab', '|': 'Pipe' } as const;
export type Delimiter = keyof typeof DELIMITERS;
export type Mapping = { label: string; score: string; model: string | null; id: string | null };
export type Table = { header: string[]; rows: string[][]; lines: number[] };
type ParseResult = { table: Table | null; errors: string[] };

const MAX_EXAMPLES = 5;

/** RFC 4180 parsing with quoted fields, doubled quotes, embedded delimiters and CRLF or LF line endings. */
export function parseDelimited(text: string, delimiter: Delimiter, maxRecords = Infinity): ParseResult {
  const records: string[][] = [], lines: number[] = [];
  let field = '', record: string[] = [], quoted = false, line = 1, recordLine = 1, i = 0, fieldStarted = false;
  const malformed: string[] = [];
  const endRecord = () => {
    record.push(field);
    // Skip blank lines, including a trailing newline.
    if (!(record.length === 1 && record[0].trim() === '' && !fieldStarted)) { records.push(record); lines.push(recordLine); }
    record = []; field = ''; fieldStarted = false;
  };
  while (i < text.length && records.length < maxRecords) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i++;
        const next = text[i];
        if (next !== undefined && next !== delimiter && next !== '\n' && next !== '\r') {
          if (malformed.length < MAX_EXAMPLES) malformed.push(`Line ${line}: text follows a closing quote.`);
        }
        continue;
      }
      if (char === '\n') line++;
      field += char; i++; continue;
    }
    if (char === '"') {
      if (field.trim() === '') { quoted = true; fieldStarted = true; field = ''; i++; continue; }
      if (malformed.length < MAX_EXAMPLES) malformed.push(`Line ${line}: a quote appears inside an unquoted field.`);
      field += char; i++; continue;
    }
    if (char === delimiter) { record.push(field); field = ''; fieldStarted = true; i++; continue; }
    if (char === '\r' || char === '\n') {
      endRecord();
      i += char === '\r' && text[i + 1] === '\n' ? 2 : 1;
      line++; recordLine = line; continue;
    }
    field += char; i++;
  }
  if (quoted) return { table: null, errors: [`Line ${recordLine}: a quoted field is never closed.`] };
  if (records.length < maxRecords && (field !== '' || record.length || fieldStarted)) endRecord();
  if (malformed.length) return { table: null, errors: malformed };
  if (!records.length) return { table: null, errors: ['The file is empty.'] };
  const [header, ...rows] = records;
  return { table: { header: header.map(name => name.trim()), rows, lines: lines.slice(1) }, errors: [] };
}

/** Chooses the delimiter that yields the most columns consistently across a sample of rows. */
export function detectDelimiter(text: string): Delimiter | null {
  const sample = text.slice(0, 64 * 1024);
  let best: { delimiter: Delimiter; score: number } | null = null;
  for (const delimiter of Object.keys(DELIMITERS) as Delimiter[]) {
    const { table } = parseDelimited(sample, delimiter, 50);
    if (!table || table.header.length < 2) continue;
    const consistent = table.rows.filter(row => row.length === table.header.length).length;
    const score = (consistent + 1) * table.header.length;
    if (!best || score > best.score) best = { delimiter, score };
  }
  return best?.delimiter ?? null;
}

const ROLE_NAMES = {
  label: ['label', 'is_fraud', 'isfraud', 'fraud', 'target', 'y', 'class', 'ground_truth', 'actual', 'truth'],
  score: ['score', 'probability', 'prob', 'fraud_probability', 'p_fraud', 'prediction', 'pred', 'y_score', 'y_prob', 'risk_score'],
  model: ['model', 'model_id', 'modelid', 'model_name', 'classifier'],
  id: ['id', 'row_id', 'transaction_id', 'txn_id', 'record_id', 'uid'],
};

export function guessMapping(header: readonly string[]): Mapping {
  const normalized = header.map(name => name.toLowerCase().replace(/[\s-]+/g, '_'));
  const find = (names: readonly string[]) => {
    for (const name of names) {
      const index = normalized.indexOf(name);
      if (index >= 0) return header[index];
    }
    return null;
  };
  return { label: find(ROLE_NAMES.label) ?? '', score: find(ROLE_NAMES.score) ?? '', model: find(ROLE_NAMES.model), id: find(ROLE_NAMES.id) };
}

export type ModelSummary = { id: string; rows: number; positives: number; negatives: number };
export type Validation = {
  errors: string[]; warnings: string[]; models: ModelSummary[];
  records: { label: number[]; score: number[] }[];
};

function parseLabel(raw: string) {
  const value = raw.trim().toLowerCase();
  if (value === '1' || value === '1.0' || value === 'true') return 1;
  if (value === '0' || value === '0.0' || value === 'false') return 0;
  return null;
}

/** Validates a parsed table under a column mapping. Every problem is reported with row numbers. */
export function validateTable(table: Table, mapping: Mapping): Validation {
  const errors: string[] = [], warnings: string[] = [];
  const empty: Validation = { errors, warnings, models: [], records: [] };
  if (table.header.length < 2) {
    errors.push('Only one column was found. Choose the delimiter used by the file: comma, semicolon, tab or pipe.');
    return empty;
  }
  const seen = new Set<string>();
  for (const name of table.header) {
    if (!name) errors.push('A header cell is empty. Every column needs a name.');
    else if (seen.has(name)) errors.push(`The header repeats the column name "${name}".`);
    seen.add(name);
  }
  if (!table.rows.length) errors.push('The file has a header but no data rows.');
  if (table.rows.length > IMPORT_LIMITS.maxRows) {
    errors.push(`The file has ${table.rows.length.toLocaleString('en-US')} rows. The browser import supports at most ${IMPORT_LIMITS.maxRows.toLocaleString('en-US')}.`);
  }
  if (!mapping.label) errors.push('Choose the column that holds the ground-truth label.');
  if (!mapping.score) errors.push('Choose the column that holds the predicted fraud probability.');
  const roles = [mapping.label, mapping.score, mapping.model, mapping.id].filter((name): name is string => Boolean(name));
  if (new Set(roles).size !== roles.length) errors.push('Each column can serve only one role.');
  for (const name of roles) if (!table.header.includes(name)) errors.push(`The column "${name}" is not in the header.`);
  if (errors.length) return empty;

  const column = (name: string | null) => name === null ? -1 : table.header.indexOf(name);
  const labelAt = column(mapping.label), scoreAt = column(mapping.score), modelAt = column(mapping.model), idAt = column(mapping.id);
  const problems = { shape: [] as string[], label: [] as string[], score: [] as string[], model: [] as string[], id: [] as string[], duplicate: [] as string[] };
  const counts = { shape: 0, label: 0, score: 0, model: 0, id: 0, duplicate: 0 };
  const note = (kind: keyof typeof problems, message: string) => {
    counts[kind]++;
    if (problems[kind].length < MAX_EXAMPLES) problems[kind].push(message);
  };
  const groups = new Map<string, { label: number[]; score: number[] }>();
  const ids = new Set<string>(), lines = new Map<string, number>();
  let exactDuplicates = 0, outsideUnit = 0;
  table.rows.forEach((row, index) => {
    const line = table.lines[index];
    if (row.length !== table.header.length) {
      note('shape', `Line ${line}: expected ${table.header.length} fields, found ${row.length}.`);
      return;
    }
    const label = parseLabel(row[labelAt]);
    if (label === null) note('label', `Line ${line}: label "${row[labelAt].slice(0, 40)}" is not 0/1 or true/false.`);
    const rawScore = row[scoreAt].trim();
    const score = rawScore === '' ? NaN : Number(rawScore);
    if (!Number.isFinite(score) || score < 0 || score > 1) {
      if (Number.isFinite(score)) outsideUnit++;
      note('score', `Line ${line}: score "${rawScore.slice(0, 40)}" is not a probability between 0 and 1.`);
    }
    const model = modelAt < 0 ? 'imported' : row[modelAt].trim();
    if (!model) note('model', `Line ${line}: the model identifier is empty.`);
    if (idAt >= 0) {
      const id = row[idAt].trim();
      if (!id) note('id', `Line ${line}: the row identifier is empty.`);
      const key = model + '\u0000' + id;
      if (id && ids.has(key)) note('duplicate', `Line ${line}: row "${id.slice(0, 40)}"${modelAt >= 0 ? ` for model "${model.slice(0, 40)}"` : ''} repeats line ${lines.get(key)}.`);
      ids.add(key);
      if (!lines.has(key)) lines.set(key, line);
    } else {
      const key = row.join('\u0000');
      if (lines.has(key)) exactDuplicates++;
      else lines.set(key, line);
    }
    if (label === null || !Number.isFinite(score) || score < 0 || score > 1 || !model) return;
    let group = groups.get(model);
    if (!group) groups.set(model, group = { label: [], score: [] });
    group.label.push(label);
    group.score.push(score);
  });
  const rows = (n: number, singular: string, plural: string) => `${n.toLocaleString('en-US')} ${n === 1 ? singular : plural}`;
  const describe = (kind: keyof typeof problems, title: string) => {
    if (!counts[kind]) return;
    errors.push(`${rows(counts[kind], 'row', 'rows')} ${title}. ${problems[kind].join(' ')}${counts[kind] > MAX_EXAMPLES ? ' …' : ''}`);
  };
  describe('shape', 'with the wrong number of fields');
  describe('label', 'with an invalid label');
  describe('score', 'with an invalid probability');
  if (outsideUnit) errors.push('Scores must be probabilities in [0, 1]. Convert logits or percentages before importing.');
  describe('model', 'without a model identifier');
  describe('id', 'without a row identifier');
  describe('duplicate', 'repeating a row identifier');
  if (exactDuplicates) warnings.push(`${rows(exactDuplicates, 'row exactly repeats', 'rows exactly repeat')} an earlier row and ${exactDuplicates === 1 ? 'is' : 'are'} counted as separate records. Map a row identifier column to check for true duplicates.`);
  if (groups.size > IMPORT_LIMITS.maxModels) errors.push(`The file has ${groups.size} models. Import at most ${IMPORT_LIMITS.maxModels} at a time.`);
  const models = [...groups].map(([id, group]) => {
    const positives = group.label.reduce((sum, value) => sum + value, 0);
    return { id, rows: group.label.length, positives, negatives: group.label.length - positives };
  });
  for (const model of models) {
    const name = modelAt < 0 ? 'The dataset' : `Model "${model.id.slice(0, 40)}"`;
    if (!model.positives || !model.negatives) {
      errors.push(`${name} has only one class (${model.positives} fraud, ${model.negatives} legitimate). Both classes are required to estimate true- and false-positive rates.`);
    } else if (model.positives < IMPORT_LIMITS.smallClass || model.negatives < IMPORT_LIMITS.smallClass) {
      warnings.push(`${name} has ${model.positives} fraud and ${model.negatives} legitimate rows. Uncertainty ranges will be wide, and robust feasibility is unlikely.`);
    }
  }
  return { errors, warnings, models, records: errors.length ? [] : [...groups.values()] };
}

export function inspectText(text: string, delimiter?: Delimiter) {
  if (!text.trim()) return { delimiter: delimiter ?? ',' as Delimiter, table: null, errors: ['The file is empty.'] };
  const chosen = delimiter ?? detectDelimiter(text);
  if (!chosen) {
    return { delimiter: ',' as Delimiter, table: null,
      errors: ['Only one column was found. Save the file with a comma, semicolon, tab or pipe delimiter.'] };
  }
  const { table, errors } = parseDelimited(text, chosen);
  return { delimiter: chosen, table, errors };
}

export function decodeFile(bytes: Uint8Array) {
  if (bytes.byteLength > IMPORT_LIMITS.maxBytes) {
    throw new Error(`The file is ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB. The browser import supports at most ${IMPORT_LIMITS.maxBytes / 1024 / 1024} MB.`);
  }
  if (!bytes.byteLength) throw new Error('The file is empty.');
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
  } catch {
    throw new Error('The file is not valid UTF-8 text. Export it as UTF-8 CSV.');
  }
}

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'model';

export async function buildImportManifest(bytes: Uint8Array, fileName: string, delimiter: Delimiter, mapping: Mapping,
  validation: Validation, now = new Date()): Promise<Manifest> {
  if (validation.errors.length || !validation.records.length) throw new Error('Resolve the validation errors before importing.');
  const datasetSha256 = await sha256Hex(bytes);
  const runSha = await sha256Hex(new TextEncoder().encode(JSON.stringify([datasetSha256, mapping, delimiter, IMPORT_THRESHOLDS])));
  const evaluationRunId = 'import-' + runSha.slice(0, 16);
  const datasetId = 'import-' + datasetSha256.slice(0, 12);
  const sampleCount = validation.models.reduce((sum, model) => sum + model.rows, 0);
  const used = new Set<string>();
  const candidates: Candidate[] = validation.models.flatMap((model, index) => {
    let modelId = slug(model.id);
    while (used.has(modelId)) modelId = slug(model.id) + '-' + (index + 1);
    used.add(modelId);
    const { label, score } = validation.records[index];
    return IMPORT_THRESHOLDS.map(threshold => ({
      id: `${modelId}-t${String(Math.round(threshold * 100)).padStart(2, '0')}`, modelId,
      modelName: mapping.model ? model.id.slice(0, 60) : 'Imported model', modelVersion: 'user-supplied', threshold,
      inferenceProfile: 'unknown', datasetId, datasetSha256, evaluationRunId, evaluatedAt: now.toISOString(),
      evaluationCodeVersion: 'nomos-browser-3.1.0', ...evaluateOperatingPoint(label, score, threshold),
      precisionInterval: null, recallInterval: null, p95LatencyMs: null, costPer1kUsd: null,
      metricProvenance: { classification: 'measured', latency: 'unknown', cost: 'unknown' },
    }));
  });
  const manifest = {
    schemaVersion: '2.0', origin: 'browser-import',
    source: { fileName: fileName.slice(0, 260), bytes: bytes.byteLength, rows: sampleCount, delimiter, columns: mapping },
    datasetId, datasetSha256, benchmarkSha256: null, evaluationSourceSha256: null, evaluationRunId, seed: null, sampleCount,
    benchmarkMethod: 'Not provided. Latency is unknown for imported data.',
    costMethod: 'Not provided. Inference cost is unknown for imported data.',
    intervalMethod: 'Clopper–Pearson exact intervals with Bonferroni adjustment, computed in the browser from confusion counts.',
    candidates,
  };
  const evaluationSha256 = await sha256Hex(new TextEncoder().encode(JSON.stringify(manifest)));
  return manifestSchema.parse({ ...manifest, evaluationSha256 });
}

// SHA-256: Web Crypto when available (secure contexts), otherwise a portable implementation.
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);

export function sha256Portable(bytes: Uint8Array) {
  const length = bytes.length, padded = new Uint8Array(((length + 9 + 63) >> 6) << 6);
  padded.set(bytes);
  padded[length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(length / 0x20000000));
  view.setUint32(padded.length - 4, (length << 3) >>> 0);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rotate = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotate(w[i - 15], 7) ^ rotate(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotate(w[i - 2], 17) ^ rotate(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, k] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (k + (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
      const t2 = ((rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      k = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += k;
  }
  return Array.from(h, value => value.toString(16).padStart(8, '0')).join('');
}

export async function sha256Hex(bytes: Uint8Array) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return sha256Portable(bytes);
  const digest = await subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
}
