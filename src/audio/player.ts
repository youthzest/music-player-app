import * as Tone from "tone";
import type { AnalyzedNote, AnalyzedSong } from "../types/music";
import { midiToNoteName } from "../types/music";
import type { InstrumentId } from "./instruments";
import { getInstrumentDef } from "./instruments";
import { Mixer } from "./mixer";
import type { SpaceId } from "./spaces";
import { getHarmonyStyle, voiceForStyle, type HarmonyStyle } from "../lib/harmony";
import { chordAtIndex, type ChordSegment } from "../lib/chordChart";
import {
  chordToneStack,
  octaveStack,
  thirdBelowStack,
  triadStack,
  voiceLeadStack,
  type MelodyStackMode,
} from "../lib/melodyStack";

/** Max continuous pitch bend range in cents (300 = about a whole step),
 * keeping the expressive bend close to the original melody note. */
export const BEND_RANGE_CENTS = 300;
export const MAX_VIBRATO_DEPTH = 0.35;
export const VIBRATO_RATE_HZ = 6;

export class MelodyPlayer {
  private synth: Tone.PolySynth;
  private vibrato: Tone.Vibrato;
  private mixer: Mixer;
  private instrumentId: InstrumentId;
  private song: AnalyzedSong | null = null;
  private index = 0;
  private activeNote: AnalyzedNote | null = null;
  private auto = false;
  private autoTimer: ReturnType<typeof setTimeout> | null = null;
  private speed = 1;

  private harmonyStyle: HarmonyStyle = "off";
  private chart: ChordSegment[] = [];
  private activeSegment: ChordSegment | null = null;

  private melodyStackMode: MelodyStackMode = "off";
  /** 지금 울리고 있는 멜로디 성부 음 이름들 (모드가 켜져 있으면 2~3개). */
  private activeMelodyNotes: string[] = [];
  /** 보이스 리딩 모드가 마지막으로 겹친 화성음. 성부가 부드럽게 이어지도록 기억해둔다. */
  private lastVoiceLeadMidi: number | null = null;

  constructor(instrumentId: InstrumentId = "piano-worship") {
    this.instrumentId = instrumentId;
    this.mixer = new Mixer();

    // 비브라토는 멜로디에만 건다. 화음까지 흔들리면 반주가 불안하게 들린다.
    this.vibrato = new Tone.Vibrato(VIBRATO_RATE_HZ, 0);
    this.vibrato.connect(this.mixer.melodyInput);

    this.synth = getInstrumentDef(instrumentId).build();
    this.synth.connect(this.vibrato);
  }

  setInstrument(id: InstrumentId) {
    if (id === this.instrumentId) return;
    this.instrumentId = id;
    this.synth.disconnect();
    this.synth.dispose();
    this.synth = getInstrumentDef(id).build();
    this.synth.connect(this.vibrato);
  }

  setSpace(id: SpaceId) {
    this.mixer.setSpace(id);
  }

  setChorus(on: boolean) {
    this.mixer.setChorus(on);
  }

  setDelay(wet: number, time: number, feedback: number) {
    this.mixer.setDelay(wet, time, feedback);
  }

  /** 0~100. 멜로디를 앞으로 끌어내는 정도. */
  setMelodyFocus(value: number) {
    this.mixer.setMelodyFocus(value);
  }

  /** 멜로디 음을 어떤 방식으로 겹쳐 낼지. */
  setMelodyStackMode(mode: MelodyStackMode) {
    if (mode === this.melodyStackMode) return;
    this.melodyStackMode = mode;
    this.lastVoiceLeadMidi = null;
  }

  /** 지금 활성화된 반주 코드의 구성음을 피치클래스(0~11)로 돌려준다. 없으면 빈 배열. */
  private activeChordPcs(): number[] {
    if (!this.activeSegment) return [];
    const root = this.activeSegment.rootPc;
    return this.activeSegment.intervals.map((i) => (root + i) % 12);
  }

  /** 선택된 모드에 맞춰 멜로디 음 하나를 여러 음으로 겹쳐 음 이름 배열을 돌려준다. */
  private melodyNoteNames(midi: number): string[] {
    if (!this.song) return [midiToNoteName(midi)];
    const key = this.song.key;

    switch (this.melodyStackMode) {
      case "off":
        return [midiToNoteName(midi)];
      case "octave":
        return octaveStack(midi).map(midiToNoteName);
      case "third":
        return thirdBelowStack(midi, key).map(midiToNoteName);
      case "triad":
        return triadStack(midi, key).map(midiToNoteName);
      case "chordTone": {
        const pcs = this.activeChordPcs();
        const notes = pcs.length > 0 ? chordToneStack(midi, pcs) : triadStack(midi, key);
        return notes.map(midiToNoteName);
      }
      case "voiceLead": {
        const pcs = this.activeChordPcs();
        if (pcs.length === 0) {
          this.lastVoiceLeadMidi = null;
          return triadStack(midi, key).map(midiToNoteName);
        }
        const { notes, next } = voiceLeadStack(midi, pcs, this.lastVoiceLeadMidi);
        this.lastVoiceLeadMidi = next;
        return notes.map(midiToNoteName);
      }
    }
  }

