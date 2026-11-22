import { useRef, useState, type PointerEvent } from 'react';
import type { Candidate, Mission } from '../core/contracts';
import { STATUS_TEXT, type Envelope as EnvelopeResult } from '../core/envelope';
import { candidateLabel, percent } from '../core/display';

type Limit = 'minRecall' | 'minPrecision' | 'maxFalsePositiveRate';
type Props = {
  candidates: Candidate[]; selected: Candidate | null; mission: Mission; envelope: EnvelopeResult;
  select: (id: string) => void; setLimit: (key: Limit, value: number) => void; zoom: boolean; pocket: boolean;
  /** Resolved prevalence (target or sample) used for the precision boundary. */
  prior: number | null;
};

/**
 * Keyboard steps follow the handle's on-screen motion. Raising the minimum precision moves the
 * precision boundary left, so ArrowLeft raises it and ArrowRight lowers it. ArrowUp always raises
 * the limit's value and ArrowDown always lowers it.
 */
export function keyDirection(key: Limit, pressed: string) {
  if (pressed === 'ArrowUp') return 1;
  if (pressed === 'ArrowDown') return -1;
  const visual = pressed === 'ArrowRight' ? 1 : pressed === 'ArrowLeft' ? -1 : 0;
  return key === 'minPrecision' ? -visual : visual;
}

