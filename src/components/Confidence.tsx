import { AlertTriangle, Check, CircleHelp, X } from 'lucide-react';
import { UNCERTAINTY_SCOPES, type UncertaintySettings } from '../core/contracts';
import { gateValue, percent } from '../core/display';
import { STATUS_TEXT, type Envelope, type Status, type Violation } from '../core/envelope';
import { explainStatus } from '../core/explain';

const ICONS = { robust: Check, 'estimate-only': AlertTriangle, uncertain: AlertTriangle, infeasible: X, unknown: CircleHelp };

export function StatusBadge({ status }: { status: Status }) {
  const Icon = ICONS[status];
  return <span className={'status-badge status-' + status}><Icon size={14} aria-hidden="true" />{STATUS_TEXT[status]}</span>;
}

function verdict(gate: Violation) {
  if (!gate.known) return 'Unknown';
  if (gate.robust) return 'Confirmed';
  return gate.possible ? gate.passes ? 'Not confirmed' : 'Could pass' : 'Fails';
}

/** A one-line picture of the range: bar = plausible range, dot = estimate, rule = limit, tint = failing side. */
function RangeBar({ gate }: { gate: Violation }) {
  if (!gate.range || gate.observed === null) return null;
  const [lo, hi] = gate.range;
  const values = [lo, hi, gate.limit, gate.observed];
  const span = Math.max(...values) - Math.min(...values) || 0.01;
  const min = Math.max(0, Math.min(...values) - span * 0.18), max = Math.min(1, Math.max(...values) + span * 0.18);
  const x = (v: number) => 4 + 192 * (v - min) / (max - min || 1);
  const failX = gate.direction === 1 ? [4, x(gate.limit)] : [x(gate.limit), 196];
  return <svg className="range-bar" viewBox="0 0 200 22" aria-hidden="true" focusable="false">
    <rect className="range-fail" x={failX[0]} y="3" width={Math.max(0, failX[1] - failX[0])} height="16" />
    <line className="range-track" x1="4" x2="196" y1="11" y2="11" />
    <rect className={'range-span ' + (gate.robust ? 'is-robust' : 'is-open')} x={x(lo)} y="7" width={Math.max(2, x(hi) - x(lo))} height="8" rx="2" />
    <line className="range-limit" x1={x(gate.limit)} x2={x(gate.limit)} y1="1" y2="21" />
    <circle className="range-estimate" cx={x(gate.observed)} cy="11" r="3.5" />
  </svg>;
}

export function ConfidenceDetails({ checks, envelope, candidateId, compact = false }: {
  checks: readonly Violation[]; envelope: Envelope; candidateId: string; compact?: boolean;
}) {
  const evidence = envelope.values.get(candidateId)?.evidence;
  const stats = envelope.statistics;
  const statistical = checks.filter(gate => gate.statistical);
  const deterministic = checks.filter(gate => !gate.statistical);
  return <div className={compact ? 'confidence compact' : 'confidence'}>
    <ul className="confidence-gates">
      {statistical.map(gate => <li key={gate.key} data-testid={'confidence-' + gate.key}>
        <div className="confidence-head"><strong>{gate.key === 'minPrecision' ? 'Expected precision' : gate.label}</strong>
          <span className={'verdict verdict-' + verdict(gate).toLowerCase().replace(' ', '-')}>{verdict(gate)}</span></div>
        <RangeBar gate={gate} />
        <dl>
          <dt>Measured estimate</dt><dd>{gateValue(gate.key, gate.observed)}</dd>
          <dt>Plausible range</dt><dd>{gate.range ? gate.range.map(v => gateValue(gate.key, v)).join(' – ') : 'Unavailable'}</dd>
          <dt>Required</dt><dd>{gate.direction === 1 ? '≥ ' : '≤ '}{gateValue(gate.key, gate.limit)}</dd>
          <dt>Worst case</dt><dd>{gateValue(gate.key, gate.pessimistic)}</dd>
        </dl>
      </li>)}
    </ul>
    {deterministic.length > 0 && <p className="confidence-note">
      {deterministic.map(gate => `${gate.label} ${gateValue(gate.key, gate.observed)} (${gate.known ? gate.passes ? 'meets' : 'misses' : 'no evidence for'} ${gate.direction === 1 ? '≥' : '≤'} ${gateValue(gate.key, gate.limit)})`).join(' · ')}.
      {' '}These are checked as point values; no uncertainty model is applied to them.
    </p>}
    {evidence && <p className="confidence-note" data-testid="confidence-method">
      Based on {evidence.positives.toLocaleString('en-US')} fraud and {evidence.negatives.toLocaleString('en-US')} legitimate evaluation records.
      {' '}Ranges are Clopper–Pearson exact intervals at {percent(stats.level, stats.level > 0.999 ? 3 : 1)} each. A Bonferroni adjustment over {stats.intervals} intervals
      {' '}gives at least {percent(stats.confidence, 0)} simultaneous coverage {stats.scope === 'all' ? `across all ${stats.familySize} configurations` : 'for this configuration’s true- and false-positive rates'}.
      {' '}Precision bounds use the worst and best corners at {percent(evidence.prevalence, 2)} {evidence.prevalenceSource === 'target' ? 'target' : 'sample'} prevalence.
      {' '}This assumes the records are independent and representative of deployment.
    </p>}
  </div>;
}

export function ConfidencePanel({ status, checks, envelope, candidateId, settings, setSettings }: {
  status: Status; checks: readonly Violation[]; envelope: Envelope; candidateId: string;
  settings: UncertaintySettings; setSettings: (settings: UncertaintySettings) => void;
}) {
  return <section className="confidence-panel" aria-labelledby="confidence-title">
    <div className="section-line"><h3 id="confidence-title">Confidence check</h3><StatusBadge status={status} /></div>
    <p className="confidence-summary" data-testid="confidence-summary">{explainStatus(status, checks)}</p>
    <details className="rail-details confidence-more">
      <summary>Estimate, range and worst case</summary>
      <ConfidenceDetails checks={checks} envelope={envelope} candidateId={candidateId} compact />
      <div className="confidence-settings">
        <label>Confidence <select value={settings.confidence}
          onChange={event => setSettings({ ...settings, confidence: Number(event.target.value) as UncertaintySettings['confidence'] })}>
          <option value={0.9}>90%</option><option value={0.95}>95%</option><option value={0.99}>99%</option>
        </select></label>
        <label>Coverage <select value={settings.scope} onChange={event => setSettings({ ...settings, scope: event.target.value as UncertaintySettings['scope'] })}>
          {Object.entries(UNCERTAINTY_SCOPES).map(([key, title]) => <option key={key} value={key}>{title}</option>)}
        </select></label>
      </div>
    </details>
  </section>;
}
