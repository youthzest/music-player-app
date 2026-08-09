// 사용자가 고른 악보 주소 하나를 받아 내려받고, 형식을 검증한 뒤 가져오기 폴더에 저장한다.
// "무엇을 가져올지"는 사람이 정하고, 서버는 받아서 정리하는 일만 한다.

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { convertNwcToText } from "./nwcConvert.mjs";

const MAX_BYTES = 20 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20_000;

/** 사설/루프백 대역인지. 서버가 내부망을 대신 찔러보게 되는 걸 막는다(SSRF). */
function isPrivateAddress(ip) {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v === "::1" || v === "::") return true;
    if (v.startsWith("fc") || v.startsWith("fd")) return true; // unique local
    if (v.startsWith("fe80")) return true; // link local
    // IPv4-mapped (::ffff:a.b.c.d)
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return false;
  }
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
  const [a, b] = p;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true; // link local / metadata
  if (a >= 224) return true; // multicast, reserved
  return false;
}

async function assertPublicUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("올바른 주소가 아닙니다");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("http/https 주소만 가져올 수 있습니다");
  }
  const host = url.hostname;
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (addrs.some((a) => isPrivateAddress(a.address))) {
    throw new Error("내부망 주소는 가져올 수 없습니다");
  }
  return url;
}

function sanitizeFilename(name) {
  return (
    name
      .replace(/[\\/:*?"<>|]/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || "가져온 악보"
  );
}

function filenameFrom(url, contentDisposition) {
  if (contentDisposition) {
    // RFC 5987 (filename*=UTF-8''...) 우선, 없으면 일반 filename=
    const star = contentDisposition.match(/filename\*=(?:UTF-8'')?([^;]+)/i);
    if (star) {
      try {
        return sanitizeFilename(decodeURIComponent(star[1].replace(/^"|"$/g, "")));
      } catch {
        /* 아래로 폴백 */
      }
    }
    const plain = contentDisposition.match(/filename="?([^";]+)"?/i);
    if (plain) return sanitizeFilename(decodeURIComponent(escape(plain[1])) || plain[1]);
  }
  const base = decodeURIComponent(path.basename(url.pathname) || "");
  return sanitizeFilename(base);
}

/** 내용을 보고 실제 형식을 판정한다. 확장자는 믿지 않는다. */
async function detectFormat(bytes) {
  if (bytes.length >= 4 && bytes.subarray(0, 4).toString("latin1") === "MThd") {
    return "mid";
  }
  const head = bytes.subarray(0, 64).toString("utf8");
  if (head.startsWith("!NoteWorthyComposer")) return "nwctxt";
  // 바이너리 .nwc 는 변환을 시도해 보는 게 가장 확실한 검증이다.
  try {
    await convertNwcToText(bytes);
    return "nwc";
  } catch {
    return null;
  }
}

/**
 * 주소에서 악보 하나를 가져와 importDir 에 저장하고 저장 경로를 돌려준다.
 * 색인은 호출한 쪽에서 한다.
 */
export async function importScoreFromUrl(rawUrl, importDir) {
  const url = await assertPublicUrl(rawUrl);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "music-player-app/1.0" },
    });
  } catch (err) {
    throw new Error(`내려받지 못했습니다: ${err.name === "AbortError" ? "시간 초과" : err.message}`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) throw new Error(`서버가 ${res.status} 를 반환했습니다`);

  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) throw new Error("파일이 너무 큽니다 (20MB 초과)");

  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length === 0) throw new Error("빈 파일입니다");
  if (bytes.length > MAX_BYTES) throw new Error("파일이 너무 큽니다 (20MB 초과)");

  const format = await detectFormat(bytes);
  if (!format) {
    throw new Error(
      "NWC/MIDI 악보 파일이 아닙니다. 악보 파일의 직접 링크인지 확인해주세요(웹페이지 주소가 아니라)."
    );
  }

  const ext = format === "mid" ? ".mid" : format === "nwctxt" ? ".nwctxt" : ".nwc";
  let base = filenameFrom(url, res.headers.get("content-disposition"));
  base = base.replace(/\.(nwc|nwctxt|mid|midi)$/i, "");

  await mkdir(importDir, { recursive: true });
  let target = path.join(importDir, base + ext);
  let n = 2;
  while (existsSync(target)) {
    target = path.join(importDir, `${base} (${n++})${ext}`);
  }

  await writeFile(target, bytes);
  return { path: target, format, bytes: bytes.length };
}
