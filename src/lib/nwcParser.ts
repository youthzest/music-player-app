import type { ParsedNote, ParsedSong } from "../types/music";
import { decodeTextFile } from "./textDecode";

// Parser for Noteworthy Composer's text clip format (.nwctxt), which is the
// only NWC variant that is actually documented/plain-text — the binary .nwc
// format is a proprietary, undocumented format and cannot be reliably parsed
// without Noteworthy Composer itself.
//
// Known simplifications (fine for melody playback, not a full engraving parser):
// - Only the first |Staff|...|StaffEnd| block is read (single melodic line).
// - Explicit accidentals apply to that note only, not for the rest of the bar.
// - Tuplets (triplets etc.) are not duration-compressed; they play at face value.
// - Tied notes are emitted as separate consecutive notes rather than merged.

const DURATION_BEATS: Record<string, number> = {
  Whole: 4,
  Half: 2,
  Quarter: 1,
  Eighth: 0.5,
  Sixteenth: 0.25,
  "ThirtySecond": 0.125,
  "SixtyFourth": 0.0625,
};

const LETTER_INDEX: Record<string, number> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
const LETTER_SEMITONE = [0, 2, 4, 5, 7, 9, 11]; // natural semitone for C D E F G A B

interface ClefRef {
  // Diatonic reference for Pos:0 -> { letter index (0=C..6=B), octave }
  letterIndex: number;
  octave: number;
}

const CLEF_REFS: Record<string, ClefRef> = {
  Treble: { letterIndex: LETTER_INDEX.B, octave: 4 }, // Pos:0 = B4
  Bass: { letterIndex: LETTER_INDEX.D, octave: 3 }, // Pos:0 = D3
  Alto: { letterIndex: LETTER_INDEX.C, octave: 4 }, // Pos:0 = C4 (middle line)
  Tenor: { letterIndex: LETTER_INDEX.A, octave: 3 }, // Pos:0 = A3 (approx)
};

function parseFields(line: string): { type: string; fields: Record<string, string> } {
  const parts = line.split("|").filter((p) => p.length > 0);
  const type = parts[0] ?? "";
  const fields: Record<string, string> = {};
  for (let i = 1; i < parts.length; i++) {
    const idx = parts[i].indexOf(":");
    if (idx === -1) {
      fields[parts[i]] = "";
    } else {
      fields[parts[i].slice(0, idx)] = parts[i].slice(idx + 1);
    }
  }
  return { type, fields };
}

/** NWC 텍스트 필드의 이스케이프를 푼다. 값은 따옴표로 감싸여 있고 줄바꿈은 \n 으로 들어온다. */
function unescapeNwcText(raw: string): string {
  const inner = raw.replace(/^"/, "").replace(/"$/, "");
  return inner.replace(/\\(.)/g, (_, c: string) => (c === "n" ? "\n" : c === "r" ? "" : c));
}

/**
 * 첫 스태프에 붙은 가사를 뽑는다. |Lyric1|, |Lyric2| ... 는 절(verse)이며
 * 비어 있는 절이 있을 수 있어 내용이 있는 첫 절을 쓴다.
 * 음절은 공백으로 구분되고 토큰 하나가 음표 하나에 대응한다("-" 는 이어짐 표시).
 */
function extractLyrics(lines: string[]): string | undefined {
  const verses = new Map<number, string>();
  let staffCount = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith("|AddStaff")) {
      staffCount++;
      if (staffCount > 1) break; // 첫 스태프의 가사만 쓴다
      continue;
    }
    const m = line.match(/^\|Lyric(\d+)\|Text:(.*)$/);
    if (!m) continue;
    const text = unescapeNwcText(m[2]).trim();
    if (text) verses.set(parseInt(m[1], 10), text);
  }

  if (verses.size === 0) return undefined;
  const firstVerse = Math.min(...verses.keys());
  return verses.get(firstVerse);
}

