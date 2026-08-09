// 반주 스타일 정의와 화음 배치(보이싱) 유틸.
//
// 어떤 코드를 칠지는 chordChart.ts 가 곡 전체를 미리 분석해 정한다.
// 여기서는 "정해진 코드를 어느 높이에 어떻게 놓을지"만 담당한다.

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
    description: "3화음(C·Am) 중심 · 정격 진행 · 촘촘하고 정적인 텍스처",
  },
  {
    id: "gospel",
    label: "가스펠",
    description: "7화음(CM7·Am7·C7) 확장 · 살짝 당겨지는 싱커페이션",
  },
  {
    id: "worship",
    label: "CCM/워십",
    description: "sus2·sus4·add9 · 넓게 벌린 패드 사운드로 공간감",
  },
  {
    id: "ccli",
    label: "CCLI 밴드",
    description: "3화음과 7화음·add9 를 섞은 밴드 편성 · 넓은 레이어",
  },
];

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
  while (root + span >= melodyMidi && guard++ < 6) root -= 12;
  guard = 0;
  while (root < MIN_CHORD_MIDI && root + 12 + span < melodyMidi && guard++ < 6) root += 12;

  return sorted.map((i) => root + i);
}

/**
 * 음정 폭이 넓은 보이싱(9th·오픈 보이싱)은 멜로디가 낮으면 통째로 저역으로 밀려
 * 들리지 않게 된다. 그럴 때는 좁은 보이싱으로 물러난다.
 */
export function voiceWithFallback(
  rootPc: number,
  candidates: number[][],
  melodyMidi: number
): number[] {
  for (const intervals of candidates) {
    const voiced = voiceChord(rootPc, intervals, melodyMidi);
    if (Math.min(...voiced) >= MIN_CHORD_MIDI) return voiced;
  }
  return voiceChord(rootPc, candidates[candidates.length - 1], melodyMidi);
}

/**
 * 같은 코드라도 스타일에 따라 벌리는 정도가 다르다.
 * 워십은 최고 성부를 한 옥타브 띄워 공간을 만들고, 나머지는 촘촘하게 둔다.
 */
export function voiceForStyle(
  style: HarmonyStyle,
  rootPc: number,
  intervals: number[],
  melodyMidi: number
): number[] {
  if (style === "worship" || style === "ccli") {
    const open = [...intervals.slice(0, -1), intervals[intervals.length - 1] + 12];
    return voiceWithFallback(rootPc, [open, intervals], melodyMidi);
  }
  return voiceChord(rootPc, intervals, melodyMidi);
}
