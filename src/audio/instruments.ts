import * as Tone from "tone";

// 샘플 없이 Tone.js 합성만으로 만든 음색. 외부 다운로드가 없어 앱이 자체 완결적이다.
// 실제 악기의 파형을 흉내내기보다, 예배 반주에서 그 악기가 맡는 "역할"(어택 속도,
// 지속, 배음 밀도)을 재현하는 데 초점을 맞췄다.

export type InstrumentId =
  | "piano-worship"
  | "acoustic-prayer"
  | "church-organ"
  | "warm-strings"
  | "choir-heaven"
  | "ambient-worship"
  | "epic-orchestra"
  | "cinematic-prayer";

export interface InstrumentDef {
  id: InstrumentId;
  label: string;
  description: string;
  build: () => Tone.PolySynth;
}

/** 어택이 빠르고 배음이 정리된 워십 그랜드 피아노. */
function pianoWorship(): Tone.PolySynth {
  return new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "triangle8" },
    envelope: { attack: 0.004, decay: 1.4, sustain: 0.08, release: 1.3 },
  });
}

/** 통기타 핑거링에 가까운 감쇠. 배음이 조금 더 거칠고 빨리 사그라든다. */
function acousticPrayer(): Tone.PolySynth {
  return new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 3.2,
    modulationIndex: 6,
    oscillator: { type: "triangle" },
    envelope: { attack: 0.005, decay: 1.1, sustain: 0.03, release: 0.9 },
    modulation: { type: "square" },
    modulationEnvelope: { attack: 0.002, decay: 0.35, sustain: 0, release: 0.4 },
  });
}

/** 파이프 오르간 — 배음이 촘촘하고 손을 뗄 때까지 세기가 유지된다. */
function churchOrgan(): Tone.PolySynth {
  return new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "fatsawtooth", count: 4, spread: 24 } as never,
    envelope: { attack: 0.03, decay: 0, sustain: 1, release: 0.35 },
  });
}

/** 현악 앙상블 — 활이 현에 걸리는 시간만큼 어택이 느리다. */
function warmStrings(): Tone.PolySynth {
  return new Tone.PolySynth(Tone.AMSynth, {
    harmonicity: 2,
    oscillator: { type: "fatsawtooth", count: 3, spread: 18 } as never,
    envelope: { attack: 0.35, decay: 0.4, sustain: 0.85, release: 1.6 },
    modulation: { type: "sine" },
    modulationEnvelope: { attack: 0.5, decay: 0.3, sustain: 0.7, release: 1.2 },
  });
}

/** 합창 — 부드럽게 부풀었다 사라지는 사람 목소리에 가까운 곡선. */
function choirHeaven(): Tone.PolySynth {
  return new Tone.PolySynth(Tone.AMSynth, {
    harmonicity: 1.005, // 살짝 어긋난 배음이 여러 사람이 부르는 느낌을 만든다
    oscillator: { type: "sine" },
    envelope: { attack: 0.5, decay: 0.6, sustain: 0.8, release: 2.2 },
    modulation: { type: "triangle" },
    modulationEnvelope: { attack: 0.7, decay: 0.4, sustain: 0.6, release: 1.8 },
  });
}

/** 앰비언트 패드 — 아주 느리게 열리고 오래 남는다. */
function ambientWorship(): Tone.PolySynth {
  return new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "fatsine", count: 3, spread: 30 } as never,
    envelope: { attack: 0.8, decay: 1.2, sustain: 0.75, release: 3.2 },
  });
}

/** 대편성 오케스트라 — 두꺼운 배음에 금관의 단단한 코어를 섞었다. */
function epicOrchestra(): Tone.PolySynth {
  return new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 1,
    modulationIndex: 8,
    oscillator: { type: "fatsawtooth", count: 3, spread: 20 } as never,
    envelope: { attack: 0.12, decay: 0.5, sustain: 0.8, release: 1.8 },
    modulation: { type: "square" },
    modulationEnvelope: { attack: 0.15, decay: 0.4, sustain: 0.6, release: 1.4 },
  });
}

/** 영화음악풍 — 어둡고 느린 현+패드. 배경을 크게 감싼다. */
function cinematicPrayer(): Tone.PolySynth {
  return new Tone.PolySynth(Tone.AMSynth, {
    harmonicity: 0.5,
    oscillator: { type: "sine" },
    envelope: { attack: 0.9, decay: 1.5, sustain: 0.7, release: 4.0 },
    modulation: { type: "sine" },
    modulationEnvelope: { attack: 1.2, decay: 0.8, sustain: 0.5, release: 3.0 },
  });
}

export const INSTRUMENTS: InstrumentDef[] = [
  { id: "piano-worship", label: "Piano Worship", description: "워십 그랜드 피아노", build: pianoWorship },
  { id: "acoustic-prayer", label: "Acoustic Prayer", description: "통기타 핑거링", build: acousticPrayer },
  { id: "church-organ", label: "Church Organ", description: "파이프 오르간", build: churchOrgan },
  { id: "warm-strings", label: "Warm Strings", description: "따뜻한 현악 앙상블", build: warmStrings },
  { id: "choir-heaven", label: "Choir Heaven", description: "천상의 합창", build: choirHeaven },
  { id: "ambient-worship", label: "Ambient Worship", description: "앰비언트 패드", build: ambientWorship },
  { id: "epic-orchestra", label: "Epic Orchestra", description: "대편성 오케스트라", build: epicOrchestra },
  { id: "cinematic-prayer", label: "Cinematic Prayer", description: "영화음악풍 패드", build: cinematicPrayer },
];

export function getInstrumentDef(id: InstrumentId): InstrumentDef {
  return INSTRUMENTS.find((i) => i.id === id) ?? INSTRUMENTS[0];
}

/**
 * 반주 성부 하나를 담당하는 모노 신스.
 * 화음을 PolySynth 하나로 치면 성부마다 세기·타이밍·좌우 위치를 따로 줄 수 없다.
 * 그래서 성부 수만큼 개별 신스를 두고 각자 패닝한다.
 */
export function buildChordVoice(style: ChordVoiceTone): Tone.Synth {
  switch (style) {
    case "warm":
      return new Tone.Synth({
        oscillator: { type: "triangle" },
        envelope: { attack: 0.09, decay: 0.7, sustain: 0.55, release: 1.6 },
      });
    case "pad":
      return new Tone.Synth({
        oscillator: { type: "fatsine", count: 3, spread: 24 } as never,
        envelope: { attack: 0.55, decay: 1.0, sustain: 0.7, release: 2.6 },
      });
    case "organ":
      return new Tone.Synth({
        oscillator: { type: "fatsawtooth", count: 3, spread: 16 } as never,
        envelope: { attack: 0.04, decay: 0.1, sustain: 0.9, release: 0.5 },
      });
    case "rhodes":
      return new Tone.Synth({
        oscillator: { type: "sine" },
        envelope: { attack: 0.012, decay: 1.1, sustain: 0.25, release: 1.4 },
      });
  }
}

export type ChordVoiceTone = "warm" | "pad" | "organ" | "rhodes";
