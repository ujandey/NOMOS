import { useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ChevronDown, RotateCcw } from 'lucide-react';
import { dollars, percent } from '../core/display';
import { AXES, logFromY, logToY, PRICE_BASE, reciprocalFromY, reciprocalToY, REQUEST_BASE, TOP, TOTAL_BASE } from '../core/geometry';
import { instrumentReading, type Instrument, type InstrumentDomain } from '../core/instruments';
import { AlignmentNomogram, type Scale } from './AlignmentNomogram';
import { NumberField } from './NumberField';

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 });
const whole = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const standardTicks = [1, 0.9, 0.8, 0.7, 0.6, 0.5];
const MAX_REQUESTS = 1e12;
const MAX_PRICE = 1000;
const MIN_POSITIVE = 1e-12;
const EXAMPLE = { p: 0.8, r: 0.9, n: 1_000_000, c: 0.003 };
const POCKET_AXES = { left: 57, center: 180, right: 303 };
const pocketQuery = '(max-width: 640px)';
const pocketSnapshot = () => window.matchMedia(pocketQuery).matches;
function subscribePocket(listener: () => void) {
  const query = window.matchMedia(pocketQuery);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}

const signed = (value: number) => (value >= 0 ? '+' : '−') + Math.abs(value).toFixed(2);
const axisMoney = (value: number) => '$' + (value === 0 ? '0' : value >= 0.01 && value < 1e15 ? compact.format(value) : value.toExponential(0));
function scaleLabel(value: number) {
  if (value > 0 && value < 0.01) return (100 * value).toPrecision(1) + '%';
  return percent(value, 0);
}

function calibratedScales(isF1: boolean, top: number, k: number, minimum: number, minLog: number, maxLog: number): [Scale, Scale, Scale] {
  const cal = { top, k };
  function reciprocalScale(label: string): Scale {
    const values = [...standardTicks, ...Array.from({ length: 12 }, (_, index) => 10 ** -(index + 1))].filter(v => v >= minimum);
    const ticks = values.filter((v, i) => i === 0 || v === minimum || reciprocalToY(v, cal) - reciprocalToY(values[i - 1], cal) >= 14);
    return { label, ticks, toY: v => reciprocalToY(v, cal), fromY: y => reciprocalFromY(y, cal),
      minor: minimum === 0.5 ? [0.55, 0.65, 0.75, 0.85, 0.95] : [], format: scaleLabel, formatInput: v => percent(v, 2) };
  }
  function logarithmicScale(label: string, reference: number, format: Scale['format'], formatInput: Scale['format'], center = false): Scale {
    const mapped = center ? { ...cal, k: k / 2 } : cal;
    const stride = Math.ceil((maxLog - minLog) / 10);
    const powers = Array.from({ length: maxLog - minLog + 1 }, (_, i) => minLog + i);
    const ticks = powers.filter((_, i) => i % stride === 0 || i === powers.length - 1 && i % stride >= stride / 2)
      .map(power => reference * 10 ** (power * (center ? 2 : 1)))
      .filter(value => reference !== REQUEST_BASE || value >= 1);
    return { label, ticks, format, formatInput, toY: v => logToY(v, reference, mapped), fromY: y => logFromY(y, reference, mapped) };
  }
  return isF1
    ? [reciprocalScale('PRECISION'), reciprocalScale('F1 SCORE'), reciprocalScale('RECALL')]
    : [logarithmicScale('REQUESTS', REQUEST_BASE, v => v < 1 ? v.toExponential(0) : compact.format(v), v => whole.format(v)),
      logarithmicScale('MONTHLY USD', TOTAL_BASE, axisMoney, dollars, true),
      logarithmicScale('USD / REQUEST', PRICE_BASE, v => v && v < 0.001 ? '$' + v.toExponential(0) : '$' + Number(v.toPrecision(2)), v => '$' + Number(v.toPrecision(7)))];
}

function useCalibratedScales(isF1: boolean, top: number, k: number, minimum: number, minLog: number, maxLog: number) {
  return useMemo(() => calibratedScales(isF1, top, k, minimum, minLog, maxLog), [isF1, top, k, minimum, minLog, maxLog]);
}

type Props = {
  precision: number | null; recall: number | null; perRequest: number | null; requests: number; setRequests: (value: number) => void;
  freeMode: boolean; setFreeMode: (value: boolean) => void; selectionChanged: string; hasCandidate: boolean;
};

