// Dropbox 찬양 폴더를 훑어 제목/작사작곡/가사를 뽑아 두고 검색만 빠르게 하는 카탈로그.
// 악보 원본은 그대로 두고 경로만 참조한다(복사하지 않는다). 연주할 때 비로소 파일을 읽는다.
//
// .nwc 는 비공개 포맷이라 nwc-conv 로 NWCTXT 를 얻어야 안을 볼 수 있다. 한 곡에 ~240ms 걸리므로
// 전체 색인은 수 분이 걸린다. 그래서 파일 크기+수정시각이 그대로면 건너뛰는 증분 색인으로 만든다.

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, existsSync, watch } from "node:fs";
import path from "node:path";
import { db } from "./db.mjs";
import { convertNwcToText, isNwcConvAvailable } from "./nwcConvert.mjs";
import { decodeMixedEncoding } from "./nwcConvert.mjs";

export const CATALOG_ROOT =
  process.env.CATALOG_ROOT || "C:\\Users\\youth\\Dropbox\\02 목회관련\\찬양관련";

/** 웹에서 가져온 악보가 쌓이는 곳. 찬양 폴더 안에 두어 Dropbox 동기화를 그대로 탄다. */
export const IMPORT_DIR =
  process.env.IMPORT_DIR || path.join(CATALOG_ROOT, "_웹에서 가져온 악보");

/** 브라우저로 직접 받은 악보도 자동으로 잡히도록 다운로드 폴더를 함께 본다(하위 폴더는 제외). */
export const DOWNLOADS_DIR =
  process.env.DOWNLOADS_DIR ||
  path.join(process.env.USERPROFILE || process.env.HOME || ".", "Downloads");

const ROOTS = [
  { path: CATALOG_ROOT, recursive: true },
  { path: IMPORT_DIR, recursive: true },
  { path: DOWNLOADS_DIR, recursive: false },
];

const PLAYABLE = new Set([".nwc", ".mid", ".midi", ".nwctxt"]);

db.exec(`
  CREATE TABLE IF NOT EXISTS catalog (
    id TEXT PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,
    filename TEXT NOT NULL,
    folder TEXT NOT NULL,
    format TEXT NOT NULL,
    title TEXT,
    author TEXT,
    lyrics TEXT,
    search_text TEXT NOT NULL,
    size INTEGER NOT NULL,
    mtime REAL NOT NULL,
    indexed_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_catalog_title ON catalog (title);
`);

/**
 * 한국어 검색은 띄어쓰기가 제각각이라("주님사랑" vs "주님 사랑") 공백을 모두 지우고
 * 소문자로 맞춘 문자열끼리 비교한다. 질의도 같은 방식으로 정규화한다.
 */
function normalize(s) {
  return (s ?? "").toLowerCase().replace(/\s+/g, "");
}

function idFor(filePath) {
  return createHash("sha1").update(filePath).digest("hex").slice(0, 16);
}

function walk(dir, recursive, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (recursive) walk(p, true, out);
    } else if (PLAYABLE.has(path.extname(e.name).toLowerCase())) {
      out.push(p);
    }
  }
  return out;
}

/** 중복 경로 없이 모든 루트를 훑는다. IMPORT_DIR 는 CATALOG_ROOT 안에 있을 수 있다. */
function collectFiles() {
  const seen = new Set();
  const files = [];
  for (const root of ROOTS) {
    if (!existsSync(root.path)) continue;
    for (const f of walk(root.path, root.recursive)) {
      const key = f.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      files.push(f);
    }
  }
  return files;
}

/** 파일이 속한 루트를 기준으로 표시용 폴더명을 만든다. */
function folderLabel(filePath) {
  const dir = path.dirname(filePath);
  let best = null;
  for (const root of ROOTS) {
    if (dir.toLowerCase().startsWith(root.path.toLowerCase())) {
      if (!best || root.path.length > best.length) best = root.path;
    }
  }
  if (!best) return path.basename(dir);
  if (best === DOWNLOADS_DIR) return "다운로드";
  const rel = path.relative(best, dir);
  return rel || path.basename(best);
}

function unescapeNwcText(raw) {
  const inner = raw.replace(/^"/, "").replace(/"$/, "");
  return inner.replace(/\\(.)/g, (_, c) => (c === "n" ? "\n" : c === "r" ? "" : c));
}

