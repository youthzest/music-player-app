import { AnalyzedSong } from "../../src/types/music";
import { Env, SongRow, jsonResponse, rowToSong } from "./_shared";

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const { results } = await env.DB.prepare(
    "SELECT * FROM songs ORDER BY created_at DESC"
  ).all<SongRow>();
  return jsonResponse((results ?? []).map(rowToSong));
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = (await request.json()) as AnalyzedSong;

  if (!body.title || !Array.isArray(body.notes)) {
    return jsonResponse({ error: "Invalid song payload" }, { status: 400 });
  }

  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO songs
      (id, title, tempo, time_sig_num, time_sig_den, key_tonic, key_mode, key_label, key_confidence, duration_seconds, source_format, notes_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      body.title,
      body.tempo,
      body.timeSignature.numerator,
      body.timeSignature.denominator,
      body.key.tonic,
      body.key.mode,
      body.key.label,
      body.key.confidence,
      body.durationSeconds,
      body.sourceFormat,
      JSON.stringify(body.notes)
    )
    .run();

  return jsonResponse({ id }, { status: 201 });
};
