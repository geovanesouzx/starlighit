const CACHE_NAME = 'starlight-v3';

// Arquivos essenciais que DEVEM estar no cache
const STATIC_ASSETS = [
    './',
    './index.html',
    './style.css',
    './script.js'
];

// 1. Instalação: Baixa os arquivos locais
self.addEventListener('install', (event) => {
    self.skipWaiting(); // Força a atualização imediata
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Caching App Shell');
            return cache.addAll(STATIC_ASSETS);
        })
    );
});

// 2. Ativação: Limpa caches antigos
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

// 3. Interceptação (Fetch)
self.addEventListener('fetch', (event) => {
    const req = event.request;
    const url = new URL(req.url);

    // --- REGRA 1: Ignorar requisições que NÃO são GET (POST, PUT, etc) ---
    if (req.method !== 'GET') return;

    // --- REGRA 2: Ignorar APIs do Google/Firebase e Vídeos (Streaming) ---
    // Isso evita que o SW quebre o login ou tente baixar filmes inteiros
    if (url.hostname.includes('googleapis.com') || 
        url.hostname.includes('firebase') || 
        url.pathname.includes('firestore') ||
        url.pathname.endsWith('.m3u8') || 
        url.pathname.endsWith('.ts')) {
        return;
    }

    // --- REGRA 3: Estratégia para o HTML (Navegação) ---
    // Se o usuário pedir a página principal (/), entrega o index.html do cache
    if (req.mode === 'navigate') {
        event.respondWith(
            caches.match('./index.html').then((cached) => {
                return cached || fetch(req).then((response) => {
                    return caches.open(CACHE_NAME).then((cache) => {
                        cache.put('./index.html', response.clone());
                        return response;
                    });
                });
            }).catch(() => {
                // Se estiver offline e não tiver index.html (raro), retorna o do cache mesmo assim
                return caches.match('./index.html');
            })
        );
        return;
    }

    // --- REGRA 4: Estratégia para Imagens e Scripts (Stale-While-Revalidate) ---
    // Tenta cache primeiro. Se não tiver, baixa, salva e devolve.
    event.respondWith(
        caches.match(req).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }

            return fetch(req).then((networkResponse) => {
                // Verifica se a resposta é válida antes de salvar
                if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic' && networkResponse.type !== 'cors' && networkResponse.type !== 'opaque') {
                    return networkResponse;
                }

                // Salva no cache para a próxima vez (apenas imagens e scripts úteis)
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(req, responseToCache);
                });

                return networkResponse;
            }).catch(() => {
                // Se falhar (offline), não retorna nada (imagem quebrada é melhor que app travado)
            });
        })
    );
});