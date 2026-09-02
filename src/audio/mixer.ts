import * as Tone from "tone";
import { buildChordVoice, type ChordVoiceTone } from "./instruments";
import { getSpace, type SpaceId } from "./spaces";

// 멜로디를 앞으로 끌어내는 일을 볼륨 하나로 하지 않는다. 실제 믹싱과 같은 순서로
// 벨로시티 -> 타이밍 -> EQ -> 스테레오 -> 리버브 를 함께 움직이고, 볼륨은 마지막에만
// 손댄다. Melody Focus 하나를 올리면 이 다섯 가지가 동시에 따라 움직인다.
//
// 신호 흐름
//   멜로디: synth -> EQ(2~5kHz 강조) -> 중앙 패닝 -> 드라이(크게) -> 출력
//                                                  \-> 리버브 센드(작게)
//   화음  : voice[i] -> 각자 패닝 -> 버스 -> EQ(300Hz~1kHz 중심, 고역 정리)
//                                        -> 드라이(작게) -> 출력
//                                        \-> 리버브 센드(크게)
// 멜로디와 화음이 같은 리버브를 쓰되 센드량이 달라, 멜로디는 앞에 화음은 뒤에 앉는다.

/** 화음 성부 수. 9·11·13 텐션까지 담으려면 5성부가 필요하다. */
const VOICE_COUNT = 5;

/** 성부가 위로 갈수록 약해지는 비율. 루트가 가장 단단하게 들린다. */
const LAYER_GAIN = [1.0, 0.78, 0.66, 0.58, 0.52];

/** 성부별 좌우 배치. 멜로디는 중앙이므로 화음만 벌린다. */
const PAN_SHAPE = [-0.2, 0.2, -0.1, 0.35, -0.35];

export interface ChordVoicing {
  /** 낮은 음부터 정렬된 MIDI 노트 */
  notes: number[];
  /** 멜로디 대비 화음이 늦게 들어오는 시간(초) */
  laySec: number;
  /** 성부를 아래에서 위로 굴리는 간격(초) */
  rollSec: number;
}

export class Mixer {
  /** 멜로디 신스를 연결할 입력 */
  readonly melodyInput: Tone.Gain;

  private melodyEq: Tone.EQ3;
  private melodyPan: Tone.Panner;
  private melodyDry: Tone.Gain;
  private melodySend: Tone.Gain;

  private voices: Tone.Synth[] = [];
  private voicePans: Tone.Panner[] = [];
  private chordBus: Tone.Gain;
  private chordEq: Tone.EQ3;
  private chordDry: Tone.Gain;
  private chordSend: Tone.Gain;

  private reverb: Tone.Reverb;
  private damping: Tone.Filter;
  private shimmer: Tone.EQ3;
  private delay: Tone.FeedbackDelay;
  private chorus: Tone.Chorus;

  private focus = 60; // 0~100
  private spaceId: SpaceId = "worship-hall";
  private voiceTone: ChordVoiceTone = "warm";
  /** 지금 울리고 있는 성부별 노트 이름 */
  private held: (string | null)[] = new Array(VOICE_COUNT).fill(null);

  constructor() {
    // --- 공용 공간 ---
    const space = getSpace(this.spaceId);
    this.reverb = new Tone.Reverb({ decay: space.decay, preDelay: space.preDelay, wet: 1 });
    this.damping = new Tone.Filter({ type: "lowpass", frequency: space.damping, rolloff: -12 });
    this.shimmer = new Tone.EQ3({ low: 0, mid: 0, high: 0 });
    this.reverb.chain(this.damping, this.shimmer, Tone.getDestination());

    // --- 멜로디 ---
    this.melodyInput = new Tone.Gain(1);
    // 2~5kHz 를 올려 존재감을 준다. EQ3 의 high 는 대략 이 대역 위를 담당한다.
    this.melodyEq = new Tone.EQ3({ low: -1, mid: 1, high: 3, lowFrequency: 300, highFrequency: 2200 });
    this.melodyPan = new Tone.Panner(0);
    this.melodyDry = new Tone.Gain(0.92);
    this.melodySend = new Tone.Gain(0.1);
    this.melodyInput.chain(this.melodyEq, this.melodyPan);
    this.melodyPan.connect(this.melodyDry);
    this.melodyPan.connect(this.melodySend);
    this.melodyDry.connect(Tone.getDestination());
    this.melodySend.connect(this.reverb);

    // --- 화음 ---
    this.chordBus = new Tone.Gain(1);
    // 300Hz~1kHz 를 살리고 멜로디가 쓰는 고역을 덜어 자리를 비켜준다.
    this.chordEq = new Tone.EQ3({ low: 0, mid: 2, high: -4, lowFrequency: 300, highFrequency: 2200 });
    this.chordDry = new Tone.Gain(0.6);
    this.chordSend = new Tone.Gain(0.4);
    this.chorus = new Tone.Chorus({ frequency: 1.1, delayTime: 3.5, depth: 0.6, wet: 0 }).start();
    this.delay = new Tone.FeedbackDelay({ delayTime: 0.2, feedback: 0, wet: 0 });

    this.chordBus.chain(this.chordEq, this.chorus, this.delay);
    this.delay.connect(this.chordDry);
    this.delay.connect(this.chordSend);
    this.chordDry.connect(Tone.getDestination());
    this.chordSend.connect(this.reverb);

    this.buildVoices();
    this.applyFocus();
    this.applySpace();
  }

