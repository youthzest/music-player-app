import * as Tone from "tone";
import type { AnalyzedNote, AnalyzedSong } from "../types/music";
import { midiToNoteName } from "../types/music";
import type { InstrumentId } from "./instruments";
import { buildChordSynth, getInstrumentDef } from "./instruments";
import type { HarmonyStyle } from "../lib/harmony";
import { harmonizeNote } from "../lib/harmony";

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

  private chordSynth: Tone.PolySynth;
  private chordGain: Tone.Gain;
  private chordReverb: Tone.Reverb;
  private harmonyStyle: HarmonyStyle = "off";
  private lastDegree: number | null = null;
  private activeChordNotes: string[] = [];

  constructor(instrumentId: InstrumentId = "grand-piano") {
    this.instrumentId = instrumentId;
    this.vibrato = new Tone.Vibrato(VIBRATO_RATE_HZ, 0).toDestination();
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

  /** Selects which chord-accompaniment style plays under the melody ("off" = melody only). */
  setHarmonyStyle(style: HarmonyStyle) {
    if (style === this.harmonyStyle) return;
    this.releaseChord();
    this.harmonyStyle = style;
    this.lastDegree = null;
    if (style === "off") return;

    this.chordSynth.disconnect();
    this.chordSynth.dispose();
    this.chordSynth = buildChordSynth(style);
    this.chordSynth.connect(this.chordReverb);
    this.chordReverb.wet.value = style === "worship" ? 0.4 : style === "hymn" ? 0.3 : style === "ccli" ? 0.25 : 0.12;
    this.chordGain.gain.value = style === "gospel" ? 0.55 : 0.45;
  }

  loadSong(song: AnalyzedSong) {
    this.song = song;
    this.index = 0;
    this.lastDegree = null;
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
    const playedIndex = this.index;
    const note = this.song.notes[playedIndex];
    this.index = (this.index + 1) % this.song.notes.length;

    this.synth.set({ detune: 0 } as any);
    this.vibrato.depth.value = 0;
    this.synth.triggerAttack(midiToNoteName(note.midi), Tone.now(), note.velocity || 0.8);
    this.activeNote = note;

    this.releaseChord();
    if (this.harmonyStyle !== "off") {
      const chord = harmonizeNote(this.song, playedIndex, this.harmonyStyle, this.lastDegree);
      if (chord) {
        this.lastDegree = chord.degree;
        const names = chord.notes.map(midiToNoteName);
        this.chordSynth.triggerAttack(names, Tone.now() + chord.attackOffsetSec, 0.5);
        this.activeChordNotes = names;
      }
    }
    return note;
  }

  private releaseChord() {
    if (this.activeChordNotes.length === 0) return;
    this.chordSynth.triggerRelease(this.activeChordNotes, Tone.now());
    this.activeChordNotes = [];
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
    this.releaseChord();
  }

  reset() {
    this.index = 0;
    this.lastDegree = null;
    this.releaseChord();
  }

  dispose() {
    this.synth.disconnect();
    this.synth.dispose();
    this.vibrato.dispose();
    this.chordSynth.disconnect();
    this.chordSynth.dispose();
    this.chordReverb.dispose();
    this.chordGain.dispose();
  }
}
