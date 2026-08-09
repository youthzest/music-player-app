import * as Tone from "tone";
import type { AnalyzedNote, AnalyzedSong } from "../types/music";
import { midiToNoteName } from "../types/music";
import type { InstrumentId } from "./instruments";
import { buildChordSynth, getInstrumentDef } from "./instruments";
import { EffectChain, type DelayId, type ReverbId } from "./effects";
import { voiceForStyle, type HarmonyStyle } from "../lib/harmony";
import { chordAtIndex, type ChordSegment } from "../lib/chordChart";

/** Max continuous pitch bend range in cents (300 = about a whole step),
 * keeping the expressive bend close to the original melody note. */
export const BEND_RANGE_CENTS = 300;
export const MAX_VIBRATO_DEPTH = 0.35;
export const VIBRATO_RATE_HZ = 6;

export class MelodyPlayer {
  private synth: Tone.PolySynth;
  private vibrato: Tone.Vibrato;
  private effects: EffectChain;
  private instrumentId: InstrumentId;
  private song: AnalyzedSong | null = null;
  private index = 0;
  private activeNote: AnalyzedNote | null = null;
  private auto = false;
  private autoTimer: ReturnType<typeof setTimeout> | null = null;
  private speed = 1;

  // 반주는 멜로디와 분리된 신스/리버브로 낸다. 스타일마다 음색과 잔향이 다르기 때문에
  // 멜로디용 이펙트 체인에 섞지 않고 따로 둔다.
  private chordSynth: Tone.PolySynth;
  private chordGain: Tone.Gain;
  private chordReverb: Tone.Reverb;
  private harmonyStyle: HarmonyStyle = "off";
  private activeChordNotes: string[] = [];
  // 곡 전체를 미리 분석해 만든 코드 진행표. 구간이 바뀔 때만 화음을 새로 친다.
  private chart: ChordSegment[] = [];
  private activeSegment: ChordSegment | null = null;

  constructor(instrumentId: InstrumentId = "grand-piano") {
    this.instrumentId = instrumentId;
    this.effects = new EffectChain();

    // 비브라토는 멜로디에만 건다. 화음까지 흔들리면 반주가 불안하게 들린다.
    this.vibrato = new Tone.Vibrato(VIBRATO_RATE_HZ, 0);
    this.vibrato.connect(this.effects.input);

    this.synth = getInstrumentDef(instrumentId).build();
    this.synth.connect(this.vibrato);

    this.chordGain = new Tone.Gain(0.45).toDestination();
    this.chordReverb = new Tone.Reverb({ decay: 2.5, wet: 0.2 }).connect(this.chordGain);
    this.chordSynth = buildChordSynth("hymn");
    this.chordSynth.connect(this.chordReverb);
  }

  setInstrument(id: InstrumentId) {
    if (id === this.instrumentId) return;
    this.instrumentId = id;
    this.synth.disconnect();
    this.synth.dispose();
    this.synth = getInstrumentDef(id).build();
    this.synth.connect(this.vibrato);
  }

  setReverb(id: ReverbId) {
    this.effects.setReverb(id);
  }

  setDelay(id: DelayId) {
    this.effects.setDelay(id);
  }

  setChorus(on: boolean) {
    this.effects.setChorus(on);
  }

  /** 미리 계산된 코드 진행표를 갈아끼운다. 곡이나 스타일이 바뀔 때 호출한다. */
  setChordChart(chart: ChordSegment[]) {
    this.chart = chart;
    this.releaseChord();
    this.activeSegment = null;
  }

  /** Selects which chord-accompaniment style plays under the melody ("off" = melody only). */
  setHarmonyStyle(style: HarmonyStyle) {
    if (style === this.harmonyStyle) return;
    this.releaseChord();
    this.activeSegment = null;
    this.harmonyStyle = style;
    if (style === "off") return;

    this.chordSynth.disconnect();
    this.chordSynth.dispose();
    this.chordSynth = buildChordSynth(style);
    this.chordSynth.connect(this.chordReverb);
    this.chordReverb.wet.value =
      style === "worship" ? 0.4 : style === "hymn" ? 0.3 : style === "ccli" ? 0.25 : 0.12;
    this.chordGain.gain.value = style === "gospel" ? 0.55 : 0.45;
  }

  /** 자동 재생 배속. 0.25~2.0. 다음 음부터 즉시 반영된다. */
  setSpeed(speed: number) {
    this.speed = Math.max(0.25, Math.min(2, speed));
  }

  get isAutoPlaying() {
    return this.auto;
  }

  loadSong(song: AnalyzedSong) {
    this.stopAuto();
    this.song = song;
    this.index = 0;
    this.activeSegment = null;
  }

  get currentIndex() {
    return this.index;
  }

  get totalNotes() {
    return this.song?.notes.length ?? 0;
  }

  private releaseChord(at?: number) {
    if (this.activeChordNotes.length === 0) return;
    this.chordSynth.triggerRelease(this.activeChordNotes, at ?? Tone.now());
    this.activeChordNotes = [];
  }

