// 멜로디 성부 자체를 두껍게 만드는 유틸. 반주 화음(chordChart.ts)과는 별개로,
// 지금 울리는 멜로디 음 하나를 조성 안에서 3도/5도 위로 쌓아 "도" 하나가
// "도-미-솔"처럼 들리게 한다. 단선율이 화음 반주에 묻혀 음량·존재감이
// 부족하게 들리는 문제와, 단음이라 밋밋하게 들리는 문제를 함께 완화한다.

import type { KeyInfo } from "../types/music";

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

/**
 * 멜로디 음 하나를 조성 안에서 3도 위·5도 위로 쌓는다 (예: Do -> Do·Mi·Sol).
 * 반음계적 꾸밈음은 가장 가까운 음계 음 기준으로 쌓이므로 화성에서 크게 벗어나지 않는다.
 */
export function stackMelodyNote(midi: number, key: KeyInfo): number[] {
  const idx = toScaleIndex(midi, key);
  const third = fromScaleIndex(idx + 2, key);
  const fifth = fromScaleIndex(idx + 4, key);
  return [midi, third, fifth];
}
