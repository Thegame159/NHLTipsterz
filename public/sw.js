/* public/sw.js */
const CACHE_NAME = "nhl-tipsterz-v4";

// Precache mínimo (podes adicionar mais ficheiros se quiseres)
const CORE_ASSETS = ["/", "/index.html", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => {})
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve())));
      await self.clients.claim();
    })()
  );
});

// Estratégia simples: network-first para HTML, cache-first para o resto
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // só GET
  if (req.method !== "GET") return;

  // O aviso de versão e a API vêm sempre da rede (nunca da cache), senão a app não deteta versões novas
  const { pathname } = new URL(req.url);
  if (pathname === "/version.json" || pathname.startsWith("/api/")) return;

  const accept = req.headers.get("accept") || "";
  const isHTML = accept.includes("text/html");

  if (isHTML) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("/")))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        // só guarda respostas válidas e nunca HTML a fazer-se passar por JS/CSS
        // (um deploy a meio devolve o index.html no lugar do ficheiro e ficava preso na cache)
        const type = res.headers.get("content-type") || "";
        if (res.ok && !type.includes("text/html")) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      });
    })
  );
});
