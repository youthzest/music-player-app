import type { AnalyzedSong, ParsedSong } from "../types/music";
import { detectKey } from "./keyDetection";
import { annotateNotes } from "./solfege";

export function analyzeSong(parsed: ParsedSong): AnalyzedSong {
  const key = detectKey(parsed.notes);
  const notes = annotateNotes(parsed.notes, key);
  const { notes: _omit, ...rest } = parsed;
  return { ...rest, key, notes };
}
