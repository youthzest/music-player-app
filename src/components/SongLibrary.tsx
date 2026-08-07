import { useEffect, useState } from "react";
import { fetchLibrary, deleteSong } from "../lib/api";
import { useAppStore } from "../store/useAppStore";

export function SongLibrary() {
  const library = useAppStore((s) => s.library);
  const setLibrary = useAppStore((s) => s.setLibrary);
  const currentSong = useAppStore((s) => s.currentSong);
  const setCurrentSong = useAppStore((s) => s.setCurrentSong);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchLibrary()
      .then(setLibrary)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [setLibrary]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteSong(id);
    setLibrary(library.filter((s) => s.id !== id));
    if (currentSong?.id === id) setCurrentSong(null);
  };

  if (loading) return <p className="song-library__empty">불러오는 중...</p>;
  if (library.length === 0) return <p className="song-library__empty">저장된 곡이 없습니다. 파일을 업로드해보세요.</p>;

  return (
    <ul className="song-library">
      {library.map((song) => (
        <li
          key={song.id}
          className={`song-library__item${currentSong?.id === song.id ? " active" : ""}`}
          onClick={() => setCurrentSong(song)}
        >
          <div className="song-library__info">
            <span className="song-library__title">{song.title}</span>
            <span className="song-library__meta">
              {song.key.label} · {song.tempo} BPM · {song.timeSignature.numerator}/{song.timeSignature.denominator}
            </span>
          </div>
          <button className="song-library__delete" onClick={(e) => handleDelete(song.id!, e)} aria-label="삭제">
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}