export function Envelope({ candidates, selected, mission, envelope, select, setLimit, zoom, pocket, prior: resolvedPrior }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: number; target: Limit | 'candidate'; offset: number } | null>(null);
  const [passingOnly, setPassingOnly] = useState(false);
  const [allRanges, setAllRanges] = useState(false);
  const width = pocket ? 400 : 860, height = pocket ? 315 : 368;
  const left = pocket ? 49 : 70, right = width - (pocket ? 16 : 34), top = 21, bottom = height - 53;
  const maxX = zoom ? 0.2 : Math.min(1, Math.max(0.5, ...candidates.map(c => c.falsePositiveRate ?? 0)));
  const minY = zoom ? 0.78 : Math.max(0, Math.min(0.25, ...candidates.map(c => c.recall ?? 1)));
  const projectX = (v: number) => left + (right - left) * Math.sqrt(Math.min(maxX, Math.max(0, v)) / maxX);
  const projectY = (v: number) => top + (bottom - top) * (1 - Math.max(minY, Math.min(1, v))) / (1 - minY);
  const readX = (x: number) => maxX * Math.min(1, Math.max(0, (x - left) / (right - left))) ** 2;
  const readY = (y: number) => 1 - (1 - minY) * Math.min(1, Math.max(0, (y - top) / (bottom - top)));
  const prior = resolvedPrior ?? 0;
  const fpr = mission.maxFalsePositiveRate ?? 1;
  const recallLine = projectY(Math.max(minY, mission.minRecall));
  const fprLine = projectX(Math.min(maxX, fpr));
  const precisionX = (recall: number) => {
    if (mission.minPrecision === 0 || prior === 1) return maxX;
    return prior * recall * (1 - mission.minPrecision) / ((1 - prior) * mission.minPrecision);
  };
  const curve = (low: number, high: number, cap: number) => Array.from({ length: 49 }, (_, i) => {
    const recall = low + (high - low) * i / 48;
    return [projectX(Math.min(cap, precisionX(recall))), projectY(recall)].join(',');
  }).join(' ');
  const precisionHandleY = projectY(0.91);
  const precisionHandleX = projectX(Math.min(maxX, precisionX(0.91)));
  const status = (c: Candidate) => envelope.statuses.get(c.id) ?? 'unknown';
  const passing = (c: Candidate) => ['robust', 'estimate-only'].includes(status(c));
  const points = candidates.flatMap(c => c.recall === null || c.falsePositiveRate === null || c.recall < minY || c.falsePositiveRate > maxX ||
    (passingOnly && !passing(c)) ? [] : [{ c, x: projectX(c.falsePositiveRate), y: projectY(c.recall) }]);
  const visibleSelection = points.some(point => point.c.id === selected?.id);
  const yTicks = zoom ? [0.8, 0.85, 0.9, 0.95, 1] : [minY, 0.4, 0.6, 0.8, 1].filter(v => v >= minY);
  const xTicks = zoom ? [0, 0.005, 0.02, 0.05, 0.1, 0.2] : [0, 0.01, 0.05, 0.1, 0.25, maxX];
  const box = (c: Candidate) => {
    const evidence = envelope.values.get(c.id)?.evidence;
    if (!evidence?.tpr || !evidence.fpr) return null;
    return { x1: projectX(evidence.fpr.lower), x2: projectX(evidence.fpr.upper), y1: projectY(evidence.tpr.upper), y2: projectY(evidence.tpr.lower),
      clipped: evidence.fpr.upper > maxX || evidence.tpr.lower < minY, worst: { fpr: evidence.fpr.upper, tpr: evidence.tpr.lower } };
  };
  const selectedBox = selected && visibleSelection ? box(selected) : null;

  function position(event: PointerEvent) {
    const matrix = svg.current?.getScreenCTM();
    return matrix ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()) : null;
  }
  function apply(target: Limit | 'candidate', x: number, y: number) {
    if (target === 'candidate') {
      const distance = (p: typeof points[number]) => Math.hypot(x - p.x, y - p.y);
      const closest = points.reduce<typeof points[number] | null>((best, p) => !best || distance(p) < distance(best) ? p : best, null);
      if (closest) select(closest.c.id);
      return;
    }
    const t = prior * 0.91;
    const value = target === 'minRecall' ? readY(y) : target === 'maxFalsePositiveRate' ? readX(x) : t / (t + (1 - prior) * readX(x));
    if (Number.isFinite(value)) setLimit(target, Math.round(value * 1000) / 1000);
  }
  function begin(event: PointerEvent, target: Limit | 'candidate', anchor?: number) {
    if (drag.current || event.button !== 0) return;
    const p = position(event);
    if (!p) return;
    if (target === 'candidate' && (p.x < left || p.x > right || p.y < top - 12 || p.y > bottom + 12)) return;
    event.preventDefault();
    event.stopPropagation();
    const offset = anchor === undefined || target === 'candidate' ? 0 : (target === 'minRecall' ? p.y : p.x) - anchor;
    drag.current = { id: event.pointerId, target, offset };
    event.currentTarget.setPointerCapture(event.pointerId);
    if (target === 'candidate' && anchor === undefined) apply(target, p.x, p.y);
  }
  function move(event: PointerEvent) {
    const current = drag.current;
    const point = position(event);
    if (current?.id !== event.pointerId || !point) return;
    apply(current.target, point.x - (current.target === 'minRecall' ? 0 : current.offset), point.y - (current.target === 'minRecall' ? current.offset : 0));
  }
  const stop = () => { drag.current = null; };
  function handle(key: Limit, x: number, y: number, label: string, value: number, rotation = 0) {
    return <g className="gate-handle" transform={`translate(${x} ${y}) rotate(${rotation})`} role="slider" tabIndex={0}
      aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Number((value * 100).toFixed(7))}
      aria-valuetext={percent(value)} aria-orientation={key === 'minRecall' ? 'vertical' : 'horizontal'}
      onPointerDown={event => {
        event.currentTarget.focus();
        begin(event, key, key === 'minRecall' ? y : x);
      }}
      onKeyDown={event => {
        const direction = keyDirection(key, event.key);
        if (!direction && !['Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = direction ? value + direction * (event.shiftKey ? 0.01 : 0.001) : event.key === 'Home' ? 0 : 1;
        setLimit(key, Math.min(1, Math.max(0, Number(next.toFixed(6)))));
      }}>
      <title>{label} · {percent(value)}</title>
      <rect x="-18" y="-18" width="36" height="36" fill="transparent" />
      <rect x="-11" y="-8" width="22" height="16" rx="2" className="gate-thumb" />
      <path d="M-4-3v6m4-6v6m4-6v6" />
    </g>;
  }

  return <div className="envelope">
    <div className="drafting">
      <svg ref={svg} viewBox={`0 0 ${width} ${height}`} className="operating-map" aria-label="Operating map of false-positive rate and recall"
        onPointerDown={event => begin(event, 'candidate')} onPointerMove={move}
        onPointerUp={event => { if (drag.current?.id === event.pointerId) stop(); }}
        onPointerCancel={event => { if (drag.current?.id === event.pointerId) stop(); }}
        onLostPointerCapture={event => { if (drag.current?.id === event.pointerId) stop(); }}>
        <title>Evaluated operating points, their uncertainty and quality constraints</title>
        <rect x={left} y={top} width={right - left} height={bottom - top} className="plot-field" />
        <polygon className="quality-region" points={`${left},${recallLine} ${curve(Math.max(minY, mission.minRecall), 1, Math.min(maxX, fpr))} ${left},${top}`} />
        {xTicks.map(tick => <g key={tick}>
          <line className="gridline" x1={projectX(tick)} x2={projectX(tick)} y1={top} y2={bottom} />
          <text className="chart-text" x={projectX(tick)} y={bottom + 19} textAnchor="middle">{percent(tick, tick === 0.005 ? 1 : 0)}</text>
        </g>)}
        {yTicks.map(tick => <g key={tick}>
          <line className="gridline" x1={left} x2={right} y1={projectY(tick)} y2={projectY(tick)} />
          <text className="chart-text" x={left - 9} y={projectY(tick) + 4} textAnchor="end">{percent(tick, 0)}</text>
        </g>)}
        <path className="chart-axes" d={`M${left} ${top}V${bottom}H${right}`} />
        <text className="axis-caption" textAnchor="middle" x={(left + right) / 2} y={height - 11}>FALSE-POSITIVE RATE</text>
        <text className="axis-caption" textAnchor="middle" transform={`translate(13 ${(top + bottom) / 2}) rotate(-90)`}>RECALL</text>
        {mission.minRecall >= minY && <line className="constraint-line recall-boundary" x1={left} x2={right} y1={recallLine} y2={recallLine} />}
        {mission.maxFalsePositiveRate !== undefined && fpr <= maxX && <line className="constraint-line fpr-boundary" x1={fprLine} x2={fprLine} y1={top} y2={bottom} />}
        {prior > 0 && prior < 1 && mission.minPrecision > 0 && <polyline className="constraint-line precision-boundary" points={curve(minY, 1, maxX)} />}
        {allRanges && <g aria-hidden="true">{points.filter(p => p.c.id !== selected?.id).map(({ c }) => {
          const b = box(c);
          return b && <rect key={c.id} className={'uncertainty-box faint status-' + status(c)} x={b.x1} y={b.y1} width={Math.max(1, b.x2 - b.x1)} height={Math.max(1, b.y2 - b.y1)} />;
        })}</g>}
        {selectedBox && <g aria-hidden="true" data-testid="selected-uncertainty">
          <rect className={'uncertainty-box status-' + status(selected!)} x={selectedBox.x1} y={selectedBox.y1}
            width={Math.max(1, selectedBox.x2 - selectedBox.x1)} height={Math.max(1, selectedBox.y2 - selectedBox.y1)} />
          <line className="worst-link" x1={projectX(selected!.falsePositiveRate!)} y1={projectY(selected!.recall!)} x2={selectedBox.x2} y2={selectedBox.y2} />
          <path className="worst-mark" d={`M${selectedBox.x2 - 5} ${selectedBox.y2 - 5}l10 10m0-10l-10 10`} />
          <text className="worst-text" x={Math.min(selectedBox.x2 + 8, right - 4)} y={Math.min(selectedBox.y2 + 16, bottom - 4)}
            textAnchor={selectedBox.x2 + 90 > right ? 'end' : 'start'}>WORST CASE{selectedBox.clipped ? ' (OFF SCALE)' : ''}</text>
        </g>}
        {points.map(({ c, x, y }) => {
          const isSelected = c.id === selected?.id, state = status(c);
          return <g key={c.id} transform={`translate(${x} ${y})`} className={`sample status-${state} ${isSelected ? 'selected' : ''}`}
            role="button" tabIndex={0} aria-pressed={isSelected} aria-label={candidateLabel(c) + ', ' + STATUS_TEXT[state].toLowerCase()}
            onPointerDown={event => { begin(event, 'candidate', 0); if (event.button === 0) select(c.id); }}
            onKeyDown={event => {
              if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); select(c.id); }
              if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                event.preventDefault();
                const series = points.filter(p => p.c.modelId === c.modelId).sort((a, b) => a.c.threshold - b.c.threshold);
                const next = series[series.findIndex(p => p.c.id === c.id) + (event.key === 'ArrowRight' ? 1 : -1)];
                if (next) { select(next.c.id); svg.current?.querySelector<SVGElement>(`[data-point="${CSS.escape(next.c.id)}"]`)?.focus(); }
              }
            }} data-point={c.id} data-status={state}>
            <title>{candidateLabel(c)} · {STATUS_TEXT[state]} · {percent(c.recall)} recall · {percent(c.falsePositiveRate)} false positives</title>
            <circle r={12} fill="transparent" />
            {isSelected && <><circle r={11} className="crosshair" /><path className="crosshair" d="M-17 0h5m24 0h5M0-17v5m0 24v5" /></>}
            {state === 'estimate-only' && <circle r={8} className="doubt-ring" />}
            {envelope.feasibleParetoIds.has(c.id) ? <path className="point-mark" d="M0-6 6 0 0 6-6 0Z" /> : <circle r="4.5" className="point-mark" />}
          </g>;
        })}
        {handle('minRecall', right - 15, recallLine, 'Recall boundary', mission.minRecall, 90)}
        {mission.maxFalsePositiveRate !== undefined && handle('maxFalsePositiveRate', fprLine, bottom - 14, 'False-positive boundary', fpr)}
        {prior > 0 && prior < 1 && handle('minPrecision', precisionHandleX, precisionHandleY, 'Precision boundary', mission.minPrecision)}
      </svg>
    </div>
    <div className="map-caption">
      <div className="legend">
        <span><i className="legend-area" />Quality limits</span>
        <span><i className="legend-dot status-robust" />Robust</span>
        <span><i className="legend-dot status-estimate-only" />Estimate only</span>
        <span><i className="legend-dot status-uncertain" />Could pass</span>
        <span><i className="legend-dot status-infeasible" />Fails</span>
        <span><i className="legend-dot status-unknown" />No evidence</span>
      </div>
      <div className="map-toggles">
        <label><input type="checkbox" checked={allRanges} onChange={event => setAllRanges(event.target.checked)} /> All ranges</label>
        <label><input type="checkbox" checked={passingOnly} onChange={event => setPassingOnly(event.target.checked)} /> Passing only</label>
      </div>
    </div>
    <p className="map-hint">The box around the selected point shows where its true recall and false-positive rate plausibly lie
      ({percent(envelope.statistics.confidence, 0)} simultaneous). A point is robustly feasible only when its whole box, including the
      worst-case corner, stays inside the shaded region and every other limit is met. Diamonds mark the Pareto front among estimate passes.</p>
    {!visibleSelection && selected && <p className="instrument-note">The selected point is outside this view. Its mission check remains active.</p>}
  </div>;
}
