// 바이너리 .nwc 는 비공개 포맷이라 직접 파싱할 수 없다. 대신 NoteWorthy Composer 2 가
// 함께 설치하는 공식 커맨드라인 변환기(nwc-conv.exe)를 호출해 .nwctxt 로 바꾼다.
//
//   nwc-conv "in.nwc" NWCTXT   ->  변환 결과가 STDOUT 으로 나온다
//
// 전제: 서버가 도는 윈도우 머신에 NWC2 가 설치돼 있어야 한다. 경로는
// NWC_CONV_PATH 환경변수로 덮어쓸 수 있고, 없으면 기본 설치 위치를 쓴다.

import { execFile } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const DEFAULT_CONV_PATH =
  "C:\\Program Files (x86)\\Noteworthy Software\\NoteWorthy Composer 2\\nwc-conv.exe";

export function nwcConvPath() {
  return process.env.NWC_CONV_PATH || DEFAULT_CONV_PATH;
}

export function isNwcConvAvailable() {
  return existsSync(nwcConvPath());
}

// nwc-conv 의 출력은 인코딩이 줄마다 다르다. 본문은 UTF-8 인데 |Font| 의 글꼴 이름처럼
// 원본 파일에서 그대로 옮겨온 값은 CP949 바이트로 남아 있다. 파일 전체를 한 번에
// 판정하면 그런 줄 하나 때문에 전체가 CP949 로 잘못 읽혀 제목까지 깨진다.
// 그래서 줄 단위로 UTF-8 을 먼저 시도하고, 실패한 줄만 EUC-KR 로 읽는다.
export function decodeMixedEncoding(buffer) {
  const utf8 = new TextDecoder("utf-8", { fatal: true });
  const eucKr = new TextDecoder("euc-kr");
  const out = [];
  let start = 0;

  for (let i = 0; i <= buffer.length; i++) {
    if (i !== buffer.length && buffer[i] !== 0x0a) continue;
    const line = buffer.subarray(start, i);
    try {
      out.push(utf8.decode(line));
    } catch {
      out.push(eucKr.decode(line));
    }
    start = i + 1;
  }
  return out.join("\n");
}

function decodeOutput(buffer) {
  return decodeMixedEncoding(buffer);
}

function runConverter(exe, inputPath) {
  return new Promise((resolve, reject) => {
    execFile(
      exe,
      [inputPath, "NWCTXT"],
      // stdout 을 문자열로 자동 변환하면 인코딩이 깨지므로 버퍼로 받는다.
      { encoding: "buffer", timeout: 30_000, maxBuffer: 32 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) {
          const detail = decodeOutput(stderr ?? Buffer.alloc(0)).trim();
          reject(new Error(detail || err.message));
          return;
        }
        resolve(decodeOutput(stdout));
      }
    );
  });
}

/** .nwc 바이트를 받아 .nwctxt 텍스트를 돌려준다. */
export async function convertNwcToText(bytes) {
  const exe = nwcConvPath();
  if (!existsSync(exe)) {
    throw new Error(
      "NoteWorthy Composer 2 가 이 서버에 설치돼 있지 않아 .nwc 를 변환할 수 없습니다."
    );
  }

  const dir = await mkdtemp(path.join(tmpdir(), "nwc-"));
  const inputPath = path.join(dir, "input.nwc");
  try {
    await writeFile(inputPath, bytes);
    const text = await runConverter(exe, inputPath);
    if (!text.includes("|SongInfo|") && !text.startsWith("!NoteWorthyComposer")) {
      throw new Error("변환 결과가 올바른 NWCTXT 형식이 아닙니다.");
    }
    return text;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
