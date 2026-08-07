import { useRef, useState } from "react";
import { parseMidiFile } from "../lib/midiParser";
import { parseNwcTextFile, isNwcTextFormat } from "../lib/nwcParser";
import { analyzeSong } from "../lib/analyze";
import { saveSong } from "../lib/api";
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

      if (isBinaryNwc) {
        throw new Error(
          "바이너리 .nwc 파일은 지원하지 않습니다. Noteworthy Composer에서 '텍스트로 저장(.nwctxt)' 후 다시 업로드해주세요."
        );
      }

      const parsed = isMidi
        ? await parseMidiFile(file)
        : isNwcText
        ? await parseNwcTextFile(file)
        : (() => {
            throw new Error("지원하지 않는 파일 형식입니다 (.mid, .midi, .nwctxt만 가능)");
          })();

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
