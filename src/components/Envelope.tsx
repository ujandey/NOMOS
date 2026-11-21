import { memo, useId, useRef, useState, type PointerEvent } from 'react';
import { ChevronDown, CircleAlert, Crosshair, Table2 } from 'lucide-react';
import { RANKING, type Candidate, type Mission, type Ranking } from '../core/contracts';
import type { evaluateEnvelope } from '../core/envelope';
import { candidateLabel, dollars, latencyValue, marginText, percent } from '../core/display';
import { instrumentReading } from '../core/instruments';

type Props = {
  candidates: Candidate[]; selected: Candidate; select: (id: string) => void; mission: Mission;
  envelope: ReturnType<typeof evaluateEnvelope>; ranking: Ranking; setRanking: (ranking: Ranking) => void;
};
const plot = { left: 71, right: 683, top: 21, bottom: 245 };

function Projection({ candidates, selected, select, mission, envelope }: Omit<Props, 'ranking' | 'setRanking'>) {
  const svg = useRef<SVGSVGElement>(null);
  const active = useRef<number | null>(null);
  const gridId = useId();
  const xMax = Math.max(120, Math.ceil(Math.max(0, ...candidates.map(c => c.p95LatencyMs ?? 0)) / 20) * 20);
  const x = (n: number) => plot.left + n / xMax * (plot.right - plot.left);
  const y = (n: number) => plot.bottom - n * (plot.bottom - plot.top);
  const points = candidates.flatMap(c => c.p95LatencyMs === null || c.recall === null ? [] : [{ c, x: x(c.p95LatencyMs), y: y(c.recall) }]);
  const shown = points.find(point => point.c.id === selected.id);
  const tabId = shown?.c.id ?? points[0]?.c.id;
  function snap(event: PointerEvent) {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) return;
    const position = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    const closest = points.reduce<typeof points[number] | null>((best, point) => {
      const distance = (p: typeof point) => Math.hypot(p.x - position.x, p.y - position.y);
      return best && distance(best) <= distance(point) ? best : point;
    }, null);
    if (closest) select(closest.c.id);
  }
  return <div className="projection-wrap">
    <svg ref={svg} viewBox="0 0 710 290" className="projection" aria-label="Recall versus p95 latency. Full candidate details are in the data table."
      onPointerDown={event => {
        if (event.button !== 0 || event.pointerType === 'touch' || active.current !== null || (event.target as Element).closest('[data-candidate]')) return;
        const matrix = svg.current?.getScreenCTM();
        if (!matrix) return;
        const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
        if (point.x < plot.left || point.x > plot.right || point.y < plot.top || point.y > plot.bottom) return;
        active.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        snap(event);
      }}
      onPointerMove={event => { if (active.current === event.pointerId) snap(event); }}
      onLostPointerCapture={() => { active.current = null; }}>
      <defs><pattern id={gridId} width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 6L6 0" stroke="#b8cbbd" strokeWidth="1" /></pattern></defs>
      <rect x={plot.left} y={plot.top} width={plot.right - plot.left} height={plot.bottom - plot.top} rx="4" className="plot-background" />
      <rect x={plot.left} y={plot.top} width={Math.max(0, x(Math.min(mission.maxP95LatencyMs, xMax)) - plot.left)}
        height={y(mission.minRecall) - plot.top} fill={'url(#' + gridId + ')'} />
      {[0, 0.25, 0.5, 0.75, 1].map(v => <g key={v}>
        <line x1={plot.left} x2={plot.right} y1={y(v)} y2={y(v)} className="plot-grid" />
        <text x={plot.left - 12} y={y(v)} textAnchor="end" dominantBaseline="central">{percent(v, 0)}</text>
      </g>)}
      {Array.from({ length: 7 }, (_, i) => xMax * i / 6).map(v => <g key={v}>
        <line x1={x(v)} x2={x(v)} y1={plot.top} y2={plot.bottom} className="plot-grid" />
        <text x={x(v)} y={plot.bottom + 18} textAnchor="middle">{Math.round(v)}</text>
      </g>)}
      <text x="380" y="284" textAnchor="middle">p95 LATENCY (ms)</text>
      <text x="17" y="132" textAnchor="middle" transform="rotate(-90 17 132)">RECALL</text>
      <line className="gate-line" x1={plot.left} x2={plot.right} y1={y(mission.minRecall)} y2={y(mission.minRecall)} />
      {mission.maxP95LatencyMs <= xMax && <line className="gate-line" x1={x(mission.maxP95LatencyMs)} x2={x(mission.maxP95LatencyMs)} y1={plot.top} y2={plot.bottom} />}
      {shown && <g className="plot-hairline" pointerEvents="none"><line x1={shown.x} x2={shown.x} y1={plot.top} y2={plot.bottom} />
        <line y1={shown.y} y2={shown.y} x1={plot.left} x2={plot.right} /></g>}
      {points.map(({ c, x, y }, index) => <g key={c.id} data-candidate={c.id} role="button" tabIndex={c.id === tabId ? 0 : -1} aria-label={candidateLabel(c)}
        aria-description={envelope.feasibleIds.has(c.id) ? 'Meets all mission limits. Use arrow keys to inspect points.' : 'Outside mission limits. Use arrow keys to inspect points.'}
        aria-pressed={c.id === selected.id} onClick={() => select(c.id)}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(c.id); return; }
          const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1
            : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
          if (!direction && event.key !== 'Home' && event.key !== 'End') return;
          event.preventDefault();
          const target = event.key === 'Home' ? 0 : event.key === 'End' ? points.length - 1 : (index + direction + points.length) % points.length;
          const id = points[target].c.id;
          svg.current?.querySelector<SVGGElement>('[data-candidate="' + CSS.escape(id) + '"]')?.focus({ preventScroll: true });
          select(id);
        }}
        className={envelope.feasibleIds.has(c.id) ? 'plot-point feasible-point' : 'plot-point'}>
        <title>{candidateLabel(c)} · {envelope.feasibleIds.has(c.id) ? 'Feasible' : 'Outside mission'}</title>
        {envelope.globalParetoIds.has(c.id) ? <path d={'M' + x + ' ' + (y - 7) + ' l7 7 -7 7 -7 -7z'} /> : <circle cx={x} cy={y} r="5" />}
        {envelope.feasibleIds.has(c.id) && <path className="point-check" d={'M' + (x - 3) + ' ' + y + 'l2 2 4 -4'} />}
      </g>)}
      {shown && <circle cx={shown.x} cy={shown.y} r="12" className="plot-selection" pointerEvents="none" />}
    </svg>
  </div>;
}

