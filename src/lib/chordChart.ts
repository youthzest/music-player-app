// 곡을 미리 훑어 마디 단위 코드 진행표를 만든다.
//
// 음 하나마다 화음을 새로 고르면 반주가 계속 흔들린다. 실제 악보의 코드네임은
// 보통 마디(또는 반마디)에 하나씩 붙고, 그 구간의 멜로디 전체를 설명하는 화음이
// 선택된다. 여기서도 같은 방식으로 구간을 잘라 후보 코드를 채점한다.

import type { AnalyzedSong, KeyInfo } from "../types/music";
import { PITCH_CLASS_NAMES } from "../types/music";
import type { HarmonyStyle } from "./harmony";

export type ChordQuality =
  | "maj"
  | "min"
  | "dim"
  | "sus2"
  | "sus4"
  | "add9"
  | "maj7"
  | "min7"
  | "dom7";

interface QualitySpec {
  /** 근음 기준 반음 간격 */
  intervals: number[];
  /** 코드네임 접미사 — C, Am, Csus2, Cadd9, CM7 ... */
  suffix: string;
  /** 같은 점수일 때 단순한 화음을 고르기 위한 감점 */
  complexity: number;
}

export const QUALITY_SPECS: Record<ChordQuality, QualitySpec> = {
  maj: { intervals: [0, 4, 7], suffix: "", complexity: 0 },
  min: { intervals: [0, 3, 7], suffix: "m", complexity: 0 },
  dim: { intervals: [0, 3, 6], suffix: "dim", complexity: 1.2 },
  sus2: { intervals: [0, 2, 7], suffix: "sus2", complexity: 0.5 },
  sus4: { intervals: [0, 5, 7], suffix: "sus4", complexity: 0.5 },
  add9: { intervals: [0, 4, 7, 14], suffix: "add9", complexity: 0.7 },
  maj7: { intervals: [0, 4, 7, 11], suffix: "M7", complexity: 0.6 },
  min7: { intervals: [0, 3, 7, 10], suffix: "m7", complexity: 0.6 },
  dom7: { intervals: [0, 4, 7, 10], suffix: "7", complexity: 0.6 },
};

/** 스타일마다 쓰는 코드 어휘가 다르다. 찬송가에 sus2 가 나오면 어색하다. */
const STYLE_VOCABULARY: Record<Exclude<HarmonyStyle, "off">, ChordQuality[]> = {
  hymn: ["maj", "min", "dim"],
  gospel: ["maj", "min", "maj7", "min7", "dom7"],
  worship: ["maj", "min", "sus2", "sus4", "add9"],
  ccli: ["maj", "min", "sus4", "add9", "maj7", "min7", "dom7"],
};

export interface ChordSegment {
  /** 구간 시작/끝 (초) */
  startTime: number;
  endTime: number;
  /** 이 구간에 속한 음표 인덱스 범위 (endIndex 미포함) */
  startIndex: number;
  endIndex: number;
  rootPc: number;
  quality: ChordQuality;
  /** 화면에 표시할 코드네임 — "C", "Am", "Csus4" ... */
  label: string;
  intervals: number[];
}

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
// 단조는 딸림화음이 제대로 해결되도록 화성단음계의 이끔음을 쓴다.
const NATURAL_MINOR = [0, 2, 3, 5, 7, 8, 10];

function scaleOf(key: KeyInfo): number[] {
  return key.mode === "minor" ? NATURAL_MINOR : MAJOR_SCALE;
}

// 각 음계 도수 위에 서는 3화음. 실제 코드표는 거의 이 안에서 움직인다.
const MAJOR_DEGREE_TRIAD: ChordQuality[] = ["maj", "min", "min", "maj", "maj", "min", "dim"];
const MINOR_DEGREE_TRIAD: ChordQuality[] = ["min", "dim", "maj", "min", "maj", "maj", "maj"];
const MAJOR_DEGREE_SEVENTH: (ChordQuality | null)[] = [
  "maj7", "min7", "min7", "maj7", "dom7", "min7", null,
];
const MINOR_DEGREE_SEVENTH: (ChordQuality | null)[] = [
  "min7", null, "maj7", "min7", "dom7", "maj7", "dom7",
];

