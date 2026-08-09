import { useEffect, useMemo, useState } from "react";
import * as Tone from "tone";
import { MelodyPlayer } from "./audio/player";
import { CircularPlayButton } from "./components/CircularPlayButton";
import { InstrumentSelector } from "./components/InstrumentSelector";
import { HarmonyStyleSelector } from "./components/HarmonyStyleSelector";
import { SongLibrary } from "./components/SongLibrary";
import { SoundPanel } from "./components/SoundPanel";
import { Prompter } from "./components/Prompter";
import { CatalogSearch } from "./components/CatalogSearch";
import { ChordChartStrip } from "./components/ChordChartStrip";
import { FileUpload } from "./components/FileUpload";
import { useAppStore } from "./store/useAppStore";
import { analyzeChordChart } from "./lib/chordChart";
import { getDelay } from "./audio/spaces";
import { midiToNoteName } from "./types/music";
import type { AnalyzedNote } from "./types/music";
import "./App.css";

function App() {
  const instrumentId = useAppStore((s) => s.instrumentId);
  const harmonyStyle = useAppStore((s) => s.harmonyStyle);
  const currentSong = useAppStore((s) => s.currentSong);
  const status = useAppStore((s) => s.status);
  const spaceId = useAppStore((s) => s.spaceId);
  const delayId = useAppStore((s) => s.delayId);
  const chorusOn = useAppStore((s) => s.chorusOn);
  const melodyFocus = useAppStore((s) => s.melodyFocus);
  const autoPlay = useAppStore((s) => s.autoPlay);
  const setAutoPlay = useAppStore((s) => s.setAutoPlay);
  const playbackSpeed = useAppStore((s) => s.playbackSpeed);

  const player = useMemo(() => new MelodyPlayer(instrumentId), []);

  // 곡이나 스타일이 바뀌면 곡 전체를 다시 분석해 코드 진행표를 만든다.
  const chordChart = useMemo(
    () => (currentSong ? analyzeChordChart(currentSong, harmonyStyle) : []),
    [currentSong, harmonyStyle]
  );
  const [lastNote, setLastNote] = useState<AnalyzedNote | null>(null);
  const [lastIndex, setLastIndex] = useState<number | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(true);

  useEffect(() => {
    player.setInstrument(instrumentId);
  }, [instrumentId, player]);

  useEffect(() => {
    player.setSpace(spaceId);
  }, [spaceId, player]);

  useEffect(() => {
    const d = getDelay(delayId);
    player.setDelay(d.wet, d.delayTime, d.feedback);
  }, [delayId, player]);

  useEffect(() => {
    player.setMelodyFocus(melodyFocus);
  }, [melodyFocus, player]);

  useEffect(() => {
    player.setChorus(chorusOn);
  }, [chorusOn, player]);

  useEffect(() => {
    player.setHarmonyStyle(harmonyStyle);
  }, [harmonyStyle, player]);

  useEffect(() => {
    player.setChordChart(chordChart);
  }, [chordChart, player]);

  useEffect(() => {
    player.setSpeed(playbackSpeed);
  }, [playbackSpeed, player]);

  useEffect(() => {
    if (!autoPlay) {
      player.stopAuto();
      return;
    }
    let cancelled = false;
    // 브라우저는 사용자 조작 없이 오디오를 못 켜므로, 토글 클릭을 그 조작으로 삼는다.
    Tone.start().then(() => {
      if (cancelled || !autoPlay) return;
      player.startAuto((note, index) => {
        setLastNote(note);
        setLastIndex(index);
      });
    });
    return () => {
      cancelled = true;
      player.stopAuto();
    };
  }, [autoPlay, player]);

  useEffect(() => {
    if (currentSong) player.loadSong(currentSong);
    setLastIndex(null);
    setLastNote(null);
    // loadSong 이 자동 재생을 멈추므로 토글 표시도 함께 되돌린다.
    setAutoPlay(false);
  }, [currentSong, player, setAutoPlay]);

  useEffect(() => () => player.dispose(), [player]);

  return (
    <div className="app">
      <header className="app__header">
        <h1>연주 웹앱</h1>
        <p className="app__subtitle">
          {currentSong
            ? `${currentSong.title} · ${currentSong.key.label} · ${currentSong.tempo} BPM`
            : "곡을 업로드하거나 라이브러리에서 선택하세요"}
        </p>
      </header>

      <main className="app__main">
        <aside className="app__sidebar">
          <CatalogSearch />
          <FileUpload />
          {status && <p className="app__status">{status}</p>}
          <button
            className="app__collapse-toggle"
            onClick={() => setLibraryOpen((o) => !o)}
            aria-expanded={libraryOpen}
          >
            <span className="app__caret">{libraryOpen ? "▼" : "▶"}</span> 라이브러리
          </button>
          {libraryOpen && <SongLibrary />}
        </aside>

        <section className="app__stage">
          <InstrumentSelector />
          <HarmonyStyleSelector />
          <SoundPanel />

          {chordChart.length > 0 && (
            <ChordChartStrip chart={chordChart} currentIndex={lastIndex} />
          )}

          <div className="app__now-playing">
            {lastNote ? (
              <>
                <span className="app__note-solfege">{lastNote.solfege}</span>
                <span className="app__note-name">{midiToNoteName(lastNote.midi)}</span>
              </>
            ) : (
              <span className="app__note-placeholder">터치해서 연주를 시작하세요</span>
            )}
          </div>

          <CircularPlayButton
            player={player}
            onNotePlayed={(note, index) => {
              // 손으로 누르면 수동 연주가 우선한다(플레이어 쪽에서도 자동을 멈춘다).
              setAutoPlay(false);
              setLastNote(note);
              setLastIndex(index);
            }}
          />

          <Prompter currentIndex={lastIndex} />

          <p className="app__hint">
            터치 = 다음 음 재생 · 누른 채 위/아래 = 음 높낮이 · 누른 채 좌/우로 흔들기 = 비브라토
          </p>
        </section>
      </main>
    </div>
  );
}

export default App;
