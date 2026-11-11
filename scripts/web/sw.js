// Style Fusion 線上版的離線快取（vite.config.ts 在 npm run build:web 時填入版本與「殼」清單，輸出成 dist-web/sw.js）。
// 規則：網頁本身每次先問網路（部署新版馬上生效，離線才用快取）；帶雜湊的程式與取樣檔永久快取（內容變了檔名就會變）；
// Google Fonts 先用快取、背景更新。
const BUILD = '__BUILD__';
const SHELL = __SHELL__;
const SHELL_CACHE = `sf-shell-${BUILD}`;
const ASSET_CACHE = 'sf-assets-v1';
const FONT_CACHE = 'sf-fonts-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('sf-shell-') && k !== SHELL_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // 網頁：網路優先，離線用快取的版本
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html', { ignoreSearch: true }).then((r) => r || caches.match('./'))),
    );
    return;
  }
  // 帶雜湊的程式、樣式、取樣、3D：快取優先
  if (url.origin === self.location.origin && url.pathname.includes('/assets/')) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(ASSET_CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }
  // 字體：先用快取，背景更新
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.open(FONT_CACHE).then((c) =>
        c.match(req).then((hit) => {
          const net = fetch(req)
            .then((res) => {
              if (res.ok || res.type === 'opaque') c.put(req, res.clone());
              return res;
            })
            .catch(() => hit);
          return hit || net;
        }),
      ),
    );
  }
});
