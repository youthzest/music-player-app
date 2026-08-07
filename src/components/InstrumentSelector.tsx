import { INSTRUMENTS } from "../audio/instruments";
import { useAppStore } from "../store/useAppStore";

export function InstrumentSelector() {
  const instrumentId = useAppStore((s) => s.instrumentId);
  const setInstrumentId = useAppStore((s) => s.setInstrumentId);

  return (
    <div className="instrument-selector">
      {INSTRUMENTS.map((inst) => (
        <button
          key={inst.id}
          className={`instrument-selector__chip${inst.id === instrumentId ? " active" : ""}`}
          onClick={() => setInstrumentId(inst.id)}
        >
          {inst.label}
        </button>
      ))}
    </div>
  );
}