  private buildVoices() {
    for (let i = 0; i < VOICE_COUNT; i++) {
      const synth = buildChordVoice(this.voiceTone);
      const pan = new Tone.Panner(0);
      synth.connect(pan);
      pan.connect(this.chordBus);
      this.voices.push(synth);
      this.voicePans.push(pan);
    }
  }

  /** 스타일이 바뀌면 반주 음색을 통째로 갈아끼운다. */
  setVoiceTone(tone: ChordVoiceTone) {
    if (tone === this.voiceTone) return;
    this.voiceTone = tone;
    this.releaseChord();
    for (let i = 0; i < this.voices.length; i++) {
      this.voices[i].disconnect();
      this.voices[i].dispose();
      const synth = buildChordVoice(tone);
      synth.connect(this.voicePans[i]);
      this.voices[i] = synth;
    }
  }

  setSpace(id: SpaceId) {
    this.spaceId = id;
    this.applySpace();
  }

  /** 0~100. 높일수록 멜로디가 앞으로 나오고 화음은 뒤로 넓게 물러난다. */
  setMelodyFocus(value: number) {
    this.focus = Math.max(0, Math.min(100, value));
    this.applyFocus();
    this.applySpace(); // 잔향 배분도 포커스에 따라 달라진다
  }

  get melodyFocus() {
    return this.focus;
  }

  private applySpace() {
    const s = getSpace(this.spaceId);
    const f = this.focus / 100;
    this.reverb.decay = s.decay;
    this.reverb.preDelay = s.preDelay;
    this.damping.frequency.rampTo(s.damping, 0.15);
    this.shimmer.high.rampTo(s.shimmer * 8 - 1, 0.15);
    // 화음은 공간을 많이 먹고, 멜로디는 포커스가 올라갈수록 더 건조해진다.
    this.chordSend.gain.rampTo(s.wet * (0.75 + 0.5 * f), 0.15);
    this.melodySend.gain.rampTo(s.wet * (0.35 - 0.22 * f), 0.15);
  }

  private applyFocus() {
    const f = this.focus / 100;
    // EQ — 포커스가 높을수록 멜로디 고역을 올리고 화음 고역을 깎아 대역을 나눈다.
    this.melodyEq.high.rampTo(1 + 5 * f, 0.15);
    this.melodyEq.mid.rampTo(0.5 + 1.5 * f, 0.15);
    this.chordEq.high.rampTo(-1 - 6 * f, 0.15);
    this.chordEq.mid.rampTo(1 + 2 * f, 0.15);
    this.chordEq.low.rampTo(-1 * f, 0.15);
    // 볼륨은 마지막 수단. 아주 완만하게만 움직인다.
    this.chordDry.gain.rampTo(0.72 - 0.22 * f, 0.15);
    this.melodyDry.gain.rampTo(0.88 + 0.1 * f, 0.15);
    // 스테레오 — 화음만 벌린다. 멜로디는 항상 중앙.
    const spread = 0.25 + 0.75 * f;
    for (let i = 0; i < this.voicePans.length; i++) {
      this.voicePans[i].pan.rampTo(PAN_SHAPE[i] * spread, 0.15);
    }
  }

  setChorus(on: boolean) {
    this.chorus.wet.rampTo(on ? 0.35 : 0, 0.1);
  }

  setDelay(wet: number, time: number, feedback: number) {
    this.delay.wet.rampTo(wet, 0.1);
    this.delay.delayTime.rampTo(time, 0.1);
    this.delay.feedback.rampTo(feedback, 0.1);
  }

  /** 멜로디 벨로시티. 포커스가 높을수록 또렷하게 들어간다. */
  melodyVelocity(base: number): number {
    const f = this.focus / 100;
    return Math.min(1, (base || 0.8) * (0.82 + 0.22 * f));
  }

  /**
   * 화음을 성부별로 나눠 친다.
   * 같은 세기로 동시에 치지 않고, 아래에서 위로 약해지며 조금씩 늦게 들어간다.
   */
  attackChord(voicing: ChordVoicing, at: number, toNoteName: (midi: number) => string) {
    const f = this.focus / 100;
    const base = 0.66 - 0.2 * f;
    const notes = voicing.notes.slice(0, VOICE_COUNT);

    this.releaseChord(at);
    notes.forEach((midi, i) => {
      const name = toNoteName(midi);
      const velocity = Math.max(0.15, base * (LAYER_GAIN[i] ?? 0.5));
      // 손이 아래에서 위로 굴러가는 느낌 + 멜로디보다 살짝 늦은 진입
      const when = at + voicing.laySec + voicing.rollSec * i;
      this.voices[i].triggerAttack(name, when, velocity);
      this.held[i] = name;
    });
  }

  releaseChord(at?: number) {
    const when = at ?? Tone.now();
    for (let i = 0; i < this.voices.length; i++) {
      if (this.held[i] === null) continue;
      this.voices[i].triggerRelease(when);
      this.held[i] = null;
    }
  }

  dispose() {
    this.voices.forEach((v) => {
      v.disconnect();
      v.dispose();
    });
    this.voicePans.forEach((p) => p.dispose());
    this.melodyInput.dispose();
    this.melodyEq.dispose();
    this.melodyPan.dispose();
    this.melodyDry.dispose();
    this.melodySend.dispose();
    this.chordBus.dispose();
    this.chordEq.dispose();
    this.chordDry.dispose();
    this.chordSend.dispose();
    this.chorus.dispose();
    this.delay.dispose();
    this.reverb.dispose();
    this.damping.dispose();
    this.shimmer.dispose();
  }
}
