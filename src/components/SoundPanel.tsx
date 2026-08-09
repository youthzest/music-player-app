import { DELAY_PRESETS, SPACES } from "../audio/spaces";
import { useAppStore } from "../store/useAppStore";

interface RowProps {
  label: string;
  children: React.ReactNode;
}

function Row({ label, children }: RowProps) {
  return (
    <div className="sound-panel__row">
      <span className="sound-panel__label">{label}</span>
      <div className="sound-panel__chips">{children}</div>
    </div>
  );
}

const SPEED_MARKS = [0.5, 0.75, 1, 1.25, 1.5, 2];

/** Melody Focus 값을 사람 말로 옮겨준다. */
function focusHint(v: number): string {
  if (v < 20) return "성부 균등 · 합창처럼 섞임";
  if (v < 45) return "멜로디 약간 앞 · 자연스러운 균형";
  if (v < 70) return "멜로디 또렷 · 화음은 뒤로 넓게";
  if (v < 90) return "멜로디 강조 · 화음은 배경 패드";
  return "멜로디 최대 강조 · 화음 최소";
}

export function SoundPanel() {
  const spaceId = useAppStore((s) => s.spaceId);
  const setSpaceId = useAppStore((s) => s.setSpaceId);
  const delayId = useAppStore((s) => s.delayId);
  const setDelayId = useAppStore((s) => s.setDelayId);
  const chorusOn = useAppStore((s) => s.chorusOn);
  const setChorusOn = useAppStore((s) => s.setChorusOn);
  const melodyFocus = useAppStore((s) => s.melodyFocus);
  const setMelodyFocus = useAppStore((s) => s.setMelodyFocus);
  const autoPlay = useAppStore((s) => s.autoPlay);
  const setAutoPlay = useAppStore((s) => s.setAutoPlay);
  const playbackSpeed = useAppStore((s) => s.playbackSpeed);
  const setPlaybackSpeed = useAppStore((s) => s.setPlaybackSpeed);
  const currentSong = useAppStore((s) => s.currentSong);

  const activeSpace = SPACES.find((s) => s.id === spaceId);

  return (
    <div className="sound-panel">
      <Row label="자동재생">
        <button
          className={`sound-panel__chip${!autoPlay ? " active" : ""}`}
          onClick={() => setAutoPlay(false)}
          disabled={!currentSong}
        >
          수동
        </button>
        <button
          className={`sound-panel__chip${autoPlay ? " active" : ""}`}
          onClick={() => setAutoPlay(true)}
          disabled={!currentSong}
        >
          ▶ 자동
        </button>
      </Row>

      <Row label="속도">
        <input
          className="sound-panel__slider"
          type="range"
          min={0.25}
          max={2}
          step={0.05}
          value={playbackSpeed}
          onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
          aria-label="재생 속도"
        />
        <span className="sound-panel__speed-value">{playbackSpeed.toFixed(2)}×</span>
      </Row>

      <Row label="">
        {SPEED_MARKS.map((m) => (
          <button
            key={m}
            className={`sound-panel__chip${Math.abs(playbackSpeed - m) < 0.001 ? " active" : ""}`}
            onClick={() => setPlaybackSpeed(m)}
          >
            {m}×
          </button>
        ))}
      </Row>

      <Row label="Melody Focus">
        <input
          className="sound-panel__slider"
          type="range"
          min={0}
          max={100}
          step={1}
          value={melodyFocus}
          onChange={(e) => setMelodyFocus(Number(e.target.value))}
          aria-label="Melody Focus"
        />
        <span className="sound-panel__speed-value">{melodyFocus}</span>
      </Row>
      <p className="sound-panel__note">{focusHint(melodyFocus)}</p>

      <Row label="공간">
        {SPACES.map((s) => (
          <button
            key={s.id}
            className={`sound-panel__chip${s.id === spaceId ? " active" : ""}`}
            onClick={() => setSpaceId(s.id)}
            title={s.description}
          >
            {s.label}
          </button>
        ))}
      </Row>
      {activeSpace && <p className="sound-panel__note">{activeSpace.description}</p>}

      <Row label="딜레이">
        {DELAY_PRESETS.map((p) => (
          <button
            key={p.id}
            className={`sound-panel__chip${p.id === delayId ? " active" : ""}`}
            onClick={() => setDelayId(p.id)}
          >
            {p.label}
          </button>
        ))}
      </Row>

      <Row label="코러스">
        <button
          className={`sound-panel__chip${!chorusOn ? " active" : ""}`}
          onClick={() => setChorusOn(false)}
        >
          끔
        </button>
        <button
          className={`sound-panel__chip${chorusOn ? " active" : ""}`}
          onClick={() => setChorusOn(true)}
        >
          켬
        </button>
      </Row>
    </div>
  );
}
