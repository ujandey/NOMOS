import { useState } from 'react';
import { RotateCcw, X } from 'lucide-react';
import type { Candidate, Manifest, Mission, UncertaintySettings } from '../core/contracts';
import { candidateLabel, gateValue } from '../core/display';
import { DEPLOYMENT_MISSION, GATES, type Envelope, type Violation } from '../core/envelope';
import { compileMission, type Proposal } from '../core/mission';
import { ConfidencePanel } from './Confidence';
import { NumberField } from './NumberField';

type Props = {
  mission: Mission; setMission: (mission: Mission) => void; envelope: Envelope;
  total: number; selected: Candidate | null; select: (id: string) => void;
  settings: UncertaintySettings; setSettings: (settings: UncertaintySettings) => void; defaultMission: Mission;
};
const example = 'Catch at least 95% of fraud, keep expected precision above 80%, and respond within 100 milliseconds.';
const REQUIRED = new Set<keyof Mission>(['minPrecision', 'minRecall']);
export { gateValue };

function failure(gate: Violation) {
  if (gate.observed === null) return 'Required evidence unavailable';
  if (gate.precisionRounded) return 'Rounds to 100%. The exact rate is lower.';
  const gap = Math.abs(gate.margin!) * (gate.unit === '%' ? 100 : 1);
  return (gap < 0.01 ? gap.toPrecision(2) : Number(gap.toFixed(2))) + ' ' +
    (gate.unit === '%' ? 'pp' : gate.unit) + (gate.direction === 1 ? ' below minimum' : ' over maximum');
}

export function MissionBrief({ manifest }: { manifest: Manifest }) {
  if (manifest.origin === 'browser-import') {
    const models = new Set(manifest.candidates.map(c => c.modelId)).size;
    return <section className="mission-brief" aria-labelledby="mission-title">
      <div className="eyebrow">IMPORTED DATASET / LOCAL ONLY</div>
      <h2 id="mission-title">Your evaluation data</h2>
      <p>{manifest.source?.fileName ?? 'Imported file'} · {manifest.sampleCount.toLocaleString('en-US')} scored rows · {models} model{models === 1 ? '' : 's'}.
        Latency, cost and throughput are unknown. The file stays in this browser tab.</p>
    </section>;
  }
  return <section className="mission-brief" aria-labelledby="mission-title">
    <div className="eyebrow">MISSION 001 / FRAUD DETECTION</div>
    <h2 id="mission-title">The fraud deployment challenge</h2>
    <p>A bank processes one million transactions a day. Catch at least 95% of fraud, reduce false alarms, and stay within the latency and inference budgets.</p>
  </section>;
}

