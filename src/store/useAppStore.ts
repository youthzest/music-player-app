import { create } from "zustand";
import type { AnalyzedSong } from "../types/music";
import type { InstrumentId } from "../audio/instruments";
import type { DelayId, SpaceId } from "../audio/spaces";
import type { HarmonyStyle } from "../lib/harmony";

interface AppState {
  instrumentId: InstrumentId;
  setInstrumentId: (id: InstrumentId) => void;

  spaceId: SpaceId;
  setSpaceId: (id: SpaceId) => void;

  delayId: DelayId;
  setDelayId: (id: DelayId) => void;

  chorusOn: boolean;
  setChorusOn: (on: boolean) => void;

  /** 0~100. 멜로디를 앞으로 끌어내는 정도 */
  melodyFocus: number;
  setMelodyFocus: (v: number) => void;

  /** 멜로디 음 하나를 3도·5도 위로 쌓아 두껍게 낼지 (도 -> 도미솔) */
  melodyStackOn: boolean;
  setMelodyStackOn: (on: boolean) => void;

  harmonyStyle: HarmonyStyle;
  setHarmonyStyle: (style: HarmonyStyle) => void;

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
  instrumentId: "piano-worship",
  setInstrumentId: (id) => set({ instrumentId: id }),

  // 완전 드라이한 신스가 가장 인위적으로 들리므로 기본은 예배당 공간으로 둔다.
  spaceId: "worship-hall",
  setSpaceId: (id) => set({ spaceId: id }),

  delayId: "off",
  setDelayId: (id) => set({ delayId: id }),

  chorusOn: false,
  setChorusOn: (on) => set({ chorusOn: on }),

  melodyFocus: 60,
  setMelodyFocus: (v) => set({ melodyFocus: v }),

  melodyStackOn: false,
  setMelodyStackOn: (on) => set({ melodyStackOn: on }),

  harmonyStyle: "off",
  setHarmonyStyle: (harmonyStyle) => set({ harmonyStyle }),

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
