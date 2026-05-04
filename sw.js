const CACHE_NAME = 'amway-pos-v1';

// ติดตั้ง Service Worker
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

// เปิดใช้งาน
self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

// ดักจับ Request (เพื่อให้ผ่านเกณฑ์ PWA)
self.addEventListener('fetch', (event) => {
    event.respondWith(
        fetch(event.request).catch(() => {
            return caches.match(event.request);
        })
    );
});