interface Candidate2 {
  rootPc: number;
  quality: ChordQuality;
}

/**
 * 조성 안에서 실제로 쓰일 수 있는 화음만 후보로 만든다.
 * 12개 근음 × 모든 종류를 다 열어두면 지나가는 음 하나 때문에
 * D장조 곡에 Dm 이나 B 같은 코드가 튀어나온다.
 */
function candidatesForKey(key: KeyInfo, vocabulary: ChordQuality[]): Candidate2[] {
  const scale = scaleOf(key);
  const pcs = new Set(scale.map((s) => (key.tonic + s) % 12));
  const allowed = new Set(vocabulary);
  const triads = key.mode === "minor" ? MINOR_DEGREE_TRIAD : MAJOR_DEGREE_TRIAD;
  const sevenths = key.mode === "minor" ? MINOR_DEGREE_SEVENTH : MAJOR_DEGREE_SEVENTH;

  const out: Candidate2[] = [];
  for (let d = 0; d < 7; d++) {
    const rootPc = (key.tonic + scale[d]) % 12;
    const triad = triads[d];
    if (allowed.has(triad)) out.push({ rootPc, quality: triad });

    const seventh = sevenths[d];
    if (seventh && allowed.has(seventh)) out.push({ rootPc, quality: seventh });

    if (triad === "dim") continue; // 감화음에는 sus/add9 를 붙이지 않는다
    // sus2·sus4·add9 는 덧붙는 음까지 조성 안에 있을 때만 허용한다.
    if (allowed.has("sus2") && pcs.has((rootPc + 2) % 12)) out.push({ rootPc, quality: "sus2" });
    if (allowed.has("sus4") && pcs.has((rootPc + 5) % 12)) out.push({ rootPc, quality: "sus4" });
    if (allowed.has("add9") && triad === "maj" && pcs.has((rootPc + 2) % 12)) {
      out.push({ rootPc, quality: "add9" });
    }
  }
  return out;
}

/** 으뜸·버금딸림·딸림화음은 어느 곡에서나 자주 쓰이므로 살짝 우대한다. */
function functionalBonus(key: KeyInfo, rootPc: number): number {
  const rel = ((rootPc - key.tonic) % 12 + 12) % 12;
  if (rel === 0) return 0.6; // I
  if (rel === 7) return 0.45; // V
  if (rel === 5) return 0.4; // IV
  if (key.mode === "major" && rel === 9) return 0.3; // vi
  if (key.mode === "minor" && rel === 3) return 0.3; // III
  return 0;
}

/** 마디 길이(초). time 이 4분음표 기준으로 계산돼 있으므로 그에 맞춘다. */
function measureSeconds(song: AnalyzedSong): number {
  const { numerator, denominator } = song.timeSignature;
  const quarterBeats = (numerator * 4) / (denominator || 4);
  const secondsPerQuarter = 60 / (song.tempo || 120);
  const len = quarterBeats * secondsPerQuarter;
  return len > 0.1 ? len : 2;
}

interface Candidate {
  rootPc: number;
  quality: ChordQuality;
  score: number;
}

