import { useRef, useState } from "react";
import { parseMidiFile } from "../lib/midiParser";
import { parseNwcTextFile, parseNwcText, isNwcTextFormat } from "../lib/nwcParser";
import { analyzeSong } from "../lib/analyze";
import { saveSong, convertNwcFile } from "../lib/api";
import { useAppStore } from "../store/useAppStore";

export function FileUpload() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setCurrentSong = useAppStore((s) => s.setCurrentSong);
  const addToLibrary = useAppStore((s) => s.addToLibrary);
  const setStatus = useAppStore((s) => s.setStatus);

  const handleFile = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const isMidi = /\.(mid|midi)$/i.test(file.name);
      const isNwcText = isNwcTextFormat(file);
      const isBinaryNwc = /\.nwc$/i.test(file.name);

      let parsed;
      if (isMidi) {
        parsed = await parseMidiFile(file);
      } else if (isNwcText) {
        parsed = await parseNwcTextFile(file);
      } else if (isBinaryNwc) {
        // 바이너리 .nwc 는 비공개 포맷이라 브라우저에서 못 읽는다.
        // 서버의 nwc-conv 로 NWCTXT 를 받아온 뒤 기존 파서에 그대로 넘긴다.
        setStatus("NWC 파일 변환 중...");
        const nwctxt = await convertNwcFile(file);
        parsed = parseNwcText(nwctxt, file.name.replace(/\.[^/.]+$/, ""));
      } else {
        throw new Error("지원하지 않는 파일 형식입니다 (.mid, .midi, .nwc, .nwctxt만 가능)");
      }

      const analyzed = analyzeSong(parsed);
      setStatus(`분석 완료: ${analyzed.key.label}, ${analyzed.tempo} BPM, 음표 ${analyzed.notes.length}개`);

      const { id } = await saveSong(analyzed);
      const withId = { ...analyzed, id };
      addToLibrary(withId);
      setCurrentSong(withId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "파일을 처리하지 못했습니다");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="file-upload">
      <label className="file-upload__button">
        {busy ? "분석 중..." : "곡 업로드 (MIDI / NWC)"}
        <input
          ref={inputRef}
          type="file"
          accept=".mid,.midi,.nwctxt,.nwc"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
          hidden
        />
      </label>
      {error && <p className="file-upload__error">{error}</p>}
    </div>
  );
}
