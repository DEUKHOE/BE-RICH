// 캐시할 자원들
const CACHE_NAME = "stock-app-cache-v1";
const urlsToCache = [
  "/",
  "/index.html",
  "/style.css",
  "/app.js",
  "/icons/icon-192x192.png",
];

// 서비스 워커 설치 시 캐시하기
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache).catch((error) => {
        console.error("캐시 저장 실패:", error);
      });
    })
  );
});

// 서비스 워커 활성화
self.addEventListener("activate", (event) => {
  // 이전 버전의 캐시 삭제 (필요시)
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (!cacheWhitelist.includes(cacheName)) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// 네트워크 요청을 처리하는 fetch 이벤트 리스너
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // 캐시가 있으면 캐시 응답 반환
      if (cachedResponse) {
        return cachedResponse;
      }

      // 캐시가 없으면 네트워크 요청 후 캐시에 저장
      return fetch(event.request).then((networkResponse) => {
        return caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        });
      });
    }).catch((error) => {
      console.error("fetch 처리 실패:", error);
    })
  );
});