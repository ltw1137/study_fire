'use strict';
const CACHE = 'studyfire-v1-offline-6';
const FONTS = ['AMS-Regular','Caligraphic-Bold','Caligraphic-Regular','Fraktur-Bold','Fraktur-Regular','Main-Bold','Main-BoldItalic','Main-Italic','Main-Regular','Math-BoldItalic','Math-Italic','SansSerif-Bold','SansSerif-Italic','SansSerif-Regular','Script-Regular','Size1-Regular','Size2-Regular','Size3-Regular','Size4-Regular','Typewriter-Regular'];
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(['./','index.html','app.js','style.css','vendor/katex.min.js','vendor/katex.min.css','vendor/marked.min.js','data/cards.json', ...FONTS.map(f => `vendor/fonts/KaTeX_${f}.woff2`)]);
    const cards = await (await cache.match('data/cards.json')).json();
    await cache.addAll([...new Set(cards.flatMap(c => c.images))]);
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});
// 인터넷이 되면 항상 최신 파일을 받아 저장본도 갱신하고, 안 되면 저장본을 쓴다.
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(event.request, {cache: 'no-cache'});
      if (response.ok) await cache.put(event.request, response.clone());
      return response;
    } catch (error) {
      const cached = await cache.match(event.request, {ignoreSearch: true});
      if (cached) return cached;
      throw error;
    }
  })());
});
