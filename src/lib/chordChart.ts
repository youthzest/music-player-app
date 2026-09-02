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
  | "two"
  | "maj7"
  | "min7"
  | "dom7"
  | "maj9"
  | "min9"
  | "min11"
  | "dom13";

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
  // 3음을 비우고 9음을 얹은 오픈 코드. 워십 악보에서 G2 로 표기한다.
  two: { intervals: [0, 7, 14], suffix: "2", complexity: 0.8 },
  maj7: { intervals: [0, 4, 7, 11], suffix: "M7", complexity: 0.6 },
  min7: { intervals: [0, 3, 7, 10], suffix: "m7", complexity: 0.6 },
  dom7: { intervals: [0, 4, 7, 10], suffix: "7", complexity: 0.6 },
  maj9: { intervals: [0, 4, 7, 11, 14], suffix: "M9", complexity: 1.0 },
  min9: { intervals: [0, 3, 7, 10, 14], suffix: "m9", complexity: 1.0 },
  min11: { intervals: [0, 3, 7, 10, 17], suffix: "m11", complexity: 1.1 },
  dom13: { intervals: [0, 4, 7, 10, 21], suffix: "13", complexity: 1.1 },
};

interface StyleHarmony {
  vocabulary: ChordQuality[];
  /**
   * 그 스타일의 간판 코드. 가산점을 줘서 실제로 자주 등장하게 만든다.
   * 이게 없으면 복잡도 감점 때문에 텐션 코드가 늘 단순 3화음에 밀린다.
   */
  favor: ChordQuality[];
  /** 분수코드(D/F#) 를 만들지 */
  inversions: boolean;
}