  setChordChart(chart: ChordSegment[]) {
    this.chart = chart;
    this.mixer.releaseChord();
    this.activeSegment = null;
  }

  setHarmonyStyle(style: HarmonyStyle) {
    if (style === this.harmonyStyle) return;
    this.mixer.releaseChord();
    this.activeSegment = null;
    this.harmonyStyle = style;
    if (style !== "off") this.mixer.setVoiceTone(getHarmonyStyle(style).tone);
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
    this.lastVoiceLeadMidi = null;
  }

  get currentIndex() {
    return this.index;
  }

  get totalNotes() {
    return this.song?.notes.length ?? 0;
  }

  /**
   * 이 음표가 속한 코드 구간을 찾아, 구간이 바뀐 경우에만 화음을 새로 친다.
   * 음마다 다시 치지 않으므로 한 코드가 마디 내내 지속된다.
   */
  private applyChordFor(noteIndex: number, melodyMidi: number, at: number) {
    if (this.harmonyStyle === "off" || this.chart.length === 0) return;

    const segment = chordAtIndex(this.chart, noteIndex);
    if (segment === this.activeSegment) return;

    this.activeSegment = segment;
    if (!segment) {
      this.mixer.releaseChord(at);
      return;
    }

    const style = getHarmonyStyle(this.harmonyStyle);
    const notes = voiceForStyle(
      style,
      segment.rootPc,
      segment.intervals,
      melodyMidi,
      segment.bassPc
    );
    if (notes.length === 0) return;

    this.mixer.attackChord(
      { notes, laySec: style.laySec, rollSec: style.rollSec },
      at,
      midiToNoteName
    );
  }

  /**
   * 악보의 time/duration 을 배속으로 나눠 오디오 시각에 직접 예약한다.
   * 타이머는 "다음 음을 예약할 때"만 쓰므로, setTimeout 이 흔들려도 소리는 정확한 시각에 난다.
   */
  private scheduleAuto(at: number, onNote: (note: AnalyzedNote, index: number) => void) {
    if (!this.auto || !this.song || this.song.notes.length === 0) return;

    const notes = this.song.notes;
    const index = this.index;
    const note = notes[index];
    this.index = (index + 1) % notes.length;

    const next = this.index > index ? notes[this.index] : null;
    let gap = next ? next.time - note.time : note.duration;
    if (!(gap > 0)) gap = note.duration || 0.5;
    gap /= this.speed;

    const duration = Math.min(note.duration / this.speed || gap, gap * 0.95);

    this.applyChordFor(index, note.midi, at);
    this.synth.triggerAttackRelease(
      this.melodyNoteNames(note.midi),
      duration,
      at,
      this.mixer.melodyVelocity(note.velocity)
    );

    const uiDelay = Math.max(0, (at - Tone.now()) * 1000);
    setTimeout(() => {
      if (this.auto) onNote(note, index);
    }, uiDelay);

    const nextAt = at + gap;
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
    this.mixer.releaseChord();
    this.activeSegment = null;
    this.activeNote = null;
    this.activeMelodyNotes = [];
  }

  /** Plays the next note in the stored melody sequence and advances the pointer. */
  attackNext(): AnalyzedNote | null {
    // 자동 재생 중에 손으로 누르면 수동 연주가 우선한다.
    this.stopAuto();
    if (!this.song || this.song.notes.length === 0) return null;
    const playedIndex = this.index;
    const note = this.song.notes[playedIndex];
    this.index = (this.index + 1) % this.song.notes.length;

    this.synth.set({ detune: 0 } as never);
    this.vibrato.depth.value = 0;

    const now = Tone.now();
    this.applyChordFor(playedIndex, note.midi, now);
    const names = this.melodyNoteNames(note.midi);
    this.synth.triggerAttack(names, now, this.mixer.melodyVelocity(note.velocity));
    this.activeMelodyNotes = names;
    this.activeNote = note;
    return note;
  }

  /** Continuous pitch bend while held, clamped so it never strays far from the note. */
  setPitchBend(cents: number) {
    const clamped = Math.max(-BEND_RANGE_CENTS, Math.min(BEND_RANGE_CENTS, cents));
    this.synth.set({ detune: clamped } as never);
  }

  /** Vibrato depth (0-1) driven by side-to-side shake while held. */
  setVibratoDepth(depth: number) {
    const clamped = Math.max(0, Math.min(MAX_VIBRATO_DEPTH, depth));
    this.vibrato.depth.rampTo(clamped, 0.05);
  }

  release() {
    // 반주는 손을 떼도 그 코드 구간이 끝날 때까지 이어진다(패드처럼 받쳐주는 역할).
    if (!this.activeNote) return;
    this.synth.triggerRelease(this.activeMelodyNotes, Tone.now());
    this.synth.set({ detune: 0 } as never);
    this.vibrato.depth.rampTo(0, 0.15);
    this.activeNote = null;
    this.activeMelodyNotes = [];
  }

  reset() {
    this.index = 0;
    this.activeSegment = null;
    this.lastVoiceLeadMidi = null;
    this.mixer.releaseChord();
  }

  dispose() {
    this.stopAuto();
    this.synth.disconnect();
    this.synth.dispose();
    this.vibrato.dispose();
    this.mixer.dispose();
  }
}
