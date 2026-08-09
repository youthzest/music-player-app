import { DELAY_PRESETS, REVERB_PRESETS } from "../audio/effects";
import { HARMONY_OPTIONS } from "../audio/harmony";
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

export function SoundPanel() {
  const reverbId = useAppStore((s) => s.reverbId);
  const setReverbId = useAppStore((s) => s.setReverbId);
  const delayId = useAppStore((s) => s.delayId);
  const setDelayId = useAppStore((s) => s.setDelayId);
  const chorusOn = useAppStore((s) => s.chorusOn);
  const setChorusOn = useAppStore((s) => s.setChorusOn);
  const harmonyMode = useAppStore((s) => s.harmonyMode);
  const setHarmonyMode = useAppStore((s) => s.setHarmonyMode);
  const autoPlay = useAppStore((s) => s.autoPlay);
  const setAutoPlay = useAppStore((s) => s.setAutoPlay);
  const playbackSpeed = useAppStore((s) => s.playbackSpeed);
  const setPlaybackSpeed = useAppStore((s) => s.setPlaybackSpeed);
  const currentSong = useAppStore((s) => s.currentSong);

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

      <Row label="리버브">
        {REVERB_PRESETS.map((p) => (
          <button
            key={p.id}
            className={`sound-panel__chip${p.id === reverbId ? " active" : ""}`}
            onClick={() => setReverbId(p.id)}
          >
            {p.label}
          </button>
        ))}
      </Row>

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

      <Row label="화음">
        {HARMONY_OPTIONS.map((o) => (
          <button
            key={o.id}
            className={`sound-panel__chip${o.id === harmonyMode ? " active" : ""}`}
            onClick={() => setHarmonyMode(o.id)}
          >
            {o.label}
          </button>
        ))}
      </Row>

      {harmonyMode !== "off" && (
        <p className="sound-panel__note">
          {harmonyMode === "auto"
            ? currentSong
              ? `곡의 조성(${currentSong.key.label})을 따릅니다`
              : "곡을 선택하면 조성을 따릅니다"
            : `${harmonyMode === "major" ? "장조" : "단조"}로 반주합니다 · 연주 중에도 바꿀 수 있습니다`}
        </p>
      )}
    </div>
  );
}
