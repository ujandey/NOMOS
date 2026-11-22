import { useMemo, useState } from 'react';
import { FileUp } from 'lucide-react';
import type { Manifest } from '../core/contracts';
import { buildImportManifest, decodeFile, DELIMITERS, guessMapping, IMPORT_LIMITS, IMPORT_THRESHOLDS, inspectText, validateTable,
  type Delimiter, type Mapping } from '../core/csv';
import { Drawer } from './Drawer';

type Loaded = { name: string; bytes: Uint8Array; text: string };

export function ImportDialog({ close, onImport }: { close: () => void; onImport: (manifest: Manifest, removeUnsupported: boolean) => void }) {
  const [file, setFile] = useState<Loaded | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [delimiter, setDelimiter] = useState<Delimiter | undefined>();
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [removeUnsupported, setRemoveUnsupported] = useState(true);
  const [busy, setBusy] = useState(false);
  const inspection = useMemo(() => file ? inspectText(file.text, delimiter) : null, [file, delimiter]);
  const table = inspection?.table ?? null;
  const activeMapping = useMemo(() => mapping ?? (table ? guessMapping(table.header) : null), [mapping, table]);
  const validation = useMemo(() => table && activeMapping ? validateTable(table, activeMapping) : null, [table, activeMapping]);
  const errors = [...(inspection?.errors ?? []), ...(validation?.errors ?? [])];
  const configurations = (validation?.models.length ?? 0) * IMPORT_THRESHOLDS.length;
  const ready = Boolean(file && table && activeMapping && validation && !errors.length && validation.models.length);

  async function choose(selected: File | undefined) {
    setFatal(null); setFile(null); setMapping(null); setDelimiter(undefined);
    if (!selected) return;
    if (selected.size > IMPORT_LIMITS.maxBytes) {
      setFatal(`The file is ${(selected.size / 1024 / 1024).toFixed(1)} MB. The browser import supports at most ${IMPORT_LIMITS.maxBytes / 1024 / 1024} MB.`);
      return;
    }
    try {
      const bytes = new Uint8Array(await selected.arrayBuffer());
      setFile({ name: selected.name, bytes, text: decodeFile(bytes) });
    } catch (problem) {
      setFatal(problem instanceof Error ? problem.message : 'The file could not be read.');
    }
  }

  async function confirm() {
    if (!ready || !file || !inspection || !activeMapping || !validation) return;
    setBusy(true);
    try {
      onImport(await buildImportManifest(file.bytes, file.name, inspection.delimiter, activeMapping, validation), removeUnsupported);
      close();
    } catch (problem) {
      setFatal(problem instanceof Error ? problem.message : 'The evaluation could not be built.');
      setBusy(false);
    }
  }

  const roleSelect = (role: keyof Mapping, title: string, optional: boolean) => table && activeMapping &&
    <label className="mapping-field">{title}
      <select value={activeMapping[role] ?? ''} onChange={event => setMapping({ ...activeMapping, [role]: event.target.value || (optional ? null : '') })}>
        <option value="">{optional ? 'None' : 'Choose a column'}</option>
        {table.header.map(name => <option key={name} value={name}>{name}</option>)}
      </select></label>;

  return <Drawer titleId="import-title" label="Import evaluation data" close={close}>
    <h2 id="import-title">Import scored evaluation data</h2>
    <p>Load a CSV with one row per scored record: a ground-truth label (0/1 or true/false) and a predicted fraud probability in [0, 1].
      Optional columns identify the model (long format, one row per model and record) and the record.</p>
    <p className="privacy-note"><strong>Local only.</strong> The file is read, validated, hashed and evaluated inside this browser tab. Nothing is uploaded.</p>
    <label className="file-picker"><FileUp size={16} aria-hidden="true" /> Choose CSV file
      <input type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values" onChange={event => void choose(event.target.files?.[0])} />
    </label>
    {fatal && <p className="field-error" role="alert">{fatal}</p>}
    {file && inspection && <section className="import-review" aria-label="Column mapping">
      <p className="import-file">{file.name} · {file.bytes.byteLength.toLocaleString('en-US')} bytes{table ? ` · ${table.rows.length.toLocaleString('en-US')} data rows` : ''}</p>
      <div className="mapping-grid">
        <label className="mapping-field">Delimiter
          <select value={inspection.delimiter} onChange={event => { setDelimiter(event.target.value as Delimiter); setMapping(null); }}>
            {Object.entries(DELIMITERS).map(([value, title]) => <option key={value} value={value}>{title}</option>)}
          </select></label>
        {roleSelect('label', 'Label column', false)}
        {roleSelect('score', 'Probability column', false)}
        {roleSelect('model', 'Model column', true)}
        {roleSelect('id', 'Row ID column', true)}
      </div>
      {table && table.rows.length > 0 && <div className="table-scroll" role="region" aria-label="First rows of the file" tabIndex={0}>
        <table className="preview-table"><thead><tr>{table.header.map((name, i) => <th key={i} scope="col">{name || '(empty)'}
          {activeMapping && Object.entries(activeMapping).filter(([, column]) => column === name).map(([role]) => <span key={role} className="role-tag">{role}</span>)}</th>)}</tr></thead>
          <tbody>{table.rows.slice(0, 5).map((row, r) => <tr key={r}>{row.map((cell, c) => <td key={c}>{cell.slice(0, 32)}</td>)}</tr>)}</tbody></table>
      </div>}
      {errors.length > 0 && <div className="import-errors" role="alert"><strong>Fix these problems before importing</strong>
        <ul>{errors.map(error => <li key={error}>{error}</li>)}</ul></div>}
      {validation && validation.warnings.length > 0 && <div className="import-warnings"><strong>Warnings</strong>
        <ul>{validation.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></div>}
      {ready && validation && <>
        <dl className="provenance import-summary">
          {validation.models.map(model => <div key={model.id} className="summary-row"><dt>{activeMapping?.model ? model.id : 'Dataset'}</dt>
            <dd>{model.rows.toLocaleString('en-US')} rows · {model.positives.toLocaleString('en-US')} fraud · {model.negatives.toLocaleString('en-US')} legitimate</dd></div>)}
        </dl>
        <p>NOMOS evaluates {IMPORT_THRESHOLDS.length} thresholds (0.05 to 0.95) per model with the existing confusion-matrix engine.
          No latency, inference cost, throughput or target prevalence is assumed. Expected precision uses each model&rsquo;s sample prevalence until you set a target.</p>
        <label className="check-line"><input type="checkbox" checked={removeUnsupported} onChange={event => setRemoveUnsupported(event.target.checked)} />
          Turn off latency, cost and throughput limits. This file has no evidence for them. If you keep them, they are reported as unknown and nothing can pass.</label>
      </>}
      <div className="export-actions">
        <button className="button primary" disabled={!ready || busy} onClick={() => void confirm()}>
          {busy ? 'Evaluating…' : ready ? `Evaluate and load ${configurations} configurations` : 'Evaluate and load'}</button>
        <button className="button" onClick={close}>Cancel</button>
      </div>
    </section>}
  </Drawer>;
}
