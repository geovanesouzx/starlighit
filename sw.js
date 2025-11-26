const CACHE_NAME = 'starlight-v2'; // Mudei para v2 para forçar atualização

// Arquivos locais essenciais (apenas o que é seu)
const STATIC_ASSETS = [
    './',
    './index.html',
    './style.css',
    './script.js'
];

// Instalação: Baixa apenas os arquivos locais
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Service Worker] Instalando e baixando arquivos locais...');
            return cache.addAll(STATIC_ASSETS);
        })
    );
    self.skipWaiting();
});

// Ativação: Limpa caches antigos
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

// Interceptação de Pedidos (Aqui ele salva o Tailwind e outros externos automaticamente)
self.addEventListener('fetch', (event) => {
    const req = event.request;
    const url = new URL(req.url);

    // 1. Ignora vídeos e API do Firestore (não cachear)
    if (url.pathname.includes('firestore') || url.pathname.endsWith('.m3u8') || url.pathname.endsWith('.ts')) {
        return; 
    }

    // 2. Estratégia para Imagens TMDB e Scripts Externos (Tailwind, FontAwesome, etc)
    // Tenta pegar do cache primeiro, se não tiver, baixa e salva.
    event.respondWith(
        caches.match(req).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }

            // Se não está no cache, vai na rede buscar
            return fetch(req).then((networkResponse) => {
                // Verifica se a resposta é válida antes de salvar
                if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic' && networkResponse.type !== 'cors' && networkResponse.type !== 'opaque') {
                    return networkResponse;
                }

                // Clona e salva no cache para a próxima vez
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(req, responseToCache);
                });

                return networkResponse;
            }).catch(() => {
                // Se falhar (sem net) e não estiver no cache, não faz nada
            });
        })
    );
});