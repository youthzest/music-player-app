// 공간(리버브) 프리셋.
//
// decay/wet 만 바꾸면 "길이만 다른 같은 방"처럼 들린다. 실제로 공간을 구분 짓는 건
// preDelay(첫 반사까지의 거리감)와 고역 감쇠(damping)다. 돌로 된 성당은 고역이 오래
// 남고, 작은 스튜디오는 금방 죽는다. 그래서 damping(잔향에 걸리는 로우패스)과
// shimmer(고역을 살짝 되살려 반짝이게)를 함께 둔다.

export type SpaceId =
  | "dry-studio"
  | "prayer-room"
  | "worship-hall"
  | "cathedral"
  | "heavenly-shimmer"
  | "cinematic-ambient"
  | "infinite-pad";

export interface SpacePreset {
  id: SpaceId;
  label: string;
  description: string;
  decay: number;
  preDelay: number;
  /** 화음에 걸리는 기본 잔향량. 멜로디는 이보다 훨씬 건조하게 간다. */
  wet: number;
  /** 잔향에 걸리는 로우패스 컷오프(Hz). 낮을수록 어둡고 포근하다. */
  damping: number;
  /** 잔향 고역을 살짝 밀어 올려 반짝임을 준다(0~1). */
  shimmer: number;
}

export const SPACES: SpacePreset[] = [
  {
    id: "dry-studio",
    label: "Dry Studio",
    description: "잔향 최소 · 음 하나하나가 또렷한 모니터링용",
    decay: 0.4,
    preDelay: 0,
    wet: 0.06,
    damping: 9000,
    shimmer: 0,
  },
  {
    id: "prayer-room",
    label: "Prayer Room",
    description: "작은 기도실 · 가까운 벽, 짧고 따뜻한 잔향",
    decay: 1.1,
    preDelay: 0.008,
    wet: 0.2,
    damping: 4200,
    shimmer: 0,
  },
  {
    id: "worship-hall",
    label: "Worship Hall",
    description: "중형 예배당 · 회중석의 자연스러운 울림",
    decay: 2.4,
    preDelay: 0.022,
    wet: 0.32,
    damping: 5200,
    shimmer: 0.08,
  },
  {
    id: "cathedral",
    label: "Cathedral",
    description: "석조 대성당 · 길고 깊은 잔향, 또렷한 고역",
    decay: 6.5,
    preDelay: 0.055,
    wet: 0.44,
    damping: 7000,
    shimmer: 0.12,
  },
  {
    id: "heavenly-shimmer",
    label: "Heavenly Shimmer",
    description: "고역이 반짝이며 번지는 빛 같은 잔향",
    decay: 5.0,
    preDelay: 0.03,
    wet: 0.46,
    damping: 11000,
    shimmer: 0.5,
  },
  {
    id: "cinematic-ambient",
    label: "Cinematic Ambient",
    description: "영화 음악풍 · 넓고 어두운 공간, 낮게 깔리는 배경",
    decay: 8.0,
    preDelay: 0.045,
    wet: 0.52,
    damping: 3200,
    shimmer: 0.15,
  },
  {
    id: "infinite-pad",
    label: "Infinite Pad",
    description: "거의 사라지지 않는 잔향 · 화음이 패드처럼 이어짐",
    decay: 14.0,
    preDelay: 0.02,
    wet: 0.62,
    damping: 5600,
    shimmer: 0.3,
  },
];

export function getSpace(id: SpaceId): SpacePreset {
  return SPACES.find((s) => s.id === id) ?? SPACES[2];
}

export type DelayId = "off" | "slap" | "echo";

export interface DelayPreset {
  id: DelayId;
  label: string;
  delayTime: number;
  feedback: number;
  wet: number;
}

export const DELAY_PRESETS: DelayPreset[] = [
  { id: "off", label: "없음", delayTime: 0.2, feedback: 0, wet: 0 },
  { id: "slap", label: "짧게", delayTime: 0.12, feedback: 0.15, wet: 0.16 },
  { id: "echo", label: "메아리", delayTime: 0.34, feedback: 0.36, wet: 0.26 },
];

export function getDelay(id: DelayId): DelayPreset {
  return DELAY_PRESETS.find((d) => d.id === id) ?? DELAY_PRESETS[0];
}
