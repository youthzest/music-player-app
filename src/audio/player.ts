import * as Tone from "tone";
import type { AnalyzedNote, AnalyzedSong } from "../types/music";
import { midiToNoteName } from "../types/music";
import type { InstrumentId } from "./instruments";
import { getInstrumentDef } from "./instruments";

/** Max continuous pitch bend range in cents (300 = about a whole step),
 * keeping the expressive bend close to the original melody note. */
export const BEND_RANGE_CENTS = 300;
export const MAX_VIBRATO_DEPTH = 0.35;
export const VIBRATO_RATE_HZ = 6;

export class MelodyPlayer {
  private synth: Tone.PolySynth;
  private vibrato: Tone.Vibrato;
  private instrumentId: InstrumentId;
  private song: AnalyzedSong | null = null;
  private index = 0;
  private activeNote: AnalyzedNote | null = null;

  constructor(instrumentId: InstrumentId = "grand-piano") {
    this.instrumentId = instrumentId;
    this.vibrato = new Tone.Vibrato(VIBRATO_RATE_HZ, 0).toDestination();
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

  loadSong(song: AnalyzedSong) {
    this.song = song;
    this.index = 0;
  }

  get currentIndex() {
    return this.index;
  }

  get totalNotes() {
    return this.song?.notes.length ?? 0;
  }

  /** Plays the next note in the stored melody sequence and advances the pointer. */
  attackNext(): AnalyzedNote | null {
    if (!this.song || this.song.notes.length === 0) return null;
    const note = this.song.notes[this.index];
    this.index = (this.index + 1) % this.song.notes.length;

    this.synth.set({ detune: 0 } as any);
    this.vibrato.depth.value = 0;
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
    if (!this.activeNote) return;
    this.synth.triggerRelease(midiToNoteName(this.activeNote.midi), Tone.now());
    this.synth.set({ detune: 0 } as any);
    this.vibrato.depth.rampTo(0, 0.15);
    this.activeNote = null;
  }

  reset() {
    this.index = 0;
  }

  dispose() {
    this.synth.disconnect();
    this.synth.dispose();
    this.vibrato.dispose();
  }
}
