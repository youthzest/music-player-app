import { useEffect, useMemo, useState } from "react";
import { MelodyPlayer } from "./audio/player";
import { CircularPlayButton } from "./components/CircularPlayButton";
import { InstrumentSelector } from "./components/InstrumentSelector";
import { HarmonyStyleSelector } from "./components/HarmonyStyleSelector";
import { SongLibrary } from "./components/SongLibrary";
import { FileUpload } from "./components/FileUpload";
import { useAppStore } from "./store/useAppStore";
import { midiToNoteName } from "./types/music";
import type { AnalyzedNote } from "./types/music";
import "./App.css";

function App() {
  const instrumentId = useAppStore((s) => s.instrumentId);
  const harmonyStyle = useAppStore((s) => s.harmonyStyle);
  const currentSong = useAppStore((s) => s.currentSong);
  const status = useAppStore((s) => s.status);

  const player = useMemo(() => new MelodyPlayer(instrumentId), []);
  const [lastNote, setLastNote] = useState<AnalyzedNote | null>(null);

  useEffect(() => {
    player.setInstrument(instrumentId);
  }, [instrumentId, player]);

  useEffect(() => {
    player.setHarmonyStyle(harmonyStyle);
  }, [harmonyStyle, player]);

  useEffect(() => {
    if (currentSong) player.loadSong(currentSong);
  }, [currentSong, player]);

  useEffect(() => () => player.dispose(), [player]);

  return (
    <div className="app">
      <header className="app__header">
        <h1>Hymn OS</h1>
        <p className="app__subtitle">
          {currentSong
            ? `${currentSong.title} · ${currentSong.key.label} · ${currentSong.tempo} BPM`
            : "곡을 업로드하거나 라이브러리에서 선택하세요"}
        </p>
      </header>

      <main className="app__main">
        <aside className="app__sidebar">
          <FileUpload />
          {status && <p className="app__status">{status}</p>}
          <h2 className="app__section-title">라이브러리</h2>
          <SongLibrary />
        </aside>

        <section className="app__stage">
          <InstrumentSelector />
          <HarmonyStyleSelector />

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

          <CircularPlayButton player={player} onNotePlayed={(note) => setLastNote(note)} />

          <p className="app__hint">
            터치 = 다음 음 재생 · 누른 채 위/아래 = 음 높낮이 · 누른 채 좌/우로 흔들기 = 비브라토
          </p>
        </section>
      </main>
    </div>
  );
}

export default App;
