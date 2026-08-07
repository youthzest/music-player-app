import { AnalyzedSong } from "../../src/types/music";

export interface Env {
  DB: D1Database;
}

export interface SongRow {
  id: string;
  title: string;
  tempo: number;
  time_sig_num: number;
  time_sig_den: number;
  key_tonic: number;
  key_mode: string;
  key_label: string;
  key_confidence: number;
  duration_seconds: number;
  source_format: string;
  notes_json: string;
  created_at: string;
}

export function rowToSong(row: SongRow): AnalyzedSong {
  return {
    id: row.id,
    title: row.title,
    tempo: row.tempo,
    timeSignature: { numerator: row.time_sig_num, denominator: row.time_sig_den },
    key: {
      tonic: row.key_tonic,
      tonicName: ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][row.key_tonic],
      mode: row.key_mode as "major" | "minor",
      label: row.key_label,
      confidence: row.key_confidence,
    },
    durationSeconds: row.duration_seconds,
    sourceFormat: row.source_format as "midi" | "nwctxt",
    notes: JSON.parse(row.notes_json),
    createdAt: row.created_at,
  };
}

export function jsonResponse(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}
