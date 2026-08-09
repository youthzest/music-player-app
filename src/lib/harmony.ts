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
    if (quality === "diminished") return [0, 7]; // avoid a muddy dim-add9
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

/** Stacks pitch classes upward in close position starting above `floorMidi`, capped at `ceilingMidi`. */
function stackClose(pitchClasses: number[], floorMidi: number, ceilingMidi: number): number[] {
  const voices: number[] = [];
  let prev = floorMidi;
  for (const pc of pitchClasses) {
    let candidate = pitchNear(pc, prev);
    if (candidate <= prev) candidate += 12;
    while (candidate > ceilingMidi) candidate -= 12;
    while (candidate <= prev) candidate += 12;
    voices.push(candidate);
    prev = candidate;
  }
  return voices;
}

function hymnVoicing(key: KeyInfo, degree: number, melodyMidi: number): number[] {
  // Melody note itself is the soprano line; the chord synth only supplies
  // bass/tenor/alto beneath it, close and static like a Bach chorale.
  const rootPc = chordRootPitchClass(key, degree);
  const [, thirdOffset, fifthOffset] = chordIntervals(key, degree, "triad");
  const thirdPc = (rootPc + thirdOffset) % 12;
  const fifthPc = (rootPc + fifthOffset) % 12;
  const bass = pitchNear(rootPc, melodyMidi - 26);
  const inner = stackClose([fifthPc, thirdPc], bass, melodyMidi - 1);
  return [bass, ...inner];
}

function gospelVoicing(
  key: KeyInfo,
  degree: number,
  melodyMidi: number,
  walk: boolean
): { notes: number[]; attackOffsetSec: number } {
  const rootPc = chordRootPitchClass(key, degree);
  const intervals = chordIntervals(key, degree, "ninth"); // [root, 3rd, 5th, 7th, 9th]
  const pcs = intervals.map((i) => (rootPc + i) % 12);
  // Walking-bass feel: alternate the bass between the root and the fifth
  // (a stand-in passing tone) instead of always hammering the root.
  const bassPc = walk ? pcs[2] : pcs[0];
  const bass = pitchNear(bassPc, melodyMidi - 30);
  const upper = stackClose([pcs[1], pcs[3], pcs[4]], bass, melodyMidi + 4);
  return { notes: [bass, ...upper], attackOffsetSec: walk ? 0.045 : 0 };
}

function worshipVoicing(key: KeyInfo, degree: number, melodyMidi: number): number[] {
  const useSus = degree === 5 || degree === 1;
  const intervals = chordIntervals(key, degree, useSus ? "sus4" : "add9");
  const rootPc = chordRootPitchClass(key, degree);
  const pcs = intervals.map((i) => (rootPc + i) % 12);
  const bass = pitchNear(rootPc, melodyMidi - 36);
  const mid = pitchNear(pcs[1] ?? rootPc, bass + 19); // wide 12th+ gap for open air
  const high = pitchNear(pcs[pcs.length - 1] ?? rootPc, melodyMidi - 2);
  return [bass, mid, high];
}

function ccliVoicing(key: KeyInfo, degree: number, melodyMidi: number, progress: number): number[] {
  const rootPc = chordRootPitchClass(key, degree);
  const intervals = chordIntervals(key, degree, "seventh");
  const pcs = intervals.map((i) => (rootPc + i) % 12);
  const bass = pitchNear(rootPc, melodyMidi - 28);
  // Verse -> chorus style build: start with just root+5th, layer in the 3rd
  // and 7th as the song progresses so the same chord gets denser over time.
  const layerOrder = [pcs[2], pcs[1], pcs[3]];
  const layerCount = progress < 0.33 ? 1 : progress < 0.66 ? 2 : 3;
  const upper = stackClose(layerOrder.slice(0, layerCount), bass, melodyMidi - 1);
  return [bass, ...upper];
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