function parseKeySignature(sig: string | undefined): Record<string, number> {
  const map: Record<string, number> = {};
  if (!sig) return map;
  for (const token of sig.split(",")) {
    const m = token.match(/^([A-G])([#b])/);
    if (m) {
      map[m[1]] = m[2] === "#" ? 1 : -1;
    }
  }
  return map;
}

function durationToBeats(durField: string | undefined): number {
  if (!durField) return 1;
  const tokens = durField.split(",");
  const base = DURATION_BEATS[tokens[0]] ?? 1;
  let beats = base;
  if (tokens.includes("Dotted")) beats *= 1.5;
  if (tokens.includes("DblDotted")) beats *= 1.75;
  return beats;
}

interface PosPitch {
  posValue: number;
  accidental: number | null; // explicit override, null = use key signature default
}

function parsePos(posField: string): PosPitch[] {
  // Pos field can hold multiple comma-separated positions for a chord, each
  // optionally suffixed with an accidental marker: ^ sharp, v flat, n natural.
  return posField.split(",").map((token) => {
    const m = token.match(/^(-?\d+)(\^\^|vv|[\^vn])?/);
    if (!m) return { posValue: 0, accidental: null };
    const posValue = parseInt(m[1], 10);
    let accidental: number | null = null;
    switch (m[2]) {
      case "^": accidental = 1; break;
      case "v": accidental = -1; break;
      case "n": accidental = 0; break;
      case "^^": accidental = 2; break;
      case "vv": accidental = -2; break;
    }
    return { posValue, accidental };
  });
}

function posToMidi(pos: PosPitch, clefRef: ClefRef, keyMap: Record<string, number>): number {
  const refAbsoluteStep = clefRef.octave * 7 + clefRef.letterIndex;
  const absStep = refAbsoluteStep + pos.posValue;
  const octave = Math.floor(absStep / 7);
  const letterIdx = ((absStep % 7) + 7) % 7;
  const letter = Object.keys(LETTER_INDEX).find((k) => LETTER_INDEX[k] === letterIdx)!;
  const accidental = pos.accidental !== null ? pos.accidental : keyMap[letter] ?? 0;
  const semitone = LETTER_SEMITONE[letterIdx] + accidental;
  return (octave + 1) * 12 + semitone;
}

export async function parseNwcTextFile(file: File): Promise<ParsedSong> {
  // file.text() 는 항상 UTF-8 로 디코딩하므로 CP949 로 저장된 파일이 깨진다.
  const text = await decodeTextFile(file);
  return parseNwcText(text, file.name.replace(/\.[^/.]+$/, ""));
}

/** 이미 디코딩된 NWCTXT 문자열을 파싱한다. 서버에서 변환해 온 .nwc 도 이 경로를 탄다. */
export function parseNwcText(text: string, fallbackTitle: string): ParsedSong {
  const lines = text.split(/\r?\n/);

  let title = fallbackTitle;
  let tempo = 120;
  let numerator = 4;
  let denominator = 4;

  let clefRef: ClefRef = CLEF_REFS.Treble;
  let keyMap: Record<string, number> = {};
  let inStaff = false;
  let staffCount = 0;
  let beatPos = 0; // running position in quarter-note beats
  const notes: ParsedNote[] = [];

  const secondsPerBeat = () => 60 / tempo;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const { type, fields } = parseFields(line);

    // 클립 형식(.nwctxt 조각)은 |Staff| 로 악보를 열지만, 파일 전체를 텍스트로
    // 저장하면 |AddStaff| 가 대신 쓰인다. 둘 다 받아야 실제 파일이 파싱된다.
    // 멜로디 한 줄만 필요하므로 두 번째 스태프가 시작되면 읽기를 멈춘다.
    if (type === "AddStaff") {
      staffCount++;
      if (staffCount > 1) break;
      inStaff = true;
      continue;
    }

    switch (type) {
      case "SongInfo":
        if (fields.Title) title = fields.Title.replace(/^"|"$/g, "");
        break;
      case "Tempo":
        if (fields.Tempo) tempo = parseFloat(fields.Tempo);
        break;
      case "TimeSig": {
        const sig = fields.Signature ?? "4/4";
        const [n, d] = sig.split("/").map((v) => parseInt(v, 10));
        if (n) numerator = n;
        if (d) denominator = d;
        break;
      }
      case "Staff":
        if (!inStaff) {
          inStaff = true;
        }
        break;
      case "StaffEnd":
        inStaff = false;
        break;
      case "Clef":
        if (fields.Type && CLEF_REFS[fields.Type]) {
          clefRef = CLEF_REFS[fields.Type];
        }
        break;
      case "Key":
        keyMap = parseKeySignature(fields.Signature);
        break;
      case "Note": {
        if (!inStaff) break;
        const beats = durationToBeats(fields.Dur);
        const positions = parsePos(fields.Pos ?? "0");
        const time = beatPos * secondsPerBeat();
        const duration = beats * secondsPerBeat();
        for (const pos of positions) {
          notes.push({
            midi: posToMidi(pos, clefRef, keyMap),
            time,
            duration,
            velocity: 0.8,
          });
        }
        beatPos += beats;
        break;
      }
      case "Chord": {
        if (!inStaff) break;
        const beats = durationToBeats(fields.Dur);
        const positions = parsePos(fields.Pos ?? "0");
        const time = beatPos * secondsPerBeat();
        const duration = beats * secondsPerBeat();
        for (const pos of positions) {
          notes.push({
            midi: posToMidi(pos, clefRef, keyMap),
            time,
            duration,
            velocity: 0.8,
          });
        }
        beatPos += beats;
        break;
      }
      case "Rest": {
        if (!inStaff) break;
        const beats = durationToBeats(fields.Dur);
        beatPos += beats;
        break;
      }
      default:
        break;
    }
  }

  notes.sort((a, b) => a.time - b.time);
  const durationSeconds = notes.length
    ? Math.max(...notes.map((n) => n.time + n.duration))
    : 0;

  return {
    title,
    tempo: Math.round(tempo),
    timeSignature: { numerator, denominator },
    notes,
    durationSeconds,
    sourceFormat: "nwctxt",
    lyrics: extractLyrics(lines),
  };
}

export function isNwcTextFormat(file: File): boolean {
  return /\.nwctxt$/i.test(file.name);
}
