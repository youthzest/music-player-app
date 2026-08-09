import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");
const dbPath = path.join(dataDir, "music.db");
const schemaPath = path.join(__dirname, "..", "schema.sql");

mkdirSync(dataDir, { recursive: true });
export const db = new DatabaseSync(dbPath);
db.exec(readFileSync(schemaPath, "utf-8"));

// schema.sql 의 CREATE TABLE IF NOT EXISTS 는 이미 만들어진 테이블에 새 컬럼을
// 추가해주지 않는다. 기존 DB 를 위해 빠진 컬럼만 따로 붙인다.
{
  const columns = db.prepare("PRAGMA table_info(songs)").all().map((c) => c.name);
  if (!columns.includes("lyrics")) {
    db.exec("ALTER TABLE songs ADD COLUMN lyrics TEXT");
  }
}

const PITCH_CLASS_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function rowToSong(row) {
  return {
    id: row.id,
    title: row.title,
    tempo: row.tempo,
    timeSignature: { numerator: row.time_sig_num, denominator: row.time_sig_den },
    key: {
      tonic: row.key_tonic,
      tonicName: PITCH_CLASS_NAMES[row.key_tonic],
      mode: row.key_mode,
      label: row.key_label,
      confidence: row.key_confidence,
    },
    durationSeconds: row.duration_seconds,
    sourceFormat: row.source_format,
    notes: JSON.parse(row.notes_json),
    lyrics: row.lyrics ?? undefined,
    createdAt: row.created_at,
  };
}

export function listSongs() {
  const rows = db.prepare("SELECT * FROM songs ORDER BY created_at DESC").all();
  return rows.map(rowToSong);
}

export function getSong(id) {
  const row = db.prepare("SELECT * FROM songs WHERE id = ?").get(id);
  return row ? rowToSong(row) : null;
}

export function insertSong(song) {
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO songs
      (id, title, tempo, time_sig_num, time_sig_den, key_tonic, key_mode, key_label, key_confidence, duration_seconds, source_format, notes_json, lyrics)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    song.title,
    song.tempo,
    song.timeSignature.numerator,
    song.timeSignature.denominator,
    song.key.tonic,
    song.key.mode,
    song.key.label,
    song.key.confidence,
    song.durationSeconds,
    song.sourceFormat,
    JSON.stringify(song.notes),
    song.lyrics ?? null
  );
  return id;
}

export function updateLyrics(id, lyrics) {
  const res = db.prepare("UPDATE songs SET lyrics = ? WHERE id = ?").run(lyrics || null, id);
  return res.changes > 0;
}

export function deleteSong(id) {
  db.prepare("DELETE FROM songs WHERE id = ?").run(id);
}
