// Style-aware chord accompaniment generator. Given the song's detected key and
// the scale degree of the melody note currently playing, builds a diatonic
// chord and voices it differently per style so the accompaniment "feels" like
// a hymn / gospel / CCM-worship / CCLI-band performance rather than a generic
// harmonizer.

import type { AnalyzedSong, KeyInfo } from "../types/music";

export type HarmonyStyle = "off" | "hymn" | "gospel" | "worship" | "ccli";

export interface HarmonyStyleDef {
  id: HarmonyStyle;
  label: string;
  description: string;
}

export const HARMONY_STYLES: HarmonyStyleDef[] = [
  { id: "off", label: "화음 없음", description: "멜로디만 단독으로 연주합니다." },
  {
    id: "hymn",
    label: "찬송가",
    description: "SATB 코랄 화성 · 예측 가능한 정격 진행 · 촘촘하고 정적인 텍스처",
  },
  {
    id: "gospel",
    label: "가스펠",
    description: "7th/9th 확장 화음 · 워킹 베이스 · 살짝 당겨지는 싱커페이션",
  },
  {
    id: "worship",
    label: "CCM/워십",
    description: "sus4·add9 오픈 보이싱 · 넓게 벌린 패드 사운드로 공간감",
  },
  {
    id: "ccli",
    label: "CCLI 밴드",
    description: "레이어드 보이싱 · 곡이 진행될수록 밀도가 쌓이는 다이나믹 빌드업",
  },
];

// Diatonic scale-degree -> semitone offset from the tonic, matching solfege.ts.
const MAJOR_DEGREE_TO_OFFSET: Record<number, number> = { 1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11 };
const MINOR_DEGREE_TO_OFFSET: Record<number, number> = { 1: 0, 2: 2, 3: 3, 4: 5, 5: 7, 6: 8, 7: 10 };

type TriadQuality = "major" | "minor" | "diminished";
type SeventhQuality = "maj7" | "min7" | "dom7" | "halfdim7" | "dim7";

// Root-position triad on each scale degree.
const MAJOR_TRIAD_BY_DEGREE: Record<number, TriadQuality> = {
  1: "major", 2: "minor", 3: "minor", 4: "major", 5: "major", 6: "minor", 7: "diminished",
};
// Minor key uses the harmonic-minor V (raised leading tone) so the cadence still
// resolves like a dominant — the same borrowing every hymn/gospel arranger makes.
const MINOR_TRIAD_BY_DEGREE: Record<number, TriadQuality> = {
  1: "minor", 2: "diminished", 3: "major", 4: "minor", 5: "major", 6: "major", 7: "diminished",
};

const MAJOR_SEVENTH_BY_DEGREE: Record<number, SeventhQuality> = {
  1: "maj7", 2: "min7", 3: "min7", 4: "maj7", 5: "dom7", 6: "min7", 7: "halfdim7",
};
const MINOR_SEVENTH_BY_DEGREE: Record<number, SeventhQuality> = {
  1: "min7", 2: "halfdim7", 3: "maj7", 4: "min7", 5: "dom7", 6: "maj7", 7: "dim7",
};

const TRIAD_INTERVALS: Record<TriadQuality, number[]> = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  diminished: [0, 3, 6],
};

const SEVENTH_INTERVALS: Record<SeventhQuality, number[]> = {
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  dom7: [0, 4, 7, 10],
  halfdim7: [0, 3, 6, 10],
  dim7: [0, 3, 6, 9],
};

type Extension = "triad" | "seventh" | "ninth" | "sus4" | "add9";

function chordRootPitchClass(key: KeyInfo, degree: number): number {
  const offset = (key.mode === "major" ? MAJOR_DEGREE_TO_OFFSET : MINOR_DEGREE_TO_OFFSET)[degree] ?? 0;
  return (key.tonic + offset) % 12;
}