export function InstrumentPanel({ precision, recall, perRequest, requests, setRequests, freeMode, setFreeMode, selectionChanged, hasCandidate }: Props) {
  const [kind, setKind] = useState<Instrument>('f1');
  const [check, setCheck] = useState(false);
  const [free, setFree] = useState(EXAMPLE);
  const [before, setBefore] = useState<{ left: number | null; right: number | null; value: number | null } | null>(null);
  const [fixedDomain, setFixedDomain] = useState<InstrumentDomain>();
  const panel = useRef<HTMLElement>(null);
  const isPocket = useSyncExternalStore(subscribePocket, pocketSnapshot);
  const axes = isPocket ? POCKET_AXES : AXES;
  const isF1 = kind === 'f1';
  const left = isF1 ? (freeMode ? free.p : precision) : (freeMode ? free.n : requests);
  const right = isF1 ? (freeMode ? free.r : recall) : (freeMode ? free.c : perRequest);
  const reading = instrumentReading(kind, left, right, true, axes, fixedDomain);
  const { alignment, value, verification, state, minimum, minLog, maxLog } = reading;
  const { top, k } = reading.calibration;
  const readout = isF1
    ? value !== null && value > 0 && value < 0.00005 ? (100 * value).toExponential(2) + '%' : percent(value, 2)
    : dollars(value);
  const scales = useCalibratedScales(isF1, top, k, minimum, minLog, maxLog);

  function update(side: 0 | 1, next: number) {
    if (!fixedDomain) setBefore({ left, right, value });
    if (isF1) {
      const adjusted = Math.max(0, Math.min(1, next));
      setFree(previous => ({ ...previous, [side === 0 ? 'p' : 'r']: adjusted }));
    } else if (side === 0) {
      const count = next === 0 ? 0 : Math.min(MAX_REQUESTS, Math.max(1, Math.round(next)));
      if (freeMode) setFree(previous => ({ ...previous, n: count }));
      else setRequests(count);
    } else {
      const price = next === 0 ? 0 : Math.min(MAX_PRICE, Math.max(MIN_POSITIVE, next));
      setFree(previous => ({ ...previous, c: price }));
    }
  }

  function chooseMode(next: boolean) {
    setFixedDomain(undefined);
    setBefore(null);
    setFreeMode(next);
  }

  function switchMode(next: boolean, keyboard: boolean) {
    chooseMode(next);
    if (keyboard) requestAnimationFrame(() => {
      panel.current?.querySelector<SVGElement | HTMLButtonElement>(next ? '.alignment-chart [role=slider]' : '.try-button')
        ?.focus({ preventScroll: true });
    });
  }

  function chooseInstrument(next: Instrument) {
    if (kind === next) return;
    setFixedDomain(undefined);
    setBefore(null);
    setKind(next);
  }

  let delta = !freeMode && isF1 ? selectionChanged : '';
  if (before && !fixedDomain && value !== null && before.value !== null && (left !== before.left || right !== before.right)) {
    const adjustments = isF1 && left !== null && right !== null && before.left !== null && before.right !== null
      ? [left === before.left ? '' : 'Precision ' + signed((left - before.left) * 100) + ' pp',
        right === before.right ? '' : 'recall ' + signed((right - before.right) * 100) + ' pp',
        'F1 ' + signed((value - before.value) * 100) + ' pp'].filter(Boolean).join(' · ')
      : 'Monthly cost moved from ' + dollars(before.value) + ' to ' + dollars(value) + '.';
    delta = adjustments;
  }

  return <section ref={panel} className="instrument" id="instrument" aria-labelledby="instrument-title">
    <div className="instrument-top">
      <div className="equation-switch" role="group" aria-label="Equation">
        <button aria-pressed={isF1} onClick={() => chooseInstrument('f1')}>F1 score</button>
        <button aria-pressed={!isF1} onClick={() => chooseInstrument('cost')}>Inference cost</button>
      </div>
      {freeMode && hasCandidate
        ? <button className="text-button mode-label" onClick={event => switchMode(false, event.detail === 0)}>Use model inputs</button>
        : <span className="mode-label">{freeMode ? 'Practice mode' : 'Using model inputs'}</span>}
    </div>
    <div className="instrument-heading">
      <div>
        <h2 id="instrument-title">{isF1 ? 'Balance precision and recall' : 'Estimate monthly inference cost'}</h2>
        <p>{freeMode ? 'Drag an outer handle. Read the answer where the line crosses the middle scale.'
          : isF1 ? 'Change the threshold to move both markers. The center crossing reads F1.'
          : 'Drag the requests handle. The unit price follows the selected model.'}</p>
      </div>
      {freeMode
        ? <button className="outline-button reset-example" onClick={() => { setFree(EXAMPLE); setBefore(null); setFixedDomain(undefined); }}><RotateCcw size={14} /> Reset example</button>
        : <button className="outline-button try-button" onClick={event => switchMode(true, event.detail === 0)}>Try the straightedge</button>}
    </div>
    <div className="chart-paper">
      <div className="readout-grid">
        <NumberField key={'left-' + kind + freeMode} label={isF1 ? 'Precision input' : 'Monthly requests'} min={0} max={isF1 ? 100 : MAX_REQUESTS}
          step={isF1 ? 'any' : 1} positiveMin={isF1 ? MIN_POSITIVE * 100 : undefined}
          value={left === null ? null : isF1 ? Number((left * 100).toPrecision(freeMode ? 8 : 4)) : left}
          unit={isF1 ? '%' : undefined} onChange={freeMode || !isF1 ? next => update(0, isF1 ? next / 100 : next) : undefined} />
        <div className="geometry-output"><span>{isF1 ? 'F1 at the crossing' : 'Monthly cost at the crossing'}</span>
          <output data-testid="geometry-value" data-value={value ?? ''} aria-live={fixedDomain ? 'off' : 'polite'}>{readout}</output></div>
        <NumberField key={'right-' + kind + freeMode} label={isF1 ? 'Recall input' : 'Unit price (USD)'} min={0} max={isF1 ? 100 : MAX_PRICE}
          step="any" positiveMin={isF1 ? MIN_POSITIVE * 100 : MIN_POSITIVE}
          value={right === null ? null : Number((isF1 ? right * 100 : right).toPrecision(freeMode || !isF1 ? 8 : 4))}
          unit={isF1 ? '%' : 'USD'} onChange={freeMode ? next => update(1, isF1 ? next / 100 : next) : undefined} />
      </div>
      <AlignmentNomogram key={kind + String(freeMode)} width={isPocket ? 360 : 760} axes={axes} scales={scales} inputs={[left, right]} alignment={alignment}
        zeroAtTop={!isF1}
        title={isF1 ? 'Reciprocal F1 nomogram' : 'Logarithmic inference cost nomogram'}
        inputMaximums={isF1 ? [1, 1] : [MAX_REQUESTS, MAX_PRICE]} movable={[freeMode || !isF1, freeMode]}
        setInput={update} onGrab={() => { setBefore({ left, right, value }); setFixedDomain({ calibration: { top, k }, minimum, minLog, maxLog }); }}
        onRelease={() => setFixedDomain(undefined)}
        stepInput={(side, v, direction) => isF1 ? Number((v + direction * 0.01).toFixed(12))
          : v === 0 ? (direction > 0 ? scales[side * 2].fromY(TOP) : 0)
            : side === 0 ? Math.max(1, Math.round(v * 10 ** (direction * 0.05))) : v * 10 ** (direction * 0.05)} />
      <div className="plate-footer">
        <span>{freeMode ? 'Practice values' : 'Evaluated model inputs'}</span>
        <span>{isF1 ? 'Reciprocal scales' : 'Logarithmic scales'}</span>
      </div>
    </div>
    <div className="reading-note" aria-live="polite">
      {state === 'zero' ? 'Zero boundary. The scale has no finite coordinate at zero.'
        : state === 'missing' ? 'A required input is unknown. No intersection is available.'
        : fixedDomain ? 'Scale held in place while you drag.'
        : delta || (freeMode ? 'Use the handles, arrow keys, or enter an exact input.' : isF1
          ? 'Precision measures how often a fraud flag is right. Recall measures how much fraud is caught.'
          : 'Monthly volume changes the forecast. The mission uses cost per 1,000 requests.')}
    </div>
    <details className="proof">
      <summary>Why the line computes <ChevronDown size={16} /></summary>
      <p>A nomogram is a historical graphical calculator. Align two known values with a straightedge and read the result on the middle scale.</p>
      <p>{isF1 ? 'The outer scales encode reciprocals. The crossing averages their coordinates, and the inverse reads F1, a single score that balances precision and recall.'
        : 'The outer scales encode logarithms. Halving the middle scale’s slope converts the coordinate average into the sum of the two logarithms.'}</p>
      <p className="mono">{isF1 ? 'y(v) = top + K(1/v − 1) · 1/F1 = (1/P + 1/R)/2'
        : 'y = y₀ + K log₁₀(v / v₀) · center: K/2, v₀ = $1,000'}</p>
      <p className="mono">top = {top.toPrecision(7)}, K = {k.toPrecision(7)}{!isF1 && ', N₀ = 1,000,000, c₀ = $0.001'}</p>
      {alignment && <p className="mono" data-testid="intersection-proof">y(left) = {alignment.left.y.toFixed(8)} · y(right) = {alignment.right.y.toFixed(8)} · crossing ({alignment.intersection.x}, {alignment.intersection.y.toFixed(8)}) · inverse = {value?.toPrecision(12)}</p>}
      <label className="verification-toggle"><input type="checkbox" checked={check} onChange={event => setCheck(event.target.checked)} /> Numerical check</label>
      {check && <p role="status" data-testid="verification">{verification
        ? (verification.passes ? 'Within tolerance' : 'Outside tolerance') + ' · Reference ' + verification.referenceValue.toPrecision(12) +
          ' · Absolute error ' + verification.absoluteError.toExponential(2) + (isF1 ? '' : ' · Relative error ' + verification.error.toExponential(2)) +
          ' · ' + verification.criterion + ' tolerance ' + verification.tolerance.toExponential()
        : 'Numerical comparison requires a finite straightedge crossing.'}</p>}
    </details>
  </section>;
}
