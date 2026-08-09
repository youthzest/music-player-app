import { create } from "zustand";
import type { AnalyzedSong } from "../types/music";
import type { InstrumentId } from "../audio/instruments";
import type { DelayId, ReverbId } from "../audio/effects";
import type { HarmonyMode } from "../audio/harmony";

interface AppState {
  instrumentId: InstrumentId;
  setInstrumentId: (id: InstrumentId) => void;

  reverbId: ReverbId;
  setReverbId: (id: ReverbId) => void;

  delayId: DelayId;
  setDelayId: (id: DelayId) => void;

  chorusOn: boolean;
  setChorusOn: (on: boolean) => void;

  harmonyMode: HarmonyMode;
  setHarmonyMode: (mode: HarmonyMode) => void;

  autoPlay: boolean;
  setAutoPlay: (on: boolean) => void;

  /** 자동 재생 배속 (0.25 ~ 2.0) */
  playbackSpeed: number;
  setPlaybackSpeed: (s: number) => void;

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

  // 기본값으로 옅은 룸 리버브를 걸어둔다. 완전 드라이한 신스가 가장 인위적으로 들린다.
  reverbId: "room",
  setReverbId: (id) => set({ reverbId: id }),

  delayId: "off",
  setDelayId: (id) => set({ delayId: id }),

  chorusOn: false,
  setChorusOn: (on) => set({ chorusOn: on }),

  harmonyMode: "auto",
  setHarmonyMode: (mode) => set({ harmonyMode: mode }),

  autoPlay: false,
  setAutoPlay: (on) => set({ autoPlay: on }),

  playbackSpeed: 1,
  setPlaybackSpeed: (s) => set({ playbackSpeed: s }),

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