export function MissionPanel({ mission, setMission, envelope, total, selected, select, settings, setSettings, defaultMission }: Props) {
  const checks = selected ? envelope.checks.get(selected.id) ?? [] : [];
  const status = selected ? envelope.statuses.get(selected.id) ?? null : null;
  const estimateCount = envelope.feasibleIds.size, robustCount = envelope.robustIds.size;
  const closest = envelope.alternatives[0];
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const [response, setResponse] = useState<{ base: Mission; text: string; proposal?: Proposal; error?: string }>();
  const current = response?.base === mission && response.text === text ? response : undefined;
  const proposal = current?.proposal;

  async function preview() {
    setPending(true);
    setResponse(undefined);
    try {
      setResponse({ base: mission, text, proposal: await compileMission(text, mission) });
    } catch (problem) {
      setResponse({ base: mission, text, error: problem instanceof Error ? problem.message : 'Unable to parse this mission.' });
    } finally {
      setPending(false);
    }
  }

  function remove(key: keyof Mission) {
    const next = { ...mission };
    delete next[key];
    setMission(next);
  }

  function field(gate: typeof GATES[number]) {
    const value = mission[gate.key], check = checks.find(c => c.key === gate.key);
    const ratio = gate.unit === '%';
    const label = gate.key === 'minPrecision' ? 'Expected precision' : gate.label;
    const inputMax = ratio ? 100 : gate.key === 'minThroughputRps' ? 1e9 : gate.key === 'maxDailyCostUsd' ? 1e12 : 1e6;
    return <div key={gate.key} className="limit-block">
      <div className="limit-row">
        <div><span>{label}</span><strong className={check && !check.passes ? 'failed-value' : undefined}>{value === undefined ? 'Off' : gateValue(gate.key, check?.observed ?? null)}</strong></div>
        <div className="limit-control">
          {value === undefined
            ? <button className="button quiet" onClick={() => setMission({ ...mission, [gate.key]: gate.key === 'minThroughputRps' ? 1 : DEPLOYMENT_MISSION[gate.key] })}>Require {label.toLowerCase()}</button>
            : <><span aria-hidden="true">{gate.direction === 1 ? '≥' : '≤'}</span>
              <NumberField compact label={(gate.direction === 1 ? 'Min ' : 'Max ') + label.toLowerCase()}
                value={ratio ? Number((value * 100).toPrecision(12)) : value} min={0} max={inputMax}
                exclusiveMin={gate.key === 'maxP95LatencyMs'} step={ratio ? 0.1 : 'any'} unit={gate.unit}
                onChange={next => setMission({ ...mission, [gate.key]: ratio ? next / 100 : next })} />
              {!REQUIRED.has(gate.key) && <button className="icon-button remove-limit" aria-label={`Remove ${label.toLowerCase()} limit`}
                title={`Remove ${label.toLowerCase()} limit`} onClick={() => remove(gate.key)}><X size={14} /></button>}</>}
        </div>
      </div>
      {check && !check.passes && <p className="gate-fail"><X size={12} />{failure(check)}</p>}
    </div>;
  }

  return <aside className="mission-panel" aria-labelledby="constraints-title">
    <div className="mission-status" aria-live="polite">
      <div>
        <strong data-testid="robust-count">{robustCount}<span> / {total}</span></strong>
        <span>Robustly feasible</span>
        <span className="estimate-count" data-testid="estimate-count">{estimateCount} pass{estimateCount === 1 ? 'es' : ''} on estimate</span>
      </div>
    </div>
    {selected && status && <ConfidencePanel status={status} checks={checks} envelope={envelope} candidateId={selected.id}
      settings={settings} setSettings={setSettings} />}
    <div className="limits">
      <div className="section-line"><h3 id="constraints-title">Mission constraints</h3>
        <button className="icon-button" aria-label="Restore default mission" title="Restore default mission" onClick={() => setMission({ ...defaultMission })}><RotateCcw size={16} /></button>
      </div>
      <div className="limit-head"><span>Selected point</span><span>Required limit</span></div>
      {GATES.filter(g => !['maxCostPer1kUsd', 'minThroughputRps'].includes(g.key)).map(field)}
      <details className="rail-details">
        <summary>Additional constraints</summary>
        {GATES.filter(g => ['maxCostPer1kUsd', 'minThroughputRps'].includes(g.key)).map(field)}
      </details>
      {!estimateCount && <div className="mission-conflict"><strong>No evaluated point meets every limit.</strong>
        {envelope.failedCounts[0]?.count > 0 && <p>{envelope.failedCounts[0].label} excludes {envelope.failedCounts[0].count} of {total} points.</p>}
        {closest && <p><button className="text-link" onClick={() => select(closest.candidate.id)}>Inspect {candidateLabel(closest.candidate)}</button>. Misses {closest.failures.map(c => c.label === 'P95 latency' ? c.label : c.label.toLowerCase()).join(', ')}.</p>}
      </div>}
      {estimateCount > 0 && !robustCount && <div className="mission-conflict caution" data-testid="no-robust">
        <strong>No configuration is robustly feasible.</strong>
        <p>{estimateCount} pass{estimateCount === 1 ? 'es' : ''} on the measured estimate only. The evaluation sample is too small to rule out a violation.</p>
      </div>}
      {envelope.recommendedId && envelope.recommendedId !== selected?.id && status !== 'robust' &&
        <button className="button recommend" onClick={() => select(envelope.recommendedId!)}>
          {envelope.recommendedBasis === 'robust' ? 'Select a robustly feasible point' : 'Select the best estimate'}</button>}
      <details className="rail-details compiler">
        <summary>Mission compiler</summary>
        <form onSubmit={event => { event.preventDefault(); void preview(); }}>
          <label htmlFor="mission-text">Describe your requirements</label>
          <textarea id="mission-text" value={text} onChange={event => setText(event.target.value)} maxLength={1000} rows={4} />
          <div className="compiler-actions">
            <button className="button" disabled={pending || !text.trim()}>{pending ? 'Parsing…' : 'Preview changes'}</button>
            <button type="button" className="text-link" onClick={() => setText(example)}>Use example</button>
          </div>
        </form>
        {current?.error && <p className="field-error" role="alert">{current.error}</p>}
        {proposal && <div className="compiler-preview" aria-live="polite">
          <strong>{proposal.source === 'llm' ? 'Model-assisted proposal' : 'Offline parser proposal'}</strong>
          {proposal.changes.length ? <ul>{proposal.changes.map(c => <li key={c.key}>{GATES.find(g => g.key === c.key)?.label ?? 'Target prevalence'} · {gateValue(c.key, c.from)} → {gateValue(c.key, c.to)}</li>)}</ul> : <p>These limits already match your mission.</p>}
          {proposal.warnings.map(warning => <p key={warning}>{warning}</p>)}
          {proposal.changes.length > 0 && <button className="button primary" onClick={() => setMission(proposal.mission)}>Apply mission</button>}
        </div>}
      </details>
    </div>
  </aside>;
}
