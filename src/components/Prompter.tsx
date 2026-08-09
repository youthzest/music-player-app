import { useEffect, useMemo, useRef, useState } from "react";
import { saveLyrics } from "../lib/api";
import { useAppStore } from "../store/useAppStore";

interface Props {
  /** 방금 연주한 음표의 인덱스. 가사 토큰 순서와 1:1 로 대응한다. */
  currentIndex: number | null;
}

interface Token {
  text: string;
  /** 몇 번째 음표에 붙는 토큰인지 */
  noteIndex: number;
}

/** 가사를 줄 단위로 쪼개고, 각 토큰에 전체 순번(=음표 인덱스)을 매긴다. */
function tokenizeLyrics(lyrics: string): Token[][] {
  let counter = 0;
  return lyrics.split("\n").map((line) =>
    line
      .split(/\s+/)
      .filter(Boolean)
      .map((text) => ({ text, noteIndex: counter++ }))
  );
}

export function Prompter({ currentIndex }: Props) {
  const currentSong = useAppStore((s) => s.currentSong);
  const setCurrentSong = useAppStore((s) => s.setCurrentSong);
  const library = useAppStore((s) => s.library);
  const setLibrary = useAppStore((s) => s.setLibrary);

  const [collapsed, setCollapsed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [fontScale, setFontScale] = useState(1);
  const [saving, setSaving] = useState(false);
  const activeRef = useRef<HTMLSpanElement>(null);

  const lyrics = currentSong?.lyrics ?? "";
  const lines = useMemo(() => (lyrics ? tokenizeLyrics(lyrics) : []), [lyrics]);

  // 현재 부르는 음절이 항상 보이도록 따라간다.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [currentIndex]);

  useEffect(() => {
    setEditing(false);
    setDraft(currentSong?.lyrics ?? "");
  }, [currentSong?.id, currentSong?.lyrics]);

  if (!currentSong) return null;

  const handleSave = async () => {
    if (!currentSong.id) return;
    setSaving(true);
    try {
      await saveLyrics(currentSong.id, draft);
      const updated = { ...currentSong, lyrics: draft };
      setCurrentSong(updated);
      setLibrary(library.map((s) => (s.id === updated.id ? updated : s)));
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={`prompter${collapsed ? " collapsed" : ""}`}>
      <header className="prompter__header">
        <button
          className="prompter__toggle"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
        >
          <span className="prompter__caret">{collapsed ? "▶" : "▼"}</span> 가사 프롬프터
        </button>

        {!collapsed && (
          <div className="prompter__actions">
            <button
              className="prompter__action"
              onClick={() => setFontScale((f) => Math.max(0.7, f - 0.15))}
              aria-label="글자 작게"
            >
              A−
            </button>
            <button
              className="prompter__action"
              onClick={() => setFontScale((f) => Math.min(2.2, f + 0.15))}
              aria-label="글자 크게"
            >
              A+
            </button>
            <button className="prompter__action" onClick={() => setEditing((e) => !e)}>
              {editing ? "취소" : lyrics ? "편집" : "가사 입력"}
            </button>
          </div>
        )}
      </header>

      {!collapsed && (
        <div className="prompter__body">
          {editing ? (
            <div className="prompter__editor">
              <textarea
                className="prompter__textarea"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={"음절을 공백으로 띄우면 음표 하나씩 따라갑니다.\n예) 주 님 의 사 랑"}
                rows={8}
              />
              <div className="prompter__editor-actions">
                <span className="prompter__hint">
                  공백으로 구분된 토큰 {draft.split(/\s+/).filter(Boolean).length}개 · 이 곡의 음표{" "}
                  {currentSong.notes.length}개
                </span>
                <button className="prompter__save" onClick={handleSave} disabled={saving}>
                  {saving ? "저장 중..." : "저장"}
                </button>
              </div>
            </div>
          ) : lines.length > 0 ? (
            <div className="prompter__lyrics" style={{ fontSize: `${fontScale * 1.5}rem` }}>
              {lines.map((tokens, li) => (
                <p key={li} className="prompter__line">
                  {tokens.length === 0 ? (
                    <span className="prompter__blank">&nbsp;</span>
                  ) : (
                    tokens.map((t) => {
                      const active = currentIndex === t.noteIndex;
                      const sung = currentIndex !== null && t.noteIndex < currentIndex;
                      return (
                        <span
                          key={t.noteIndex}
                          ref={active ? activeRef : undefined}
                          className={`prompter__token${active ? " active" : ""}${
                            sung ? " sung" : ""
                          }`}
                        >
                          {t.text}
                        </span>
                      );
                    })
                  )}
                </p>
              ))}
            </div>
          ) : (
            <p className="prompter__empty">
              이 곡에는 가사가 없습니다. "가사 입력"으로 직접 넣을 수 있습니다.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