/** 스타일마다 쓰는 코드 어휘가 다르다. 찬송가에 sus2 가 나오면 어색하다. */
const STYLE_HARMONY: Record<Exclude<HarmonyStyle, "off">, StyleHarmony> = {
  hymn: { vocabulary: ["maj", "min", "dim"], favor: [], inversions: false },
  gospel: {
    vocabulary: ["maj", "min", "maj7", "min7", "dom7"],
    favor: ["maj7", "min7", "dom7"],
    inversions: false,
  },
  worship: {
    vocabulary: ["maj", "min", "sus2", "sus4", "add9"],
    favor: ["sus4", "sus2"],
    inversions: false,
  },
  ccli: {
    vocabulary: ["maj", "min", "sus4", "add9", "maj7", "min7", "dom7"],
    favor: ["add9", "min7"],
    inversions: false,
  },
  // 힐송 — Dadd9 / Asus4 / Bm7 / Gadd9. sus4 를 앞세우고 분수코드는 쓰지 않는다.
  hillsong: {
    vocabulary: ["maj", "add9", "sus4", "min7"],
    favor: ["add9", "min7"],
    inversions: false,
  },
  // 벧엘 — DM7 / Bm11 / G2. 3음을 비운 코드가 이 스타일의 색이다.
  bethel: {
    vocabulary: ["maj7", "min11", "two", "add9", "min7"],
    favor: ["maj7", "min11", "two"],
    inversions: false,
  },
  // 제이어스 — Dadd9 / D/F# / Bm7. sus 없이 담백하게 가고 베이스가 움직인다.
  jesusimage: {
    vocabulary: ["maj", "add9", "min7"],
    favor: ["add9"],
    inversions: true,
  },
  // 마커스 — Dsus2 / Gadd9 / Bm7
  marcus: {
    vocabulary: ["maj", "sus2", "add9", "min7"],
    favor: ["sus2", "add9"],
    inversions: false,
  },
  // 재즈 워십 — DM9 / Em9 / A13
  jazz: {
    vocabulary: ["maj9", "min9", "dom13", "min7", "maj7"],
    favor: ["maj9", "min9", "dom13"],
    inversions: true,
  },
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
  /** 분수코드일 때의 베이스 음. 근음과 같으면 일반 코드. */
  bassPc: number;
  /** 화면에 표시할 코드네임 — "C", "Am", "Csus4", "D/F#" ... */
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
  const inScale = (rootPc: number, interval: number) => pcs.has((rootPc + interval) % 12);

  const out: Candidate2[] = [];
  const push = (rootPc: number, quality: ChordQuality) => {
    if (allowed.has(quality)) out.push({ rootPc, quality });
  };

  for (let d = 0; d < 7; d++) {
    const rootPc = (key.tonic + scale[d]) % 12;
    const triad = triads[d];
    const seventh = sevenths[d];
    push(rootPc, triad);
    if (seventh) push(rootPc, seventh);

    if (triad === "dim") continue; // 감화음에는 sus·텐션을 붙이지 않는다

    // 덧붙는 음까지 조성 안에 있을 때만 허용한다. 그래야 코드표가 조성을 벗어나지 않는다.
    if (inScale(rootPc, 2)) {
      push(rootPc, "sus2");
      push(rootPc, "two");
      if (triad === "maj") push(rootPc, "add9");
    }
    if (inScale(rootPc, 5)) push(rootPc, "sus4");

    // 9th·11th·13th 텐션은 해당 7화음이 성립하는 도수에서만 쓴다.
    if (seventh === "maj7" && inScale(rootPc, 2)) push(rootPc, "maj9");
    if (seventh === "min7" && inScale(rootPc, 2)) push(rootPc, "min9");
    if (seventh === "min7" && inScale(rootPc, 5)) push(rootPc, "min11");
    if (seventh === "dom7" && inScale(rootPc, 9)) push(rootPc, "dom13");
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

// 장르색(favor)·유지(prev) 보너스가 실제 멜로디 적합도(base)를 뒤집을 수 있는 폭.
// 이보다 크면 멜로디와 안 맞는 화음도 보너스만으로 계속 이겨서, 그 화음에
// 곡이 끝날 때까지 눌러앉는 문제가 생긴다. 그래서 base 점수가 최고 후보와
// TIE_MARGIN 이내인 "그럴듯한" 후보끼리만 보너스로 순위를 가른다.
const TIE_MARGIN = 0.2;

function scoreSegment(
  weights: number[],
  totalWeight: number,
  bassPc: number | null,
  key: KeyInfo,
  candidates: Candidate2[],
  favor: Set<ChordQuality>,
  prev: Candidate | null
): Candidate | null {
  if (totalWeight <= 0) return null;

  const scored: { rootPc: number; quality: ChordQuality; base: number }[] = [];
  let maxBase = -Infinity;

  for (const { rootPc, quality } of candidates) {
    const spec = QUALITY_SPECS[quality];
    const tones = new Set(spec.intervals.map((i) => (rootPc + i) % 12));

    let base = 0;
    for (let pc = 0; pc < 12; pc++) {
      if (weights[pc] === 0) continue;
      const w = weights[pc] / totalWeight;
      // 화음에 속한 음은 더하고, 벗어난 음은 뺀다. 지나가는 음 하나 때문에
      // 화음이 바뀌지 않도록 감점은 가점보다 약하게 둔다.
      base += tones.has(pc) ? w : -0.55 * w;
    }

    // 구간 첫 음이 화음 구성음이면 그 화음일 가능성이 높다.
    if (bassPc !== null && tones.has(bassPc)) base += 0.25;
    base += functionalBonus(key, rootPc);
    base -= spec.complexity * 0.12;

    if (base > maxBase) maxBase = base;
    scored.push({ rootPc, quality, base });
  }

  let best: Candidate | null = null;
  for (const c of scored) {
    let score = c.base;
    // 멜로디와 그럴듯하게 맞는 후보에게만 장르색/유지 보너스를 준다.
    if (c.base >= maxBase - TIE_MARGIN) {
      // 스타일 간판 코드는 복잡도 감점을 상쇄하고도 남을 만큼 밀어준다.
      if (favor.has(c.quality)) score += 0.32;
      // 앞 구간과 같은 화음이면 우대해서 진행이 덜 흔들리게 한다.
      // 실제 악보도 한 코드를 여러 마디 끄는 경우가 많다.
      if (prev && prev.rootPc === c.rootPc && prev.quality === c.quality) score += 0.4;
    }
    if (!best || score > best.score) best = { rootPc: c.rootPc, quality: c.quality, score };
  }
  return best;
}

/**
 * 곡 전체를 반마디 단위로 훑어 코드 진행표를 만든다.
 * 같은 코드가 이어지면 하나로 합쳐서 실제 악보의 코드네임처럼 보이게 한다.
 */
export function analyzeChordChart(song: AnalyzedSong, style: HarmonyStyle): ChordSegment[] {
  if (style === "off" || song.notes.length === 0) return [];

  const styleHarmony = STYLE_HARMONY[style];
  const candidates = candidatesForKey(song.key, styleHarmony.vocabulary);
  if (candidates.length === 0) return [];
  const favor = new Set(styleHarmony.favor);
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

    const best = scoreSegment(weights, totalWeight, bassPc, song.key, candidates, favor, prev);
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
      bassPc: best.rootPc,
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
  if (styleHarmony.inversions) applyInversions(merged);
  return merged;
}

/**
 * 분수코드(D/F#) 후처리.
 *
 * 다음 코드의 근음이 이 코드의 3음 바로 위/아래라면 3음을 베이스로 내려서
 * 베이스가 계단처럼 이어지게 만든다. 제이어스·힐송 반주에서 흔한 움직임이다.
 * (예: D - G 사이에 D/F# 를 두면 베이스가 D-F#-G 로 올라간다.)
 */
function applyInversions(chart: ChordSegment[]): void {
  for (let i = 0; i < chart.length - 1; i++) {
    const seg = chart[i];
    const next = chart[i + 1];
    // 3음이 있는 화음에만 적용한다(sus·2 코드는 3음이 없다).
    const third = seg.intervals.find((iv) => iv === 3 || iv === 4);
    if (third === undefined) continue;

    const thirdPc = (seg.rootPc + third) % 12;
    const gap = ((next.rootPc - thirdPc) % 12 + 12) % 12;
    if (gap !== 1 && gap !== 2) continue;

    seg.bassPc = thirdPc;
    seg.label = `${seg.label}/${PITCH_CLASS_NAMES[thirdPc]}`;
  }
}

/** 해당 음표 인덱스가 속한 코드 구간을 찾는다. */
export function chordAtIndex(chart: ChordSegment[], index: number): ChordSegment | null {
  for (const seg of chart) {
    if (index >= seg.startIndex && index < seg.endIndex) return seg;
  }
  return null;
}
