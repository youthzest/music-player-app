// Core note/song model shared by MIDI and NWC parsers, the analyzer, and the player.

export interface ParsedNote {
  /** MIDI note number, 0-127 (60 = C4) */
  midi: number;
  /** Note start time in seconds from the beginning of the song */
  time: number;
  /** Duration in seconds */
  duration: number;
  /** Velocity 0-1 */
  velocity: number;
}

export interface TimeSignature {
  numerator: number;
  denominator: number;
}

export type KeyMode = "major" | "minor";

export interface KeyInfo {
  /** Tonic pitch class 0-11, 0 = C */
  tonic: number;
  tonicName: string;
  mode: KeyMode;
  /** Human-readable e.g. "C Major", "A Minor" */
  label: string;
  /** Confidence 0-1 from the key-finding correlation */
  confidence: number;
}

export interface AnalyzedNote extends ParsedNote {
  /** Movable-do solfege syllable relative to the detected key, e.g. "Do", "Re", "Me" (b3) */
  solfege: string;
  /** Scale degree 1-7, or null if the note is chromatic/non-diatonic */
  scaleDegree: number | null;
}

export interface ParsedSong {
  title: string;
  tempo: number; // BPM
  timeSignature: TimeSignature;
  notes: ParsedNote[];
  durationSeconds: number;
  sourceFormat: "midi" | "nwctxt";
}

export interface AnalyzedSong extends Omit<ParsedSong, "notes"> {
  id?: string;
  key: KeyInfo;
  notes: AnalyzedNote[];
  createdAt?: string;
}

export const PITCH_CLASS_NAMES = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
] as const;

export function midiToPitchClass(midi: number): number {
  return ((midi % 12) + 12) % 12;
}

export function midiToNoteName(midi: number): string {
  const pc = midiToPitchClass(midi);
  const octave = Math.floor(midi / 12) - 1;
  return `${PITCH_CLASS_NAMES[pc]}${octave}`;
}
