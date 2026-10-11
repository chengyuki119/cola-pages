// Yuki 站点 Service Worker：只在断网时兜底导航请求到 offline.html，不做其它缓存
var OFFLINE_URL = '/offline.html';
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open('yuki-offline-v1').then(function (c) { return c.add(OFFLINE_URL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', function (e) {
  if (e.request.mode !== 'navigate') return; // 只管页面导航，不碰图片/接口
  e.respondWith(
    fetch(e.request).catch(function () {
      return caches.match(OFFLINE_URL);
    })
  );
});
