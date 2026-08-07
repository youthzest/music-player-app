import type { AnalyzedNote, KeyInfo, ParsedNote } from "../types/music";
import { midiToPitchClass } from "../types/music";

// Movable-do chromatic solfege tables, indexed by semitone offset from the tonic (0-11).
// Diatonic scale-degree offsets are annotated; in-between values are the "raised"
// chromatic syllables (Di/Ri/Fi/Si/Li), the common convention for altered tones.

const MAJOR_SOLFEGE = ["Do", "Di", "Re", "Ri", "Mi", "Fa", "Fi", "Sol", "Si", "La", "Li", "Ti"];
const MAJOR_DEGREE_OFFSETS: Record<number, number> = { 0: 1, 2: 2, 4: 3, 5: 4, 7: 5, 9: 6, 11: 7 };

// La-based (natural minor) solfege: tonic = La.
const MINOR_SOLFEGE = ["La", "Li", "Ti", "Do", "Di", "Re", "Ri", "Mi", "Fa", "Fi", "Sol", "Si"];
const MINOR_DEGREE_OFFSETS: Record<number, number> = { 0: 1, 2: 2, 3: 3, 5: 4, 7: 5, 8: 6, 10: 7 };

export function solfegeForNote(midi: number, key: KeyInfo): { solfege: string; scaleDegree: number | null } {
  const pc = midiToPitchClass(midi);
  const offset = ((pc - key.tonic) % 12 + 12) % 12;

  if (key.mode === "major") {
    return {
      solfege: MAJOR_SOLFEGE[offset],
      scaleDegree: MAJOR_DEGREE_OFFSETS[offset] ?? null,
    };
  }
  return {
    solfege: MINOR_SOLFEGE[offset],
    scaleDegree: MINOR_DEGREE_OFFSETS[offset] ?? null,
  };
}

/** Semitone offsets (from tonic) that belong to the diatonic scale for the given key. */
export function diatonicOffsets(key: KeyInfo): number[] {
  return Object.keys(key.mode === "major" ? MAJOR_DEGREE_OFFSETS : MINOR_DEGREE_OFFSETS).map(Number);
}

export function annotateNotes(notes: ParsedNote[], key: KeyInfo): AnalyzedNote[] {
  return notes.map((note) => {
    const { solfege, scaleDegree } = solfegeForNote(note.midi, key);
    return { ...note, solfege, scaleDegree };
  });
}
