// 한글 텍스트가 깨져 들어오는 두 가지 경로를 막기 위한 디코딩 유틸.
//
// 1) MIDI 메타 텍스트 — @tonejs/midi 는 트랙/시퀀스 이름을 바이트 단위로 읽어
//    Latin-1 로 문자열화한다. 원본이 UTF-8 한글이면 "십자가의 전달자" 가
//    "ì­ìê°ì ì ë¬ì" 처럼 보이는 mojibake 가 된다. 문자열이 통째로
//    Latin-1 영역에 있으면 바이트로 되돌려 UTF-8 로 재해석한다.
//
// 2) .nwctxt 파일 — File.text() 는 항상 UTF-8 로 디코딩하므로, 한국어 윈도우에서
//    저장된 CP949/EUC-KR 파일은 U+FFFD 로 깨져 복구가 불가능해진다.
//    UTF-8 엄격 모드로 먼저 시도하고 실패할 때만 EUC-KR 로 넘어간다.

/** Latin-1 로 잘못 디코딩된 UTF-8 문자열을 되살린다. 복원할 수 없으면 원문 그대로 반환. */
export function repairLatin1Mojibake(input: string): string {
  if (!input) return input;

  const codePoints = [...input].map((c) => c.codePointAt(0) ?? 0);

  // 한 글자라도 Latin-1 범위를 벗어나면 이미 제대로 디코딩된 문자열이다.
  // (정상 한글은 U+AC00 이상이라 여기서 걸러진다.)
  if (codePoints.some((cp) => cp > 0xff)) return input;

  // 순수 ASCII 는 어떤 인코딩으로 읽어도 같으므로 손댈 이유가 없다.
  if (!codePoints.some((cp) => cp > 0x7f)) return input;

  const bytes = Uint8Array.from(codePoints);
  try {
    // fatal: true — 유효한 UTF-8 이 아니면 예외를 던지게 해서
    // 진짜 Latin-1 문자열(예: "Café")을 망가뜨리지 않는다.
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return input;
  }
}

// NWC2 가 저장한 .nwctxt 는 인코딩이 줄마다 섞여 있다. 본문은 UTF-8 인데 |Font| 의
// 글꼴 이름처럼 원본에서 그대로 옮겨온 값만 CP949 바이트로 남는다. 파일 전체를 한 번에
// 판정하면 그런 줄 하나 때문에 전체가 CP949 로 잘못 읽혀 제목까지 깨진다.
// 그래서 줄 단위로 UTF-8 을 먼저 시도하고, 실패한 줄만 EUC-KR 로 읽는다.
export function decodeMixedEncoding(bytes: Uint8Array): string {
  const utf8 = new TextDecoder("utf-8", { fatal: true });
  let eucKr: TextDecoder | null = null;
  try {
    eucKr = new TextDecoder("euc-kr");
  } catch {
    eucKr = null; // EUC-KR 을 지원하지 않는 환경
  }
  const lenient = new TextDecoder("utf-8");

  const out: string[] = [];
  let start = 0;
  for (let i = 0; i <= bytes.length; i++) {
    if (i !== bytes.length && bytes[i] !== 0x0a) continue;
    const line = bytes.subarray(start, i);
    try {
      out.push(utf8.decode(line));
    } catch {
      out.push((eucKr ?? lenient).decode(line));
    }
    start = i + 1;
  }
  return out.join("\n");
}

/** 텍스트 파일을 줄 단위 인코딩 판정으로 읽는다. */
export async function decodeTextFile(file: File): Promise<string> {
  return decodeMixedEncoding(new Uint8Array(await file.arrayBuffer()));
}
