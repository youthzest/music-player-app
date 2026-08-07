import { Env, SongRow, jsonResponse, rowToSong } from "../_shared";

export const onRequestGet: PagesFunction<Env> = async ({ params, env }) => {
  const row = await env.DB.prepare("SELECT * FROM songs WHERE id = ?")
    .bind(params.id as string)
    .first<SongRow>();

  if (!row) {
    return jsonResponse({ error: "Not found" }, { status: 404 });
  }
  return jsonResponse(rowToSong(row));
};

export const onRequestDelete: PagesFunction<Env> = async ({ params, env }) => {
  await env.DB.prepare("DELETE FROM songs WHERE id = ?")
    .bind(params.id as string)
    .run();
  return jsonResponse({ ok: true });
};
