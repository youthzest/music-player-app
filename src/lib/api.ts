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

export async function fetchSong(id: string): Promise<AnalyzedSong> {
  const res = await fetch(`/api/songs/${id}`);
  if (!res.ok) throw new Error("곡을 불러오지 못했습니다");
  return res.json();
}

export async function deleteSong(id: string): Promise<void> {
  await fetch(`/api/songs/${id}`, { method: "DELETE" });
}
