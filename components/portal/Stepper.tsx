const STEPS = ['Self-appraisal', 'With your HOD', 'Discussion & acceptance'];

export default function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-1 text-[11px] sm:text-xs">
      {STEPS.map((s, i) => {
        const n = i + 1;
        const state = n < current ? 'done' : n === current ? 'now' : 'todo';
        return (
          <li key={s} className="flex items-center gap-1 flex-1">
            <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center font-semibold
              ${state === 'done' ? 'bg-green-100 text-green-700' :
                state === 'now' ? 'bg-brand text-white' : 'bg-slate-200 text-slate-500'}`}>
              {state === 'done' ? '✓' : n}
            </span>
            <span className={`hidden sm:inline ${state === 'now' ? 'font-semibold' : 'text-slate-500'}`}>{s}</span>
            {n < STEPS.length && <span className="flex-1 h-px bg-slate-200 mx-1" />}
          </li>
        );
      })}
    </ol>
  );
}
