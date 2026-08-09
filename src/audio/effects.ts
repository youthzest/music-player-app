import * as Tone from "tone";

// 신디사이즈 음색이 건조하게 들리는 가장 큰 이유는 공간감이 없기 때문이다.
// 멜로디/화음 신스를 모두 이 체인으로 모아서 코러스 -> 딜레이 -> 리버브 순으로 통과시킨다.
// (리버브를 맨 뒤에 두어야 딜레이로 갈라진 소리까지 같은 공간에 놓인 것처럼 들린다.)

export type ReverbId = "off" | "room" | "hall" | "cathedral";
export type DelayId = "off" | "slap" | "echo";

export interface ReverbPreset {
  id: ReverbId;
  label: string;
  decay: number; // 잔향 길이(초)
  wet: number; // 0-1
  preDelay: number;
}

export interface DelayPreset {
  id: DelayId;
  label: string;
  delayTime: number;
  feedback: number;
  wet: number;
}

export const REVERB_PRESETS: ReverbPreset[] = [
  { id: "off", label: "없음", decay: 0.5, wet: 0, preDelay: 0 },
  { id: "room", label: "룸", decay: 1.2, wet: 0.22, preDelay: 0.01 },
  { id: "hall", label: "홀", decay: 3.2, wet: 0.35, preDelay: 0.03 },
  { id: "cathedral", label: "대성당", decay: 7.0, wet: 0.5, preDelay: 0.06 },
];

export const DELAY_PRESETS: DelayPreset[] = [
  { id: "off", label: "없음", delayTime: 0.2, feedback: 0, wet: 0 },
  { id: "slap", label: "짧게", delayTime: 0.12, feedback: 0.15, wet: 0.18 },
  { id: "echo", label: "메아리", delayTime: 0.34, feedback: 0.38, wet: 0.28 },
];

export function getReverbPreset(id: ReverbId): ReverbPreset {
  return REVERB_PRESETS.find((p) => p.id === id) ?? REVERB_PRESETS[0];
}

export function getDelayPreset(id: DelayId): DelayPreset {
  return DELAY_PRESETS.find((p) => p.id === id) ?? DELAY_PRESETS[0];
}

export class EffectChain {
  /** 신스를 연결할 입력 노드 */
  readonly input: Tone.Gain;
  private chorus: Tone.Chorus;
  private delay: Tone.FeedbackDelay;
  private reverb: Tone.Reverb;

  constructor(reverbId: ReverbId = "room", delayId: DelayId = "off", chorusOn = false) {
    const rv = getReverbPreset(reverbId);
    const dl = getDelayPreset(delayId);

    this.input = new Tone.Gain(1);
    this.chorus = new Tone.Chorus({
      frequency: 1.1,
      delayTime: 3.5,
      depth: 0.6,
      wet: chorusOn ? 0.35 : 0,
    }).start();
    this.delay = new Tone.FeedbackDelay({
      delayTime: dl.delayTime,
      feedback: dl.feedback,
      wet: dl.wet,
    });
    this.reverb = new Tone.Reverb({
      decay: rv.decay,
      preDelay: rv.preDelay,
      wet: rv.wet,
    });

    this.input.chain(this.chorus, this.delay, this.reverb, Tone.getDestination());
  }

  setReverb(id: ReverbId) {
    const p = getReverbPreset(id);
    // decay 를 바꾸면 임펄스 응답이 비동기로 다시 만들어진다. 그동안에도 소리는 계속 난다.
    this.reverb.decay = p.decay;
    this.reverb.preDelay = p.preDelay;
    this.reverb.wet.rampTo(p.wet, 0.1);
  }

  setDelay(id: DelayId) {
    const p = getDelayPreset(id);
    this.delay.delayTime.rampTo(p.delayTime, 0.1);
    this.delay.feedback.rampTo(p.feedback, 0.1);
    this.delay.wet.rampTo(p.wet, 0.1);
  }

  setChorus(on: boolean) {
    this.chorus.wet.rampTo(on ? 0.35 : 0, 0.1);
  }

  dispose() {
    this.input.dispose();
    this.chorus.dispose();
    this.delay.dispose();
    this.reverb.dispose();
  }
}