function scoreSegment(
  weights: number[],
  totalWeight: number,
  bassPc: number | null,
  key: KeyInfo,
  candidates: Candidate2[],
  prev: Candidate | null
): Candidate | null {
  if (totalWeight <= 0) return null;

  let best: Candidate | null = null;
  for (const { rootPc, quality } of candidates) {
    const spec = QUALITY_SPECS[quality];
    const tones = new Set(spec.intervals.map((i) => (rootPc + i) % 12));

    let score = 0;
    for (let pc = 0; pc < 12; pc++) {
      if (weights[pc] === 0) continue;
      const w = weights[pc] / totalWeight;
      // 화음에 속한 음은 더하고, 벗어난 음은 뺀다. 지나가는 음 하나 때문에
      // 화음이 바뀌지 않도록 감점은 가점보다 약하게 둔다.
      score += tones.has(pc) ? w : -0.55 * w;
    }

    // 구간 첫 음이 화음 구성음이면 그 화음일 가능성이 높다.
    if (bassPc !== null && tones.has(bassPc)) score += 0.25;
    score += functionalBonus(key, rootPc);
    score -= spec.complexity * 0.12;
    // 앞 구간과 같은 화음이면 우대해서 진행이 덜 흔들리게 한다.
    // 실제 악보도 한 코드를 여러 마디 끄는 경우가 많다.
    if (prev && prev.rootPc === rootPc && prev.quality === quality) score += 0.4;

    if (!best || score > best.score) best = { rootPc, quality, score };
  }
  return best;
}

/**
 * 곡 전체를 반마디 단위로 훑어 코드 진행표를 만든다.
 * 같은 코드가 이어지면 하나로 합쳐서 실제 악보의 코드네임처럼 보이게 한다.
 */
export function analyzeChordChart(song: AnalyzedSong, style: HarmonyStyle): ChordSegment[] {
  if (style === "off" || song.notes.length === 0) return [];

  const candidates = candidatesForKey(song.key, STYLE_VOCABULARY[style]);
  if (candidates.length === 0) return [];
  // 반마디마다 후보를 뽑는다. 마디당 코드가 둘인 곡도 잡아내되,
  // 결과가 같으면 아래에서 다시 합쳐지므로 과하게 쪼개지지 않는다.
  const step = measureSeconds(song) / 2;
  const end = Math.max(
    song.durationSeconds,
    ...song.notes.map((n) => n.time + n.duration)
  );

  const raw: ChordSegment[] = [];
  let prev: Candidate | null = null;

  for (let start = 0; start < end - 1e-6; start += step) {
    const stop = start + step;
    const weights = new Array(12).fill(0);
    let totalWeight = 0;
    let startIndex = -1;
    let endIndex = -1;
    let bassPc: number | null = null;

    for (let i = 0; i < song.notes.length; i++) {
      const n = song.notes[i];
      const overlap = Math.min(n.time + n.duration, stop) - Math.max(n.time, start);
      if (overlap <= 0) continue;
      if (startIndex === -1) {
        startIndex = i;
        bassPc = ((n.midi % 12) + 12) % 12;
      }
      endIndex = i + 1;
      const pc = ((n.midi % 12) + 12) % 12;
      weights[pc] += overlap;
      totalWeight += overlap;
    }

    if (totalWeight <= 0) continue;

    const best = scoreSegment(weights, totalWeight, bassPc, song.key, candidates, prev);
    if (!best) continue;
    prev = best;

    const spec = QUALITY_SPECS[best.quality];
    raw.push({
      startTime: start,
      endTime: stop,
      startIndex,
      endIndex,
      rootPc: best.rootPc,
      quality: best.quality,
      label: `${PITCH_CLASS_NAMES[best.rootPc]}${spec.suffix}`,
      intervals: spec.intervals,
    });
  }

  // 같은 코드가 연달아 나오면 한 구간으로 합친다.
  const merged: ChordSegment[] = [];
  for (const seg of raw) {
    const last = merged[merged.length - 1];
    if (last && last.rootPc === seg.rootPc && last.quality === seg.quality) {
      last.endTime = seg.endTime;
      last.endIndex = seg.endIndex;
    } else {
      merged.push({ ...seg });
    }
  }
  return merged;
}

/** 해당 음표 인덱스가 속한 코드 구간을 찾는다. */
export function chordAtIndex(chart: ChordSegment[], index: number): ChordSegment | null {
  for (const seg of chart) {
    if (index >= seg.startIndex && index < seg.endIndex) return seg;
  }
  return null;
}
