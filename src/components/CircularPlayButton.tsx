import { useCallback, useRef, useState } from "react";
import * as Tone from "tone";
import { MelodyPlayer, BEND_RANGE_CENTS, MAX_VIBRATO_DEPTH } from "../audio/player";
import type { AnalyzedNote } from "../types/music";
import "./CircularPlayButton.css";

interface Props {
  player: MelodyPlayer;
  onNotePlayed?: (note: AnalyzedNote, index: number) => void;
}

const VERTICAL_SENSITIVITY = 4; // px of drag per cent of bend
const SHAKE_WINDOW_MS = 350;
const SHAKE_TO_VIBRATO = 0.012; // px of horizontal travel -> vibrato depth

interface PointHistory {
  x: number;
  t: number;
}

export function CircularPlayButton({ player, onNotePlayed }: Props) {
  const [pressed, setPressed] = useState(false);
  const [bendDirection, setBendDirection] = useState<"up" | "down" | null>(null);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const history = useRef<PointHistory[]>([]);

  const handlePointerDown = useCallback(
    async (e: React.PointerEvent<HTMLButtonElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      if (Tone.getContext().state !== "running") {
        await Tone.start();
      }
      startPos.current = { x: e.clientX, y: e.clientY };
      history.current = [{ x: e.clientX, t: performance.now() }];
      setPressed(true);
      setBendDirection(null);

      const note = player.attackNext();
      if (note) onNotePlayed?.(note, (player.currentIndex - 1 + player.totalNotes) % player.totalNotes);
    },
    [player, onNotePlayed]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!startPos.current) return;

      const dy = e.clientY - startPos.current.y;
      const cents = Math.max(
        -BEND_RANGE_CENTS,
        Math.min(BEND_RANGE_CENTS, -dy * VERTICAL_SENSITIVITY)
      );
      player.setPitchBend(cents);
      setBendDirection(cents > 8 ? "up" : cents < -8 ? "down" : null);

      const now = performance.now();
      history.current.push({ x: e.clientX, t: now });
      history.current = history.current.filter((p) => now - p.t <= SHAKE_WINDOW_MS);

      let travel = 0;
      for (let i = 1; i < history.current.length; i++) {
        travel += Math.abs(history.current[i].x - history.current[i - 1].x);
      }
      const vibratoDepth = Math.min(MAX_VIBRATO_DEPTH, travel * SHAKE_TO_VIBRATO);
      player.setVibratoDepth(vibratoDepth);
    },
    [player]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      e.currentTarget.releasePointerCapture(e.pointerId);
      player.release();
      startPos.current = null;
      history.current = [];
      setPressed(false);
      setBendDirection(null);
    },
    [player]
  );

  return (
    <button
      className={`circular-play-button${pressed ? " pressed" : ""}${
        bendDirection ? ` bend-${bendDirection}` : ""
      }`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      aria-label="터치하여 연주"
    >
      <span className="circular-play-button__ring" />
      <span className="circular-play-button__label">TOUCH</span>
    </button>
  );
}
