import { Midi } from "@tonejs/midi";
import type { ParsedNote, ParsedSong } from "../types/music";
import { repairLatin1Mojibake } from "./textDecode";

export async function parseMidiFile(file: File): Promise<ParsedSong> {
  const buffer = await file.arrayBuffer();
  const midi = new Midi(buffer);

  const notes: ParsedNote[] = [];
  for (const track of midi.tracks) {
    for (const n of track.notes) {
      notes.push({
        midi: n.midi,
        time: n.time,
        duration: n.duration,
        velocity: n.velocity,
      });
    }
  }
  notes.sort((a, b) => a.time - b.time);

  const tempo = midi.header.tempos[0]?.bpm ?? 120;
  const ts = midi.header.timeSignatures[0]?.timeSignature ?? [4, 4];

  // MIDI 메타 텍스트는 Latin-1 로 읽혀 오므로 UTF-8 한글을 되살린다.
  const embeddedName = repairLatin1Mojibake(midi.header.name?.trim() ?? "");
  const title = embeddedName || file.name.replace(/\.[^/.]+$/, "");

  return {
    title,
    tempo: Math.round(tempo),
    timeSignature: { numerator: ts[0], denominator: ts[1] },
    notes,
    durationSeconds: midi.duration,
    sourceFormat: "midi",
  };
}
