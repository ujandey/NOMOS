import { useId, useMemo, useState } from 'react';
import { MoveVertical } from 'lucide-react';
import type { Candidate } from '../core/contracts';
import { capacityReading, prevalenceReading, RATE_STABILITY, SECONDS_BASE, STEADY_STATE, THROUGHPUT_BASE } from '../core/deployment';
import { AXES, BOTTOM, logFromY, logToY, logistic, logit, PRICE_BASE, reciprocalFromY, reciprocalToY, REQUEST_BASE, TOP, TOTAL_BASE, type Calibration, type LogOddsPlate } from '../core/geometry';
import { instrumentReading, type InstrumentDomain } from '../core/instruments';
import { dollars, percent } from '../core/display';
import { AlignmentNomogram, type Scale } from './AlignmentNomogram';
import { NumberField } from './NumberField';
import { CalculationProof } from './Evidence';

export type Plate = 'prevalence' | 'f1' | 'cost' | 'capacity';
const pocketAxes = { left: 72, center: 200, right: 328 };
const maxRequests = 1e12;
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 });
const numeric = (v: number) => v !== 0 && (v < 0.001 || v >= 1e12) ? v.toExponential(2) : Number(v.toPrecision(5)).toLocaleString('en-US');
const share = (v: number) => v > 0 && v < 0.001 ? (v * 100).toPrecision(2) + '%' : percent(v, v * 100 % 1 ? 1 : 0);
const probability = (v: number | null) => {
  if (v !== null && v > 0 && v < 0.00005) return (v * 100).toExponential(2) + '%';
  if (v !== null && v < 1 && v > 0.99995) return '≈100%';
  return percent(v, 2);
};
const examples = { p: 0.8, r: 0.9, n: 1e6, c: 0.003, rate: 100, mean: 80 };
const powers = (low: number, high: number) => Array.from({ length: high - low + 1 }, (_, i) => 10 ** (low + i));

function scale(label: string, values: number[], toY: Scale['toY'], fromY: Scale['fromY'], format: Scale['format'], formatInput = format): Scale {
  const sorted = values.map(v => ({ v, y: toY(v) })).filter(tick => tick.y >= TOP - 1e-7 && tick.y <= BOTTOM + 1e-7).sort((a, b) => a.y - b.y);
  const ticks: number[] = [];
  let last = -Infinity;
  for (const { v, y } of sorted) {
    if (y - last >= 16) { ticks.push(v); last = y; }
  }
  return { label, ticks, toY, fromY, format, formatInput };
}

function logScale(label: string, base: number, cal: Calibration, format: Scale['format'], min = -12, max = 14) {
  return scale(label, powers(min, max), v => logToY(v, base, cal), y => logFromY(y, base, cal), format, numeric);
}

function makeScales(kind: Plate, cal: Calibration, odds: LogOddsPlate, practice: boolean): [Scale, Scale, Scale] {
  if (kind === 'prevalence') {
    const toY = (c: Calibration, transform: (value: number) => number) => (v: number) => c.top + c.k * transform(v);
    const fromY = (c: Calibration, invert: (value: number) => number) => (y: number) => invert((y - c.top) / c.k);
    const probabilities = [0.000001, 0.0001, 0.001, 0.003, 0.01, 0.03, 0.05, 0.1, 0.2, 0.35, 0.5, 0.65, 0.8, 0.9, 0.95, 0.99, 0.999, 0.9999];
    return [scale('FRAUD PREVALENCE', probabilities, toY(odds.prior, logit), fromY(odds.prior, logistic), share, v => percent(v, 2)),
      scale('EXPECTED PRECISION', probabilities, toY(odds.result, logit), fromY(odds.result, logistic), share),
      scale('LIKELIHOOD RATIO', powers(-12, 20), toY(odds.ratio, Math.log), fromY(odds.ratio, Math.exp), numeric)];
  }
  if (kind === 'f1') return [practice ? 'PRECISION' : 'EXPECTED PRECISION', practice ? 'F1 SCORE' : 'EXPECTED F1', 'RECALL'].map(label =>
    scale(label, [1, 0.95, 0.9, 0.8, 0.7, 0.6, 0.5, 0.3, 0.2, ...powers(-14, -1)],
      v => reciprocalToY(v, cal), y => reciprocalFromY(y, cal), share, v => percent(v, 2))) as [Scale, Scale, Scale];
  const middle = { ...cal, k: cal.k / 2 };
  return kind === 'cost'
    ? [logScale('REQUESTS / DAY', REQUEST_BASE, cal, compact.format, 0, 12),
      logScale('USD / DAY', TOTAL_BASE, middle, dollars), logScale('USD / REQUEST', PRICE_BASE, cal, dollars)]
    : [logScale('REQUESTS / SEC', THROUGHPUT_BASE, cal, compact.format),
      logScale('REQUESTS IN SYSTEM', THROUGHPUT_BASE * SECONDS_BASE, middle, compact.format),
      scale('MEAN RESPONSE', powers(-5, 8), v => logToY(v, SECONDS_BASE * 1000, cal),
        y => logFromY(y, SECONDS_BASE * 1000, cal), v => numeric(v) + ' ms')];
}