function triadQuality(key: KeyInfo, degree: number): TriadQuality {
  return (key.mode === "major" ? MAJOR_TRIAD_BY_DEGREE : MINOR_TRIAD_BY_DEGREE)[degree] ?? "major";
}

function chordIntervals(key: KeyInfo, degree: number, extension: Extension): number[] {
  const quality = triadQuality(key, degree);
  if (extension === "sus4") return [0, 5, 7];
  if (extension === "add9") {
    // dim-add9 는 탁해서 피한다. 다만 [0,7] 로 줄이면 성부가 둘뿐이라
    // 화음이 비어 들리므로 감3화음 그대로를 쓴다.
    if (quality === "diminished") return TRIAD_INTERVALS.diminished;
    return [0, TRIAD_INTERVALS[quality][1], 7, 14];
  }
  if (extension === "seventh" || extension === "ninth") {
    const sevQuality = (key.mode === "major" ? MAJOR_SEVENTH_BY_DEGREE : MINOR_SEVENTH_BY_DEGREE)[degree] ?? "dom7";
    const base = SEVENTH_INTERVALS[sevQuality];
    return extension === "ninth" ? [...base, 14] : base;
  }
  return TRIAD_INTERVALS[quality];
}

/** Closest MIDI note with the given pitch class to a target MIDI note. */
function pitchNear(pitchClass: number, target: number): number {
  return pitchClass + 12 * Math.round((target - pitchClass) / 12);
}

// 노트북·휴대폰 스피커는 대략 이 아래를 재생하지 못한다. 보이싱이 이보다 낮게 깔리면
// 화음이 "안 들려서" 멜로디만 단음으로 나는 것처럼 들린다.
const MIN_CHORD_MIDI = 45; // A2 (110Hz)

/**
 * 화음을 근음 위에 음정 구조 그대로 쌓고, 그 덩어리를 옥타브 단위로 옮겨
 * (1) 최고음이 멜로디보다 반드시 낮고 (2) 가능한 한 들리는 음역에 오도록 배치한다.
 *
 * 이전 구현(stackClose)은 성부를 하나씩 올리면서 천장을 넘으면 내리고 다시 올리는
 * 방식이라, 좁은 구간에서는 마지막 성부가 멜로디 위로 튀어 나가고 같은 음이
 * 두 번 잡히기도 했다. 간격을 통째로 유지하면 그 두 문제가 같이 사라진다.
 */
function voiceChord(rootPc: number, intervals: number[], melodyMidi: number): number[] {
  const sorted = [...intervals].sort((a, b) => a - b);
  const span = sorted[sorted.length - 1];
  let root = pitchNear(rootPc, melodyMidi - 1 - span);

  let guard = 0;
  while (root + span >= melodyMidi && guard++ < 6) root -= 12;
  guard = 0;
  while (root < MIN_CHORD_MIDI && root + 12 + span < melodyMidi && guard++ < 6) root += 12;

  return sorted.map((i) => root + i);
}

/**
 * 음정 폭이 넓은 보이싱(9th·오픈 보이싱)은 멜로디가 낮으면 통째로 저역으로 밀려
 * 들리지 않게 된다. 그럴 때는 확장음을 접은 좁은 보이싱으로 물러난다.
 */
function voiceWithFallback(rootPc: number, candidates: number[][], melodyMidi: number): number[] {
  for (const intervals of candidates) {
    const voiced = voiceChord(rootPc, intervals, melodyMidi);
    if (Math.min(...voiced) >= MIN_CHORD_MIDI) return voiced;
  }
  return voiceChord(rootPc, candidates[candidates.length - 1], melodyMidi);
}

function hymnVoicing(key: KeyInfo, degree: number, melodyMidi: number): number[] {
  // Melody note itself is the soprano line; the chord synth only supplies
  // bass/tenor/alto beneath it, close and static like a Bach chorale.
  const rootPc = chordRootPitchClass(key, degree);
  return voiceChord(rootPc, chordIntervals(key, degree, "triad"), melodyMidi);
}

