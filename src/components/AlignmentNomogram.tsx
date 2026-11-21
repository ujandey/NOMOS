import { memo, useEffect, useId, useRef, useState, type PointerEvent } from 'react';
import { BOTTOM, TOP, type Alignment, type Axes } from '../core/geometry';

export type Scale = {
  label: string;
  ticks: number[];
  minor?: number[];
  toY: (value: number) => number;
  fromY: (y: number) => number;
  format: (value: number) => string;
  formatInput?: (value: number) => string;
};
type Side = 0 | 1;
type Props = {
  axes: Axes;
  width: number;
  scales: [Scale, Scale, Scale];
  inputs: [number | null, number | null];
  alignment: Alignment | null;
  zeroAtTop: boolean;
  movable: [boolean, boolean];
  setInput: (side: Side, value: number) => void;
  stepInput: (side: Side, value: number, direction: number) => number;
  inputMaximums: [number, number];
  onGrab: () => void;
  onRelease: () => void;
  title: string;
};

const ScalePlate = memo(function ScalePlate({ axes, scales, labels = false }: Pick<Props, 'axes' | 'scales'> & { labels?: boolean }) {
  return scales.map((scale, index) => {
    const x = [axes.left, axes.center, axes.right][index];
    const center = index === 1;
    return <g key={scale.label} className={center ? 'result-axis' : 'input-axis'}>
      {labels ? <text className="scale-title" x={x} y="21" textAnchor="middle">{scale.label}</text> : <>
        {center && <rect x={x - 10} y={TOP - 9} width="20" height={BOTTOM - TOP + 18} className="center-band" />}
        <line className="axis-line" x1={x} x2={x} y1={TOP} y2={BOTTOM} />
        {scale.minor?.map(value => <line key={value} className="minor-tick" x1={x - 3} x2={x + 3} y1={scale.toY(value)} y2={scale.toY(value)} />)}
      </>}
      {scale.ticks.map(value => {
        const y = scale.toY(value);
        return labels
          ? <text key={value} className="axis-label" data-tick-value={value} x={x + (index === 0 ? -10 : 10)} y={y}
            dominantBaseline="central" textAnchor={index === 0 ? 'end' : 'start'}>{scale.format(value)}</text>
          : <line key={value} className="major-tick" x1={x - 6} x2={x + 6} y1={y} y2={y} />;
      })}
    </g>;
  });
});

type Drag = {
  side: Side;
  id: number;
  offset: number;
  start: number;
  startValue: number;
  appliedY: number;
  fromY: Scale['fromY'];
  pendingY: number | null;
  frame: number | null;
};

