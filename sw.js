const CACHE_NAME = 'starlight-v1';

// Arquivos essenciais para o App funcionar (App Shell)
const STATIC_ASSETS = [
    './',
    './index.html',
    './style.css',
    './script.js',
    'https://cdn.tailwindcss.com',
    'https://unpkg.com/lucide@latest',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&display=swap'
];

// Instalação: Baixa os arquivos essenciais
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Service Worker] Caching App Shell');
            return cache.addAll(STATIC_ASSETS);
        })
    );
    self.skipWaiting(); // Ativa imediatamente
});

// Ativação: Limpa caches antigos se a versão mudar
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(
                keyList.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Interceptação de Pedidos (Fetch)
self.addEventListener('fetch', (event) => {
    const req = event.request;
    const url = new URL(req.url);

    // 1. Ignora requisições de vídeo (HLS/Streams) e API do Firebase para evitar erros
    if (url.pathname.includes('firestore') || url.pathname.endsWith('.m3u8') || url.pathname.endsWith('.ts')) {
        return; 
    }

    // 2. Estratégia para Imagens do TMDB (Cache First, depois Network)
    if (url.hostname.includes('tmdb.org')) {
        event.respondWith(
            caches.open(CACHE_NAME).then((cache) => {
                return cache.match(req).then((cachedResponse) => {
                    if (cachedResponse) return cachedResponse;
                    return fetch(req).then((networkResponse) => {
                        cache.put(req, networkResponse.clone());
                        return networkResponse;
                    });
                });
            })
        );
        return;
    }

    // 3. Estratégia Padrão (Stale-While-Revalidate para arquivos estáticos)
    event.respondWith(
        caches.match(req).then((cachedResponse) => {
            const fetchPromise = fetch(req).then((networkResponse) => {
                // Atualiza o cache com a versão mais nova
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(req, networkResponse.clone());
                });
                return networkResponse;
            }).catch(() => {
                // Se estiver offline e não tiver no cache, não faz nada (ou poderia retornar página de erro)
            });

            // Retorna o cache se existir, senão espera a rede
            return cachedResponse || fetchPromise;
        })
    );
});