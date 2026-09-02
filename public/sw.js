// 설치형 웹앱(PWA)용 서비스 워커 — 캐시는 하지 않고,
// 오프라인일 때만 안내 화면을 보여준다 (항상 서버의 최신 화면 표시).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return;
  e.respondWith(
    fetch(e.request).catch(
      () =>
        new Response(
          "<!doctype html><meta charset='utf-8'><meta name='viewport' content='width=device-width'><body style='font-family:sans-serif;padding:40px;text-align:center;background:#0b0e22;color:#f4f6ff'><h2>오프라인입니다</h2><p>네트워크 연결 후 다시 열어주세요.</p></body>",
          { headers: { "Content-Type": "text/html; charset=utf-8" } }
        )
    )
  );
});