  /**
   * 이 음표가 속한 코드 구간을 찾아, 구간이 바뀐 경우에만 화음을 새로 친다.
   * 음마다 다시 치지 않으므로 한 코드가 마디 내내 지속된다.
   */
  private applyChordFor(noteIndex: number, melodyMidi: number, at: number) {
    if (this.harmonyStyle === "off" || this.chart.length === 0) return;

    const segment = chordAtIndex(this.chart, noteIndex);
    if (segment === this.activeSegment) return;

    this.releaseChord(at);
    this.activeSegment = segment;
    if (!segment) return;

    const names = voiceForStyle(
      this.harmonyStyle,
      segment.rootPc,
      segment.intervals,
      melodyMidi
    ).map(midiToNoteName);
    if (names.length === 0) return;

    // 가스펠은 코드가 바뀌는 순간을 살짝 뒤로 밀어 당겨지는 느낌을 준다.
    const offset = this.harmonyStyle === "gospel" ? 0.045 : 0;
    this.chordSynth.triggerAttack(names, at + offset, 0.5);
    this.activeChordNotes = names;
  }

  /**
   * 악보의 time/duration 을 배속으로 나눠 오디오 시각에 직접 예약한다.
   * 타이머는 "다음 음을 예약할 때"만 쓰므로, setTimeout 이 흔들려도 소리는 정확한 시각에 난다.
   * 배속은 매 음마다 다시 읽어서, 재생 중에 바꿔도 다음 음부터 바로 반영된다.
   */
  private scheduleAuto(at: number, onNote: (note: AnalyzedNote, index: number) => void) {
    if (!this.auto || !this.song || this.song.notes.length === 0) return;

    const notes = this.song.notes;
    const index = this.index;
    const note = notes[index];
    this.index = (index + 1) % notes.length;

    // 다음 음까지의 간격. 마지막 음이면(다시 처음으로 돌아가면) 자기 길이를 쓴다.
    const next = this.index > index ? notes[this.index] : null;
    let gap = next ? next.time - note.time : note.duration;
    if (!(gap > 0)) gap = note.duration || 0.5;
    gap /= this.speed;

    const duration = Math.min(note.duration / this.speed || gap, gap * 0.95);

    this.applyChordFor(index, note.midi, at);

    this.synth.triggerAttackRelease(
      midiToNoteName(note.midi),
      duration,
      at,
      note.velocity || 0.8
    );

    // 화면 표시는 소리가 나는 시점에 맞춰 따로 알린다.
    const uiDelay = Math.max(0, (at - Tone.now()) * 1000);
    setTimeout(() => {
      if (this.auto) onNote(note, index);
    }, uiDelay);

    const nextAt = at + gap;
    // 다음 음이 울리기 조금 전에 깨어나 예약한다.
    const wake = Math.max(0, (nextAt - Tone.now()) * 1000 - 40);
    this.autoTimer = setTimeout(() => this.scheduleAuto(nextAt, onNote), wake);
  }

  startAuto(onNote: (note: AnalyzedNote, index: number) => void) {
    if (this.auto) return;
    if (!this.song || this.song.notes.length === 0) return;
    this.auto = true;
    this.scheduleAuto(Tone.now() + 0.15, onNote);
  }

  stopAuto() {
    if (!this.auto && !this.autoTimer) return;
    this.auto = false;
    if (this.autoTimer) {
      clearTimeout(this.autoTimer);
      this.autoTimer = null;
    }
    this.synth.releaseAll();
    this.chordSynth.releaseAll();
    this.activeChordNotes = [];
    this.activeSegment = null;
    this.activeNote = null;
  }

  /** Plays the next note in the stored melody sequence and advances the pointer. */
  attackNext(): AnalyzedNote | null {
    // 자동 재생 중에 손으로 누르면 수동 연주가 우선한다.
    this.stopAuto();
    if (!this.song || this.song.notes.length === 0) return null;
    const playedIndex = this.index;
    const note = this.song.notes[playedIndex];
    this.index = (this.index + 1) % this.song.notes.length;

    this.synth.set({ detune: 0 } as any);
    this.vibrato.depth.value = 0;

    this.applyChordFor(playedIndex, note.midi, Tone.now());

    this.synth.triggerAttack(midiToNoteName(note.midi), Tone.now(), note.velocity || 0.8);
    this.activeNote = note;
    return note;
  }

  /** Continuous pitch bend while held, clamped so it never strays far from the note. */
  setPitchBend(cents: number) {
    const clamped = Math.max(-BEND_RANGE_CENTS, Math.min(BEND_RANGE_CENTS, cents));
    this.synth.set({ detune: clamped } as any);
  }

  /** Vibrato depth (0-1) driven by side-to-side shake while held. */
  setVibratoDepth(depth: number) {
    const clamped = Math.max(0, Math.min(MAX_VIBRATO_DEPTH, depth));
    this.vibrato.depth.rampTo(clamped, 0.05);
  }

  release() {
    // 반주는 손을 떼도 그 코드 구간이 끝날 때까지 이어진다(패드처럼 받쳐주는 역할).
    if (!this.activeNote) return;
    this.synth.triggerRelease(midiToNoteName(this.activeNote.midi), Tone.now());
    this.synth.set({ detune: 0 } as any);
    this.vibrato.depth.rampTo(0, 0.15);
    this.activeNote = null;
  }

  reset() {
    this.index = 0;
    this.activeSegment = null;
    this.releaseChord();
  }

  dispose() {
    this.stopAuto();
    this.synth.disconnect();
    this.synth.dispose();
    this.vibrato.dispose();
    this.effects.dispose();
    this.chordSynth.disconnect();
    this.chordSynth.dispose();
    this.chordReverb.dispose();
    this.chordGain.dispose();
  }
}
