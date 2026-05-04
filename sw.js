const CACHE_NAME = "stock-app-cache-v3";
const urlsToCache = [
  "./",
  "./index.html",
  "./app.js",
  // style.css 파일이 실제로 폴더에 있는지 꼭 확인하세요!
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // addAll 대신 하나씩 추가하여 에러가 나도 나머지는 캐시되게 함
      return Promise.allSettled(
        urlsToCache.map(url => 
          cache.add(url).catch(err => console.log(`${url} 캐시 실패 (파일 확인 필요)`))
        )
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener("fetch", (event) => {
  // 1. 외부 API 호출은 서비스 워커가 간섭하지 않고 바로 네트워크로 통과시킵니다.
  if (
    event.request.url.includes('query1.finance.yahoo.com') || 
    event.request.url.includes('api.allorigins.win') ||
    event.request.url.includes('api.twelvedata.com') // Twelve Data 추가
  ) {
    return; 
  }

  // 2. 나머지는 기존 캐시 로직 처리
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