export function AlignmentNomogram({ axes, width, scales, inputs, alignment, zeroAtTop, movable, setInput, stepInput, inputMaximums, onGrab, onRelease, title }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const [active, setActive] = useState<Side | null>(null);
  const description = useId();
  useEffect(() => () => {
    const frame = drag.current?.frame;
    if (frame != null) cancelAnimationFrame(frame);
  }, []);

  function modelY(event: PointerEvent) {
    const matrix = svg.current?.getScreenCTM();
    return matrix ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()).y : null;
  }

  function applyPosition(current: Drag, pointerY: number) {
    const y = pointerY - current.offset;
    // Preserve the exact initial value on a click or a horizontal movement.
    if (Math.abs(y - current.appliedY) < 1e-7) return;
    current.appliedY = y;
    const value = Math.abs(y - current.start) < 1e-7 ? current.startValue
      : current.fromY(Math.min(BOTTOM, Math.max(TOP, y)));
    setInput(current.side, value);
  }

  function move(event: PointerEvent) {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    const y = modelY(event);
    if (y === null) return;
    current.pendingY = y;
    if (current.frame === null) current.frame = requestAnimationFrame(() => {
      current.frame = null;
      if (current.pendingY !== null) applyPosition(current, current.pendingY);
    });
  }

  function finish(event: PointerEvent, commit: boolean) {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    drag.current = null;
    if (current.frame !== null) cancelAnimationFrame(current.frame);
    const y = commit ? modelY(event) : current.pendingY;
    if (y !== null) applyPosition(current, y);
    setActive(null);
    onRelease();
  }

  return <svg ref={svg} className="alignment-chart" viewBox={'0 0 ' + width + ' 282'} aria-label={title} aria-describedby={description}>
    <title>{title}</title>
    <desc id={description}>Read the output where the straightedge crosses the middle scale. Movable outer handles support dragging and arrow keys.</desc>
    <ScalePlate axes={axes} scales={scales} />
    {alignment && <g pointerEvents="none" data-testid="straightedge">
      <line className="straightedge-shadow" x1={alignment.left.x} y1={alignment.left.y} x2={alignment.right.x} y2={alignment.right.y} />
      <line className="straightedge" x1={alignment.left.x} y1={alignment.left.y} x2={alignment.right.x} y2={alignment.right.y} />
      <circle className="crossing-halo" cx={alignment.intersection.x} cy={alignment.intersection.y} r="11" />
      <circle className="crossing" data-testid="intersection" cx={alignment.intersection.x} cy={alignment.intersection.y} r="5" />
    </g>}
    <ScalePlate axes={axes} scales={scales} labels />
    {([0, 1] as const).map(side => {
      const value = inputs[side];
      const scale = scales[side * 2];
      const x = side ? axes.right : axes.left;
      const y = value !== null && value > 0 ? scale.toY(value) : zeroAtTop ? TOP - 13 : BOTTOM + 14;
      const enabled = movable[side] && value !== null;
      const label = value === null ? 'Unknown' : (scale.formatInput ?? scale.format)(value);
      if (!enabled && (value === null || value === 0)) return null;
      return <g key={side} className={'marker' + (enabled ? ' draggable' : '')} data-active={active === side || undefined}
        data-testid={side ? 'right-marker' : 'left-marker'}
        role={enabled ? 'slider' : undefined} tabIndex={enabled ? 0 : undefined}
        aria-label={enabled ? scale.label + ' marker' : undefined} aria-orientation={enabled ? 'vertical' : undefined}
        aria-valuemin={enabled ? 0 : undefined} aria-valuemax={enabled ? inputMaximums[side] : undefined}
        aria-valuenow={enabled ? value : undefined} aria-valuetext={enabled ? label : undefined}
        onPointerDown={event => {
          if (!enabled || event.button !== 0 || drag.current) return;
          const pointerY = modelY(event);
          if (pointerY === null) return;
          event.preventDefault();
          event.currentTarget.focus({ preventScroll: true });
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { side, id: event.pointerId, offset: pointerY - y, start: y, startValue: value,
            appliedY: y, fromY: scale.fromY, pendingY: null, frame: null };
          setActive(side);
          onGrab();
        }}
        onPointerMove={move}
        onPointerUp={event => finish(event, true)}
        onPointerCancel={event => finish(event, false)}
        onLostPointerCapture={event => finish(event, false)}
        onKeyDown={event => {
          if (!enabled) return;
          const direction = event.key === 'ArrowUp' || event.key === 'ArrowRight' ? 1 : event.key === 'ArrowDown' || event.key === 'ArrowLeft' ? -1 : 0;
          if (direction || event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            setInput(side, direction ? stepInput(side, value, direction) : event.key === 'Home' ? 0 : inputMaximums[side]);
          }
        }}>
        <circle cx={x} cy={y} r="26" fill="transparent" />
        <circle className="marker-guide" cx={x} cy={y} r="15" />
        <circle className="marker-ring" cx={x} cy={y} r="9" />
        <path className="marker-grip" d={'M' + (x - 3) + ' ' + (y - 2) + 'h6m-6 4h6'} />
        <g className="marker-measure" aria-hidden="true" pointerEvents="none">
          <text x={x + (side ? -19 : 19)} y={y - 10} textAnchor={side ? 'end' : 'start'}>{label}</text>
        </g>
      </g>;
    })}
  </svg>;
}
