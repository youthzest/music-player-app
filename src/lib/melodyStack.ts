// 멜로디 성부 자체를 두껍게 만드는 유틸. 반주 화음(chordChart.ts)과는 별개로,
// 지금 울리는 멜로디 음 하나를 여러 방식으로 겹쳐 소리 낸다. 실제 편곡자들이
// 쓰는 방식이 상황마다 다르므로(무난한 옥타브 더블링부터, 그 순간의 반주
// 코드를 그대로 따라가는 코드톤 하모나이제이션까지) 여러 모드를 선택지로 둔다.

import type { KeyInfo } from "../types/music";
import { pitchNear } from "./harmony";

export type MelodyStackMode = "off" | "octave" | "third" | "triad" | "chordTone" | "voiceLead";

export interface MelodyStackDef {
  id: MelodyStackMode;
  label: string;
  description: string;
}

export const MELODY_STACK_MODES: MelodyStackDef[] = [
  { id: "off", label: "단음", description: "멜로디를 원음 그대로 한 음씩 냅니다." },
  {
    id: "octave",
    label: "옥타브",
    description: "한 옥타브 위를 겹쳐 웅장하게 냅니다. 어떤 화성에서도 안 어긋나는 가장 무난한 방식.",
  },
  {
    id: "third",
    label: "3도 화성",
    description: "조성 안에서 3도 아래를 겹쳐 듀엣처럼 냅니다. 가스펠 백보컬·바버샵에서 흔한 방식.",
  },
  {
    id: "triad",
    label: "도미솔",
    description: "조성 안에서 3도·5도 위로 쌓아 3화음처럼 냅니다 (도 → 도미솔).",
  },
  {
    id: "chordTone",
    label: "코드톤",
    description: "그 순간 반주 코드의 실제 구성음(7th·9th 포함) 중 가까운 음을 겹칩니다. 재즈·가스펠식.",
  },
  {
    id: "voiceLead",
    label: "보이스 리딩",
    description: "코드톤을 겹치되, 앞서 겹친 음과 최소한만 움직이도록 부드럽게 이어갑니다.",
  },
];

export function getMelodyStackMode(id: MelodyStackMode): MelodyStackDef {
  return MELODY_STACK_MODES.find((m) => m.id === id) ?? MELODY_STACK_MODES[0];
}

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const NATURAL_MINOR = [0, 2, 3, 5, 7, 8, 10];

function scaleOf(key: KeyInfo): number[] {
  return key.mode === "minor" ? NATURAL_MINOR : MAJOR_SCALE;
}

/**
 * MIDI 음을 조성의 음계 위 위치(옥타브를 넘나드는 정수축)로 바꾼다.
 * 음계에 없는 반음계적 음(꾸밈음 등)은 가장 가까운 음계 음으로 스냅한다.
 */
function toScaleIndex(midi: number, key: KeyInfo): number {
  const scale = scaleOf(key);
  const octave = Math.floor((midi - key.tonic) / 12);
  const rel = ((midi - key.tonic) % 12 + 12) % 12;

  let best = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < scale.length; i++) {
    const diff = Math.min(Math.abs(scale[i] - rel), 12 - Math.abs(scale[i] - rel));
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return octave * scale.length + best;
}

function fromScaleIndex(index: number, key: KeyInfo): number {
  const scale = scaleOf(key);
  const octave = Math.floor(index / scale.length);
  const i = ((index % scale.length) + scale.length) % scale.length;
  return key.tonic + octave * 12 + scale[i];
}

/** 한 옥타브 위를 겹친다. */
export function octaveStack(midi: number): number[] {
  return [midi, midi + 12];
}

/** 조성 안에서 3도 아래를 겹친다 (듀엣 화성). */
export function thirdBelowStack(midi: number, key: KeyInfo): number[] {
  const idx = toScaleIndex(midi, key);
  const below = fromScaleIndex(idx - 2, key);
  return [below, midi];
}

/**
 * 멜로디 음 하나를 조성 안에서 3도 위·5도 위로 쌓는다 (예: Do -> Do·Mi·Sol).
 * 반음계적 꾸밈음은 가장 가까운 음계 음 기준으로 쌓이므로 화성에서 크게 벗어나지 않는다.
 */
export function triadStack(midi: number, key: KeyInfo): number[] {
  const idx = toScaleIndex(midi, key);
  const third = fromScaleIndex(idx + 2, key);
  const fifth = fromScaleIndex(idx + 4, key);
  return [midi, third, fifth];
}

/** chordPcs(화음 구성음의 피치클래스)를 target 에 가까운 순서로 정렬해 돌려준다. exclude 와 같은 음은 뺀다. */
function chordToneCandidates(chordPcs: number[], target: number, exclude: number): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const pc of chordPcs) {
    const midi = pitchNear(pc, target);
    if (midi === exclude || seen.has(midi)) continue;
    seen.add(midi);
    out.push(midi);
  }
  out.sort((a, b) => Math.abs(a - target) - Math.abs(b - target));
  return out;
}

/** 지금 울리는 반주 코드의 구성음 중, 멜로디에 가까운 최대 2개를 겹친다. */
export function chordToneStack(melodyMidi: number, chordPcs: number[]): number[] {
  if (chordPcs.length === 0) return [melodyMidi];
  const extra = chordToneCandidates(chordPcs, melodyMidi, melodyMidi).slice(0, 2);
  return [melodyMidi, ...extra].sort((a, b) => a - b);
}

/**
 * 코드톤을 겹치되, 매번 멜로디 기준으로 새로 고르지 않고 "앞서 겹친 음"에서
 * 가장 가까운 코드톤을 골라 부드럽게 이어간다 (성부가 계단처럼만 움직이는
 * 전통적인 보이스 리딩). prevMidi 가 없으면(첫 음이거나 코드가 방금 바뀌었으면)
 * 멜로디 근처에서 새로 시작한다.
 */
export function voiceLeadStack(
  melodyMidi: number,
  chordPcs: number[],
  prevMidi: number | null
): { notes: number[]; next: number | null } {
  if (chordPcs.length === 0) return { notes: [melodyMidi], next: null };

  const anchor = prevMidi ?? melodyMidi - 4;
  const nearAnchor = chordToneCandidates(chordPcs, anchor, melodyMidi).filter(
    (m) => Math.abs(m - melodyMidi) <= 12
  );
  const picked = nearAnchor[0] ?? pitchNear(chordPcs[0], melodyMidi - 4);
  return { notes: [picked, melodyMidi].sort((a, b) => a - b), next: picked };
}
