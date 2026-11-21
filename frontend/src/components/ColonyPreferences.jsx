import { useEffect, useState } from 'react';
import { useApi } from '../lib/hooks.js';
import { quarterTypeLabel } from '../lib/constants.js';

export const MAX_CHOICES = 3;
const ORDINAL = ['1st', '2nd', '3rd'];

/** Returns a message when the choices break a rule (a gap, or the same colony twice), else null. */
export function colonyProblem(choices) {
  const names = choices.map((c) => c.trim());
  if (!names[0]) return 'Choose your 1st choice colony.';
  for (let i = 1; i < names.length; i++) {
    if (names[i] && !names[i - 1]) return `Fill the ${ORDINAL[i - 1]} choice before the ${ORDINAL[i]} one.`;
  }
  const seen = new Set();
  for (const n of names) {
    if (!n) continue;
    if (seen.has(n.toLowerCase())) return `"${n}" is chosen twice - each choice must be a different colony.`;
    seen.add(n.toLowerCase());
  }
  return null;
}

function useDebounced(value, ms = 400) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const Arrow = ({ up }) => (
  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d={up ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} /></svg>
);

/**
 * Up to three preferred colonies in order of priority (1 = most wanted).
 * Colonies that exist in the quarter inventory for the chosen quarter type / station are shown as
 * one-click chips; any colony or area name can also be typed.
 */
export default function ColonyPreferences({ value, onChange, quarterType, station }) {
  const debouncedStation = useDebounced(station.trim());
  const q = useApi('/colonies', { type: quarterType, station: debouncedStation });
  const options = q.data?.data ?? [];
  const lower = value.map((v) => v.trim().toLowerCase());
  const problem = colonyProblem(value);
  const touched = value.some((v) => v.trim());

  const setAt = (i, v) => onChange(value.map((x, j) => (j === i ? v : x)));
  const addChip = (name) => {
    const slot = value.findIndex((v) => !v.trim());
    if (slot >= 0 && !lower.includes(name.toLowerCase())) setAt(slot, name);
  };
  const clearAt = (i) => onChange([...value.filter((_, j) => j !== i), '']); // remove and shift the lower choices up
  const move = (i, d) => {
    const next = [...value];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };

  return (
    <div className="sm:col-span-2">
      <label className="lbl">
        Preferred colonies — in order of priority<span className="text-signal"> *</span>
      </label>
      <p className="mt-0.5 text-xs text-slate-500">
        Choose up to {MAX_CHOICES} colonies / locations. Your <b>1st choice</b> is the one you want most; it is considered first when a quarter falls vacant.
      </p>

      {/* colonies available in the inventory */}
      <div className="mt-3 rounded-lg border border-edge bg-canvas/60 px-3 py-2.5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
          Available colonies · {quarterTypeLabel(quarterType)}{station.trim() ? ` · ${station.trim()}` : ''}
        </p>
        {options.length === 0 ? (
          <p className="mt-1 text-xs text-slate-500">
            {q.loading ? 'Loading…' : 'No colonies are listed for this quarter type yet — type the colony / area name in the boxes below.'}
          </p>
        ) : (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {options.map((o) => {
              const picked = lower.includes(o.colony_name.toLowerCase());
              return (
                <button key={o.colony_name} type="button" disabled={picked} onClick={() => addChip(o.colony_name)}
                  title={picked ? 'Already chosen' : 'Add as the next choice'}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                    picked ? 'cursor-not-allowed border-edge bg-white text-slate-300' : 'border-rail/30 bg-white text-rail hover:border-rail hover:bg-rail hover:text-white'
                  }`}>
                  {o.colony_name} <span className="font-normal opacity-70">· {o.vacant > 0 ? `${o.vacant} vacant` : 'no vacancy now'}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* the three ranked choices */}
      <datalist id="colony-options">{options.map((o) => <option key={o.colony_name} value={o.colony_name} />)}</datalist>
      <ol className="mt-3 space-y-2">
        {value.map((v, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2">
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-display text-sm font-bold ring-1 ${
              i === 0 ? 'bg-rail text-white ring-rail' : 'bg-canvas text-rail ring-edge'
            }`} title={`${ORDINAL[i]} choice`}>{i + 1}</span>
            <input
              list="colony-options" name={`colony_${i + 1}`} value={v} onChange={(e) => setAt(i, e.target.value)}
              required={i === 0} maxLength={255} autoComplete="off" aria-label={`${ORDINAL[i]} choice colony`}
              placeholder={i === 0 ? '1st choice (required) — e.g. Saket' : `${ORDINAL[i]} choice (optional)`}
              className="input mt-0 min-w-0 flex-1 basis-40"
            />
            <div className="flex w-full shrink-0 items-center gap-1 pl-10 sm:w-auto sm:pl-0">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0 || !v.trim()} aria-label={`Move choice ${i + 1} up`}
                className="rounded-md border border-edge p-1.5 text-slate-500 hover:bg-canvas disabled:opacity-30"><Arrow up /></button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === value.length - 1 || !v.trim() || !value[i + 1].trim()} aria-label={`Move choice ${i + 1} down`}
                className="rounded-md border border-edge p-1.5 text-slate-500 hover:bg-canvas disabled:opacity-30"><Arrow /></button>
              <button type="button" onClick={() => clearAt(i)} disabled={!v.trim()} aria-label={`Clear choice ${i + 1}`}
                className="rounded-md border border-edge px-2 py-1 text-xs font-medium text-signal hover:bg-canvas disabled:opacity-30">Clear</button>
            </div>
          </li>
        ))}
      </ol>
      {touched && problem && <p className="mt-2 text-xs text-rose-600" role="alert">{problem}</p>}
    </div>
  );
}
