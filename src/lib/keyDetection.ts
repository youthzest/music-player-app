import type { KeyInfo, ParsedNote } from "../types/music";
import { PITCH_CLASS_NAMES, midiToPitchClass } from "../types/music";

// Krumhansl-Schmuckler key-finding algorithm: correlate the song's pitch-class
// duration histogram against the classic major/minor tonal profiles for all 24
// keys and pick the best correlation.

const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function correlate(histogram: number[], profile: number[]): number {
  const n = 12;
  const meanH = histogram.reduce((a, b) => a + b, 0) / n;
  const meanP = profile.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let denomH = 0;
  let denomP = 0;
  for (let i = 0; i < n; i++) {
    const dh = histogram[i] - meanH;
    const dp = profile[i] - meanP;
    num += dh * dp;
    denomH += dh * dh;
    denomP += dp * dp;
  }
  const denom = Math.sqrt(denomH * denomP);
  return denom === 0 ? 0 : num / denom;
}

function rotate(profile: number[], n: number): number[] {
  return profile.map((_, i) => profile[(i - n + 12) % 12]);
}

export function detectKey(notes: ParsedNote[]): KeyInfo {
  const histogram = new Array(12).fill(0);
  for (const note of notes) {
    const pc = midiToPitchClass(note.midi);
    // weight by duration so long notes influence the key more than passing tones
    histogram[pc] += Math.max(note.duration, 0.05) * (note.velocity || 0.8);
  }

  let best: KeyInfo = {
    tonic: 0,
    tonicName: "C",
    mode: "major",
    label: "C Major",
    confidence: 0,
  };
  let bestScore = -Infinity;

  for (let tonic = 0; tonic < 12; tonic++) {
    const majorScore = correlate(histogram, rotate(MAJOR_PROFILE, tonic));
    const minorScore = correlate(histogram, rotate(MINOR_PROFILE, tonic));

    if (majorScore > bestScore) {
      bestScore = majorScore;
      best = {
        tonic,
        tonicName: PITCH_CLASS_NAMES[tonic],
        mode: "major",
        label: `${PITCH_CLASS_NAMES[tonic]} Major`,
        confidence: majorScore,
      };
    }
    if (minorScore > bestScore) {
      bestScore = minorScore;
      best = {
        tonic,
        tonicName: PITCH_CLASS_NAMES[tonic],
        mode: "minor",
        label: `${PITCH_CLASS_NAMES[tonic]} Minor`,
        confidence: minorScore,
      };
    }
  }

  return best;
}