function gospelVoicing(
  key: KeyInfo,
  degree: number,
  melodyMidi: number,
  walk: boolean
): { notes: number[]; attackOffsetSec: number } {
  const rootPc = chordRootPitchClass(key, degree);
  const [, third, fifth, seventh, ninth] = chordIntervals(key, degree, "ninth");
  // Walking-bass feel: alternate the bass between the root and the fifth
  // (a stand-in passing tone) instead of always hammering the root.
  // 근음을 5도로 바꿀 때는 나머지 성부를 그 위에 다시 쌓아 자리바꿈처럼 들리게 한다.
  const shift = walk ? 12 - fifth : 0;
  const bassPc = walk ? (rootPc + fifth) % 12 : rootPc;
  const wide = [0, third + shift, seventh + shift, ninth + shift];
  const narrow = [0, third + shift, seventh + shift];
  return {
    notes: voiceWithFallback(bassPc, [wide, narrow], melodyMidi),
    attackOffsetSec: walk ? 0.045 : 0,
  };
}

function worshipVoicing(key: KeyInfo, degree: number, melodyMidi: number): number[] {
  const useSus = degree === 5 || degree === 1;
  const base = chordIntervals(key, degree, useSus ? "sus4" : "add9");
  const rootPc = chordRootPitchClass(key, degree);
  // 넓게 벌린 오픈 보이싱: 최고 성부를 한 옥타브 띄워 공간감을 만든다.
  // 멜로디가 낮아 자리가 없으면 좁은 보이싱으로 물러난다.
  const open = [...base.slice(0, -1), base[base.length - 1] + 12];
  return voiceWithFallback(rootPc, [open, base], melodyMidi);
}

function ccliVoicing(key: KeyInfo, degree: number, melodyMidi: number, progress: number): number[] {
  const rootPc = chordRootPitchClass(key, degree);
  const [, third, fifth, seventh] = chordIntervals(key, degree, "seventh");
  // Verse -> chorus style build: 3화음(근음·3도·5도)은 항상 유지하고,
  // 곡이 진행될수록 7도를 더해 밀도만 올린다.
  // (예전에는 앞 절반이 근음+5도 2음뿐이라 화음이 비어 들렸다.)
  const intervals = progress < 0.5 ? [0, third, fifth] : [0, third, fifth, seventh];
  return voiceChord(rootPc, intervals, melodyMidi);
}

export interface HarmonizedChord {
  notes: number[];
  degree: number;
  attackOffsetSec: number;
}

/**
 * Builds the accompaniment chord for the note at `index`. Chromatic/non-diatonic
 * melody notes (scaleDegree === null) keep sounding over the previous chord
 * (`prevDegree`) instead of forcing a harmony change on every passing tone.
 */
export function harmonizeNote(
  song: AnalyzedSong,
  index: number,
  style: HarmonyStyle,
  prevDegree: number | null
): HarmonizedChord | null {
  if (style === "off") return null;
  const note = song.notes[index];
  if (!note) return null;
  const degree = note.scaleDegree ?? prevDegree ?? 1;
  const key = song.key;

  if (style === "hymn") {
    return { notes: hymnVoicing(key, degree, note.midi), degree, attackOffsetSec: 0 };
  }
  if (style === "gospel") {
    const walk = index % 2 === 1;
    const { notes, attackOffsetSec } = gospelVoicing(key, degree, note.midi, walk);
    return { notes, degree, attackOffsetSec };
  }
  if (style === "worship") {
    return { notes: worshipVoicing(key, degree, note.midi), degree, attackOffsetSec: 0 };
  }
  // ccli
  const total = Math.max(song.notes.length - 1, 1);
  const progress = index / total;
  return { notes: ccliVoicing(key, degree, note.midi, progress), degree, attackOffsetSec: 0 };
}
