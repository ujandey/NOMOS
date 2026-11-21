import { useId, useState } from 'react';

type Props = {
  label: string;
  value: number | null;
  onChange?: (value: number) => void;
  min: number;
  max: number;
  step: number | 'any';
  unit?: string;
  positiveMin?: number;
  exclusiveMin?: boolean;
  compact?: boolean;
};

export function NumberField({ label, value, onChange, min, max, step, unit, positiveMin, exclusiveMin, compact }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const errorId = useId();

  function commit(raw: string, discardInvalid: boolean) {
    const number = Number(raw);
    const valid = raw.trim() !== '' && Number.isFinite(number) && number >= min && number <= max &&
      (!exclusiveMin || number > min) && (!positiveMin || number === 0 || number >= positiveMin) &&
      (step !== 1 || Number.isInteger(number));
    if (valid) onChange?.(number);
    setError(!valid);
    if (valid || discardInvalid) setDraft(null);
  }

  return <label className={compact ? 'number-field compact-field' : 'number-field'}>
    <span className={compact ? 'sr-only' : undefined}>{label}</span>
    <span className="number-box">
      <input aria-label={label} type="number" inputMode="decimal" min={min} max={max} step={step}
        value={draft ?? value ?? ''} placeholder="Unknown" readOnly={!onChange}
        aria-invalid={error || undefined} aria-describedby={error ? errorId : undefined}
        onChange={event => { setDraft(event.target.value); setError(false); }}
        onBlur={event => { if (draft !== null && onChange) commit(event.currentTarget.value, true); }}
        onKeyDown={event => {
          if (event.key === 'Enter' && draft !== null && onChange) {
            event.preventDefault();
            commit(event.currentTarget.value, false);
          }
          if (event.key === 'Escape') { setDraft(null); setError(false); }
        }}
      />
      {unit && <span className="input-unit" aria-hidden="true">{unit}</span>}
    </span>
    {error && <span id={errorId} className="field-error" role="alert">
      Enter {step === 1 ? 'a whole number' : 'a value'} {exclusiveMin ? 'above ' + min + ' and at most ' + max
        : (positiveMin ? 'of zero or ' : '') + 'from ' + (positiveMin ?? min) + ' to ' + max}.
    </span>}
  </label>;
}
