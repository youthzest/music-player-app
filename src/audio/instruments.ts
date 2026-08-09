import * as Tone from "tone";

// All instruments are built from Tone.js synthesis (no external sample
// downloads) so the app stays fully self-contained on Cloudflare Pages.
// Timbres for non-keyboard instruments (flute, sax, trumpet, organ) are
// approximations shaped via oscillator type, envelope and filtering.

export type InstrumentId =
  | "grand-piano"
  | "flute"
  | "pipe-organ"
  | "saxophone"
  | "trumpet"
  | "synthesizer"
  | "brass";

export interface InstrumentDef {
  id: InstrumentId;
  label: string;
  build: () => Tone.PolySynth;
}

function pianoSynth(): Tone.PolySynth {
  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "triangle8" },
    envelope: { attack: 0.005, decay: 1.2, sustain: 0.05, release: 1.0 },
  });
  return synth;
}

function fluteSynth(): Tone.PolySynth {
  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "sine" },
    envelope: { attack: 0.08, decay: 0.1, sustain: 0.9, release: 0.4 },
  });
  return synth;
}

function pipeOrganSynth(): Tone.PolySynth {
  // A fat/multi-partial oscillator approximates the organ's dense harmonics.
  return new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "fatsawtooth", count: 3, spread: 20 } as any,
    envelope: { attack: 0.02, decay: 0.0, sustain: 1.0, release: 0.3 },
  });
}

function saxophoneSynth(): Tone.PolySynth {
  const synth = new Tone.PolySynth(Tone.AMSynth, {
    harmonicity: 1.5,
    oscillator: { type: "sawtooth" },
    envelope: { attack: 0.06, decay: 0.2, sustain: 0.7, release: 0.3 },
    modulation: { type: "square" },
    modulationEnvelope: { attack: 0.1, decay: 0.2, sustain: 0.5, release: 0.3 },
  });
  return synth;
}

function trumpetSynth(): Tone.PolySynth {
  const synth = new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 2,
    modulationIndex: 4,
    oscillator: { type: "square" },
    envelope: { attack: 0.03, decay: 0.15, sustain: 0.6, release: 0.2 },
    modulation: { type: "sine" },
    modulationEnvelope: { attack: 0.02, decay: 0.1, sustain: 0.4, release: 0.2 },
  });
  return synth;
}

function synthesizerSynth(): Tone.PolySynth {
  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "sawtooth" },
    envelope: { attack: 0.02, decay: 0.3, sustain: 0.4, release: 0.5 },
  });
  return synth;
}

function brassSynth(): Tone.PolySynth {
  const synth = new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 1,
    modulationIndex: 6,
    oscillator: { type: "sawtooth" },
    envelope: { attack: 0.05, decay: 0.2, sustain: 0.75, release: 0.35 },
    modulation: { type: "square" },
    modulationEnvelope: { attack: 0.05, decay: 0.15, sustain: 0.5, release: 0.3 },
  });
  return synth;
}

export const INSTRUMENTS: InstrumentDef[] = [
  { id: "grand-piano", label: "그랜드 피아노", build: pianoSynth },
  { id: "flute", label: "플룻", build: fluteSynth },
  { id: "pipe-organ", label: "파이프 오르간", build: pipeOrganSynth },
  { id: "saxophone", label: "색소폰", build: saxophoneSynth },
  { id: "trumpet", label: "트럼펫", build: trumpetSynth },
  { id: "synthesizer", label: "신디사이저", build: synthesizerSynth },
  { id: "brass", label: "브라스", build: brassSynth },
];

export function getInstrumentDef(id: InstrumentId): InstrumentDef {
  return INSTRUMENTS.find((i) => i.id === id) ?? INSTRUMENTS[0];
}

// Accompaniment timbres for the chord-style layer (harmony.ts). Kept separate
// from the melody INSTRUMENTS above since they're picked automatically by
// harmony style, not by the user directly.

function hymnChordSynth(): Tone.PolySynth {
  // Organ-ish dense harmonics, near-instant attack, full sustain: static chorale pad.
  return new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "fatsawtooth", count: 3, spread: 15 } as any,
    envelope: { attack: 0.03, decay: 0.1, sustain: 0.9, release: 0.6 },
  });
}

function gospelChordSynth(): Tone.PolySynth {
  // Rhodes-like FM tone with a quick attack so 7th/9th voicings stay articulate.
  return new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 1.5,
    modulationIndex: 3,
    oscillator: { type: "sine" },
    envelope: { attack: 0.01, decay: 0.3, sustain: 0.5, release: 0.4 },
  });
}

function worshipChordSynth(): Tone.PolySynth {
  // Slow-swelling detuned pad for sus4/add9 atmosphere.
  return new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "fatsine", count: 4, spread: 30 } as any,
    envelope: { attack: 0.6, decay: 0.3, sustain: 0.8, release: 1.8 },
  });
}

function ccliChordSynth(): Tone.PolySynth {
  // Slightly softer attack than gospel; density (not timbre) carries the build-up.
  return new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "fattriangle", count: 3, spread: 20 } as any,
    envelope: { attack: 0.15, decay: 0.2, sustain: 0.7, release: 0.9 },
  });
}

export function buildChordSynth(style: "hymn" | "gospel" | "worship" | "ccli"): Tone.PolySynth {
  switch (style) {
    case "hymn":
      return hymnChordSynth();
    case "gospel":
      return gospelChordSynth();
    case "worship":
      return worshipChordSynth();
    case "ccli":
      return ccliChordSynth();
  }
}
