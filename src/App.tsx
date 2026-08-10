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

  // 블루투스 키보드·페이지터너로도 연주할 수 있게 아무 키나 터치처럼 받는다.
  // 누르면 다음 음, 떼면 릴리스 — 원형 버튼과 동작이 같다.
  useEffect(() => {
    let heldKey: string | null = null;
    let safety: ReturnType<typeof setTimeout> | null = null;

    const isTyping = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      return (
        el.tagName === "INPUT" ||
        el.tagName === "TEXTAREA" ||
        el.tagName === "SELECT" ||
        el.isContentEditable
      );
    };

    const releaseHeld = () => {
      if (heldKey === null) return;
      heldKey = null;
      if (safety) {
        clearTimeout(safety);
        safety = null;
      }
      player.release();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // 브라우저 단축키(⌘R 등)와 키보드 탐색은 그대로 둔다.
      if (e.ctrlKey || e.metaKey || e.altKey || e.key === "Tab") return;
      // 검색창이나 가사 편집 중에는 글자를 쳐야 하므로 연주하지 않는다.
      if (isTyping(e.target)) return;
      // 길게 누르고 있으면 반복 이벤트가 쏟아진다. 한 음만 낸다.
      if (e.repeat) return;

      // keyup 을 보내지 않는 HID 기기가 있다. 그런 기기에서 앞 음이 걸려 있다고
      // 새 입력을 막으면 다음 누름이 통째로 씹힌다. 앞 음을 정리하고 이어서 친다.
      if (heldKey !== null) releaseHeld();

      e.preventDefault(); // 스페이스·화살표의 화면 스크롤 방지
      heldKey = e.code || e.key;

      const play = () => {
        setAutoPlay(false);
        const note = player.attackNext();
        if (!note) return;
        setLastNote(note);
        setLastIndex((player.currentIndex - 1 + player.totalNotes) % player.totalNotes);
      };

      if (Tone.getContext().state !== "running") {
        // 키 입력도 사용자 조작이라 여기서 오디오를 열 수 있다.
        Tone.start().then(play);
      } else {
        play();
      }

      // 페이지터너처럼 keyup 을 보내지 않는 기기가 있어 음이 계속 울릴 수 있다.
      safety = setTimeout(releaseHeld, 5000);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (heldKey === null || (e.code || e.key) !== heldKey) return;
      releaseHeld();
    };

    // 미디어 리모컨·이어폰 버튼은 keydown 을 만들지 않고 미디어 세션으로만 들어온다.
    // 눌렀다 뗀 것으로 간주해 한 음을 짧게 낸다.
    const mediaTap = () => {
      setAutoPlay(false);
      const note = player.attackNext();
      if (!note) return;
      setLastNote(note);
      setLastIndex((player.currentIndex - 1 + player.totalNotes) % player.totalNotes);
      setTimeout(() => player.release(), 350);
    };

    const media = navigator.mediaSession;
    const mediaActions: MediaSessionAction[] = [
      "play",
      "pause",
      "nexttrack",
      "previoustrack",
    ];
    if (media) {
      for (const action of mediaActions) {
        try {
          media.setActionHandler(action, mediaTap);
        } catch {
          // 브라우저가 지원하지 않는 액션은 건너뛴다.
        }
      }
    }

    // capture 단계에서 받아 다른 요소가 먼저 삼키는 일이 없게 한다.
    // 창을 벗어나면 keyup 을 못 받으므로 눌린 상태를 정리한다.
    window.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("keyup", onKeyUp, { capture: true });
    window.addEventListener("blur", releaseHeld);
    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      window.removeEventListener("keyup", onKeyUp, { capture: true });
      window.removeEventListener("blur", releaseHeld);
      if (media) {
        for (const action of mediaActions) {
          try {
            media.setActionHandler(action, null);
          } catch {
            /* 지원하지 않는 액션 */
          }
        }
      }
      if (safety) clearTimeout(safety);
    };
  }, [player, setAutoPlay]);

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

        {/*
          무대는 두 층으로 나뉜다. 위층(app__stage-scroll)만 스크롤되고,
          아래 연주 독(app__dock)은 화면 하단에 고정된다. 가사를 키우거나
          설정을 펼쳐도 터치 버튼 위치가 흔들리지 않게 하기 위한 구조다.
        */}
        <section className="app__stage">
          <div className="app__stage-scroll">
            <InstrumentSelector />
            <HarmonyStyleSelector />
            <SoundPanel />
            <Prompter currentIndex={lastIndex} />
          </div>

          <div className="app__dock">
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

            <p className="app__hint">
              터치 = 다음 음 재생 · 누른 채 위/아래 = 음 높낮이 · 누른 채 좌/우로 흔들기 = 비브라토
              <br />
              키보드는 아무 키나 누르면 재생됩니다 (입력창에 커서가 있을 때는 제외)
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
