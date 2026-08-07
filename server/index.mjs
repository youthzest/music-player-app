import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listSongs, getSong, insertSong, deleteSong } from "./db.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "..", "dist");
const PORT = process.env.PORT ? Number(process.env.PORT) : 8791;

const app = express();
app.use(express.json({ limit: "5mb" }));

app.get("/api/songs", (_req, res) => {
  res.json(listSongs());
});

app.post("/api/songs", (req, res) => {
  const song = req.body;
  if (!song || typeof song.title !== "string" || !Array.isArray(song.notes)) {
    return res.status(400).json({ error: "Invalid song payload" });
  }
  const id = insertSong(song);
  res.status(201).json({ id });
});

app.get("/api/songs/:id", (req, res) => {
  const song = getSong(req.params.id);
  if (!song) return res.status(404).json({ error: "Not found" });
  res.json(song);
});

app.delete("/api/songs/:id", (req, res) => {
  deleteSong(req.params.id);
  res.json({ ok: true });
});

app.use(express.static(distDir));

app.listen(PORT, "127.0.0.1", () => {
  console.log(`music-player-app listening on http://127.0.0.1:${PORT}`);
});
