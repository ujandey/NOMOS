import { useCallback, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine } from 'lucide-react';
import { DEFAULT_MISSION, type Manifest, type Mission, type Ranking } from './core/contracts';
import { evaluateEnvelope, resolveSelection } from './core/envelope';
import { candidateLabel, dollars, percent } from './core/display';
import { instrumentReading } from './core/instruments';
import { Drawer } from './components/Drawer';
import { Envelope } from './components/Envelope';
import { Evidence } from './components/Evidence';
import { InstrumentPanel } from './components/InstrumentPanel';
import { MissionPanel } from './components/MissionPanel';

const difference = (label: string, old: number | null, next: number | null) => {
  if (old === null || next === null || old === next) return '';
  return label + ' ' + (next > old ? '+' : '−') + (Math.abs(next - old) * 100).toFixed(2) + ' pp';
};

export function App({ manifest }: { manifest: Manifest }) {
  const candidates = manifest.candidates;
  const models = useMemo(() => [...new Map(candidates.map(c => [c.modelId, c.modelName]))], [candidates]);
  const [mission, setMission] = useState<Mission>(DEFAULT_MISSION);
  const [ranking, setRanking] = useState<Ranking>('min_latency');
  const [selection, setSelection] = useState(() => ({
    id: evaluateEnvelope(candidates, DEFAULT_MISSION, 'min_latency').recommendedId ?? candidates[0]?.id ?? null,
    fromId: null as string | null,
  }));
  const [requests, setRequests] = useState(1_000_000);
  const [freeMode, setFreeMode] = useState(!candidates.length);
  const [drawer, setDrawer] = useState<'source' | 'evidence' | null>(null);
  const [downloadFeedback, setDownloadFeedback] = useState<{ key: string; text: string; error?: boolean } | null>(null);
  const cachedExport = useRef<{ key: string; record: Promise<ReturnType<typeof import('./core/export').exportDecision>> } | null>(null);
  const envelope = useMemo(() => evaluateEnvelope(candidates, mission, ranking), [candidates, mission, ranking]);
  const selected = resolveSelection(candidates, selection.id, envelope.recommendedId);
  const previous = candidates.find(candidate => candidate.id === selection.fromId);
  const recommended = candidates.find(candidate => candidate.id === envelope.recommendedId);
  const thresholdRows = candidates.filter(c => c.modelId === selected?.modelId).sort((a, b) => a.threshold - b.threshold);
  const candidateId = selected?.id;
  const passes = candidateId ? envelope.feasibleIds.has(candidateId) : false;
  const f1 = instrumentReading('f1', selected?.precision ?? null, selected?.recall ?? null, false).value;
  const unitPrice = selected?.costPer1kUsd == null ? null : selected.costPer1kUsd / 1000;
  const monthlyCost = instrumentReading('cost', requests, unitPrice, false).value;
  const changes = selected && previous ? [
    difference('Precision', previous.precision, selected.precision),
    difference('recall', previous.recall, selected.recall),
    difference('F1', instrumentReading('f1', previous.precision, previous.recall, false).value, f1),
  ].filter(Boolean).join(' · ') : '';
  const decisionKey = JSON.stringify([candidateId, mission, ranking, requests]);

  const select = useCallback((id: string) => {
    setSelection(current => current.id === id ? current : { id, fromId: current.id });
    setFreeMode(false);
  }, []);

  function chooseModel(model: string) {
    if (!selected) return;
    const options = candidates.filter(candidate => candidate.modelId === model);
    const closest = options.sort((a, b) => Math.abs(a.threshold - selected.threshold) - Math.abs(b.threshold - selected.threshold))[0];
    if (closest) select(closest.id);
  }

  async function save(format: 'json' | 'yaml') {
    if (!candidateId) return;
    try {
      const exporter = import('./core/export');
      if (cachedExport.current?.key !== decisionKey) {
        cachedExport.current = { key: decisionKey, record: exporter.then(module => module.exportDecision(manifest, candidateId, mission, ranking, requests)) };
      }
      const [module, record] = await Promise.all([exporter, cachedExport.current.record]);
      const name = format === 'json' ? 'nomos-decision.json' : 'nomos-config.yaml';
      module.download(module.decisionFiles(record)[format], name, format === 'json' ? 'application/json' : 'application/yaml');
      setDownloadFeedback({ key: decisionKey, text: 'Download started · ' + name });
    } catch {
      if (cachedExport.current?.key === decisionKey) cachedExport.current = null;
      setDownloadFeedback({ key: decisionKey, text: 'Could not prepare the download. Try exporting again.', error: true });
    }
  }

  return <>
    <a className="skip-link" href="#main">Skip to workbench</a>
    <header className="topbar">
      <div className="top-inner">
        <a href="#main" className="brand" aria-label="NOMOS workbench"><span className="brand-mark" aria-hidden="true"><i /></span> NOMOS</a>
        <div className="header-actions">
          <a href="#mission" className="source-button">Mission limits</a>
          <a href="#decision" className="header-export"><ArrowDownToLine size={16} /> Export decision</a>
        </div>
      </div>
    </header>
    <main className="workbench" id="main" tabIndex={-1}>
      <div className="workspace-heading">
        <div><h1>Calibrate a fraud model</h1>
          <p>Explore where a model catches fraud and which settings fit your limits.</p></div>
        <button className="dataset-link" onClick={() => setDrawer('source')}>
          <span>Synthetic demo data</span><small>{manifest.sampleCount.toLocaleString()} records · {models.length} models</small>
        </button>
      </div>

      <div className="workstation">
        <section className="selection-strip" aria-labelledby="candidate-title">
          <div className="selection-identity"><h2 id="candidate-title">Operating point</h2><span>{candidates.length} evaluated settings</span></div>
          {selected ? <>
            <label>Model<select aria-label="Model variant" value={selected.modelId} onChange={event => chooseModel(event.target.value)}>
              {models.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select></label>
            <label>Threshold<select aria-label="Threshold" value={selected.id} onChange={event => select(event.target.value)}>
              {thresholdRows.map(point => <option key={point.id} value={point.id}>{point.threshold.toFixed(2)}</option>)}
            </select></label>
            <label className="threshold-slider">Sweep evaluated thresholds
              <input aria-label="Sweep evaluated thresholds" type="range" min={0} max={thresholdRows.length - 1} step={1}
                value={thresholdRows.findIndex(point => point.id === selected.id)}
                aria-valuetext={selected.threshold.toFixed(2)}
                onChange={event => select(thresholdRows[Number(event.target.value)].id)} />
            </label>
            <button className="outline-button evidence-button" onClick={() => setDrawer('evidence')}>View evidence</button>
          </> : <p role="status">No evaluated settings are available. Try the free instrument below.</p>}
        </section>

        <InstrumentPanel precision={selected?.precision ?? null} recall={selected?.recall ?? null} perRequest={unitPrice}
          requests={requests} setRequests={setRequests} freeMode={freeMode} setFreeMode={setFreeMode} selectionChanged={changes}
          hasCandidate={Boolean(selected)} />
        <MissionPanel mission={mission} setMission={setMission} envelope={envelope} total={candidates.length}
          selected={selected} recommended={recommended} select={select} />
      </div>

      {selected && <Envelope candidates={candidates} selected={selected} select={select}
        mission={mission} envelope={envelope} ranking={ranking} setRanking={setRanking} />}

      <section id="decision" className="decision-panel" tabIndex={-1} aria-labelledby="decision-title">
        <div>
          <h2 id="decision-title">Export configuration</h2>
          <p>{selected ? candidateLabel(selected) + ' threshold · ' + (passes ? 'Meets demo limits' : 'Review only · outside mission')
            : 'Select an evaluated configuration to export.'}</p>
          {selected && <p className="export-metrics">F1 {percent(f1, 2)} · {requests.toLocaleString('en-US')} requests/month · {dollars(monthlyCost)} estimated monthly cost</p>}
          {freeMode && selected && <p className="export-scope">Practice inputs are exploratory. Exports use the evaluated point and its linked request volume.</p>}
          {downloadFeedback?.key === decisionKey &&
            <p role={downloadFeedback.error ? 'alert' : 'status'} className={downloadFeedback.error ? 'field-error' : 'export-feedback'}>{downloadFeedback.text}</p>}
        </div>
        <div className="export-actions">
          <button className="outline-button" disabled={!selected} onClick={() => void save('yaml')}><ArrowDownToLine size={16} /> Configuration YAML</button>
          <button className="primary-button" disabled={!selected} onClick={() => void save('json')}><ArrowDownToLine size={16} /> Decision JSON</button>
        </div>
      </section>
      <footer><span>NOMOS</span><span>Evaluation {manifest.evaluationRunId}</span></footer>
    </main>

    {selected && drawer === 'evidence' && <Evidence candidate={selected} manifest={manifest} envelope={envelope} close={() => setDrawer(null)} />}
    {drawer === 'source' && <Drawer titleId="dataset-title" label="Dataset" close={() => setDrawer(null)}>
      <h2 id="dataset-title">Evaluation dataset</h2>
      <p>{manifest.datasetId} · {manifest.sampleCount.toLocaleString()} synthetic records · {candidates.length} evaluated settings</p>
      <h3>What was evaluated</h3>
      <p>Precision and recall are calculated from generated fraud labels and model scores. Timing samples are synthetic. Costs are estimated from declared rates.</p>
      <dl className="provenance">
        <dt>Model variants</dt><dd>{models.map(([, name]) => name).join(', ') || 'None available'}</dd>
        <dt>Data seed</dt><dd>{manifest.seed}</dd>
        <dt>Evaluation run</dt><dd>{manifest.evaluationRunId}</dd>
        <dt>Dataset SHA-256</dt><dd><code>{manifest.datasetSha256}</code></dd>
        <dt>Latency method</dt><dd>{manifest.benchmarkMethod}</dd>
        <dt>Cost method</dt><dd>{manifest.costMethod}</dd>
      </dl>
    </Drawer>}
  </>;
}
