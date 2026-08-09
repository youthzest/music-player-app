import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listSongs, getSong, insertSong, deleteSong, updateLyrics } from "./db.mjs";
import { convertNwcToText, isNwcConvAvailable } from "./nwcConvert.mjs";
import {
  reindex,
  indexStatus,
  searchCatalog,
  loadCatalogContent,
  catalogCount,
  indexOne,
  getCatalogEntry,
  startWatching,
  IMPORT_DIR,
} from "./catalog.mjs";
import { importScoreFromUrl } from "./importUrl.mjs";

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

app.put("/api/songs/:id/lyrics", (req, res) => {
  const { lyrics } = req.body ?? {};
  if (typeof lyrics !== "string") {
    return res.status(400).json({ error: "lyrics 는 문자열이어야 합니다" });
  }
  if (!updateLyrics(req.params.id, lyrics)) {
    return res.status(404).json({ error: "Not found" });
  }
  res.json({ ok: true });
});

app.delete("/api/songs/:id", (req, res) => {
  deleteSong(req.params.id);
  res.json({ ok: true });
});

// --- 찬양 폴더 카탈로그 ---

app.get("/api/catalog/status", (_req, res) => {
  res.json({ ...indexStatus(), count: catalogCount() });
});

app.post("/api/catalog/reindex", (req, res) => {
  const force = req.query.force === "1";
  if (indexStatus().running) {
    return res.status(409).json({ error: "이미 색인 중입니다", ...indexStatus() });
  }
  // 수 분 걸리므로 응답을 기다리게 하지 않고 백그라운드로 돌린다. 진행률은 status 로 확인.
  reindex({ force }).catch(() => {});
  res.status(202).json({ started: true, ...indexStatus() });
});

app.post("/api/catalog/import-url", async (req, res) => {
  const { url } = req.body ?? {};
  if (typeof url !== "string" || !url.trim()) {
    return res.status(400).json({ error: "url 이 필요합니다" });
  }
  try {
    const saved = await importScoreFromUrl(url.trim(), IMPORT_DIR);
    const id = await indexOne(saved.path);
    const entry = getCatalogEntry(id);
    res.status(201).json({
      id,
      title: entry?.title,
      format: entry?.format,
      folder: entry?.folder,
      bytes: saved.bytes,
    });
  } catch (err) {
    res.status(422).json({ error: err.message });
  }
});

app.get("/api/catalog/search", (req, res) => {
  const q = String(req.query.q ?? "");
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  res.json(searchCatalog(q, limit));
});

app.get("/api/catalog/:id/content", async (req, res) => {
  try {
    const content = await loadCatalogContent(req.params.id);
    if (!content) return res.status(404).json({ error: "Not found" });
    if (content.missing) {
      return res.status(410).json({ error: "원본 파일이 이동되었거나 삭제되었습니다" });
    }
    res.json(content);
  } catch (err) {
    res.status(500).json({ error: `악보를 읽지 못했습니다: ${err.message}` });
  }
});

// 바이너리 .nwc 업로드 -> NWCTXT 텍스트로 변환해서 돌려준다. 파싱은 클라이언트가 한다.
app.post(
  "/api/convert/nwc",
  express.raw({ type: "application/octet-stream", limit: "20mb" }),
  async (req, res) => {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ error: "빈 파일입니다" });
    }
    if (!isNwcConvAvailable()) {
      return res.status(501).json({
        error:
          "이 서버에 NoteWorthy Composer 2 가 없어 .nwc 를 변환할 수 없습니다. .nwctxt 로 저장해서 올려주세요.",
      });
    }
    try {
      const text = await convertNwcToText(req.body);
      res.type("text/plain; charset=utf-8").send(text);
    } catch (err) {
      res.status(422).json({ error: `.nwc 변환에 실패했습니다: ${err.message}` });
    }
  }
);

app.use(express.static(distDir));

app.listen(PORT, "127.0.0.1", () => {
  console.log(`music-player-app listening on http://127.0.0.1:${PORT}`);
  const n = startWatching();
  console.log(`watching ${n} folder(s) for new scores`);
});
