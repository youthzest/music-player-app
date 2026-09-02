// 반주 스타일 정의와 화음 배치(보이싱) 유틸.
//
// 어떤 코드를 칠지는 chordChart.ts 가 곡 전체를 미리 분석해 정하고,
// 여기서는 스타일의 성격과 "정해진 코드를 어느 높이에 놓을지"를 담당한다.

import type { ChordVoiceTone } from "../audio/instruments";

export type HarmonyStyle =
  | "off"
  | "hymn"
  | "gospel"
  | "worship"
  | "ccli"
  | "hillsong"
  | "bethel"
  | "jesusimage"
  | "marcus"
  | "jazz";

export interface HarmonyStyleDef {
  id: HarmonyStyle;
  label: string;
  /** 대표 코드 — 사용자가 스타일 감을 잡도록 D조 기준으로 보여준다. */
  signature: string;
  description: string;
  /** 반주 성부에 쓰는 음색 */
  tone: ChordVoiceTone;
  /** 화음이 멜로디보다 늦게 들어오는 정도(초). 실제 연주자의 손 움직임을 흉내낸다. */
  laySec: number;
  /** 성부를 아래에서 위로 굴리는 간격(초). 0 이면 동시에 친다. */
  rollSec: number;
  /** 최고 성부를 한 옥타브 띄워 넓게 벌릴지 */
  openVoicing: boolean;
}

export const HARMONY_STYLES: HarmonyStyleDef[] = [
  {
    id: "off",
    label: "화음 없음",
    signature: "",
    description: "멜로디만 단독으로 연주합니다.",
    tone: "warm",
    laySec: 0,
    rollSec: 0,
    openVoicing: false,
  },
  {
    id: "hymn",
    label: "찬송가",
    signature: "D · G · A · Bm",
    description: "3화음 중심의 정격 진행 · 촘촘하고 정적인 코랄 텍스처",
    tone: "organ",
    laySec: 0.006,
    rollSec: 0,
    openVoicing: false,
  },
  {
    id: "gospel",
    label: "가스펠",
    signature: "DM7 · Am7 · A7",
    description: "7화음 확장 · 살짝 당겨 들어오는 싱커페이션",
    tone: "rhodes",
    laySec: 0.045,
    rollSec: 0.012,
    openVoicing: false,
  },
  {
    id: "worship",
    label: "CCM/워십",
    signature: "Dsus4 · Gadd9",
    description: "sus2·sus4·add9 · 넓게 벌린 패드로 공간감",
    tone: "pad",
    laySec: 0.015,
    rollSec: 0.008,
    openVoicing: true,
  },
  {
    id: "ccli",
    label: "CCLI 밴드",
    signature: "D · Bm7 · Gadd9",
    description: "3화음과 7화음·add9 를 섞은 밴드 편성",
    tone: "warm",
    laySec: 0.012,
    rollSec: 0.006,
    openVoicing: true,
  },
  {
    id: "hillsong",
    label: "힐송",
    signature: "Dadd9 · Asus4 · Bm7 · Gadd9",
    description: "add9 와 sus4 를 겹쳐 쌓는 스타디움 워십 사운드",
    tone: "pad",
    laySec: 0.018,
    rollSec: 0.01,
    openVoicing: true,
  },
  {
    id: "bethel",
    label: "벧엘",
    signature: "DM7 · Bm11 · G2",
    description: "maj7·m11·2 코드로 3음을 비운 몽환적인 앰비언트",
    tone: "pad",
    laySec: 0.025,
    rollSec: 0.014,
    openVoicing: true,
  },
  {
    id: "jesusimage",
    label: "제이어스",
    signature: "Dadd9 · D/F# · Bm7",
    description: "add9 에 분수코드를 섞어 베이스가 계단처럼 움직임",
    tone: "warm",
    laySec: 0.015,
    rollSec: 0.008,
    openVoicing: false,
  },
  {
    id: "marcus",
    label: "마커스",
    signature: "Dsus2 · Gadd9 · Bm7",
    description: "sus2 로 3음을 비운 담백하고 서정적인 한국 워십",
    tone: "rhodes",
    laySec: 0.012,
    rollSec: 0.006,
    openVoicing: false,
  },
  {
    id: "jazz",
    label: "재즈 워십",
    signature: "DM9 · Em9 · A13",
    description: "9th·13th 텐션과 롤링 보이싱 · 재즈 하모니",
    tone: "rhodes",
    laySec: 0.05,
    rollSec: 0.022,
    openVoicing: true,
  },
];

export function getHarmonyStyle(id: HarmonyStyle): HarmonyStyleDef {
  return HARMONY_STYLES.find((s) => s.id === id) ?? HARMONY_STYLES[0];
}

// 노트북·휴대폰 스피커는 대략 이 아래를 재생하지 못한다. 보이싱이 이보다 낮게 깔리면
// 화음이 "안 들려서" 멜로디만 단음으로 나는 것처럼 들린다.
export const MIN_CHORD_MIDI = 45; // A2 (110Hz)

/** Closest MIDI note with the given pitch class to a target MIDI note. */
export function pitchNear(pitchClass: number, target: number): number {
  return pitchClass + 12 * Math.round((target - pitchClass) / 12);
}

/**
 * 화음을 근음 위에 음정 구조 그대로 쌓고, 그 덩어리를 옥타브 단위로 옮겨
 * (1) 최고음이 멜로디보다 반드시 낮고 (2) 가능한 한 들리는 음역에 오도록 배치한다.
 */
export function voiceChord(rootPc: number, intervals: number[], melodyMidi: number): number[] {
  const sorted = [...intervals].sort((a, b) => a - b);
  const span = sorted[sorted.length - 1];
  let root = pitchNear(rootPc, melodyMidi - 1 - span);

  let guard = 0;
  while (root + span >= melodyMidi && guard++ < 8) root -= 12;
  guard = 0;
  while (root < MIN_CHORD_MIDI && root + 12 + span < melodyMidi && guard++ < 8) root += 12;

  return sorted.map((i) => root + i);
}

function voiceWithFallback(rootPc: number, candidates: number[][], melodyMidi: number): number[] {
  for (const intervals of candidates) {
    const voiced = voiceChord(rootPc, intervals, melodyMidi);
    if (Math.min(...voiced) >= MIN_CHORD_MIDI) return voiced;
  }
  return voiceChord(rootPc, candidates[candidates.length - 1], melodyMidi);
}

/**
 * 코드 하나를 스타일에 맞게 배치한다.
 * bassPc 가 근음과 다르면 분수코드(D/F#)이므로 그 음을 맨 아래에 따로 놓는다.
 */
export function voiceForStyle(
  style: HarmonyStyleDef,
  rootPc: number,
  intervals: number[],
  melodyMidi: number,
  bassPc?: number
): number[] {
  const upper = style.openVoicing
    ? voiceWithFallback(
        rootPc,
        [[...intervals.slice(0, -1), intervals[intervals.length - 1] + 12], intervals],
        melodyMidi
      )
    : voiceChord(rootPc, intervals, melodyMidi);

  if (bassPc === undefined || bassPc === rootPc) return upper;

  // 분수코드: 베이스를 화음 아래쪽에 따로 깐다.
  let bass = pitchNear(bassPc, Math.min(...upper) - 7);
  while (bass >= Math.min(...upper)) bass -= 12;
  return [bass, ...upper];
}