/** NWCTXT 본문에서 제목/작사작곡/가사(첫 스태프의 내용 있는 첫 절)를 뽑는다. */
export function extractNwcMetadata(text) {
  const lines = text.split(/\r?\n/);
  let title = null;
  let author = null;
  const verses = new Map();
  let staffCount = 0;

  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("|AddStaff")) {
      staffCount++;
      if (staffCount > 1) break;
      continue;
    }
    if (line.startsWith("|SongInfo|")) {
      const t = line.match(/\|Title:"([^"]*)"/);
      const a = line.match(/\|Author:"([^"]*)"/);
      if (t) title = t[1].trim() || null;
      if (a) author = a[1].trim() || null;
      continue;
    }
    const m = line.match(/^\|Lyric(\d+)\|Text:(.*)$/);
    if (m) {
      const v = unescapeNwcText(m[2]).trim();
      if (v) verses.set(parseInt(m[1], 10), v);
    }
  }

  const lyrics = verses.size ? verses.get(Math.min(...verses.keys())) : null;
  return { title, author, lyrics };
}

function metadataFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const base = path.basename(filePath, path.extname(filePath));

  if (ext === ".nwc") {
    // 변환 실패해도 파일명만으로 목록에는 남긴다.
    return convertNwcToText(readFileSync(filePath))
      .then((text) => ({ format: "nwc", ...extractNwcMetadata(text) }))
      .catch(() => ({ format: "nwc", title: base, author: null, lyrics: null }));
  }
  if (ext === ".nwctxt") {
    const text = decodeMixedEncoding(readFileSync(filePath));
    return Promise.resolve({ format: "nwctxt", ...extractNwcMetadata(text) });
  }
  // MIDI 는 안에 가사가 거의 없어 파일명을 제목으로 쓴다.
  return Promise.resolve({ format: "mid", title: base, author: null, lyrics: null });
}

const state = {
  running: false,
  total: 0,
  done: 0,
  added: 0,
  updated: 0,
  skipped: 0,
  failed: 0,
  startedAt: null,
  finishedAt: null,
  error: null,
};

export function indexStatus() {
  return {
    ...state,
    root: CATALOG_ROOT,
    importDir: IMPORT_DIR,
    watching: ROOTS.filter((r) => existsSync(r.path)).map((r) => r.path),
    converterAvailable: isNwcConvAvailable(),
  };
}

const upsertStmt = () =>
  db.prepare(
    `INSERT INTO catalog (id, path, filename, folder, format, title, author, lyrics, search_text, size, mtime, indexed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       path=excluded.path, filename=excluded.filename, folder=excluded.folder,
       format=excluded.format, title=excluded.title, author=excluded.author,
       lyrics=excluded.lyrics, search_text=excluded.search_text,
       size=excluded.size, mtime=excluded.mtime, indexed_at=datetime('now')`
  );

/** 파일 하나를 색인하고 카탈로그 id 를 돌려준다. URL 가져오기 직후에 쓴다. */
export async function indexOne(filePath) {
  const st = statSync(filePath);
  const meta = await metadataFor(filePath);
  const id = idFor(filePath);
  const filename = path.basename(filePath);
  const folder = folderLabel(filePath);
  const title = meta.title || path.basename(filePath, path.extname(filePath));
  const searchText = normalize(
    [title, meta.author, filename, folder, meta.lyrics].filter(Boolean).join(" ")
  );
  upsertStmt().run(
    id,
    filePath,
    filename,
    folder,
    meta.format,
    title,
    meta.author,
    meta.lyrics,
    searchText,
    st.size,
    st.mtimeMs
  );
  return id;
}

export function catalogCount() {
  return db.prepare("SELECT COUNT(*) AS n FROM catalog").get().n;
}

