import type { AnalyzedSong } from "../types/music";

export async function fetchLibrary(): Promise<AnalyzedSong[]> {
  const res = await fetch("/api/songs");
  if (!res.ok) throw new Error("곡 목록을 불러오지 못했습니다");
  return res.json();
}

export async function saveSong(song: AnalyzedSong): Promise<{ id: string }> {
  const res = await fetch("/api/songs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(song),
  });
  if (!res.ok) throw new Error("곡 저장에 실패했습니다");
  return res.json();
}

export interface CatalogEntry {
  id: string;
  filename: string;
  folder: string;
  format: "nwc" | "nwctxt" | "mid";
  title: string;
  author: string | null;
}

export type CatalogContent =
  | { format: "nwctxt"; title: string; text: string }
  | { format: "midi"; title: string; base64: string };

export interface CatalogStatus {
  running: boolean;
  total: number;
  done: number;
  added: number;
  updated: number;
  skipped: number;
  failed: number;
  count: number;
  error: string | null;
  root: string;
}

export async function searchCatalog(q: string): Promise<CatalogEntry[]> {
  const res = await fetch(`/api/catalog/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error("검색에 실패했습니다");
  return res.json();
}

export async function fetchCatalogStatus(): Promise<CatalogStatus> {
  const res = await fetch("/api/catalog/status");
  if (!res.ok) throw new Error("색인 상태를 불러오지 못했습니다");
  return res.json();
}

export async function startCatalogReindex(): Promise<void> {
  await fetch("/api/catalog/reindex", { method: "POST" });
}

export interface ImportResult {
  id: string;
  title: string;
  format: string;
  folder: string;
  bytes: number;
}

/** 사용자가 고른 악보 주소 하나를 서버가 받아와 카탈로그에 등록한다. */
export async function importScoreFromUrl(url: string): Promise<ImportResult> {
  const res = await fetch("/api/catalog/import-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? "가져오지 못했습니다");
  return body as ImportResult;
}

export async function loadCatalogContent(id: string): Promise<CatalogContent> {
  const res = await fetch(`/api/catalog/${id}/content`);
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.error ?? "악보를 불러오지 못했습니다");
  }
  return res.json();
}

/** 바이너리 .nwc 를 서버로 보내 NWCTXT 텍스트로 변환받는다. */
export async function convertNwcFile(file: File): Promise<string> {
  const res = await fetch("/api/convert/nwc", {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: await file.arrayBuffer(),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.error ?? ".nwc 변환에 실패했습니다");
  }
  return res.text();
}

export async function fetchSong(id: string): Promise<AnalyzedSong> {
  const res = await fetch(`/api/songs/${id}`);
  if (!res.ok) throw new Error("곡을 불러오지 못했습니다");
  return res.json();
}

export async function saveLyrics(id: string, lyrics: string): Promise<void> {
  const res = await fetch(`/api/songs/${id}/lyrics`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lyrics }),
  });
  if (!res.ok) throw new Error("가사 저장에 실패했습니다");
}

export async function deleteSong(id: string): Promise<void> {
  await fetch(`/api/songs/${id}`, { method: "DELETE" });
}
