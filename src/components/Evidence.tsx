import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { type Candidate, type Manifest } from '../core/contracts';
import { dominates, type evaluateEnvelope } from '../core/envelope';
import { candidateLabel, dollars, latencyValue, marginText, missionDisplay, percent } from '../core/display';
import { instrumentReading } from '../core/instruments';
import { Drawer } from './Drawer';

type Props = { candidate: Candidate; manifest: Manifest; envelope: ReturnType<typeof evaluateEnvelope>; close: () => void };
export function Evidence({ candidate, manifest, envelope, close }: Props) {
  const [comparisonId, setComparisonId] = useState('');
  const { tp, fp, tn, fn } = candidate;
  const checks = envelope.checks.get(candidate.id) ?? [];
  const other = manifest.candidates.find(point => point.id === comparisonId);
  const dominator = manifest.candidates.find(point => dominates(point, candidate));
  const complete = checks.every(gate => gate.observed !== null);
  const f1 = instrumentReading('f1', candidate.precision, candidate.recall, false).value;
  const formatInterval = (interval: [number, number] | null) => interval ? interval.map(v => percent(v)).join('–') : 'Unknown';

  return <Drawer titleId="evidence-title" label="Evidence" close={close}>
      <h2 id="evidence-title">{candidateLabel(candidate)}</h2>
      <p className="mono drawer-meta">{candidate.id} · {candidate.modelVersion} · {candidate.inferenceProfile}</p>
      <label className="compare-control">Compare with<select aria-label="Compare with" value={comparisonId} onChange={event => setComparisonId(event.target.value)}>
        <option value="">Choose a candidate</option>
        {manifest.candidates.filter(point => point.id !== candidate.id).map(point => <option key={point.id} value={point.id}>{candidateLabel(point)}</option>)}
      </select></label>
      <h3>Mission gates</h3>
      <ul className="checks">
        {checks.map(gate => <li key={gate.key}>
          <span className={gate.passes ? 'pass' : 'fail'}>{gate.passes ? <Check size={15} /> : <X size={15} />}{gate.passes ? 'Pass' : 'Fail'}</span>
          <div><strong>{gate.label}</strong><small>{gate.observed === null ? 'Unknown' : missionDisplay(gate.key, gate.observed)} · {gate.direction === 1 ? 'min' : 'max'} {missionDisplay(gate.key, gate.limit)}</small></div>
          <code title={String(gate.margin)}>{marginText(gate, true)}</code>
        </li>)}
      </ul>
      <p className="drawer-meta">Positive margins clear the gate. Precision and recall use percentage points.</p>
      <h3>Classification evidence</h3>
      <div className="confusion">{Object.entries({ TP: tp, FP: fp, TN: tn, FN: fn }).map(([label, value]) =>
        <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
      <p>{candidate.sampleCount.toLocaleString()} labeled records · FPR {percent(candidate.falsePositiveRate)} · Geometric F1 {percent(f1, 2)}</p>
      <p>{manifest.intervalMethod}. Precision {formatInterval(candidate.precisionInterval)} (n={tp + fp}). Recall {formatInterval(candidate.recallInterval)} (n={tp + fn}).</p>
      <h3>Pareto standing</h3>
      <p>{!complete ? 'Incomplete measurements exclude this point from the frontiers.' :
        dominator ? candidateLabel(dominator) + ' is at least as good on all four objectives and better on at least one.' : 'On the global Pareto frontier.'}
        {envelope.feasibleParetoIds.has(candidate.id) && ' On the feasible Pareto frontier.'}</p>
      {other && <><p>{dominates(candidate, other) ? 'Selected point dominates the comparison.' :
        dominates(other, candidate) ? 'Comparison dominates the selected point.' : 'Neither point dominates the other.'}</p>
        <table className="compare-table"><thead><tr><th>Metric</th><th>Selected</th><th>Comparison</th><th>Delta</th></tr></thead>
          <tbody>{checks.map(gate => {
            const baseline = other[gate.metric];
            const show = gate.metric === 'costPer1kUsd' ? dollars : gate.metric === 'p95LatencyMs' ? latencyValue : percent;
            const delta = gate.observed === null || baseline === null ? null : gate.observed - baseline;
            return <tr key={gate.key}><th>{gate.label}</th><td>{show(gate.observed)}</td><td>{show(baseline)}</td>
              <td>{delta === null ? 'Unknown' : marginText({ ...gate, margin: delta })}</td></tr>;
          })}</tbody></table></>}
      <h3>Provenance</h3>
      <dl className="provenance">
        <dt>Dataset</dt><dd>{candidate.datasetId} · seed {manifest.seed}</dd>
        <dt>Dataset SHA-256</dt><dd><code>{candidate.datasetSha256}</code></dd>
        <dt>Evaluation run</dt><dd>{candidate.evaluationRunId} · code {candidate.evaluationCodeVersion}</dd>
        <dt>Evaluation SHA-256</dt><dd><code>{manifest.evaluationSha256}</code></dd>
        <dt>Classification</dt><dd>{candidate.metricProvenance.classification} · confusion counts from row-level labels and scores.</dd>
        <dt>Latency</dt><dd>{candidate.metricProvenance.latency} · {manifest.benchmarkMethod}.</dd>
        <dt>Cost</dt><dd>{candidate.metricProvenance.cost} · {manifest.costMethod}.</dd>
      </dl>
  </Drawer>;
}
