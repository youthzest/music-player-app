import { create } from "zustand";
import type { AnalyzedSong } from "../types/music";
import type { InstrumentId } from "../audio/instruments";

interface AppState {
  instrumentId: InstrumentId;
  setInstrumentId: (id: InstrumentId) => void;

  currentSong: AnalyzedSong | null;
  setCurrentSong: (song: AnalyzedSong | null) => void;

  library: AnalyzedSong[];
  setLibrary: (songs: AnalyzedSong[]) => void;
  addToLibrary: (song: AnalyzedSong) => void;

  lastPlayedIndex: number | null;
  setLastPlayedIndex: (i: number | null) => void;

  status: string;
  setStatus: (s: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  instrumentId: "grand-piano",
  setInstrumentId: (id) => set({ instrumentId: id }),

  currentSong: null,
  setCurrentSong: (song) => set({ currentSong: song, lastPlayedIndex: null }),

  library: [],
  setLibrary: (songs) => set({ library: songs }),
  addToLibrary: (song) => set((s) => ({ library: [song, ...s.library] })),

  lastPlayedIndex: null,
  setLastPlayedIndex: (i) => set({ lastPlayedIndex: i }),

  status: "",
  setStatus: (status) => set({ status }),
}));