/** 폴더 전체를 증분 색인한다. 이미 실행 중이면 무시한다. */
export async function reindex({ force = false } = {}) {
  if (state.running) return indexStatus();
  if (!existsSync(CATALOG_ROOT)) {
    state.error = `폴더를 찾을 수 없습니다: ${CATALOG_ROOT}`;
    return indexStatus();
  }

  Object.assign(state, {
    running: true,
    total: 0,
    done: 0,
    added: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
  });

  try {
    const files = collectFiles();
    state.total = files.length;

    const existing = new Map(
      db.prepare("SELECT id, size, mtime FROM catalog").all().map((r) => [r.id, r])
    );
    const seen = new Set();
    const upsert = upsertStmt();

    for (const file of files) {
      const id = idFor(file);
      seen.add(id);
      let st;
      try {
        st = statSync(file);
      } catch {
        state.failed++;
        state.done++;
        continue;
      }

      const prev = existing.get(id);
      if (!force && prev && prev.size === st.size && prev.mtime === st.mtimeMs) {
        state.skipped++;
        state.done++;
        continue;
      }

      try {
        const meta = await metadataFor(file);
        const filename = path.basename(file);
        const folder = folderLabel(file);
        const title = meta.title || path.basename(file, path.extname(file));
        const searchText = normalize(
          [title, meta.author, filename, folder, meta.lyrics].filter(Boolean).join(" ")
        );
        upsert.run(
          id,
          file,
          filename,
          folder,
          meta.format,
          title,
          meta.author,
          meta.lyrics,
          searchText,
          st.size,
          st.mtimeMs
        );
        if (prev) state.updated++;
        else state.added++;
      } catch {
        state.failed++;
      }
      state.done++;
    }

    // 폴더에서 사라진 파일은 목록에서도 지운다.
    const stale = db
      .prepare("SELECT id FROM catalog")
      .all()
      .filter((r) => !seen.has(r.id));
    const del = db.prepare("DELETE FROM catalog WHERE id = ?");
    for (const r of stale) del.run(r.id);
  } catch (err) {
    state.error = err.message;
  } finally {
    state.running = false;
    state.finishedAt = new Date().toISOString();
  }

  return indexStatus();
}

// --- 폴더 감시 ---
// 새 악보가 폴더에 떨어지면 자동으로 색인한다. 저장이 여러 이벤트로 쪼개져 오고
// 다운로드는 .crdownload -> 최종 파일 순으로 바뀌므로, 잠잠해진 뒤에 한 번만 돌린다.

let watchTimer = null;
let watchers = [];

function scheduleIncrementalIndex() {
  if (watchTimer) clearTimeout(watchTimer);
  watchTimer = setTimeout(() => {
    watchTimer = null;
    if (!state.running) reindex().catch(() => {});
  }, 5000);
}

export function startWatching() {
  stopWatching();
  for (const root of ROOTS) {
    if (!existsSync(root.path)) continue;
    try {
      const w = watch(root.path, { recursive: root.recursive }, (_event, filename) => {
        if (!filename) return;
        if (!PLAYABLE.has(path.extname(String(filename)).toLowerCase())) return;
        scheduleIncrementalIndex();
      });
      w.on("error", () => {});
      watchers.push(w);
    } catch {
      // 감시를 못 걸어도 수동 "폴더 다시 읽기" 는 그대로 동작한다.
    }
  }
  return watchers.length;
}

export function stopWatching() {
  for (const w of watchers) {
    try {
      w.close();
    } catch {
      /* 이미 닫힘 */
    }
  }
  watchers = [];
  if (watchTimer) {
    clearTimeout(watchTimer);
    watchTimer = null;
  }
}

/** 공백 무시 부분일치. 질의를 토큰으로 쪼개 모두 포함하는 곡만 남긴다(AND). */
export function searchCatalog(query, limit = 50) {
  const tokens = (query ?? "")
    .split(/\s+/)
    .map(normalize)
    .filter(Boolean);
  if (tokens.length === 0) return [];

  const where = tokens.map(() => "search_text LIKE ?").join(" AND ");
  const params = tokens.map((t) => `%${t}%`);

  // 제목에 걸린 곡을 위로 올린다.
  const titleLike = tokens[0];
  const rows = db
    .prepare(
      `SELECT id, filename, folder, format, title, author,
              CASE WHEN replace(lower(COALESCE(title,'')),' ','') LIKE ? THEN 0 ELSE 1 END AS rank
       FROM catalog
       WHERE ${where}
       ORDER BY rank, title COLLATE NOCASE
       LIMIT ?`
    )
    .all(`%${titleLike}%`, ...params, limit);

  return rows.map(({ rank, ...r }) => r);
}

export function getCatalogEntry(id) {
  return db.prepare("SELECT * FROM catalog WHERE id = ?").get(id) ?? null;
}

/** 연주용 원본을 읽어 클라이언트가 파싱할 수 있는 형태로 돌려준다. */
export async function loadCatalogContent(id) {
  const row = getCatalogEntry(id);
  if (!row) return null;
  if (!existsSync(row.path)) return { missing: true, title: row.title };

  if (row.format === "nwc") {
    return { format: "nwctxt", title: row.title, text: await convertNwcToText(readFileSync(row.path)) };
  }
  if (row.format === "nwctxt") {
    return { format: "nwctxt", title: row.title, text: decodeMixedEncoding(readFileSync(row.path)) };
  }
  return {
    format: "midi",
    title: row.title,
    base64: readFileSync(row.path).toString("base64"),
  };
}
