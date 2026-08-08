import { HARMONY_STYLES } from "../lib/harmony";
import { useAppStore } from "../store/useAppStore";

export function HarmonyStyleSelector() {
  const harmonyStyle = useAppStore((s) => s.harmonyStyle);
  const setHarmonyStyle = useAppStore((s) => s.setHarmonyStyle);
  const active = HARMONY_STYLES.find((style) => style.id === harmonyStyle);

  return (
    <div className="harmony-style-selector">
      <div className="instrument-selector">
        {HARMONY_STYLES.map((style) => (
          <button
            key={style.id}
            className={`instrument-selector__chip${style.id === harmonyStyle ? " active" : ""}`}
            onClick={() => setHarmonyStyle(style.id)}
          >
            {style.label}
          </button>
        ))}
      </div>
      {active && <p className="harmony-style-selector__description">{active.description}</p>}
    </div>
  );
}