function useScales(kind: Plate, top: number, k: number, priorTop: number, priorK: number, ratioTop: number, practice: boolean) {
  return useMemo(() => makeScales(kind, { top, k }, {
    prior: { top: priorTop, k: priorK }, ratio: { top: ratioTop, k: priorK },
    result: { top: (priorTop + ratioTop) / 2, k: priorK / 2 },
  }, practice), [kind, k, top, priorK, priorTop, ratioTop, practice]);
}

export function InstrumentPanel({ kind, candidate, prior, setPrior, requests, setRequests, pocket, onEvidence }: {
  kind: Plate; candidate: Candidate | null; prior: number; setPrior: (v: number) => void; requests: number;
  setRequests: (v: number) => void; pocket: boolean; onEvidence: () => void;
}) {
  const [practice, setPractice] = useState(false);
  const outputId = useId();
  const [free, setFree] = useState(examples);
  const [held, setHeld] = useState<{ domain?: InstrumentDomain; odds?: LogOddsPlate; capacity?: Calibration } | null>(null);
  const axes = pocket ? pocketAxes : AXES;
  const odds = prevalenceReading(prior, candidate?.recall ?? null, candidate?.falsePositiveRate ?? null, held?.odds, true, axes);
  const price = candidate?.costPer1kUsd == null ? null : candidate.costPer1kUsd / 1000;
  const f1 = instrumentReading('f1', practice ? free.p : odds.value, practice ? free.r : candidate?.recall ?? null, true, axes, kind === 'f1' ? held?.domain : undefined);
  const cost = instrumentReading('cost', practice && kind === 'cost' ? free.n : requests, practice && kind === 'cost' ? free.c : price, true, axes, kind === 'cost' ? held?.domain : undefined);
  const performance = candidate?.performance;
  const capacity = capacityReading(practice ? free.rate : performance?.requestsPerSecond ?? null,
    practice ? free.mean : performance?.meanResponseMs ?? null, true, axes, held?.capacity);
  const reading = kind === 'prevalence' ? odds : kind === 'f1' ? f1 : kind === 'cost' ? cost : capacity;
  const alignment = reading.alignment;
  const cal = kind === 'f1' ? f1.calibration : kind === 'cost' ? cost.calibration : capacity.calibration;
  const { top, k } = cal;
  const { top: priorTop, k: priorK } = odds.plate.prior;
  const ratioTop = odds.plate.ratio.top;
  const scales = useScales(kind, top, k, priorTop, priorK, ratioTop, practice);

  const left = kind === 'prevalence' ? prior : kind === 'f1' ? (practice ? free.p : odds.value)
    : kind === 'cost' ? (practice ? free.n : requests) : practice ? free.rate : performance?.requestsPerSecond ?? null;
  const right = kind === 'prevalence' ? odds.ratio : kind === 'f1' ? (practice ? free.r : candidate?.recall ?? null)
    : kind === 'cost' ? (practice ? free.c : price) : practice ? free.mean : performance?.meanResponseMs ?? null;
  const max: [number, number] = kind === 'prevalence' || kind === 'f1' ? [1, 1] : kind === 'cost' ? [maxRequests, 1000] : [1e9, 1e6];
  const movable: [boolean, boolean] = [kind === 'prevalence' || kind === 'cost' || practice, kind !== 'prevalence' && practice];
  const out = kind === 'cost' ? dollars(reading.value) : kind === 'capacity' ? (reading.value === null ? 'Unknown' : numeric(reading.value))
    : probability(reading.value);
  const leftField = ['prevalence', 'f1'].includes(kind);
  const rightField = kind === 'f1';
  const equation = { prevalence: 'logit(P) = logit(π) + ln(LR⁺)', f1: '1/F₁ = ½ (1/P + 1/R)', cost: 'log(C) = log(N) + log(c)', capacity: 'L = λW' }[kind];
  const titles = { prevalence: 'Prevalence & precision', f1: 'F1 alignment', cost: 'Inference economics', capacity: 'Throughput & occupancy' };

  function update(side: 0 | 1, value: number) {
    const bounded = Math.min(max[side], Math.max(0, value));
    if (kind === 'prevalence') setPrior(bounded);
    else if (kind === 'cost' && side === 0 && !practice) setRequests(Math.round(bounded));
    else {
      const key = kind === 'f1' ? side ? 'r' : 'p' : kind === 'cost' ? side ? 'c' : 'n' : side ? 'mean' : 'rate';
      setFree(current => ({ ...current, [key]: key === 'n' ? Math.round(bounded) : bounded }));
    }
  }

  const leftLabel = { prevalence: 'Target prevalence', f1: 'Precision input', cost: 'Requests per day', capacity: 'Throughput' }[kind];
  const rightLabel = { prevalence: 'Likelihood ratio', f1: 'Recall input', cost: 'Unit price', capacity: 'Mean response time' }[kind];
  const outputLabel = { prevalence: 'Expected precision', f1: practice ? 'F1 score' : 'Expected F1', cost: 'Daily inference cost', capacity: 'Average requests in system' }[kind];
  const rightDisplay = kind === 'prevalence' && odds.ratioState === 'unbounded' ? '∞' :
    kind === 'prevalence' && odds.ratioState === 'overflow' ? 'Beyond numeric range' :
    right === null ? 'Unknown' : rightField ? percent(right) : kind === 'cost' ? dollars(right) : numeric(right) + (kind === 'capacity' ? ' ms' : '×');

  return <section className="alignment-panel" aria-label={titles[kind]}>
    <div className="plate-toolbar">
      <span className="equation">{equation}</span>
      {kind === 'prevalence' ? <div className="segmented" aria-label="Prevalence presets">
        {[0.1, 0.01].map(p => <button key={p} aria-pressed={prior === p} onClick={() => setPrior(p)}>{percent(p, 0)} prevalence</button>)}
      </div> : <button className="button quiet" aria-pressed={practice} onClick={() => { setPractice(!practice); setHeld(null); }}>
        {practice ? 'Return to evaluated inputs' : 'Use practice inputs'}
      </button>}
    </div>
    <div className="alignment-paper">
      <div className="readout-grid">
        {movable[0] ? <NumberField label={leftLabel} value={left === null ? null : Number((left * (leftField ? 100 : 1)).toPrecision(9))}
          onChange={v => update(0, leftField ? v / 100 : v)} min={0} max={max[0] * (leftField ? 100 : 1)}
          step={kind === 'cost' ? 1 : 'any'} unit={leftField ? '%' : kind === 'capacity' ? 'req/s' : undefined} />
          : <div className="static-input"><span>{leftLabel}</span><strong>{left === null ? 'Unknown' : leftField ? percent(left) : numeric(left) + ' req/s'}</strong></div>}
        <div className="geometry-output"><label htmlFor={outputId}>{outputLabel}</label>
          <output id={outputId} data-testid={kind + '-geometry-value'} data-value={reading.value ?? ''} aria-live={held ? 'off' : 'polite'}>{out}</output></div>
        {movable[1] ? <NumberField label={rightLabel} value={right === null ? null : Number((right * (rightField ? 100 : 1)).toPrecision(9))}
          onChange={v => update(1, rightField ? v / 100 : v)} min={0} max={max[1] * (rightField ? 100 : 1)}
          step="any" unit={rightField ? '%' : kind === 'cost' ? 'USD' : 'ms'} />
          : <div className="static-input"><span>{rightLabel}</span><strong>{rightDisplay}</strong></div>}
      </div>
      <AlignmentNomogram width={pocket ? 400 : 760} axes={axes} scales={scales} inputs={[left, right]} alignment={alignment}
        markerY={kind === 'prevalence' ? [prior === 1 ? TOP - 13 : prior === 0 ? BOTTOM + 14 : null,
          odds.ratioState === 'unbounded' ? TOP - 13 : odds.alignment?.right.y ?? null] : undefined}
        zeroAtTop={kind === 'cost' || kind === 'capacity'} title={titles[kind] + ' nomogram'} inputMaximums={max} movable={movable}
        setInput={update} onGrab={() => setHeld({ domain: kind === 'f1' ? f1 : kind === 'cost' ? cost : undefined,
          odds: kind === 'prevalence' ? odds.plate : undefined, capacity: kind === 'capacity' ? capacity.calibration : undefined })}
        onRelease={() => setHeld(null)}
        stepInput={(side, v, direction) => leftField && (side === 0 || rightField) ? v + direction * 0.001
          : v === 0 ? direction > 0 ? scales[side * 2].fromY(TOP) : 0 : v * 10 ** (direction * 0.05)} />
    </div>
    <div className="instrument-notes">
      {reading.state === 'invalid' && <p role="alert">The result lies outside the representable numeric range. Enter a smaller positive range.</p>}
      {reading.state === 'no-alerts' && <p>Expected precision is undefined because this population has zero expected alerts.</p>}
      {reading.state === 'boundary' && <p>Exact probability boundary. The log-odds straightedge has no finite crossing here.</p>}
      {kind === 'prevalence' && reading.state === 'aligned' && (reading.value === 0 || reading.value === 1) &&
        <p>The finite crossing rounds to a probability endpoint at floating-point precision.</p>}
      {reading.state === 'zero' && <p>Zero boundary. The reading uses an explicit zero convention outside the finite scale.</p>}
      {reading.state === 'missing' && <p>Required inputs are unknown. {kind === 'capacity' ? 'Use practice inputs to operate the plate.' : 'Select a point with evaluation evidence.'}</p>}
      {kind === 'prevalence' && <p><MoveVertical size={16} /> Drag the prevalence handle. {RATE_STABILITY}</p>}
      {kind === 'f1' && <p>{practice ? 'Practice inputs are independent and have no evaluated model attached.' : 'Expected precision feeds this plate from the log-odds instrument. Recall comes from the evaluated point.'}</p>}
      {kind === 'cost' && <p>{practice ? 'Practice volume and price are assumptions. The mission retains its linked inputs.' :
        (candidate?.metricProvenance.cost === 'measured' ? 'Unit price comes from the measured evaluation. ' : 'Unit price is an evaluation assumption. ') + 'Changing daily volume also updates the budget gate.'}</p>}
      {kind === 'capacity' && <p>{STEADY_STATE} Mean response time and P95 are distinct. Maximum sustainable capacity is unknown.{practice ? ' These inputs are illustrative.' : performance ? ' ' + performance.method : ''}</p>}
      {practice ? <details><summary>Verify practice calculation</summary>
        <CalculationProof title={outputLabel} formula={equation} reading={reading} /></details>
        : candidate && <button className="text-link" onClick={onEvidence}>Inspect linked calculation evidence</button>}
    </div>
  </section>;
}
