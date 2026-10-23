import { useExpertMode } from '../../hooks/useExpertMode'

/** The expert-mode switch, the same control on the Invest page and in Settings. */
export function ExpertSwitch() {
  const [expert, setExpert] = useExpertMode()
  return (
    <span className="flex shrink-0 items-center gap-2">
      <span className="text-sm font-semibold text-slate-300" aria-hidden>{expert ? 'On' : 'Off'}</span>
      <button
        type="button"
        role="switch"
        aria-checked={expert}
        aria-label="Expert mode"
        onClick={() => setExpert(!expert)}
        className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${expert ? 'border-brand bg-brand' : 'border-line bg-seg'}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full shadow transition-all ${expert ? 'left-[22px] bg-white' : 'left-0.5 bg-slate-400'}`} />
      </button>
    </span>
  )
}
