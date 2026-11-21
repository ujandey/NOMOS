import { useState } from 'react';
import { Check, ChevronDown, RotateCcw, X } from 'lucide-react';
import { DEFAULT_MISSION, type Candidate, type Mission } from '../core/contracts';
import { candidateLabel, dollars, latencyValue, missionDisplay } from '../core/display';
import { GATES, type evaluateEnvelope, type Violation } from '../core/envelope';
import { compileMission, type Proposal } from '../core/mission';
import { NumberField } from './NumberField';

type Props = {
  mission: Mission; setMission: (next: Mission) => void;
  envelope: ReturnType<typeof evaluateEnvelope>; total: number; selected: Candidate | null;
  recommended: Candidate | undefined; select: (id: string) => void;
};
const example = 'Keep recall at least 90%, but prioritize latency under 50 ms.';

function failure(gate: Violation) {
  if (gate.observed === null) return 'Metric unavailable';
  if (gate.margin === null) return '';
  const gap = -gate.margin * (gate.direction === 1 ? 100 : 1);
  const size = gap < 0.01 ? gap.toPrecision(2) : gap.toFixed(2).replace(/\.?0+$/, '');
  return size + (gate.direction === 1 ? ' pp below minimum' : ' ' + gate.unit + ' over maximum');
}

export function MissionPanel({ mission, setMission, envelope, total, selected, recommended, select }: Props) {
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const [response, setResponse] = useState<{ proposal?: Proposal; error?: string; base: Mission; text: string } | null>(null);
  const current = response?.base === mission && response?.text === text ? response : null;
  const proposal = current?.proposal;
  const count = envelope.feasibleIds.size;
  const checks = selected ? envelope.checks.get(selected.id) : undefined;
  const failures = checks?.filter(gate => !gate.passes) ?? [];
  const firstAlternative = envelope.alternatives[0];

  async function preview() {
    setPending(true);
    setResponse(null);
    try {
      setResponse({ proposal: await compileMission(text, mission), base: mission, text });
    } catch (problem) {
      setResponse({ error: problem instanceof Error ? problem.message : 'Unable to parse this mission.', base: mission, text });
    } finally {
      setPending(false);
    }
  }

  return <aside className="mission-panel" id="mission" tabIndex={-1} aria-labelledby="mission-title">
    <div className="mission-heading">
      <h2 id="mission-title">Mission limits</h2>
      <button className="icon-button" aria-label="Restore default mission" title="Restore default mission"
        onClick={() => { setMission({ ...DEFAULT_MISSION }); setResponse(null); }}><RotateCcw size={17} /></button>
    </div>
    <div className={'mission-status' + (failures.length ? ' danger' : '')} aria-live="polite">
      <strong>{selected ? failures.length ? failures.length + ' of 4 limits missed' : 'Selected point meets all 4 limits' : 'Select a point to check its limits'}</strong>
      <span>{count ? count + ' feasible configuration' + (count === 1 ? '' : 's') : 'No feasible configuration'}</span>
      <small>Across {total} evaluated points</small>
    </div>
    <div className="limit-head"><span>Selected point</span><span>Edit limit</span></div>
    <div className="limit-list">
      {GATES.map(gate => {
        const ratio = gate.direction === 1;
        const check = checks?.find(item => item.key === gate.key);
        const observed = check?.observed ?? null;
        return <div className={'limit-row' + (check && !check.passes ? ' limit-missed' : '')} key={gate.key} data-testid={gate.metric}>
          <div>
            <span className="limit-label">{gate.label}</span>
            <strong>{gate.key === 'maxCostPer1kUsd' ? dollars(observed) : gate.key === 'maxP95LatencyMs' ? latencyValue(observed)
              : observed === null ? 'Unknown' : missionDisplay(gate.key, observed)}</strong>
            {check && <small className={check.passes ? 'pass' : 'fail'}>
              {check.passes ? <Check size={13} /> : <X size={13} />}
              {check.passes ? 'Meets limit' : failure(check)}
            </small>}
          </div>
          <div className="limit-control">
            <span aria-hidden="true">{ratio ? '≥' : '≤'}</span>
            <NumberField compact label={(ratio ? 'Min ' : 'Max ') + gate.label.toLowerCase()} unit={gate.unit}
              min={0} exclusiveMin={gate.key === 'maxP95LatencyMs'} max={ratio ? 100 : 1_000_000} step={ratio ? 0.1 : 'any'}
              value={ratio ? Number((mission[gate.key] * 100).toPrecision(15)) : mission[gate.key]}
              onChange={value => {
                const next = ratio ? value / 100 : value;
                if (mission[gate.key] !== next) setMission({ ...mission, [gate.key]: next });
              }} />
          </div>
        </div>;
      })}
    </div>
    <div className="preset-row">
      <button className="outline-button" aria-pressed={mission.maxP95LatencyMs === 50}
        onClick={() => setMission({ ...mission, maxP95LatencyMs: 50 })}>Tighten to 50 ms</button>
      <button className="text-button" onClick={() => setMission({ minPrecision: 1, minRecall: 1, maxP95LatencyMs: 20, maxCostPer1kUsd: 1 })}>Impossible preset</button>
    </div>
    {failures.length > 0 && recommended &&
      <button className="text-button alternative-link" onClick={() => select(recommended.id)}>Try {candidateLabel(recommended)} · meets all limits</button>}
    {!count && firstAlternative && <div className="nearby">
      <strong>Closest evaluated point</strong>
      <button className="text-button" onClick={() => select(firstAlternative.candidate.id)}>{candidateLabel(firstAlternative.candidate)}</button>
      <span>{firstAlternative.failures.map(gate => gate.label + ' would need ' + missionDisplay(gate.key, gate.observed!)).join(' · ')}</span>
    </div>}
    <details className="compiler">
      <summary>Mission Compiler <ChevronDown size={16} /></summary>
      <form onSubmit={event => { event.preventDefault(); void preview(); }}>
        <label htmlFor="mission-text">Describe the limits</label>
        <textarea id="mission-text" aria-label="Mission instruction" rows={3} maxLength={1000} value={text}
          placeholder="Recall at least 90%; latency under 50 ms."
          onChange={event => setText(event.target.value)} />
        <div className="compiler-actions">
          <button className="outline-button" disabled={pending || !text.trim()}>{pending ? 'Parsing…' : 'Preview changes'}</button>
          <button type="button" className="text-button" onClick={() => setText(example)}>Use example</button>
        </div>
      </form>
      {current?.error && <p className="field-error" role="alert">{current.error}</p>}
      {proposal && <div className="compiler-diff" aria-live="polite">
        <strong>{proposal.source === 'llm' ? 'Model-assisted proposal' : 'Offline parser proposal'}</strong>
        {proposal.changes.length ? <ul>{proposal.changes.map(change => <li key={change.key}>{GATES.find(g => g.key === change.key)?.label}: {missionDisplay(change.key, change.from)} → {missionDisplay(change.key, change.to)}</li>)}</ul> : <p>These limits already match your mission.</p>}
        <p>Proposed limits · {GATES.map(gate => gate.label + ' ' + missionDisplay(gate.key, proposal.mission[gate.key])).join(' · ')}</p>
        {proposal.warnings.map(warning => <p key={warning}>{warning}</p>)}
        {proposal.changes.length > 0 && <button className="primary-button" onClick={() => { setMission(proposal.mission); setResponse(null); }}>Apply mission</button>}
      </div>}
    </details>
  </aside>;
}
