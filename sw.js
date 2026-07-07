/* 귀트임 서비스워커 — 앱 셸 + CDN 스크립트 캐시 (오프라인에서도 앱이 뜨게)
   · 페이지(navigate): 네트워크 우선, 실패 시 캐시 (배포 후 새 버전이 바로 반영되도록)
   · CDN(react/babel): 캐시 우선 (버전 고정 URL 이라 안전)
   · /api/·YouTube·GitHub 요청은 건드리지 않음 */
const VERSION = "listen-up-v1";
const SHELL = ["./", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png"];
const CDN = [
  "https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.6/babel.min.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(VERSION).then((c) => c.addAll(SHELL.concat(CDN))).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // 페이지 이동: 네트워크 우선 → 오프라인이면 캐시된 셸
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put("./", copy)); return res; })
        .catch(() => caches.match("./"))
    );
    return;
  }
  // CDN 스크립트: 캐시 우선 (버전 고정)
  if (url.hostname === "cdnjs.cloudflare.com") {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); return res;
      }))
    );
    return;
  }
  // 같은 출처 정적 파일(manifest·아이콘): 캐시 우선
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); return res;
      }))
    );
  }
  // 그 외(API·YouTube 등)는 브라우저 기본 동작
});
