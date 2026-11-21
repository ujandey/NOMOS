import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Activity, Crosshair, Download, FileCheck2, Layers3, Maximize, Minimize, Ruler } from 'lucide-react';
import { RANKING, type Manifest, type Mission, type Ranking } from './core/contracts';
import { DAILY_REQUESTS } from './core/deployment';
import { DEPLOYMENT_MISSION, evaluateEnvelope, resolveSelection } from './core/envelope';
import { candidateLabel, dollars, percent } from './core/display';
import { Drawer } from './components/Drawer';
import { Envelope } from './components/Envelope';
import { Evidence } from './components/Evidence';
import { InstrumentPanel, type Plate } from './components/InstrumentPanel';
import { MissionBrief, MissionPanel } from './components/MissionPanel';

const views = [
  ['map', 'Operating map', Crosshair], ['prevalence', 'Prevalence', Activity], ['f1', 'F1 alignment', Ruler],
  ['cost', 'Economics', Layers3], ['capacity', 'Throughput', Activity],
] as const;
type View = typeof views[number][0];
const pocketQuery = '(max-width: 640px)';
function subscribe(listener: () => void) {
  const query = window.matchMedia(pocketQuery);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}
const isPocket = () => window.matchMedia(pocketQuery).matches;

export function App({ manifest }: { manifest: Manifest }) {
  const candidates = manifest.candidates;
  const [mission, setMission] = useState<Mission>(DEPLOYMENT_MISSION);
  const [ranking, setRanking] = useState<Ranking>('min_fpr');
  const [requests, setRequests] = useState(DAILY_REQUESTS);
  const [selectedId, select] = useState<string | null>(() => evaluateEnvelope(candidates, DEPLOYMENT_MISSION, 'min_fpr').recommendedId);
  const [view, setView] = useState<View>('map');
  const [zoom, setZoom] = useState(true);
  const [drawer, setDrawer] = useState<'evidence' | 'export' | null>(null);
  const [feedback, setFeedback] = useState<{ key: string; text: string; error?: boolean }>();
  const exportCache = useRef<{ key: string; record: ReturnType<typeof import('./core/export').exportDecision> } | null>(null);
  const pocket = useSyncExternalStore(subscribe, isPocket);
  const envelope = useMemo(() => evaluateEnvelope(candidates, mission, ranking, requests), [candidates, mission, ranking, requests]);
  const selected = resolveSelection(candidates, selectedId, envelope.recommendedId);
  const values = selected ? envelope.values.get(selected.id) : undefined;
  const prior = mission.targetPrevalence ?? 0.1;
  const setLimit = useCallback((key: keyof Mission, value: number) => setMission(m => m[key] === value ? m : { ...m, [key]: value }), []);
  const selectPoint = useCallback((id: string) => select(id), []);
  const decisionKey = JSON.stringify([selected?.id, mission, requests, ranking]);
  const passes = selected ? envelope.feasibleIds.has(selected.id) : false;

  async function save(format: 'json' | 'yaml') {
    if (!selected) return;
    try {
      const exporter = await import('./core/export');
      if (exportCache.current?.key !== decisionKey) {
        exportCache.current = { key: decisionKey, record: exporter.exportDecision(manifest, selected.id, mission, ranking, requests) };
      }
      const file = format === 'json' ? 'nomos-decision.json' : 'nomos-config.yaml';
      exporter.download(exporter.decisionFiles(exportCache.current.record)[format], file, format === 'json' ? 'application/json' : 'application/yaml');
      setFeedback({ key: decisionKey, text: 'Download started · ' + file });
    } catch {
      setFeedback({ key: decisionKey, text: 'Could not prepare the download. Try again.', error: true });
    }
  }

  return <>
    <a className="skip-link" href="#main">Skip to workspace</a>
    <header className="topbar">
      <div className="top-inner">
        <div className="brand"><span className="brand-mark"><Crosshair size={22} /></span><span>NOMOS <small>3.0</small></span></div>
        <span className="brand-caption">Geometric computer for AI calibration</span>
        <div className="top-actions">
          <button className="button header-evidence" disabled={!selected} onClick={() => setDrawer('evidence')}><FileCheck2 size={17} /> Evidence</button>
          <button className="button primary" disabled={!selected} onClick={() => setDrawer('export')}><Download size={17} /> Export decision</button>
        </div>
      </div>
    </header>
    <main id="main" className="workspace" tabIndex={-1}>
      <div className="workspace-meta"><div><span className="signal" /><span className="desktop-meta">Calibration workspace</span>
        <span className="mobile-meta">{envelope.feasibleIds.size} / {candidates.length} feasible</span></div>
        <span>Synthetic evaluation · {manifest.sampleCount.toLocaleString('en-US')} records</span></div>
      <div className="workbench">
        <MissionBrief />
        <section className="instrument" aria-labelledby="instrument-title">
          <nav className="instrument-nav" aria-label="Instruments">
            {views.map(([id, label, Icon]) => <button key={id} aria-pressed={view === id} onClick={() => setView(id)}><Icon size={17} />{label}</button>)}
          </nav>
          <div className="instrument-heading">
            <div><h1 id="instrument-title">{views.find(([id]) => id === view)?.[1]}</h1>
              <p>{view === 'map' ? 'Drag the operating point to test evaluated settings.' : {
                prevalence: 'See how rarer fraud changes which alerts are correct.',
                f1: 'Balance expected precision with evaluated recall.',
                cost: 'Change daily requests to test the inference budget.',
                capacity: 'Read average requests in the system from long-run rates.',
              }[view]}</p></div>
            {view === 'map' && <button className="button quiet" aria-pressed={zoom} onClick={() => setZoom(!zoom)}>{zoom ? <Minimize size={16} /> : <Maximize size={16} />}{zoom ? 'Show full map' : 'Zoom to high recall'}</button>}
          </div>
          <div hidden={view !== 'map'}>
            <div className="map-tools"><span>Target fraud prevalence</span>
              <div className="segmented">
                {[0.1, 0.01].map(p => <button key={p} aria-pressed={prior === p} onClick={() => setLimit('targetPrevalence', p)}>{percent(p, 0)}</button>)}
              </div>
              {prior !== 0.1 && prior !== 0.01 && <strong>{percent(prior, 2)}</strong>}
              <button className="text-link" onClick={() => setView('prevalence')}>Open prevalence scale</button>
            </div>
            <Envelope candidates={candidates} selected={selected} mission={mission} envelope={envelope}
              select={selectPoint} setLimit={setLimit} zoom={zoom} pocket={pocket} />
          </div>
          {views.slice(1).map(([id]) => <div key={id} hidden={view !== id}>
            <InstrumentPanel kind={id as Plate} candidate={selected} prior={prior} setPrior={p => setLimit('targetPrevalence', p)}
              requests={requests} setRequests={setRequests} pocket={pocket} onEvidence={() => setDrawer('evidence')} />
          </div>)}
          <div className="point-strip" aria-label="Current evaluated operating point">
            <div><span>Operating point</span><strong>{selected ? selected.modelName : 'Unavailable'}{selected && <small> / {selected.threshold.toFixed(2)}</small>}</strong></div>
            <div><span>Expected precision</span><strong data-testid="selected-precision">{percent(values?.precision ?? null)}</strong></div>
            <div><span>Recall</span><strong>{percent(values?.recall ?? null)}</strong></div>
            <div><span>False-positive rate</span><strong>{percent(values?.falsePositiveRate ?? null)}</strong></div>
          </div>
          <details className="candidate-drawer">
            <summary>Evaluated configurations <span>{candidates.length} settings</span></summary>
            <div className="data-tools"><label>Rank feasible points <select value={ranking} onChange={event => setRanking(event.target.value as Ranking)}>
              {Object.entries(RANKING).map(([key, title]) => <option key={key} value={key}>{title}</option>)}
            </select></label>
            {envelope.recommendedId && <button className="button quiet" onClick={() => selectPoint(envelope.recommendedId!)}>Select recommended</button>}</div>
            <div className="table-scroll" role="region" aria-label="Evaluated settings table" tabIndex={0}><table>
              <thead><tr><th scope="col">Configuration</th><th scope="col">Recall</th><th scope="col">Expected precision</th><th scope="col">Daily cost</th><th scope="col">Mission</th></tr></thead>
              <tbody>{candidates.map(c => <tr key={c.id}>
                <th scope="row"><button aria-pressed={c.id === selected?.id} className="text-link" onClick={() => selectPoint(c.id)}>{candidateLabel(c)}</button></th>
                <td>{percent(c.recall)}</td><td>{percent(envelope.values.get(c.id)?.precision ?? null)}</td><td>{dollars(envelope.values.get(c.id)?.dailyCostUsd ?? null)}</td>
                <td>{envelope.feasibleParetoIds.has(c.id) ? 'Feasible · Pareto' : envelope.feasibleIds.has(c.id) ? 'Feasible' : 'Outside limits'}</td>
              </tr>)}</tbody>
            </table></div>
          </details>
        </section>
        <MissionPanel mission={mission} setMission={setMission} envelope={envelope} total={candidates.length} selected={selected} select={selectPoint} />
      </div>
      <footer><span>NOMOS / FRAUD DEPLOYMENT</span><span>Evaluation {manifest.evaluationRunId}</span></footer>
    </main>
    {selected && drawer === 'evidence' && <Evidence candidate={selected} manifest={manifest} mission={mission} requests={requests} envelope={envelope} close={() => setDrawer(null)} />}
    {selected && drawer === 'export' && <Drawer titleId="export-title" label="Decision export" close={() => setDrawer(null)}>
      <h2 id="export-title">Export {candidateLabel(selected)}</h2>
      <p>{passes ? 'Feasible under the current demo mission.' : 'Review only. This point misses one or more mission constraints.'}</p>
      <p>The decision includes evaluated rates, source hashes, deployment assumptions, geometric readings, numerical checks and every constraint result.</p>
      <dl className="provenance">
        <dt>Target prevalence</dt><dd>{percent(prior, 2)}</dd>
        <dt>Requests per day</dt><dd>{requests.toLocaleString()}</dd>
        <dt>Expected precision</dt><dd>{percent(values?.precision ?? null, 2)}</dd>
      </dl>
      <div className="export-actions">
        <button className="button primary" onClick={() => void save('json')}><Download size={16} /> Decision JSON</button>
        <button className="button" onClick={() => void save('yaml')}>Configuration YAML</button>
      </div>
      {feedback?.key === decisionKey && <p role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p>}
    </Drawer>}
  </>;
}