export const Envelope = memo(function Envelope({ candidates, selected, select, mission, envelope, ranking, setRanking }: Props) {
  const [table, setTable] = useState(false);
  const recommended = candidates.find(candidate => candidate.id === envelope.recommendedId);
  return <section id="envelope" className="envelope-panel" aria-labelledby="envelope-title">
    <div className="envelope-heading">
      <div><h2 id="envelope-title">Explore operating points</h2><p>Compare recall and latency. A check mark means the point meets all four mission limits.</p>
        <p className="map-selection"><strong>{candidateLabel(selected)}</strong> selected · {envelope.feasibleIds.has(selected.id) ? 'Meets limits' : 'Outside limits'}</p></div>
      <div className="segmented">
        <button aria-pressed={!table} onClick={() => setTable(false)}><Crosshair size={14} /> Map</button>
        <button aria-pressed={table} onClick={() => setTable(true)}><Table2 size={14} /> Data table</button>
      </div>
    </div>
    <div className="envelope-grid">
      <div>
        {table ? <div className="table-scroll" role="region" aria-label="Evaluated points table" tabIndex={0}><table>
          <caption className="sr-only">Evaluated operating points</caption>
          <thead><tr>{['Candidate', 'Precision', 'Recall', 'F1', 'Latency', 'Cost / 1k', 'Mission', 'Pareto'].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
          <tbody>{candidates.map(c => <tr key={c.id} className={c.id === selected.id ? 'selected-row' : undefined}>
            <td><button className="text-button" aria-pressed={c.id === selected.id} onClick={() => select(c.id)}>{candidateLabel(c)}</button></td>
            <td>{percent(c.precision)}</td><td>{percent(c.recall)}</td>
            <td>{percent(instrumentReading('f1', c.precision, c.recall, false).value)}</td>
            <td>{latencyValue(c.p95LatencyMs)}</td><td>{dollars(c.costPer1kUsd)}</td>
            <td>{envelope.feasibleIds.has(c.id) ? 'Feasible' : 'Outside'}</td>
            <td>{envelope.feasibleParetoIds.has(c.id) ? 'Feasible Pareto' : envelope.globalParetoIds.has(c.id) ? 'Global Pareto' : '—'}</td>
          </tr>)}</tbody>
        </table></div> : <>
          <Projection candidates={candidates} selected={selected} select={select} mission={mission} envelope={envelope} />
          <div className="chart-legend"><span><i className="legend feasible">✓</i> Meets limits</span><span><i className="legend" /> Outside mission</span><span><i className="legend diamond" /> On Pareto frontier</span><span><i className="legend hatch" /> Recall / latency limits</span></div>
        </>}
      </div>
      <aside className="ranking">
        <label htmlFor="ranking-policy">Ranking policy</label>
        <select id="ranking-policy" value={ranking} onChange={event => setRanking(event.target.value as Ranking)}>
          {Object.entries(RANKING).map(([key, label]) => <option value={key} key={key}>{label}</option>)}
        </select>
        <details className="pareto-details">
          <summary>Pareto frontier <ChevronDown size={15} /></summary>
          <p>A point is on the frontier when no other point improves one metric while matching or improving the rest.</p>
          <p>Ties for the recommendation resolve by cost, then candidate ID.</p>
          <div className="frontier-count"><span>All evaluated points</span><strong>{envelope.globalParetoIds.size}</strong></div>
          <div className="frontier-count"><span>Among feasible points</span><strong>{envelope.feasibleParetoIds.size}</strong></div>
        </details>
        {recommended ? <button className="outline-button" onClick={() => select(recommended.id)}>Select {candidateLabel(recommended)}</button> :
          <div className="no-solution" aria-live="polite">
            <h3><CircleAlert size={16} /> No evaluated match</h3>
            <p>Failed gates across {candidates.length} points</p>
            <ul>{envelope.failedCounts.filter(gate => gate.count > 0).map(gate => <li key={gate.label}>{gate.label} <strong>{gate.count}</strong></li>)}</ul>
            {envelope.alternatives.length > 0 && <><h4>Closest evaluated trade-offs</h4><p>Fewest failed gates, then normalized margin.</p>
              {envelope.alternatives.slice(0, 2).map(({ candidate, failures }) => <div className="alternative" key={candidate.id}>
                <button className="text-button" onClick={() => select(candidate.id)}>{candidateLabel(candidate)}</button>
                {failures.map(gate => <span key={gate.key}>{gate.label} {marginText(gate, true)} · gate could move to {gate.direction === 1 ? percent(gate.observed, 6) : gate.observed + ' ' + gate.unit}</span>)}
              </div>)}
            </>}
          </div>}
      </aside>
    </div>
  </section>;
});
