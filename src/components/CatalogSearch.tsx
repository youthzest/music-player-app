import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchCatalogStatus,
  importScoreFromUrl,
  loadCatalogContent,
  searchCatalog,
  startCatalogReindex,
  type CatalogEntry,
  type CatalogStatus,
} from "../lib/api";
import { parseNwcText } from "../lib/nwcParser";
import { parseMidiFile } from "../lib/midiParser";
import { analyzeSong } from "../lib/analyze";
import { useAppStore } from "../store/useAppStore";

function base64ToFile(base64: string, name: string): File {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], name);
}

export function CatalogSearch() {
  const setCurrentSong = useAppStore((s) => s.setCurrentSong);
  const setStatus = useAppStore((s) => s.setStatus);

  const [open, setOpen] = useState(true);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogEntry[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatusInfo] = useState<CatalogStatus | null>(null);
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    fetchCatalogStatus().then(setStatusInfo).catch(() => {});
  }, []);

  // 색인이 도는 동안에만 진행률을 따라간다.
  useEffect(() => {
    if (!status?.running) return;
    const h = window.setInterval(() => {
      fetchCatalogStatus().then(setStatusInfo).catch(() => {});
    }, 2000);
    return () => window.clearInterval(h);
  }, [status?.running]);

  // 입력이 멈춘 뒤에 검색한다.
  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    if (!query.trim()) {
      setResults([]);
      return;
    }
    timer.current = window.setTimeout(() => {
      setSearching(true);
      searchCatalog(query)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [query]);

  const handleOpen = useCallback(
    async (entry: CatalogEntry) => {
      setLoadingId(entry.id);
      setError(null);
      try {
        const content = await loadCatalogContent(entry.id);
        const parsed =
          content.format === "nwctxt"
            ? parseNwcText(content.text, entry.title)
            : await parseMidiFile(base64ToFile(content.base64, entry.filename));

        if (parsed.notes.length === 0) {
          throw new Error("이 악보에서 멜로디를 찾지 못했습니다");
        }
        const analyzed = analyzeSong({ ...parsed, title: entry.title || parsed.title });
        setCurrentSong(analyzed);
        setStatus(
          `${analyzed.title} · ${analyzed.key.label} · 음표 ${analyzed.notes.length}개${
            analyzed.lyrics ? " · 가사 있음" : ""
          }`
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "악보를 불러오지 못했습니다");
      } finally {
        setLoadingId(null);
      }
    },
    [setCurrentSong, setStatus]
  );

  const handleReindex = async () => {
    await startCatalogReindex();
    const s = await fetchCatalogStatus();
    setStatusInfo(s);
  };

  /** 검색어로 웹 검색 결과를 새 탭에 띄워만 준다. 어떤 파일을 가져올지는 사용자가 고른다. */
  const openWebSearch = () => {
    const q = query.trim();
    if (!q) return;
    const url = `https://www.google.com/search?q=${encodeURIComponent(`${q} filetype:nwc`)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleImport = async () => {
    const url = importUrl.trim();
    if (!url) return;
    setImporting(true);
    setImportMsg(null);
    try {
      const r = await importScoreFromUrl(url);
      setImportMsg(`"${r.title}" 등록 완료 (${r.format.toUpperCase()})`);
      setImportUrl("");
      setQuery(r.title);
      const s = await fetchCatalogStatus();
      setStatusInfo(s);
    } catch (err) {
      setImportMsg(err instanceof Error ? err.message : "가져오지 못했습니다");
    } finally {
      setImporting(false);
    }
  };

  return (
    <section className="catalog">
      <button
        className="app__collapse-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="app__caret">{open ? "▼" : "▶"}</span> 찬양 검색
        {status && !status.running && (
          <span className="catalog__count">{status.count.toLocaleString()}곡</span>
        )}
      </button>

      {open && (
        <div className="catalog__body">
          <div className="catalog__searchbar">
            <input
              className="catalog__input"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="제목 또는 가사 한 구절"
            />
            <button
              className="catalog__web"
              onClick={openWebSearch}
              disabled={!query.trim()}
              title="이 단어로 웹에서 NWC 악보 검색 (새 탭)"
            >
              웹 검색
            </button>
          </div>

          {status?.running && (
            <p className="catalog__progress">
              색인 중… {status.done}/{status.total} (
              {status.total ? Math.round((status.done / status.total) * 100) : 0}%)
            </p>
          )}

          {error && <p className="catalog__error">{error}</p>}

          {query.trim() && !searching && results.length === 0 && (
            <p className="catalog__empty">검색 결과가 없습니다.</p>
          )}

          <ul className="catalog__results">
            {results.map((r) => (
              <li key={r.id}>
                <button
                  className="catalog__result"
                  onClick={() => handleOpen(r)}
                  disabled={loadingId !== null}
                >
                  <span className="catalog__result-title">
                    {r.title}
                    {loadingId === r.id && " · 불러오는 중…"}
                  </span>
                  <span className="catalog__result-meta">
                    {r.format.toUpperCase()} · {r.folder}
                    {r.author ? ` · ${r.author}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div className="catalog__import">
            <span className="catalog__import-label">주소로 가져오기</span>
            <div className="catalog__searchbar">
              <input
                className="catalog__input"
                type="url"
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleImport();
                }}
                placeholder="악보 파일(.nwc) 직접 링크 붙여넣기"
                disabled={importing}
              />
              <button
                className="catalog__web"
                onClick={handleImport}
                disabled={importing || !importUrl.trim()}
              >
                {importing ? "가져오는 중…" : "가져오기"}
              </button>
            </div>
            {importMsg && <p className="catalog__import-msg">{importMsg}</p>}
          </div>

          {!status?.running && (
            <button className="catalog__reindex" onClick={handleReindex}>
              폴더 다시 읽기
            </button>
          )}
        </div>
      )}
    </section>
  );
}
