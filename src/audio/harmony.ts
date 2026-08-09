import type { KeyMode } from "../types/music";

// 멜로디 한 음마다 그 음을 품는 3화음을 골라 아래에 깔아준다.
// 곡 전체를 미리 화성 분석하지 않고 음 단위로 고르기 때문에 완벽한 화성학은 아니지만,
// 조성 안에서 골라 쓰므로 실제 반주처럼 들린다.

export type HarmonyMode = "off" | "auto" | "major" | "minor";

export interface HarmonyOption {
  id: HarmonyMode;
  label: string;
}

export const HARMONY_OPTIONS: HarmonyOption[] = [
  { id: "off", label: "없음" },
  { id: "auto", label: "자동" },
  { id: "major", label: "장조" },
  { id: "minor", label: "단조" },
];

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const NATURAL_MINOR = [0, 2, 3, 5, 7, 8, 10];

// 멜로디 음을 품은 화음이 여럿일 때의 선호 순서: I → V → IV → vi → ii → iii → vii°
// 주요 3화음(I, IV, V)을 앞에 두어야 반주가 흔들리지 않는다.
const DEGREE_PRIORITY = [0, 4, 3, 5, 1, 2, 6];

function scaleFor(mode: KeyMode): number[] {
  return mode === "minor" ? NATURAL_MINOR : MAJOR_SCALE;
}

/** 해당 도수 위에 스케일 3도씩 쌓은 3화음의 반음 간격(근음 기준). */
function triadIntervals(scale: number[], degree: number): number[] {
  const root = scale[degree];
  const third = (scale[(degree + 2) % 7] - root + 12) % 12;
  const fifth = (scale[(degree + 4) % 7] - root + 12) % 12;
  return [0, third, fifth];
}

/** 화음 모드와 곡의 조성을 합쳐 실제로 쓸 장/단조를 정한다. off 면 null. */
export function resolveHarmonyMode(mode: HarmonyMode, songMode: KeyMode): KeyMode | null {
  if (mode === "off") return null;
  if (mode === "auto") return songMode;
  return mode;
}

/**
 * 멜로디 음(midi)에 어울리는 3화음을 멜로디보다 한 옥타브 아래에 배치해 돌려준다.
 * tonic 은 조성의 으뜸음 피치클래스(0-11).
 */
export function chordForMelodyNote(midi: number, tonic: number, mode: KeyMode): number[] {
  const scale = scaleFor(mode);
  const relPc = (((midi - tonic) % 12) + 12) % 12;

  // 멜로디 음을 구성음으로 가진 화음을 우선순위대로 찾는다.
  let degree = -1;
  for (const d of DEGREE_PRIORITY) {
    const pcs = triadIntervals(scale, d).map((i) => (scale[d] + i) % 12);
    if (pcs.includes(relPc)) {
      degree = d;
      break;
    }
  }

  let rootPc: number;
  let intervals: number[];
  if (degree >= 0) {
    rootPc = (((tonic + scale[degree]) % 12) + 12) % 12;
    intervals = triadIntervals(scale, degree);
  } else {
    // 조성 밖의 음(비화성음). 으뜸화음으로 받치면 반음 충돌이 나기 쉬우므로
    // (예: 다단조 반주에 E♮ 멜로디 -> E♭ 과 충돌) 멜로디 음 자체를 근음으로 삼아
    // 조성의 성격(장/단)에 맞는 3화음을 쌓는다. 멜로디가 항상 구성음이 된다.
    rootPc = (((midi % 12) + 12) % 12);
    intervals = mode === "minor" ? [0, 3, 7] : [0, 4, 7];
  }
  // 멜로디와 겹쳐 탁해지지 않도록 근음을 멜로디 한 옥타브 아래 이하로 내린다.
  const ceiling = midi - 12;
  const root = rootPc + 12 * Math.floor((ceiling - rootPc) / 12);

  return intervals.map((i) => root + i).filter((n) => n >= 24 && n <= 96);
}
