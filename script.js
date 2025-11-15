import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signInWithPopup,
    GoogleAuthProvider,
    signOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
    getFirestore,
    collection,
    doc,
    getDoc,
    getDocs,
    addDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy, // RE-ADICIONADO PARA ORDENAR NOVIDADES E COMENTÁRIOS
    limit,   // Para paginação de comentários (opcional)
    startAfter, // Para paginação de comentários (opcional)
    onSnapshot,
    serverTimestamp,
    arrayUnion,
    arrayRemove,
    increment // Para contadores de likes/replies
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', function () {
    lucide.createIcons();

    // Define um hash padrão se nenhum existir e não for #player
    if (!window.location.hash || window.location.hash === '#player') {
        history.replaceState(null, '', window.location.pathname + window.location.search); // Limpa #player
        window.location.hash = '#home-view'; // Define um padrão inicial
    }

    // --- Configuração do Firebase ---
    const firebaseConfig = {
        apiKey: "AIzaSyA791i8R8Bmrn3toFxFltZ40TU7PUavev8", // Substitua pela sua chave real se necessário
        authDomain: "starlight-max.firebaseapp.com",
        projectId: "starlight-max",
        storageBucket: "starlight-max.appspot.com",
        messagingSenderId: "120477177511",
        appId: "1:120477177511:web:5a75a2dd6d8089c829ed82"
    };

    // Inicializar Firebase
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);
    const googleProvider = new GoogleAuthProvider();

    let isFirstNavigation = true; // ADICIONADO AQUI

    let userId = null;
    let userEmail = null; // Guardar email para referência
    let userDisplayName = null; // Guardar nome para comentários/respostas

    // Constantes da API TMDB (Exemplo - use suas chaves reais)
    const API_KEY = '5954890d9e9b723ff3032f2ec429fec3'; // Chave de exemplo
    const API_URL = 'https://api.themoviedb.org/3';
    const IMG_URL_POSTER = 'https://image.tmdb.org/t/p/w500';
    const IMG_URL_BACKGROUND = 'https://image.tmdb.org/t/p/original';
    const LANGUAGE = 'pt-BR';

    // Variáveis de estado global
    let currentHeroItem = null;
    let currentDetailsItem = null;
    let controlsTimeout;
    let currentPlayerContext = {};
    let lastProgressSaveTime = 0;
    const detailsView = document.getElementById('details-view');

    let heroCarouselInterval;
    let featuredItemIds = [];

    let hls = null; // Instância do HLS.js
    let notifications = []; // Cache de notificações
    let lastNotificationCheck = localStorage.getItem('starlight-lastNotificationCheck') || 0;
    let dismissedNotifications = JSON.parse(localStorage.getItem('starlight-dismissedNotifications')) || [];

    let firestoreContent = []; // Cache do conteúdo principal
    let pendingRequests = []; // Cache de pedidos pendentes
    let newsItemsCache = []; // Cache para novidades
    // let dailyShuffledContent = []; // <-- REMOVA ESTA LINHA
    let unsubscribeNewsListener = null; // Para parar de ouvir novidades ao deslogar

    // Elementos DOM frequentemente usados
    const loginView = document.getElementById('login-view');
    const searchOverlay = document.getElementById('search-overlay');
    const headerElement = document.querySelector('header');
    const searchInput = document.getElementById('search-input');
    const searchResultsContainer = document.getElementById('search-results');
    const searchIconBtn = document.getElementById('search-icon-btn');
    const closeSearchBtn = document.getElementById('close-search-btn');
    const notificationBtn = document.getElementById('notification-btn');
    const notificationPanel = document.getElementById('notification-panel');
    let debounceTimer; // Timer para debounce de busca

    // Elementos do Player
    const playerView = document.getElementById('player-view');
    let videoPlayer = document.getElementById('video-player');
    const playerTitle = document.getElementById('player-title');
    const playPauseBtn = document.getElementById('player-play-pause-btn');
    const rewindBtn = document.getElementById('player-rewind-btn');
    const forwardBtn = document.getElementById('player-forward-btn');
    const nextEpisodeBtn = document.getElementById('player-next-episode-btn');
    const prevEpisodeBtn = document.getElementById('player-prev-episode-btn');
    const volumeBtn = document.getElementById('player-volume-btn');
    const volumeSlider = document.getElementById('player-volume-slider');
    const seekBar = document.getElementById('player-seek-bar');
    const seekProgressBar = document.getElementById('seek-progress-bar');
    const currentTimeEl = document.getElementById('player-current-time');
    const durationEl = document.getElementById('player-duration');
    const fullscreenBtn = document.getElementById('player-fullscreen-btn');
    const settingsBtn = document.getElementById('player-settings-btn');
    const settingsPanel = document.getElementById('player-settings-panel');
    const playerBackBtn = document.getElementById('player-back-btn');
    const aspectRatioBtn = document.getElementById('player-aspect-ratio-btn'); // NOVO
    let currentAspectRatio = 'contain'; // NOVO: 'contain' ou 'cover'

    // Elementos de Gerenciamento de Perfil
    const manageProfileView = document.getElementById('manage-profile-view');
    const manageProfilesBtn = document.getElementById('manage-profiles-btn');
    const profilesGrid = document.getElementById('profiles-grid');
    const profileModal = document.getElementById('profile-modal');
    const avatarOptionsContainer = document.getElementById('avatar-options');
    const headerProfileBtn = document.getElementById('header-profile-btn');
    const logoutBtn = document.getElementById('logout-btn');

    // Elementos do Modal de Confirmação
    const confirmModal = document.getElementById('confirm-modal');
    const confirmTitle = document.getElementById('confirm-title');
    const confirmMessage = document.getElementById('confirm-message');
    const confirmOkBtn = document.getElementById('confirm-ok-btn');
    const confirmCancelBtn = document.getElementById('confirm-cancel-btn');
    let confirmCallback = null; // Função a ser chamada ao confirmar

    // Estado de Gerenciamento de Perfil
    let profiles = []; // Lista de perfis do usuário
    let currentProfile = null; // Perfil atualmente selecionado
    let isEditMode = false; // Modo de edição de perfis ativo?
    const AVATARS = [ // URLs dos avatares disponíveis
        'https://pbs.twimg.com/media/EcGdw6xXsAMkqGF?format=jpg&name=large',
        'https://pbs.twimg.com/media/FMs8_KeWYAAtoS3.jpg',
        'https://pbs.twimg.com/media/EcGdw6xXsAANIu1?format=jpg&name=large',
        'https://pbs.twimg.com/media/EcGdw6wXYAUrPu4.jpg',
        'https://pbs.twimg.com/media/EcGdw6uXgAEpGA-.jpg',

    ];

    // Ícones SVG para os controles do player
    const ICONS = {
        play: `<svg class="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg>`,
        pause: `<svg class="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"></path></svg>`,
        skipForward: `<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7"></path></svg>`,
        skipBackward: `<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"></path></svg>`,
        rewind10: `<svg fill="currentColor" viewBox="0 0 24 24"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"></path></svg>`,
        fastForward10: `<svg fill="currentColor" viewBox="0 0 24 24"><path d="M12 5c-4.42 0-8 3.58-8 8s3.58 8 8 8 8-3.58 8-8h-2c0 3.31-2.69 6-6 6s-6-2.69-6-6 2.69-6 6-6V1l5 5-5 5V7z"></path></svg>`,
        volumeHigh: `<svg fill="currentColor" viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"></path></svg>`,
        volumeMute: `<svg fill="currentColor" viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"></path></svg>`,
        fullscreen: `<svg fill="currentColor" viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"></path></svg>`,
        exitFullscreen: `<svg fill="currentColor" viewBox="0 0 24 24"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"></path></svg>`,
        settings: `<svg fill="currentColor" viewBox="0 0 24 24"><path d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12-.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49.42l.38-2.65c.61-.25 1.17-.59 1.69.98l2.49 1c.23.09.49 0 .61.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"></path></svg>`,
        back: `<svg fill="currentColor" viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"></path></svg>`,
        aspectContain: `<svg fill="currentColor" viewBox="0 0 24 24"><path d="M2 5h2v14H2V5zm20 0h-2v14h2V5zM6 7h12v10H6V7z"></path></svg>`,
        aspectCover: `<svg fill="currentColor" viewBox="0 0 24 24"><path d="M4 5h16v14H4V5z"></path></svg>`
    };

    // HTML para o spinner de carregamento
    const glassSpinnerHTML = `<div class="glass-spinner-wrapper min-h-screen"><div class="glass-spinner"><div class="glass-filter"></div><div class="glass-overlay"></div><div class="glass-specular"></div><div class="glass-content"><div class="spinner-ring"></div><div class="spinner-core"></div></div></div></div>`;

    /**
     * Exibe uma notificação toast temporária na tela.
     * @param {string} message - A mensagem a ser exibida.
     * @param {boolean} [isError=false] - Se true, estiliza como erro.
     */
    function showToast(message, isError = false) {
        const toast = document.getElementById('notification-toast');
        if (!toast) return;
        toast.textContent = message;
        toast.style.backgroundColor = isError ? 'rgba(239, 68, 68, 0.7)' : 'rgba(34, 197, 94, 0.7)'; // Vermelho para erro, verde para sucesso
        toast.classList.remove('hidden', 'opacity-0');
        toast.classList.add('opacity-100');
        // Esconde após 3 segundos
        setTimeout(() => {
            toast.classList.remove('opacity-100');
            toast.classList.add('opacity-0');
            setTimeout(() => toast.classList.add('hidden'), 300); // Garante que 'hidden' seja adicionado após a transição
        }, 3000);
    }

    // --- Funções de Dados do Firestore ---

    /**
     * Busca a lista de itens salvos ("Minha Lista") do perfil atual no Firestore.
     * @returns {Promise<Array>} - Uma promessa que resolve com a lista de itens.
     */
    async function getMyList() {
        if (!userId || !currentProfile?.id) return []; // Retorna vazio se não houver usuário ou perfil
        const myListCol = collection(db, 'users', userId, 'profiles', currentProfile.id, 'my-list');
        const snapshot = await getDocs(myListCol);
        return snapshot.docs.map(doc => doc.data()); // Mapeia os documentos para seus dados
    }

    /**
     * Verifica se um item específico está na "Minha Lista" do perfil atual.
     * @param {string|number} itemId - O ID do item a ser verificado.
     * @returns {Promise<boolean>} - True se o item estiver na lista, false caso contrário.
     */
    async function checkIfInList(itemId) {
        if (!userId || !currentProfile?.id) return false;
        const docRef = doc(db, 'users', userId, 'profiles', currentProfile.id, 'my-list', String(itemId));
        const docSnap = await getDoc(docRef);
        return docSnap.exists(); // Retorna true se o documento existir
    }

    /**
     * Adiciona ou remove um item da "Minha Lista" e atualiza os botões correspondentes.
     * @param {object} item - O objeto do item (filme ou série).
     */
    async function handleListAction(item) {
        if (!item || !userId || !currentProfile?.id) return;
        const itemId = String(item.docId || item.id); // Usa docId se disponível (do Firestore), senão id (do TMDB)
        const docRef = doc(db, 'users', userId, 'profiles', currentProfile.id, 'my-list', itemId);
        const isInList = await checkIfInList(itemId);

        if (isInList) {
            await deleteDoc(docRef); // Remove se já estiver na lista
        } else {
            // Adiciona se não estiver, garantindo que 'media_type' esteja presente
            const itemToAdd = { ...item, media_type: item.media_type || (item.title ? 'movie' : 'tv') };
            await setDoc(docRef, itemToAdd);
        }

        updateListButtons(item); // Atualiza a aparência dos botões relacionados
        // Se a view "Minha Lista" estiver ativa, recarrega seu conteúdo
        if (window.location.hash === '#mylist-view') {
            populateMyList();
        }
    }

    /**
     * Função wrapper para adicionar/remover item da lista (chamada por botões).
     * @param {object} item - O objeto do item.
     */
    async function toggleMyListItem(item) {
        await handleListAction(item);
    }

    /**
     * Atualiza a aparência dos botões "Minha Lista" (no hero e nos detalhes)
     * se o item correspondente for modificado.
     * @param {object} item - O item que foi adicionado/removido.
     */
    function updateListButtons(item) {
        // Verifica se o item modificado é o que está no hero
        if (currentHeroItem?.docId === item.docId) {
            updateListButton(document.getElementById('hero-add-to-list'), currentHeroItem);
        }
        // Verifica se o item modificado é o que está na tela de detalhes
        if (currentDetailsItem?.docId === item.docId) {
            const detailsButton = document.getElementById('details-add-to-list');
            if (detailsButton) updateListButton(detailsButton, currentDetailsItem);
        }
    }

    /**
     * Busca todo o progresso de visualização salvo para o perfil atual.
     * @returns {Promise<object>} - Um objeto onde as chaves são IDs de progresso e os valores são os dados de progresso.
     */
    async function getProgressStorage() {
        if (!userId || !currentProfile?.id) return {};
        const progressCol = collection(db, 'users', userId, 'profiles', currentProfile.id, 'watch-progress');
        const snapshot = await getDocs(progressCol);
        const progressData = {};
        snapshot.forEach(doc => {
            progressData[doc.id] = doc.data(); // Monta o objeto de progresso
        });
        return progressData;
    }

    /**
     * Salva o progresso atual do vídeo no Firestore.
     * Executada periodicamente durante a reprodução.
     */
    async function savePlayerProgress() {
        // Não salva se não houver duração, chave de contexto, usuário ou perfil
        if (!videoPlayer.duration || !currentPlayerContext.key || !userId || !currentProfile?.id) return;

        const progressData = {
            currentTime: videoPlayer.currentTime, // Tempo atual
            duration: videoPlayer.duration,       // Duração total
            lastWatched: Date.now(),            // Timestamp da última atualização
            item: currentPlayerContext.itemData, // Dados do filme/série geral
            // Dados do episódio específico (se for uma série)
            episode: currentPlayerContext.episodes ? currentPlayerContext.episodes[currentPlayerContext.currentIndex] : null,
        };

        // Referência do documento de progresso (ex: 'users/uid/profiles/pid/watch-progress/movie-123')
        const docRef = doc(db, 'users', userId, 'profiles', currentProfile.id, 'watch-progress', currentPlayerContext.key);
        // Salva (ou atualiza se já existir) os dados no Firestore
        await setDoc(docRef, progressData, { merge: true }); // 'merge: true' evita sobrescrever dados não enviados
    }

    // --- Funções de Criação de UI ---

    /**
     * Busca dados da API do TMDB.
     * @param {string} endpoint - O endpoint da API (ex: 'movie/popular').
     * @param {string} [params=''] - Parâmetros adicionais da query string.
     * @returns {Promise<object|null>} - Os dados da API ou null em caso de erro.
     */
    async function fetchFromTMDB(endpoint, params = '') {
        const url = `${API_URL}/${endpoint}?api_key=${API_KEY}&language=${LANGUAGE}&${params}`;
        try {
            const response = await fetch(url);
            if (!response.ok) {
                console.error(`HTTP error! status: ${response.status} for URL: ${url}`);
                return null;
            }
            return (await response.json()); // Retorna os dados JSON
        } catch (error) {
            console.error("Erro ao buscar dados do TMDB:", error);
            return null;
        }
    }

    /**
     * Cria e adiciona um carrossel de conteúdo a um container.
     * @param {HTMLElement} container - O elemento onde o carrossel será adicionado.
     * @param {string} title - O título do carrossel.
     * @param {Array} data - Array de itens (filmes/séries) a serem exibidos.
     */
    function createCarousel(container, title, data) {
        if (!container || !data || data.length === 0) return; // Não faz nada se não houver dados
        const section = document.createElement('section'); // Cria a seção do carrossel
        // Define o HTML interno da seção
        section.innerHTML = `
            <div class="liquid-glass-card inline-block mb-6 rounded-full" style="--bg-color: rgba(30,30,30,0.3);">
                 <div class="glass-filter"></div><div class="glass-overlay"></div><div class="glass-specular"></div>
                 <h2 class="glass-content text-xl sm:text-2xl font-bold text-white px-6 py-2">${title}</h2>
            </div>
            <div class="carousel-container relative">
                <div class="carousel space-x-4 px-4 sm:px-6 lg:px-8 py-4 overflow-x-auto hide-scrollbar scroll-smooth">
                    ${data.map(item => createContentCard(item)).join('')}
                </div>
            </div>`;
        container.appendChild(section); // Adiciona a seção ao container
        lucide.createIcons(); // Recria ícones Lucide, se houver
    }

    /**
     * Retorna uma versão embaralhada de uma lista específica (ex: um gênero),
     * com cache de 24h no localStorage, usando uma chave única.
     * @param {Array} originalList - O array a ser embaralhado (ex: todos os filmes de "Animação").
     * @param {string} cacheKey - Uma chave única para este cache (ex: "Animação").
     * @returns {Array} - O array embaralhado (novo ou do cache).
     */
    function getDailyShuffledList(originalList, cacheKey) {
        // Define chaves únicas para esta lista específica
        const CACHE_KEY_PREFIX = 'starlight-shuffled-list-';
        const TIMESTAMP_KEY_PREFIX = 'starlight-shuffle-timestamp-';
        const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000; // 24 horas em milissegundos

        const finalCacheKey = CACHE_KEY_PREFIX + cacheKey;
        const finalTimestampKey = TIMESTAMP_KEY_PREFIX + cacheKey;

        const now = new Date().getTime();
        const storedTimestamp = localStorage.getItem(finalTimestampKey);
        const storedContentJSON = localStorage.getItem(finalCacheKey);

        // Verifica se o timestamp é válido e se não expirou
        if (storedTimestamp && storedContentJSON && (now - storedTimestamp < TWENTY_FOUR_HOURS)) {
            try {
                const cachedContent = JSON.parse(storedContentJSON);
                // Validação: Se o cache tiver um número diferente de itens, está desatualizado.
                if (cachedContent.length === originalList.length) {
                    // console.log(`Usando cache de 24h para: ${cacheKey}`); // (Opcional: para debug)
                    return cachedContent; // Retorna o cache
                }
            } catch (e) {
                console.error(`Erro ao ler cache JSON para ${cacheKey}. Gerando novo.`, e);
            }
        }

        // Se chegou aqui, o cache não existe, expirou, ou falhou
        // console.log(`Gerando novo cache de 24h para: ${cacheKey}`); // (Opcional: para debug)

        // Cria uma cópia e embaralha (Algoritmo Fisher-Yates)
        const newShuffledList = [...originalList]; // Copia o array

        for (let i = newShuffledList.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [newShuffledList[i], newShuffledList[j]] = [newShuffledList[j], newShuffledList[i]];
        }

        // Salva o novo conteúdo e o timestamp no localStorage
        try {
            localStorage.setItem(finalCacheKey, JSON.stringify(newShuffledList));
            localStorage.setItem(finalTimestampKey, now.toString());
        } catch (e) {
            console.error(`Erro ao salvar cache no localStorage para ${cacheKey}:`, e);
        }

        return newShuffledList;
    }
    /**
     * Cria o HTML para um card de conteúdo (usado em carrosséis).
     * @param {object} item - O objeto do item (filme/série).
     * @returns {string} - O HTML do card.
     */
    function createContentCard(item) {
        if (!item || !item.poster) return ''; // Retorna vazio se não houver item ou pôster
        // Define o caminho do pôster, com fallback para placeholder
        const posterPath = item.poster.startsWith('http') ? item.poster : `https://placehold.co/300x450/1c1917/FFFFFF?text=Sem+Imagem`;
        // Retorna o HTML do card como um link para a tela de detalhes
        return `
        <a href="#details/${item.docId}" class="carousel-item w-36 sm:w-48 cursor-pointer group block flex-shrink-0">
            <div class="liquid-glass-card aspect-[2/3] bg-stone-800">
                 <div class="glass-filter"></div>
                 <div class="glass-distortion-overlay"></div>
                 <div class="glass-overlay" style="--bg-color: rgba(0,0,0,0.1);"></div>
                 <div class="glass-specular"></div>
                 <div class="glass-content p-0">
                     <img src="${posterPath}" alt="Pôster de ${item.title}" loading="lazy" class="w-full h-full object-cover rounded-[inherit]">
                 </div>
            </div>
        </a>`;
    };

    /**
     * Cria o HTML para um card de conteúdo em grid (usado em Séries, Filmes, Minha Lista).
     * @param {object} item - O objeto do item.
     * @returns {string} - O HTML do card.
     */
    function createGridCard(item) {
        if (!item || !item.poster) return '';
        const posterPath = item.poster.startsWith('http') ? item.poster : `https://placehold.co/300x450/1c1917/FFFFFF?text=Sem+Imagem`;
        // Inclui o título abaixo da imagem
        return `
        <a href="#details/${item.docId}" class="group block cursor-pointer">
            <div class="liquid-glass-card aspect-[2/3] bg-stone-800">
                 <div class="glass-filter"></div>
                 <div class="glass-distortion-overlay"></div>
                 <div class="glass-overlay" style="--bg-color: rgba(0,0,0,0.1);"></div>
                 <div class="glass-specular"></div>
                 <div class="glass-content p-0">
                     <img src="${posterPath}" alt="Pôster de ${item.title}" loading="lazy" class="w-full h-full object-cover rounded-[inherit]">
                 </div>
            </div>
            <h4 class="text-white text-sm mt-2 truncate">${item.title}</h4>
        </a>`;
    };

    // --- Funções de População de Dados ---

    /**
     * Exibe a classificação indicativa do conteúdo.
     * @param {object} item - O objeto do item.
     * @param {HTMLElement} container - O elemento onde a classificação será adicionada.
     */
    async function displayContentRating(item, container) {
        if (!item || !container || !item.rating) return; // Sai se não houver dados necessários
        const certification = item.rating; // Pega a classificação (ex: '14', 'Livre')

        // Mapeia a classificação para classes CSS de cor
        const ratingClassMap = {
            'Livre': 'rating-L', '10': 'rating-10', '12': 'rating-12',
            '14': 'rating-14', '16': 'rating-16', '18': 'rating-18',
        };

        const ratingClass = ratingClassMap[certification] || ''; // Obtém a classe CSS
        if (!ratingClass) return; // Sai se a classificação não for reconhecida

        // Cria o elemento da caixa de classificação
        const ratingElement = document.createElement('div');
        ratingElement.className = 'glass-container rating-box ' + ratingClass; // Adiciona as classes
        // Define o HTML interno com o efeito de vidro e o texto da classificação
        ratingElement.innerHTML = `
            <div class="glass-filter"></div>
            <div class="glass-overlay"></div>
            <div class="glass-specular"></div>
            <div class="glass-content">${certification === 'Livre' ? 'L' : certification}</div>
        `;
        container.prepend(ratingElement); // Adiciona no início do container
    }

    /**
     * Inicia a rotação automática do conteúdo em destaque na tela inicial.
     */
    function startHeroRotation() {
        if (heroCarouselInterval) clearInterval(heroCarouselInterval); // Limpa intervalo anterior
        // Filtra os itens do Firestore que estão marcados como destaque
        const featuredItems = featuredItemIds.map(id => firestoreContent.find(item => item.docId === id)).filter(Boolean);
        if (featuredItems.length <= 1) return; // Não rotaciona se houver 1 ou nenhum item

        let currentFeaturedIndex = 0; // Índice do item atual

        // Define um intervalo para trocar o item em destaque a cada 8 segundos
        heroCarouselInterval = setInterval(() => {
            currentFeaturedIndex = (currentFeaturedIndex + 1) % featuredItems.length; // Avança o índice circularmente
            updateHero(featuredItems[currentFeaturedIndex]); // Atualiza a seção hero
        }, 8000);
    }

    /**
     * Atualiza a seção "hero" (destaque principal) com os dados de um item.
     * @param {object} item - O item a ser exibido.
     */
    async function updateHero(item) {
        if (!item) return; // Sai se o item for inválido

        const heroContentWrapper = document.getElementById('hero-content-wrapper');
        const mainBackground = document.getElementById('main-background');

        // Inicia a transição de fade-out
        heroContentWrapper.classList.add('hero-fade-out');
        mainBackground.style.opacity = 0;

        // Aguarda a animação de fade-out antes de atualizar o conteúdo
        setTimeout(async () => {
            currentHeroItem = item; // Define o item atual do hero
            const backgroundUrl = item.backdrop; // URL do backdrop

            // Define a imagem de fundo principal
            mainBackground.style.backgroundImage = `url('${backgroundUrl}')`;

            // Atualiza os textos e informações
            document.getElementById('hero-category').textContent = 'EM DESTAQUE';
            document.getElementById('hero-title').textContent = item.title || item.name;
            // Limita a sinopse a 200 caracteres
            document.getElementById('hero-overview').textContent = item.synopsis.length > 200 ? item.synopsis.substring(0, 200) + '...' : item.synopsis;
            const releaseYear = item.year; // Ano de lançamento

            // Atualiza a seção de metadados (classificação, ano)
            const metaContainer = document.getElementById('hero-meta');
            metaContainer.innerHTML = ``; // Limpa o conteúdo anterior
            await displayContentRating(item, metaContainer); // Adiciona a classificação
            metaContainer.innerHTML += `<span>${releaseYear}</span>`; // Adiciona o ano

            // Atualiza o botão "Minha Lista"
            await updateListButton(document.getElementById('hero-add-to-list'), item);
            // NOVO: Adiciona listener para o botão "Mais Detalhes"
            const detailsBtn = document.getElementById('hero-details-btn');
            if (detailsBtn) {
                // Remove listener antigo para evitar duplicação (boa prática)
                if (detailsBtn.clickHandler) {
                    detailsBtn.removeEventListener('click', detailsBtn.clickHandler);
                }
                // Define o novo click handler
                detailsBtn.clickHandler = () => {
                    if (currentHeroItem && currentHeroItem.docId) {
                        // Navega para a tela de detalhes usando o hash
                        window.location.hash = `#details/${currentHeroItem.docId}`;
                    }
                };
                detailsBtn.addEventListener('click', detailsBtn.clickHandler);

                // Recria o ícone 'info' do Lucide que adicionamos no HTML
                const icon = detailsBtn.querySelector('i[data-lucide]');
                if (icon) {
                    lucide.createIcons({ nodes: [icon] });
                }
            }

            // Inicia a transição de fade-in
            mainBackground.style.opacity = 1;
            heroContentWrapper.style.opacity = 1;
            heroContentWrapper.classList.remove('hero-fade-out');
        }, 500); // Tempo correspondente à duração da animação CSS
    }

    /**
     * Atualiza a aparência (ícone e texto) de um botão "Minha Lista".
     * @param {HTMLElement} button - O elemento do botão.
     * @param {object} item - O item associado ao botão.
     */
    async function updateListButton(button, item) {
        if (!button || !item) return; // Sai se botão ou item forem inválidos
        const itemId = String(item.docId || item.id); // Pega o ID
        const isInList = await checkIfInList(itemId); // Verifica se está na lista
        const contentDiv = button.querySelector('.glass-content'); // Container do conteúdo do botão
        // Define o ícone e texto com base se está ou não na lista
        contentDiv.innerHTML = isInList
            ? `<svg class="w-5 h-5 sm:w-6 sm:h-6" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path></svg><span>Na Lista</span>` // Ícone de check
            : `<svg class="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg><span>Minha Lista</span>`; // Ícone de mais
        // Remove o listener de clique antigo para evitar duplicação
        if (button.clickHandler) {
            button.removeEventListener('click', button.clickHandler);
        }
        // Adiciona o novo listener de clique que chama a função de toggle
        button.clickHandler = () => toggleMyListItem(item);
        button.addEventListener('click', button.clickHandler);
    }

    /**
     * Popula a seção "Minha Lista" com os itens salvos do usuário.
     */
    async function populateMyList() {
        const list = await getMyList(); // Busca a lista do Firestore
        const container = document.getElementById('my-list-grid'); // Container da grid
        if (!container) return;
        // Define o HTML da grid: mensagem se vazia, ou cards dos itens
        container.innerHTML = list.length === 0
            ? '<p class="col-span-full text-center text-gray-400">Sua lista está vazia.</p>'
            : list.map(item => createGridCard(item)).join('');
        attachGlassButtonListeners(); // Reatacha listeners para efeitos visuais
    }

    /**
     * Escuta por atualizações na coleção 'content' do Firestore e atualiza a UI.
     */
    async function listenToFirestoreContent() {
        // Escuta a coleção 'content'
        onSnapshot(collection(db, 'content'), (snapshot) => {
            firestoreContent = []; // Limpa o cache local
            snapshot.forEach(doc => {
                // Adiciona cada item ao cache com seu ID do Firestore
                firestoreContent.push({ docId: doc.id, ...doc.data() });
            });

            // *** A linha abaixo foi REMOVIDA ***
            // dailyShuffledContent = getDailyShuffledContent(firestoreContent); 

            // Escuta o documento 'featured' na coleção 'config' para saber quais itens destacar
            onSnapshot(doc(db, 'config', 'featured'), (docSnap) => {
                // Pega a lista de IDs de destaque, ou um array vazio se não existir
                featuredItemIds = docSnap.exists() ? (docSnap.data().items || []) : [];
                // Re-renderiza a tela atual com base nos novos dados
                handleNavigation(); // O roteador decidirá o que renderizar
            });
        });
    }
    /**
     * Popula a tela inicial com carrosséis (adicionados recentemente, por gênero).
     */
    async function populateAllViews() {
        const carouselsContainer = document.getElementById('home-carousels-container');
        if (!carouselsContainer) return; // Sai se o container não existir
        carouselsContainer.innerHTML = ''; // Limpa o container

        // Carrossel "Adicionado Recentemente"
        // (ESTA PARTE FICA IGUAL, usando 'firestoreContent' original para ordenar por data)
        const recentlyAdded = [...firestoreContent]
            .sort((a, b) => (b.addedAt?.toMillis() || 0) - (a.addedAt?.toMillis() || 0))
            .slice(0, 20); // Pega os 20 mais recentes
        createCarousel(carouselsContainer, "Adicionado Recentemente", recentlyAdded);

        // Carrosséis por Gênero
        // *** MODIFIQUE A PARTIR DAQUI ***

        // 1. Pega todos os gêneros únicos do CONTEÚDO ORIGINAL
        const allGenres = [...new Set(firestoreContent.flatMap(item => item.genres || []))];

        for (const genre of allGenres) {
            // 2. Filtra o CONTEÚDO ORIGINAL para obter a lista APENAS daquele gênero
            const originalGenreList = firestoreContent.filter(item => item.genres && item.genres.includes(genre));

            // 3. Passa essa lista de gênero específica para a função de embaralhamento diário
            // A chave de cache (o nome do gênero) garante um embaralhamento único por gênero
            const shuffledGenreList = getDailyShuffledList(originalGenreList, genre);

            // 4. Cria o carrossel com a lista de gênero embaralhada e cacheada
            createCarousel(carouselsContainer, genre, shuffledGenreList);
        }
        // *** FIM DAS MODIFICAÇÕES ***

        attachGlassButtonListeners(); // Reatacha listeners visuais
    }

    // --- Navegação e Gerenciamento de Views ---

    // Listener para cliques nos links de navegação (desktop e mobile)
    const navLinks = document.querySelectorAll('.nav-item, .mobile-nav-item');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault(); // Impede a navegação padrão do link
            const targetId = link.getAttribute('data-target'); // Pega o ID da view alvo
            if (!targetId) return; // Sai se não houver alvo

            // Muda o hash da URL. O listener 'hashchange' cuidará da lógica de mostrar/esconder.
            if (window.location.hash !== `#${targetId}`) {
                window.location.hash = targetId;
            }
        });
    });

    /**
     * Renderiza o conteúdo específico de uma tela principal (Home, Séries, Filmes, etc.).
     * @param {string} screenId - O ID da tela a ser renderizada.
     * @param {boolean} [forceReload=false] - Se true, força o recarregamento (não usado atualmente).
     */
    function renderScreenContent(screenId, forceReload = false) {
        const screenElement = document.getElementById(screenId);
        if (!screenElement) return; // Sai se a tela não for encontrada

        // Lógica de renderização específica para cada tela
        if (screenId === 'home-view') {
            // Pega os itens em destaque e atualiza o hero
            const featuredItems = featuredItemIds.map(id => firestoreContent.find(item => item.docId === id)).filter(Boolean);
            if (featuredItems.length > 0) {
                updateHero(featuredItems[0]); // Mostra o primeiro item
                startHeroRotation(); // Inicia a rotação
            }
            populateAllViews(); // Popula os carrosséis da home
        } else if (screenId === 'series-view') {
            const grid = document.getElementById('series-grid');
            const series = firestoreContent.filter(item => item.type === 'tv'); // Filtra apenas séries
            grid.innerHTML = series.map(createGridCard).join(''); // Cria a grid de séries
        } else if (screenId === 'movies-view') {
            const grid = document.getElementById('movies-grid');
            const movies = firestoreContent.filter(item => item.type === 'movie'); // Filtra apenas filmes
            grid.innerHTML = movies.map(createGridCard).join(''); // Cria a grid de filmes
        } else if (screenId === 'mylist-view') {
            populateMyList(); // Popula a grid da "Minha Lista"
        } else if (screenId === 'requests-view') {
            renderPendingRequests(); // Renderiza os pedidos pendentes
        } else if (screenId === 'news-view') {
            renderNewsFeed(); // NOVO: Renderiza o feed de novidades
        }
        lucide.createIcons(); // Recria ícones
        attachGlassButtonListeners(); // Reatacha listeners visuais
    }

    // Listener global para cliques em links de detalhes (cards de conteúdo)
    document.body.addEventListener('click', (e) => {
        const anchor = e.target.closest('a'); // Encontra o link pai mais próximo
        // Se for um link de detalhes
        if (anchor && anchor.hash.startsWith('#details/')) {
            e.preventDefault(); // Impede a navegação padrão
            window.location.hash = anchor.hash; // Muda o hash para acionar o roteador
        }
    });

    /**
     * Renderiza a tela de detalhes para um item específico.
     * @param {object} item - Objeto contendo o docId do item.
     */
    async function showDetailsView(item) {
        // Esconde header/footer
        document.querySelector('header').classList.add('hidden');
        document.querySelector('footer').classList.add('hidden');

        detailsView.classList.remove('hidden'); // Mostra a view de detalhes
        detailsView.innerHTML = '<div class="spinner mx-auto mt-20"></div>'; // Mostra spinner
        window.scrollTo(0, 0); // Rola para o topo

        // Busca os dados do item no cache local do Firestore
        const data = firestoreContent.find(i => i.docId === item.docId);
        if (!data) { // Se não encontrar, mostra erro
            detailsView.innerHTML = '<p class="text-center text-red-400">Conteúdo não encontrado.</p>';
            return;
        }

        currentDetailsItem = data; // Define o item atual dos detalhes
        // Extrai informações do item
        const title = data.title || data.name;
        const releaseYear = data.year || '';
        const genres = data.genres ? data.genres.map(g => `<span class="bg-white/10 text-xs font-semibold px-2 py-1 rounded-full text-white">${g}</span>`).join('') : '';
        let duration = '';
        if (data.type === 'movie' && data.duration) {
            duration = data.duration;
        } else if (data.type === 'tv' && data.seasons) {
            duration = `${Object.keys(data.seasons).length} Temporada(s)`;
        }

        // Define URLs de imagem com fallback
        let backgroundUrl = data.backdrop;
        const finalImageUrl = backgroundUrl.startsWith('http') ? backgroundUrl : 'https://placehold.co/1280x720/0c0a09/ffffff?text=Starlight';
        const posterUrl = data.poster.startsWith('http') ? data.poster : 'https://placehold.co/500x750/1a1a1a/ffffff?text=Capa';

        // Define o HTML da tela de detalhes
        detailsView.innerHTML = `
            <div class="fixed inset-0 z-[-1] bg-cover bg-center bg-no-repeat" style="background-image: url('${finalImageUrl}');">
                 <div class="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
                 <div class="absolute inset-0 details-gradient-overlay"></div>
            </div>

            <div class="relative">
                <button id="back-from-details" class="fixed top-6 left-6 z-20 bg-black/20 backdrop-blur-sm rounded-full p-2 hover:bg-black/40 transition-colors" aria-label="Voltar">
                    <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
                </button>

                <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 min-h-screen flex items-center pt-24 pb-12">
                    <div class="flex flex-col md:flex-row items-center md:items-start gap-8 lg:gap-12 w-full">
                        <div class="flex-shrink-0 w-48 sm:w-56 md:w-64 mx-auto md:mx-0">
                            <img src="${posterUrl}" alt="${title}" class="rounded-lg shadow-2xl w-full aspect-[2/3] object-cover">
                        </div>
                        <div class="flex-1 mt-6 md:mt-0 text-center md:text-left">
                            <h1 class="text-3xl md:text-5xl lg:text-6xl font-black text-white" style="text-shadow: 2px 2px 8px rgba(0,0,0,0.7);">${title}</h1>
                            <div id="details-meta" class="flex items-center justify-center md:justify-start flex-wrap gap-x-4 gap-y-2 mt-4 text-base text-stone-300">
                                <!-- Metadados (ano, duração, classificação) serão inseridos aqui -->
                            </div>
                            <div class="mt-4 flex flex-wrap gap-2 justify-center md:justify-start">${genres}</div>
                            <div class="mt-8 flex flex-wrap gap-4 justify-center md:justify-start">
                                <button id="details-watch-btn" class="glass-container glass-button rounded-full text-base sm:text-lg px-7 py-2.5 sm:px-8 sm:py-3"><div class="glass-filter"></div><div class="glass-overlay"></div><div class="glass-specular"></div><div class="glass-content flex items-center gap-2"><svg class="w-5 h-5 sm:w-6 sm:h-6" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"></path></svg>Assistir</div></button>
                                <button id="details-add-to-list" class="glass-container glass-button rounded-full text-base sm:text-lg px-7 py-2.5 sm:px-8 sm:py-3"><div class="glass-filter"></div><div class="glass-overlay"></div><div class="glass-specular"></div><div class="glass-content flex items-center gap-2"></div></button>
                            </div>
                            <h3 class="mt-8 text-lg sm:text-xl font-semibold text-white">Sinopse</h3>
                            <p class="mt-2 text-gray-300 max-w-2xl text-sm leading-relaxed">${data.synopsis || data.overview || 'Sinopse não disponível.'}</p>
                            <div id="tv-content-details" class="mt-10"></div> <!-- Container para temporadas/episódios -->
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Popula a seção de metadados
        const detailsMetaContainer = detailsView.querySelector('#details-meta');
        if (detailsMetaContainer) {
            displayContentRating(data, detailsMetaContainer); // Adiciona classificação
            // Adiciona ano e duração
            detailsMetaContainer.innerHTML += `
                ${releaseYear ? `<span>${releaseYear}</span>` : ''}
                ${duration ? `<span>•</span><span>${duration}</span>` : ''}
            `;
        }

        // Adiciona listeners aos botões da tela de detalhes
        document.getElementById('back-from-details').addEventListener('click', () => history.back()); // Botão voltar
        document.getElementById('details-watch-btn').addEventListener('click', () => { // Botão assistir
            if (data.type === 'movie') {
                // Se for filme, inicia o player com a URL do filme
                showPlayer({ videoUrl: data.url, title: title, itemData: data });
            } else if (data.type === 'tv' && data.seasons) {
                // Se for série, encontra o primeiro episódio da primeira temporada
                const firstSeasonKey = Object.keys(data.seasons).sort((a, b) => parseInt(a) - parseInt(b))[0];
                const firstEpisode = data.seasons[firstSeasonKey]?.episodes?.[0];

                if (firstEpisode) {
                    // Prepara o contexto do player com informações da série e episódio
                    const allEpisodesOfSeason = data.seasons[firstSeasonKey].episodes;
                    const context = {
                        videoUrl: firstEpisode.url,
                        title: `${title} - T${firstSeasonKey} E${firstEpisode.episode_number || 1}`,
                        itemData: data,
                        episodes: allEpisodesOfSeason,
                        currentIndex: 0 // Começa no primeiro episódio
                    };
                    showPlayer(context); // Inicia o player
                } else {
                    showToast("Nenhum episódio encontrado.", true); // Mensagem de erro
                }
            }
        });
        await updateListButton(document.getElementById('details-add-to-list'), data); // Atualiza botão "Minha Lista"

        // Se for uma série, renderiza a seção de temporadas/episódios
        if (data.type === 'tv' && data.seasons) {
            renderTvDetails(data);
        }
        attachGlassButtonListeners(); // Reatacha listeners visuais
    }

    /**
     * Renderiza a seção de temporadas e episódios para uma série na tela de detalhes.
     * @param {object} data - Os dados da série.
     */
    function renderTvDetails(data) {
        const container = document.getElementById('tv-content-details');
        if (!container) return; // Sai se o container não existir

        // Pega as chaves das temporadas (números) e ordena
        const seasonKeys = Object.keys(data.seasons).sort((a, b) => parseInt(a) - parseInt(b));
        if (seasonKeys.length === 0) { // Se não houver temporadas
            container.innerHTML = '<p class="text-stone-400">Nenhuma temporada encontrada.</p>';
            return;
        }

        // Tenta pegar a última temporada selecionada do localStorage, ou usa a primeira
        const savedSeason = localStorage.getItem(`starlight-selected-season-${data.docId}`);
        const firstSeasonKey = (savedSeason && data.seasons[savedSeason]) ? savedSeason : seasonKeys[0];

        // Cria o HTML do seletor de temporada e do container de episódios
        container.innerHTML = `
            <div class="custom-select-container relative w-full md:w-64 mb-6">
                <button id="season-selector-button" class="glass-container glass-button rounded-lg w-full text-left">
                    <!-- Botão para abrir o seletor -->
                    <div class="glass-filter"></div>
                    <div class="glass-overlay" style="--glass-bg-color: rgba(25, 25, 25, 0.5);"></div>
                    <div class="glass-specular"></div>
                    <div class="glass-content flex justify-between items-center p-3">
                        <span id="selected-season-text">${data.seasons[firstSeasonKey]?.title || `Temporada ${firstSeasonKey}`}</span>
                        <i data-lucide="chevron-down" class="w-5 h-5 transition-transform"></i>
                    </div>
                </button>
                <div id="season-options" class="hidden custom-select-options glass-container rounded-lg animate-fade-in-down">
                     <!-- Opções do seletor (inicialmente escondido) -->
                     <div class="glass-filter"></div>
                     <div class="glass-overlay" style="--glass-bg-color: rgba(25, 25, 25, 0.7);"></div>
                     <div class="glass-specular"></div>
                     <div id="season-options-content" class="glass-content p-2">
                         <!-- Mapeia as chaves das temporadas para criar as opções -->
                         ${seasonKeys.map(key => `<div class="custom-select-option p-3 rounded-md cursor-pointer" data-season="${key}">${data.seasons[key]?.title || `Temporada ${key}`}</div>`).join('')}
                     </div>
                </div>
            </div>
            <div id="episode-list-container" class="space-y-3"></div> <!-- Container para a lista de episódios -->
        `;
        lucide.createIcons(); // Recria ícones

        /**
         * Renderiza a lista de episódios para uma temporada específica.
         * @param {string} seasonKey - A chave da temporada (ex: '1', '2').
         */
        const renderEpisodes = (seasonKey) => {
            const season = data.seasons[seasonKey]; // Pega os dados da temporada
            const episodes = season?.episodes; // Pega a lista de episódios
            const episodeContainer = document.getElementById('episode-list-container');
            if (!episodes || episodes.length === 0) { // Se não houver episódios
                episodeContainer.innerHTML = '<p class="text-stone-400">Nenhum episódio encontrado para esta temporada.</p>';
                return;
            }
            // Cria o HTML para cada episódio
            episodeContainer.innerHTML = episodes.map((ep, index) => {
                const epTitle = ep.title || `Episódio ${ep.episode_number || index + 1}`;
                const epOverview = ep.overview || 'Sem descrição.';
                // Define a imagem do episódio com fallback
                const stillPath = ep.still_path ? (ep.still_path.startsWith('/') ? `https://image.tmdb.org/t/p/w300${ep.still_path}` : ep.still_path) : 'https://placehold.co/300x168/1c1917/FFFFFF?text=Starlight';

                return `
                    <div class="episode-item glass-container glass-button rounded-lg overflow-hidden cursor-pointer" data-index="${index}" data-season="${seasonKey}">
                        <div class="glass-filter"></div>
                        <div class="glass-overlay" style="--glass-bg-color: rgba(25, 25, 25, 0.3);"></div>
                        <div class="glass-specular"></div>
                        <div class="glass-content flex items-start p-3 gap-4">
                            <div class="relative flex-shrink-0">
                                <img src="${stillPath}" alt="Cena do episódio" class="w-32 sm:w-40 rounded-md aspect-video object-cover">
                                <div class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <i data-lucide="play-circle" class="w-8 h-8 text-white"></i> <!-- Ícone de play ao passar o mouse -->
                                </div>
                            </div>
                            <div class="flex-1">
                                <h4 class="font-semibold text-white">${index + 1}. ${epTitle}</h4>
                                <p class="text-xs text-stone-300 mt-1 max-h-16 overflow-hidden">${epOverview}</p> <!-- Limita altura da sinopse -->
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
            lucide.createIcons(); // Recria ícones
        };

        renderEpisodes(firstSeasonKey); // Renderiza os episódios da temporada inicial

        // Listeners para o seletor de temporada
        const seasonSelectorBtn = document.getElementById('season-selector-button');
        const seasonOptions = document.getElementById('season-options');

        seasonSelectorBtn.addEventListener('click', () => { // Abrir/fechar seletor
            const isHidden = seasonOptions.classList.toggle('hidden');
            seasonSelectorBtn.querySelector('i').style.transform = isHidden ? 'rotate(0deg)' : 'rotate(180deg)'; // Gira a seta
        });

        document.getElementById('season-options-content').addEventListener('click', (e) => { // Selecionar temporada
            const option = e.target.closest('.custom-select-option');
            if (option) {
                const seasonKey = option.dataset.season; // Pega a temporada selecionada
                document.getElementById('selected-season-text').textContent = data.seasons[seasonKey]?.title || `Temporada ${seasonKey}`; // Atualiza texto do botão
                renderEpisodes(seasonKey); // Renderiza os episódios da nova temporada
                localStorage.setItem(`starlight-selected-season-${data.docId}`, seasonKey); // Salva a seleção
                seasonSelectorBtn.click(); // Fecha o seletor
                attachGlassButtonListeners(); // Reatacha listeners visuais
            }
        });

        // Listener para cliques nos itens de episódio
        document.getElementById('episode-list-container').addEventListener('click', (e) => {
            const episodeItem = e.target.closest('.episode-item');
            if (episodeItem) { // Se clicou em um episódio
                const seasonKey = episodeItem.dataset.season; // Pega a temporada
                const episodeIndex = parseInt(episodeItem.dataset.index, 10); // Pega o índice do episódio
                const allEpisodesOfSeason = data.seasons[seasonKey].episodes;
                const episode = allEpisodesOfSeason[episodeIndex]; // Pega os dados do episódio

                // Prepara o contexto para o player
                const context = {
                    videoUrl: episode.url, // URL do vídeo do episódio
                    title: `${data.name} - T${seasonKey} E${episode.episode_number || episodeIndex + 1}`, // Título para o player
                    itemData: data, // Dados gerais da série
                    episodes: allEpisodesOfSeason, // Lista de todos os episódios da temporada
                    currentIndex: episodeIndex // Índice do episódio clicado
                };
                showPlayer(context); // Inicia o player
            }
        });
    }

    /** Efeito visual: Atualiza gradiente especular ao mover o mouse sobre elementos 'glass' */
    function handleMouseMove(e) { const rect = this.getBoundingClientRect(); const x = e.clientX - rect.left; const y = e.clientY - rect.top; const specular = this.querySelector('.glass-specular'); if (specular) specular.style.background = `radial-gradient(circle at ${x}px ${y}px, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.05) 30%, rgba(255,255,255,0) 60%)`; }
    /** Efeito visual: Remove gradiente especular ao tirar o mouse */
    function handleMouseLeave() { const specular = this.querySelector('.glass-specular'); if (specular) specular.style.background = 'none'; }
    /** Adiciona listeners para os efeitos visuais 'glass' a todos os elementos relevantes */
    function attachGlassButtonListeners() { document.querySelectorAll('.glass-button, .liquid-glass-card, .player-control-btn, .glass-container[style*="--bg-color"], .glass-form, .news-card, .comment-card, .reply-card').forEach(element => { if (!element.hasGlassListener) { element.addEventListener('mousemove', handleMouseMove); element.addEventListener('mouseleave', handleMouseLeave); element.hasGlassListener = true; } }); } // 'hasGlassListener' evita adicionar múltiplos listeners
    /** Atualiza a posição e tamanho do indicador da navegação mobile */
    function updateMobileNavIndicator() { const indicator = document.getElementById('mobile-nav-indicator'); const activeItem = document.querySelector('#mobile-nav .mobile-nav-item.active'); if (indicator && activeItem) { const left = activeItem.offsetLeft; const width = activeItem.offsetWidth; indicator.style.width = `${width}px`; indicator.style.transform = `translateX(${left}px)`; } }
    /** Mostra ou esconde o overlay de busca */
    function toggleSearchOverlay(show) { if (show) { searchOverlay.classList.remove('hidden'); searchInput.focus(); document.body.style.overflow = 'hidden'; } else { searchOverlay.classList.add('hidden'); searchInput.value = ''; searchResultsContainer.innerHTML = ''; document.body.style.overflow = 'auto'; } }

    /**
     * Realiza a busca no CATÁLOGO LOCAL (firestoreContent) e exibe os resultados.
     */
    function performSearch(query) {
        if (query.length < 2) {
            searchResultsContainer.innerHTML = `<p class="col-span-full text-center text-gray-400">Digite pelo menos 2 caracteres.</p>`;
            return;
        }

        // Garante que firestoreContent está disponível
        if (!firestoreContent || firestoreContent.length === 0) {
            searchResultsContainer.innerHTML = `<p class="col-span-full text-center text-gray-400">O catálogo está carregando. Tente novamente em alguns segundos.</p>`;
            return;
        }

        const lowerCaseQuery = query.toLowerCase();
        // Filtra o array firestoreContent local
        const results = firestoreContent.filter(item => {
            const title = (item.title || item.name || '').toLowerCase();
            return title.includes(lowerCaseQuery);
        });

        if (results.length > 0) {
            // Usa createGridCard para exibir os resultados na grid
            // createGridCard usa 'item.docId' para criar o link correto
            searchResultsContainer.innerHTML = results.map(item => createGridCard(item)).join('');
        } else {
            searchResultsContainer.innerHTML = `<p class="col-span-full text-center text-gray-400">Nenhum resultado para "${query}" em nosso catálogo.</p>`;
        }

        // Re-anexa listeners para os cards de vidro recém-criados
        attachGlassButtonListeners();
    }


    // --- Funções do Player ---

    /**
     * Mostra e configura o player de vídeo.
     * @param {object} context - Informações sobre o vídeo a ser reproduzido.
     */
    async function showPlayer(context) {
        // 1. Reset completo do player antes de iniciar um novo
        hidePlayer(false, true); // Limpa estado anterior, marca como 'isChangingEpisode'
        await new Promise(resolve => setTimeout(resolve, 50)); // Pequeno delay

        let key; // Chave única para salvar o progresso (ex: 'movie-123', 'tv-456-s1-e2')
        let itemData = context.itemData; // Dados gerais do item
        if (!itemData) { // Erro se não houver dados do item
            console.error("showPlayer called without itemData in context.");
            return;
        }

        // Define a chave com base se é filme ou episódio de série
        if (context.episodes) { // É uma série
            const episode = context.episodes[context.currentIndex];
            key = `tv-${itemData.docId}-s${episode.season_number}-e${episode.episode_number}`;
        } else { // É um filme
            key = `movie-${itemData.docId}`;
        }

        // Define o contexto atual do player
        currentPlayerContext = { ...context, key, id: itemData.docId, itemData };

        // Adiciona #player ao histórico do navegador se ainda não estiver lá
        if (window.location.hash !== '#player') {
            history.pushState({ view: 'player' }, '', '#player');
        }

        // Mostra a view do player e esconde a barra de rolagem do body
        playerView.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        playerTitle.textContent = context.title; // Define o título no player

        // Processa a URL do vídeo (caso especial para api.anivideo.net)
        let urlToLoad = context.videoUrl;
        try {
            const urlObject = new URL(urlToLoad);
            if (urlObject.hostname.includes('api.anivideo.net') && urlObject.pathname.includes('videohls.php')) {
                const videoSrc = urlObject.searchParams.get('d');
                if (videoSrc) {
                    urlToLoad = videoSrc; // Usa a URL extraída do parâmetro 'd'
                }
            }
        } catch (e) {
            // URL inválida, usa a original
        }

        // Configura HLS.js se for um stream .m3u8 e o navegador suportar
        if (Hls.isSupported() && urlToLoad.includes('.m3u8')) {
            // MUDANÇA: Adiciona configuração de buffer para tentar reduzir travamentos
            hls = new Hls({
                maxBufferLength: 30,    // Segundos de buffer
                maxBufferSize: 60 * 1000 * 1000, // 60MB de buffer
                startLevel: -1           // Começa na qualidade automática
            });
            hls.loadSource(urlToLoad); // Carrega a fonte
            hls.attachMedia(videoPlayer); // Anexa ao elemento <video>
            hls.on(Hls.Events.MANIFEST_PARSED, () => { // Quando o manifesto HLS for carregado
                // Se houver um tempo inicial definido (ex: continuar assistindo), pula para ele
                if (context.startTime && context.startTime > 5) { // Só pula se for maior que 5s
                    videoPlayer.currentTime = context.startTime;
                }
                videoPlayer.play().catch(e => console.error("Erro ao tentar reproduzir o vídeo HLS:", e)); // Tenta iniciar a reprodução
            });
        } else { // Se não for HLS ou não for suportado, usa a tag <video> nativa
            videoPlayer.src = urlToLoad; // Define a fonte do vídeo
            videoPlayer.addEventListener('loadedmetadata', () => { // Quando os metadados do vídeo carregarem
                if (context.startTime && context.startTime > 5) {
                    videoPlayer.currentTime = context.startTime; // Pula se necessário
                }
                videoPlayer.play().catch(e => console.error("Erro ao tentar reproduzir o vídeo:", e)); // Tenta iniciar
            }, { once: true }); // Executa este listener apenas uma vez
        }

        // 2. Lógica de orientação e tela cheia para mobile
        if (window.innerWidth < 768) { // Se for tela pequena (considerado mobile)
            // MUDANÇA: Lógica ajustada para (re)tentar bloquear a orientação
            if (!document.fullscreenElement) { // Só tenta entrar em fullscreen se já não estiver
                try {
                    await playerView.requestFullscreen();
                } catch (err) {
                    console.error("Não foi possível ativar tela cheia:", err);
                }
            }
            // Tenta (re)travar a orientação.
            // Se foi um clique (nextBtn), funciona.
            // Se foi 'ended', pode falhar, mas como não demos unlock,
            // a orientação anterior (landscape) deve ser mantida.
            try {
                if (screen.orientation && typeof screen.orientation.lock === 'function') {
                    await screen.orientation.lock('landscape');
                }
            } catch (err) {
                console.error("Não foi possível bloquear orientação:", err);
            }
        }

        // Mostra/Esconde botões de episódio anterior/próximo
        if (context.episodes && context.episodes.length > 1) {
            nextEpisodeBtn.classList.remove('hidden');
            prevEpisodeBtn.classList.remove('hidden');
        } else {
            nextEpisodeBtn.classList.add('hidden');
            prevEpisodeBtn.classList.add('hidden');
        }

        attachGlassButtonListeners(); // Reatacha listeners visuais
    }

    /**
     * Esconde o player de vídeo e limpa seu estado.
     * @param {boolean} [updateHistory=true] - Se true, salva o progresso e volta no histórico.
     * @param {boolean} [isChangingEpisode=false] - Se true, não desbloqueia a orientação (mobile).
     */
    async function hidePlayer(updateHistory = true, isChangingEpisode = false) { // MUDANÇA: Adicionado isChangingEpisode
        // Salva o progresso se updateHistory for true e houver um contexto válido
        if (updateHistory && currentPlayerContext.key) {
            await savePlayerProgress();
        }

        videoPlayer.pause(); // Pausa o vídeo

        // Destrói a instância do HLS.js se existir
        if (hls) {
            hls.destroy();
            hls = null;
        }
        // Remove o atributo 'src' e chama 'load()' para parar completamente o download do vídeo
        videoPlayer.removeAttribute('src');
        videoPlayer.load();

        playerView.classList.add('hidden'); // Esconde a view do player
        document.body.style.overflow = 'auto'; // Restaura a rolagem do body
        currentPlayerContext = {}; // Limpa o contexto do player

        // 3. Sai da tela cheia e desbloqueia a orientação
        // MUDANÇA: Só executa se NÃO estiver trocando de episódio
        if (!isChangingEpisode) {
            if (document.fullscreenElement) {
                document.exitFullscreen().catch(err => console.error("Erro ao sair da tela cheia:", err));
            }
            if (screen.orientation && typeof screen.orientation.unlock === 'function') {
                screen.orientation.unlock(); // Desbloqueia a orientação da tela
            }
        }

        // MUDANÇA: Reseta o aspect ratio para o padrão
        videoPlayer.style.objectFit = 'contain';
        currentAspectRatio = 'contain';
        if (aspectRatioBtn) aspectRatioBtn.querySelector('.glass-content').innerHTML = ICONS.aspectContain;

        // NÃO chama history.back() aqui. O roteador (`handleNavigation`) fará isso
        // quando o evento 'popstate' for disparado pelo clique no botão voltar do navegador.
    }

    /**
     * Formata segundos para o formato HH:MM:SS ou MM:SS.
     * @param {number} timeInSeconds - Tempo em segundos.
     * @returns {string} - Tempo formatado.
     */
    function formatTime(timeInSeconds) {
        if (isNaN(timeInSeconds) || timeInSeconds < 0) { return "00:00"; } // Retorna '00:00' para valores inválidos
        const hours = Math.floor(timeInSeconds / 3600);
        const minutes = Math.floor((timeInSeconds % 3600) / 60);
        const seconds = Math.floor(timeInSeconds % 60);
        // Garante que minutos e segundos tenham dois dígitos (ex: 05)
        const formattedMinutes = String(minutes).padStart(2, '0');
        const formattedSeconds = String(seconds).padStart(2, '0');
        // Inclui horas apenas se for maior que 0
        return hours > 0 ? `${hours}:${formattedMinutes}:${formattedSeconds}` : `${formattedMinutes}:${formattedSeconds}`;
    }

    /** Alterna entre play e pause no vídeo */
    function togglePlay() {
        if (videoPlayer.paused) {
            videoPlayer.play().catch(error => {
                // Ignora erro 'AbortError' que pode ocorrer ao trocar de vídeo rapidamente
                if (error.name !== 'AbortError') { console.error("Video play error:", error); }
            });
        } else {
            videoPlayer.pause();
        }
    }

    /** Manipula cliques na área do vídeo em dispositivos móveis */
    function handleMobilePlayerClick() {
        // 1. Limpa qualquer timeout anterior para esconder os controles
        clearTimeout(controlsTimeout);

        // 2. Apenas MOSTRA os controles
        playerView.classList.add('controls-active');

        // 3. Define um novo timeout para esconder os controles (somente se o vídeo estiver tocando)
        if (!videoPlayer.paused) {
            controlsTimeout = setTimeout(() => {
                playerView.classList.remove('controls-active');
            }, 3000); // 3 segundos
        }
    }


    /** Manipula cliques na área do vídeo em desktop */
    function handlePlayerClick() {
        clearTimeout(controlsTimeout); // Limpa timeout

        if (!playerView.classList.contains('controls-active')) {
            playerView.classList.add('controls-active'); // Se escondidos, apenas mostra
        } else {
            togglePlay(); // Se controles visíveis, alterna play/pause
        }

        // Reseta o timeout para esconder controles (somente se estiver tocando)
        if (!videoPlayer.paused) {
            controlsTimeout = setTimeout(() => {
                playerView.classList.remove('controls-active');
            }, 3000);
        }
    }


    /** Adiciona listeners de evento ao elemento <video> */
    function addPlayerEventListeners() {
        // Remove listeners antigos antes de adicionar novos para evitar duplicidade
        // Garantir que a referência da função é a mesma
        const isMobile = window.innerWidth < 768;
        if (isMobile) {
            videoPlayer.removeEventListener('click', handlePlayerClick); // Remove listener desktop se existir
            videoPlayer.removeEventListener('click', handleMobilePlayerClick); // Remove listener mobile antigo
            videoPlayer.addEventListener('click', handleMobilePlayerClick); // Adiciona listener mobile correto
        } else {
            videoPlayer.removeEventListener('click', handleMobilePlayerClick); // Remove listener mobile se existir
            videoPlayer.removeEventListener('click', handlePlayerClick); // Remove listener desktop antigo
            videoPlayer.addEventListener('click', handlePlayerClick); // Adiciona listener desktop correto
        }


        // Listener para o evento 'play'
        videoPlayer.addEventListener('play', () => {
            playPauseBtn.querySelector('.glass-content').innerHTML = ICONS.pause;
            clearTimeout(controlsTimeout); // Limpa timeout ao dar play
            // Agenda para esconder controles se estiverem visíveis
            if (playerView.classList.contains('controls-active')) {
                controlsTimeout = setTimeout(() => {
                    playerView.classList.remove('controls-active');
                }, 3000);
            }
        });
        // Listener para o evento 'pause'
        videoPlayer.addEventListener('pause', () => {
            playPauseBtn.querySelector('.glass-content').innerHTML = ICONS.play;
            clearTimeout(controlsTimeout); // Cancela o timeout ao pausar
            // Garante que os controles fiquem visíveis ao pausar manualmente
            if (!videoPlayer.ended) {
                playerView.classList.add('controls-active');
            }
        });

        // Quando o vídeo/episódio termina
        videoPlayer.addEventListener('ended', () => {
            // Se for série e houver próximo episódio, avança
            if (currentPlayerContext.episodes && currentPlayerContext.currentIndex < currentPlayerContext.episodes.length - 1) {
                changeEpisode(1); // Vai para o próximo
            } else {
                // Senão, apenas mostra o ícone de play e mantém controles visíveis
                playPauseBtn.querySelector('.glass-content').innerHTML = ICONS.play;
                playerView.classList.add('controls-active'); // Garante que controles fiquem visíveis no final
                clearTimeout(controlsTimeout); // Cancela qualquer timeout pendente
            }
        });

        // Atualiza a barra de progresso e salva progresso periodicamente
        videoPlayer.addEventListener('timeupdate', () => {
            if (isNaN(videoPlayer.currentTime)) return; // Ignora se currentTime for NaN
            seekBar.value = videoPlayer.currentTime; // Atualiza valor do slider
            if (videoPlayer.duration) { // Atualiza a barra visual
                const progressPercent = (videoPlayer.currentTime / videoPlayer.duration) * 100;
                seekProgressBar.style.width = `${progressPercent}%`;
            }
            currentTimeEl.textContent = formatTime(videoPlayer.currentTime); // Atualiza tempo atual formatado

            // Salva progresso a cada 5 segundos
            const now = Date.now();
            if (now - lastProgressSaveTime > 5000) {
                savePlayerProgress();
                lastProgressSaveTime = now;
            }
        });

        // Quando metadados carregam (obtém duração)
        videoPlayer.addEventListener('loadedmetadata', () => {
            if (isNaN(videoPlayer.duration)) return; // Ignora se duration for NaN
            seekBar.max = videoPlayer.duration; // Define o máximo do slider
            durationEl.textContent = formatTime(videoPlayer.duration); // Mostra duração total formatada
        });

        // Atualiza ícone de volume e valor do slider de volume
        videoPlayer.addEventListener('volumechange', () => {
            volumeSlider.value = videoPlayer.volume;
            volumeBtn.querySelector('.glass-content').innerHTML = (videoPlayer.muted || videoPlayer.volume === 0) ? ICONS.volumeMute : ICONS.volumeHigh;
        });

        // --- Listener de clique já está sendo adicionado no início da função ---
    }

    // --- Listeners dos Controles do Player ---
    seekBar.addEventListener('input', () => { videoPlayer.currentTime = seekBar.value; }); // Pular ao arrastar barra
    volumeSlider.addEventListener('input', (e) => { videoPlayer.volume = e.target.value; videoPlayer.muted = e.target.value == 0; }); // Ajustar volume
    volumeBtn.addEventListener('click', () => { videoPlayer.muted = !videoPlayer.muted; }); // Mutar/Desmutar
    rewindBtn.addEventListener('click', () => { videoPlayer.currentTime -= 10; }); // Voltar 10s
    forwardBtn.addEventListener('click', () => { videoPlayer.currentTime += 10; }); // Avançar 10s

    // NOVO: Listener do botão de Aspect Ratio
    aspectRatioBtn.addEventListener('click', () => {
        if (currentAspectRatio === 'contain') {
            currentAspectRatio = 'cover';
            videoPlayer.style.objectFit = 'cover';
            aspectRatioBtn.querySelector('.glass-content').innerHTML = ICONS.aspectCover;
            showToast('Proporção: Preencher');
        } else {
            currentAspectRatio = 'contain';
            videoPlayer.style.objectFit = 'contain';
            aspectRatioBtn.querySelector('.glass-content').innerHTML = ICONS.aspectContain;
            showToast('Proporção: Padrão');
        }
    });

    /**
     * Muda para o episódio anterior ou próximo.
     * @param {number} direction - 1 para próximo, -1 para anterior.
     */
    function changeEpisode(direction) {
        if (!currentPlayerContext.episodes) return; // Sai se não for série
        const newIndex = currentPlayerContext.currentIndex + direction; // Calcula novo índice
        // Verifica se o novo índice é válido
        if (newIndex >= 0 && newIndex < currentPlayerContext.episodes.length) {
            const episode = currentPlayerContext.episodes[newIndex]; // Pega dados do novo episódio
            // Cria novo contexto com índice atualizado e novo título
            const newContext = {
                ...currentPlayerContext,
                currentIndex: newIndex,
                title: `${currentPlayerContext.itemData.name} - T${episode.season_number} E${episode.episode_number}`,
                videoUrl: episode.url // IMPORTANTE: Atualizar a URL do vídeo
            };
            showPlayer(newContext); // Mostra o player com o novo episódio
        }
    }

    // Listeners para botões de episódio
    nextEpisodeBtn.addEventListener('click', () => changeEpisode(1));
    prevEpisodeBtn.addEventListener('click', () => changeEpisode(-1));

    // Listener para botão de tela cheia
    fullscreenBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) { // Se não estiver em tela cheia
            playerView.requestFullscreen().catch(err => console.error(`Erro ao entrar em tela cheia: ${err.message}`));
        } else { // Se já estiver
            document.exitFullscreen(); // Sai da tela cheia
        }
    });

    // Listener para mudanças no estado de tela cheia (ex: pressionar ESC)
    document.addEventListener('fullscreenchange', () => {
        const isFullscreen = !!document.fullscreenElement; // Verifica se está em tela cheia
        // Atualiza o ícone do botão
        fullscreenBtn.querySelector('.glass-content').innerHTML = isFullscreen ? ICONS.exitFullscreen : ICONS.fullscreen;

        // Se saiu da tela cheia E o player ainda deveria estar visível
        if (!isFullscreen && !playerView.classList.contains('hidden')) {
            // Força a volta no histórico (provavelmente para a tela de detalhes)
            history.back();
        }
    });

    // Listener botão play/pause principal
    playPauseBtn.addEventListener('click', togglePlay);
    // Listener botão voltar do player
    playerBackBtn.addEventListener('click', () => history.back()); // Usa histórico do navegador

    // Listener para mostrar controles ao mover o mouse sobre o player (desktop)
    playerView.addEventListener('mousemove', () => {
        // MUDANÇA: Não executar esta lógica em mobile
        if (window.innerWidth >= 768) {
            playerView.classList.add('controls-active'); // Mostra controles
            clearTimeout(controlsTimeout); // Limpa timeout anterior
            // Define novo timeout para esconder (se não estiver pausado)
            if (!videoPlayer.paused) {
                controlsTimeout = setTimeout(() => {
                    playerView.classList.remove('controls-active');
                }, 3000);
            }
        }
    });

    // Listener para botão de configurações (abre/fecha painel)
    settingsBtn.addEventListener('click', (e) => { e.stopPropagation(); settingsPanel.classList.toggle('hidden'); });

    // Listener global para fechar painéis (configurações, notificações, seletor de temporada) ao clicar fora
    document.addEventListener('click', (e) => {
        // Fecha painel de configurações
        if (!settingsPanel.classList.contains('hidden') && !settingsBtn.contains(e.target) && !settingsPanel.contains(e.target)) { settingsPanel.classList.add('hidden'); }
        // Fecha painel de notificações
        if (!notificationPanel.classList.contains('hidden') && !notificationPanel.contains(e.target) && !notificationBtn.contains(e.target)) {
            notificationPanel.classList.remove('animate-fade-in-down');
            notificationPanel.classList.add('animate-fade-out-up');
            setTimeout(() => notificationPanel.classList.add('hidden'), 250); // Adiciona 'hidden' após animação
        }
        // Fecha seletor de temporada
        const openSelectPanel = document.querySelector('#season-options:not(.hidden)');
        if (openSelectPanel && !openSelectPanel.closest('.custom-select-container').contains(e.target)) {
            document.getElementById('season-selector-button')?.click(); // Simula clique no botão para fechar
        }
    });

    /** Cria as opções no painel de configurações do player (velocidade, qualidade) */
    function createSettingsOptions() {
        const speedContainer = document.getElementById('settings-speed-options');
        const qualityContainer = document.getElementById('settings-quality-options');
        // Só cria se ainda não existirem (evita duplicação)
        if (speedContainer.childElementCount > 1) return;

        // Opções de velocidade
        const speeds = [0.5, 1, 1.5, 2];
        speeds.forEach(speed => {
            const button = document.createElement('button');
            button.className = 'settings-option-btn';
            button.textContent = `${speed}x`;
            if (speed === 1) button.classList.add('active'); // Marca 1x como padrão
            button.onclick = () => { // Ao clicar
                videoPlayer.playbackRate = speed; // Muda velocidade do vídeo
                // Atualiza qual botão está ativo
                speedContainer.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
            };
            speedContainer.appendChild(button);
        });

        // Opções de qualidade (Placeholder - HLS.js pode gerenciar isso dinamicamente)
        const qualities = ["Auto", "1080p", "720p", "480p"];
        qualities.forEach(quality => {
            const button = document.createElement('button');
            button.className = 'settings-option-btn';
            button.textContent = quality;
            if (quality === "Auto") button.classList.add('active'); // Marca Auto como padrão
            button.onclick = () => { // Ao clicar (ação placeholder)
                qualityContainer.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                console.log(`Qualidade definida para ${quality}. (Funcionalidade de troca manual não implementada)`);
                // NOTA: A troca real de qualidade com HLS.js é mais complexa
            };
            qualityContainer.appendChild(button);
        });
    }

    /** Inicializa a UI do player (define ícones iniciais, adiciona listeners) */
    function initializePlayerUI() {
        // Define os ícones SVG para cada botão
        playPauseBtn.querySelector('.glass-content').innerHTML = ICONS.play;
        rewindBtn.querySelector('.glass-content').innerHTML = ICONS.rewind10;
        forwardBtn.querySelector('.glass-content').innerHTML = ICONS.fastForward10;
        nextEpisodeBtn.querySelector('.glass-content').innerHTML = ICONS.skipForward;
        prevEpisodeBtn.querySelector('.glass-content').innerHTML = ICONS.skipBackward;
        volumeBtn.querySelector('.glass-content').innerHTML = ICONS.volumeHigh;
        fullscreenBtn.querySelector('.glass-content').innerHTML = ICONS.fullscreen;
        settingsBtn.querySelector('.glass-content').innerHTML = ICONS.settings;
        playerBackBtn.querySelector('.glass-content').innerHTML = ICONS.back;
        aspectRatioBtn.querySelector('.glass-content').innerHTML = ICONS.aspectContain; // NOVO
        createSettingsOptions(); // Cria opções de velocidade/qualidade
        addPlayerEventListeners(); // Adiciona listeners ao <video>
    }

    // --- Listeners Gerais da UI (Busca, Notificações) ---
    searchIconBtn.addEventListener('click', () => toggleSearchOverlay(true)); // Abrir busca (desktop)
    closeSearchBtn.addEventListener('click', () => toggleSearchOverlay(false)); // Fechar busca
    document.getElementById('search-overlay-bg').addEventListener('click', () => toggleSearchOverlay(false)); // Fechar ao clicar no fundo

    // Listener de busca com debounce
    searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            performSearch(searchInput.value); // Chama a função de busca
        }, 400); // 400ms de debounce
    });


    // Botão de busca mobile
    const mobileSearchBtn = document.getElementById('mobile-search-btn');
    if (mobileSearchBtn) {
        mobileSearchBtn.addEventListener('click', (e) => {
            e.preventDefault();
            // Marca o botão como ativo na nav mobile
            document.querySelectorAll('.mobile-nav-item').forEach(item => item.classList.remove('active'));
            mobileSearchBtn.classList.add('active');
            updateMobileNavIndicator();
            toggleSearchOverlay(true); // Abre o overlay de busca
        });
    }

    // Botão de notificações
    notificationBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Impede que o clique feche o painel imediatamente
        renderNotifications(); // Renderiza o conteúdo das notificações
        const isHidden = notificationPanel.classList.contains('hidden');
        // Animação de abrir/fechar
        if (isHidden) {
            notificationPanel.classList.remove('hidden', 'animate-fade-out-up');
            notificationPanel.classList.add('animate-fade-in-down');
        } else {
            notificationPanel.classList.remove('animate-fade-in-down');
            notificationPanel.classList.add('animate-fade-out-up');
            setTimeout(() => notificationPanel.classList.add('hidden'), 250);
        }

        // Marca notificações como lidas (atualiza timestamp da última verificação)
        if (notifications.length > 0 && notifications[0].createdAt) {
            // Pega o timestamp da notificação mais recente
            const latestTimestamp = notifications[0].createdAt.toMillis ? notifications[0].createdAt.toMillis() : new Date(notifications[0].createdAt).getTime();
            lastNotificationCheck = latestTimestamp; // Atualiza variável local
            localStorage.setItem('starlight-lastNotificationCheck', latestTimestamp); // Salva no localStorage
            updateNotificationBell(); // Atualiza indicador visual (ponto vermelho)
        }
    });

    // --- Roteador Central ---
    /** Função principal que lida com a navegação baseada no hash da URL */
    async function handleNavigation() {
        const hash = window.location.hash; // Pega o hash atual (ex: #home-view, #details/123)

        // --- NOVA LÓGICA DE INTERCEPTAÇÃO DE "VOLTAR" ---

        // 1. Detecta a primeira navegação da sessão
        if (isFirstNavigation) {
            isFirstNavigation = false; // Desativa a flag para que não rode de novo
            const currentHash = window.location.hash;
            if (currentHash.startsWith('#details/') || currentHash === '#player') {
                // Se o usuário Pousou aqui, ativa a flag da sessão
                sessionStorage.setItem('landedOnDetails', 'true');
            } else {
                // Se o usuário pousou na home ou outro lugar, desativa a flag
                sessionStorage.setItem('landedOnDetails', 'false');
            }
        }

        // 2. Intercepta o clique no botão "voltar" do navegador
        // (Se a flag estiver 'true' E o usuário estiver voltando para a "raiz" do site)
        if (sessionStorage.getItem('landedOnDetails') === 'true' && (hash === '' || hash === '#')) {
            // Limpa a flag
            sessionStorage.removeItem('landedOnDetails');
            // Usa replaceState para mudar a URL para #home-view SEM adicionar ao histórico
            history.replaceState(null, '', '#home-view');
            // Roda a navegação novamente, mas agora com o hash corrigido
            await handleNavigation();
            return; // Interrompe a execução atual
        }

        // 3. Limpa a flag se o usuário navegar para a home manualmente
        // (Isso desativa a interceptação do "voltar")
        if (!hash.startsWith('#details/') && hash !== '#player' && hash !== '' && hash !== '#') {
            sessionStorage.setItem('landedOnDetails', 'false');
        }

        // --- FIM DA NOVA LÓGICA ---

        // --- Rota de Autenticação ---
        if (!userId) { // Se o usuário NÃO está logado
            // Garante que a view de login seja exibida
            if (hash !== '#login-view') {
                // Força o hash para #login-view sem adicionar ao histórico
                history.replaceState(null, '', '#login-view');
            }
            showLoginScreen(); // Mostra a tela de login
            return; // Interrompe a função aqui
        }
        // --- Rota de Seleção de Perfil ---
        if (!currentProfile) { // Se o usuário está logado, MAS NENHUM perfil foi selecionado ainda
            // Tenta carregar o último perfil usado do localStorage
            const lastProfileId = localStorage.getItem(`starlight-lastProfile-${userId}`);
            let autoSelectedProfile = false;
            if (lastProfileId) {
                // Carrega os perfis do Firestore APENAS se precisar verificar o último perfil
                if (!profiles || profiles.length === 0) { // Evita recarregar se já tiver
                    await loadProfiles(); // loadProfiles() também chama renderProfiles()
                }
                const foundProfile = profiles.find(p => p.id === lastProfileId);
                if (foundProfile) {
                    // Se encontrou um perfil válido salvo, seleciona-o automaticamente
                    selectAndEnterProfile(foundProfile);
                    autoSelectedProfile = true; // Marca que um perfil foi selecionado
                    // Não retorna aqui, continua para o roteamento do app
                }
            }

            // Se NENHUM perfil foi selecionado automaticamente
            if (!autoSelectedProfile) {
                // Garante que a view de seleção de perfil seja exibida
                if (hash !== '#manage-profile-view') {
                    history.replaceState(null, '', '#manage-profile-view');
                }
                showProfileScreen(); // Mostra a tela de seleção de perfil
                return; // Interrompe a função aqui
            }
            // Se um perfil foi auto-selecionado, a função continua para o roteamento do app abaixo
        }


        // --- Roteamento do Aplicativo (Usuário Logado e com Perfil Selecionado) ---

        // Garante que overlays especiais (busca) sejam fechados ao navegar
        if (!searchOverlay.classList.contains('hidden')) {
            toggleSearchOverlay(false);
        }

        // Esconde header/footer para views especiais (detalhes, player)
        if (hash.startsWith('#details/') || hash === '#player') {
            document.querySelector('header').classList.add('hidden');
            document.querySelector('footer').classList.add('hidden');
        } else {
            // Mostra header/footer para views normais
            document.querySelector('header').classList.remove('hidden');
            document.querySelector('footer').classList.remove('hidden');
        }

        // Garante que views especiais (detalhes, player) sejam escondidas ao navegar para views normais
        if (!hash.startsWith('#details/')) {
            detailsView.classList.add('hidden'); // Esconde detalhes
        }
        if (hash !== '#player') {
            if (!playerView.classList.contains('hidden')) {
                hidePlayer(false, false); // Esconde player (NÃO está trocando de ep)
            }
        }

        // Esconde todas as views principais antes de mostrar a correta
        document.querySelectorAll('#view-container > .content-view').forEach(view => view.classList.add('hidden'));

        // --- Lógica de Roteamento ---
        if (hash.startsWith('#details/')) { // Se for uma rota de detalhes
            const docId = hash.split('/')[1]; // Extrai o ID do item do hash
            showDetailsView({ docId }); // Chama a função para renderizar detalhes
        } else if (hash === '#player') { // Se for a rota do player
            // O player é mostrado pela função showPlayer(). O roteador apenas garante
            // que outras views estejam escondidas. Se o usuário recarregar em #player,
            // não há contexto, então voltamos.
            if (playerView.classList.contains('hidden')) {
                history.back(); // Volta para a tela anterior (provavelmente detalhes)
            }
        } else { // Navegação para uma view principal (home, series, filmes, etc.)
            const targetId = hash.substring(1) || 'home-view'; // Pega o ID do hash, ou usa 'home-view' como padrão
            const targetView = document.getElementById(targetId); // Encontra o elemento da view

            if (targetView && targetView.classList.contains('content-view')) { // Se a view existe e é válida
                targetView.classList.remove('hidden'); // Mostra a view
                renderScreenContent(targetId); // Renderiza o conteúdo específico da view
            } else { // Se a view não existe ou hash é inválido
                // Fallback para a tela inicial
                document.getElementById('home-view').classList.remove('hidden');
                renderScreenContent('home-view');
                // Corrige o hash na URL se ele era inválido
                if (window.location.hash !== '#home-view') {
                    history.replaceState(null, '', '#home-view');
                }
            }

            // --- Atualiza UI de Navegação ---
            // Remove 'active' de todos os links
            document.querySelectorAll('.nav-item, .mobile-nav-item').forEach(l => l.classList.remove('active'));
            // Adiciona 'active' aos links correspondentes à view atual
            document.querySelectorAll(`[data-target="${targetId}"]`).forEach(l => l.classList.add('active'));
            updateMobileNavIndicator(); // Atualiza indicador da nav mobile

            // --- Atualiza Background e Rotação do Hero ---
            // Mostra/Esconde background principal (só visível na home)
            document.getElementById('main-background').style.opacity = (targetId === 'home-view' && currentHeroItem) ? 1 : 0;
            // Para a rotação do hero se sair da home
            if (targetId !== 'home-view' && heroCarouselInterval) {
                clearInterval(heroCarouselInterval);
                heroCarouselInterval = null;
            }
        }
        // Força a checagem do header no final da navegação
        handleHeaderScroll();
    }

    // Adiciona os listeners de navegação do navegador (botão voltar/avançar, mudança de hash)
    window.addEventListener('popstate', handleNavigation);
    // window.addEventListener('hashchange', handleNavigation); // Não precisamos mais do hashchange, popstate cobre tudo

    // --- Lógica de Notificações ---
    function listenForNotifications() {
        const q = query(collection(db, "notifications")); // Query sem orderBy
        onSnapshot(q, (snapshot) => {
            notifications = [];
            snapshot.forEach((doc) => {
                notifications.push({ id: doc.id, ...doc.data() });
            });
            // Ordena no cliente
            notifications.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
            updateNotificationBell(); // Atualiza indicador
        });
    }

    function updateNotificationBell() {
        // Verifica se há notificações não lidas e não dispensadas
        const hasNew = notifications.some(n => {
            const notifTime = n.createdAt ? (n.createdAt.toMillis ? n.createdAt.toMillis() : new Date(n.createdAt).getTime()) : 0;
            const isNew = notifTime > lastNotificationCheck;
            // Novidades podem ser dispensadas
            const isDismissed = n.type === 'Novidade' && dismissedNotifications.includes(n.id);
            return isNew && !isDismissed;
        });
        // Adiciona/remove classe para mostrar o indicador visual
        notificationBtn.classList.toggle('has-new', hasNew);
    }

    function renderNotifications() {
        const avisosContainer = document.getElementById('notifications-avisos');
        const novidadesContainer = document.getElementById('notifications-novidades');

        // Filtra notificações por tipo
        const avisos = notifications.filter(n => n.type === 'Aviso');
        // Filtra novidades não dispensadas
        const novidades = notifications.filter(n => n.type === 'Novidade' && !dismissedNotifications.includes(n.id));

        // Função para criar o HTML de um item de notificação
        const createNotifHTML = (notif, isDismissable) => {
            // Adiciona botão de dispensar apenas se for 'Novidade'
            const dismissBtn = isDismissable ? `<button class="remove-notification-btn text-stone-500 hover:text-white" data-notif-id="${notif.id}"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>` : '';

            // **FIX:** Adiciona data attribute com dados do link
            let linkDataAttr = '';
            if (notif.link) {
                linkDataAttr = `data-link-type="${notif.link.type}" data-link-value="${notif.link.url || notif.link.docId}"`;
            }

            return `
                <div class="notification-item flex items-start gap-2 p-2 rounded-md transition-colors hover:bg-white/5 ${notif.link ? 'cursor-pointer' : ''}" ${linkDataAttr}>
                    <div class="flex-grow">
                        <p class="font-bold text-white">${notif.title}</p>
                        <p class="text-stone-300 text-sm notification-message">${notif.message}</p>
                    </div>
                    ${dismissBtn}
                </div>`;
        };

        // Popula os containers das abas
        avisosContainer.innerHTML = avisos.length > 0 ? avisos.map(n => createNotifHTML(n, false)).join('') : '<p class="text-stone-400 text-center p-4">Nenhum aviso.</p>';
        novidadesContainer.innerHTML = novidades.length > 0 ? novidades.map(n => createNotifHTML(n, true)).join('') : '<p class="text-stone-400 text-center p-4">Nenhuma novidade.</p>';
    }

    // Listener para o painel de notificações (troca de abas, dispensar, **FIX: click no item**)
    notificationPanel.addEventListener('click', (e) => {
        // Troca de abas
        const tab = e.target.closest('.notification-tab');
        if (tab) {
            notificationPanel.querySelectorAll('.notification-tab').forEach(t => t.classList.remove('active'));
            notificationPanel.querySelectorAll('.notification-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`notifications-${tab.dataset.tab}`).classList.add('active');
            return; // Impede que o clique na aba acione o clique no item
        }

        // Dispensar notificação (tipo Novidade)
        const removeBtn = e.target.closest('.remove-notification-btn');
        if (removeBtn) {
            const notifId = removeBtn.dataset.notifId;
            if (!dismissedNotifications.includes(notifId)) {
                dismissedNotifications.push(notifId); // Adiciona ao array de dispensadas
                localStorage.setItem('starlight-dismissedNotifications', JSON.stringify(dismissedNotifications)); // Salva no localStorage
                updateNotificationBell(); // Atualiza indicador
            }
            removeBtn.closest('.notification-item').remove(); // Remove o item da UI
            return; // Impede que o clique no botão acione o clique no item
        }

        // **FIX: Clique no item da notificação para navegação**
        const notificationItem = e.target.closest('.notification-item[data-link-type]');
        if (notificationItem) {
            const linkType = notificationItem.dataset.linkType;
            const linkValue = notificationItem.dataset.linkValue;

            if (linkType === 'internal' && linkValue) {
                window.location.hash = `#details/${linkValue}`; // Navega para detalhes
            } else if (linkType === 'external' && linkValue) {
                window.open(linkValue, '_blank'); // Abre link externo
            }
            // Fecha o painel após clicar
            notificationPanel.classList.remove('animate-fade-in-down');
            notificationPanel.classList.add('animate-fade-out-up');
            setTimeout(() => notificationPanel.classList.add('hidden'), 250);
        }
    });


    // --- Lógica de Pedidos --- (sem alterações significativas)
    function listenToRequests() {
        const q = query(collection(db, "pedidos"), where("status", "==", "pending"));
        onSnapshot(q, (snapshot) => {
            pendingRequests = [];
            snapshot.forEach((doc) => {
                pendingRequests.push({ id: doc.id, ...doc.data() });
            });
            // Ordena no cliente
            pendingRequests.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
            // Re-renderiza se a view de pedidos estiver ativa
            if (window.location.hash === '#requests-view') {
                renderPendingRequests();
            }
        }, (error) => {
            console.error("Erro ao escutar pedidos: ", error);
        });
    }

    async function handleVote(requestId) {
        if (!userId || !currentProfile) {
            showToast("Você precisa estar logado para votar.", true);
            return;
        }
        const docRef = doc(db, 'pedidos', requestId);
        const voteButton = document.querySelector(`.vote-btn[data-request-id="${requestId}"]`);
        if (voteButton) voteButton.disabled = true; // Desabilita botão temporariamente

        try {
            const docSnap = await getDoc(docRef); // Pega o estado atual do pedido
            if (!docSnap.exists()) { // Se o pedido foi removido
                showToast("Este pedido não existe mais.", true);
                return;
            }
            const requestData = docSnap.data();
            const requesters = requestData.requesters || []; // Array de quem pediu/votou
            // Verifica se o usuário atual já votou
            const userVoteIndex = requesters.findIndex(r => r.userId === userId);
            const userVote = { userId: userId, userName: currentProfile.name }; // Dados do voto

            if (userVoteIndex > -1) { // Se já votou
                // Remove o voto do array
                await updateDoc(docRef, {
                    requesters: arrayRemove(requesters[userVoteIndex])
                });
                showToast('Voto removido.');
            } else { // Se não votou
                // Adiciona o voto ao array
                await updateDoc(docRef, {
                    requesters: arrayUnion(userVote)
                });
                showToast('Obrigado pelo seu voto!');
            }
        } catch (error) {
            console.error("Erro ao processar voto:", error);
            showToast("Ocorreu um erro ao processar seu voto.", true);
        } finally {
            if (voteButton) voteButton.disabled = false; // Reabilita o botão
        }
    }


    function renderPendingRequests() {
        const container = document.getElementById('pending-requests-container');
        if (!container) return;
        if (pendingRequests.length === 0) { // Mensagem se não houver pedidos
            container.innerHTML = '<p class="col-span-full text-center text-gray-400">Nenhum pedido em aberto no momento.</p>';
            return;
        }

        // Cria o HTML para cada pedido pendente
        container.innerHTML = pendingRequests.map(request => {
            const posterPath = request.posterUrl || 'https://placehold.co/300x450/1c1917/FFFFFF?text=Sem+Imagem';
            const requesterCount = (request.requesters || []).length; // Contagem de votos
            // Verifica se o usuário atual já votou neste pedido
            const userHasVoted = userId && (request.requesters || []).some(r => r.userId === userId);

            return `
                <div class="liquid-glass-card bg-stone-900/50 rounded-lg overflow-hidden flex flex-col p-4 gap-4">
                    <div class="glass-filter"></div>
                    <div class="glass-overlay"></div>
                    <div class="glass-specular"></div>
                    <div class="glass-content w-full flex items-start gap-4">
                        <img src="${posterPath}" alt="${request.title || request.name}" class="w-20 rounded-md aspect-[2/3] object-cover">
                        <div class="flex-1">
                            <h4 class="font-bold text-white">${request.title} (${request.year || 'N/A'})</h4>
                            <p class="text-xs text-indigo-300 mt-1">${requesterCount} ${requesterCount === 1 ? 'voto' : 'votos'}</p>
                            <span class="text-xs font-semibold mt-2 inline-block px-2 py-1 rounded-full bg-yellow-500/20 text-yellow-300">Pendente</span>
                        </div>
                    </div>
                     <button class="vote-btn glass-container glass-button rounded-lg w-full mt-2 ${userHasVoted ? 'voted' : ''}" data-request-id="${request.id}">
                         <div class="glass-filter"></div>
                         <div class="glass-overlay"></div>
                         <div class="glass-specular"></div>
                         <div class="glass-content flex justify-center items-center gap-2 p-2 text-sm">
                             ${userHasVoted /* Muda texto e ícone do botão com base no voto */
                    ? '<i data-lucide="minus-circle" class="w-4 h-4"></i> Remover Voto'
                    : '<i data-lucide="plus-circle" class="w-4 h-4"></i> Apoiar Pedido'
                }
                         </div>
                     </button>
                </div>
            `;
        }).join('');
        attachGlassButtonListeners(); // Reatacha listeners visuais
        lucide.createIcons(); // Recria ícones
    }

    // --- Lógica de Gerenciamento de Perfil ---
    /** Carrega os perfis do usuário logado do Firestore */
    async function loadProfiles() {
        if (!userId) return; // Sai se não houver usuário
        const profilesCol = collection(db, 'users', userId, 'profiles'); // Referência da coleção
        const snapshot = await getDocs(profilesCol); // Busca os documentos
        // Mapeia os documentos para objetos de perfil, incluindo o ID do documento
        profiles = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderProfiles(); // Renderiza os perfis na tela
    }

    /** Renderiza os cards de perfil na tela de seleção/gerenciamento */
    function renderProfiles() {
        profilesGrid.innerHTML = ''; // Limpa a grid
        // Cria um card para cada perfil existente
        profiles.forEach((profile) => {
            const profileCard = document.createElement('div');
            profileCard.className = 'cursor-pointer group'; // Estilos e grupo para hover
            profileCard.dataset.id = profile.id; // Armazena o ID do perfil no elemento
            // HTML do card de perfil
            profileCard.innerHTML = `
                <div class="relative w-full aspect-square liquid-glass-card">
                     <div class="glass-filter"></div><div class="glass-distortion-overlay"></div><div class="glass-overlay"></div><div class="glass-specular"></div>
                     <div class="glass-content p-0">
                         <img src="${profile.avatar}" alt="${profile.name}" class="w-full h-full object-cover rounded-[inherit]">
                         <div class="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity ${isEditMode ? '!opacity-100' : ''}"> <!-- Overlay com ícone de edição -->
                             <svg class="w-12 h-12 text-white ${isEditMode ? '' : 'hidden'}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L16.732 3.732z"></path></svg>
                         </div>
                     </div>
                </div>
                <p class="text-center text-lg text-gray-300 group-hover:text-white mt-3 transition-colors">${profile.name}</p> <!-- Nome do perfil -->
            `;
            // Listener de clique no card
            profileCard.addEventListener('click', () => {
                if (isEditMode) { // Se estiver no modo de edição
                    showProfileModal(profile.id); // Abre o modal para editar este perfil
                } else { // Se estiver no modo de seleção
                    selectAndEnterProfile(profile); // Seleciona este perfil e entra no app
                }
            });
            profilesGrid.appendChild(profileCard); // Adiciona o card à grid
        });

        // Adiciona o card "Adicionar Perfil" se houver menos de 4 perfis
        if (profiles.length < 4) {
            const addProfileCard = document.createElement('div');
            addProfileCard.className = 'cursor-pointer group';
            // HTML do card de adicionar
            addProfileCard.innerHTML = `
                <div class="relative w-full aspect-square liquid-glass-card flex items-center justify-center">
                    <div class="glass-filter"></div><div class="glass-distortion-overlay"></div><div class="glass-overlay"></div><div class="glass-specular"></div>
                    <div class="glass-content flex items-center justify-center">
                        <svg class="w-16 h-16 text-gray-400 group-hover:text-white transition-colors" style="transform: translateY(2px);" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6v12M6 12h12"></path></svg> <!-- Ícone de mais -->
                    </div>
                </div>
                <p class="text-center text-lg text-gray-300 group-hover:text-white mt-3 transition-colors">Adicionar Perfil</p>
            `;
            // Listener para abrir o modal de adicionar perfil
            addProfileCard.addEventListener('click', () => showProfileModal());
            profilesGrid.appendChild(addProfileCard);
        }
        attachGlassButtonListeners(); // Reatacha listeners visuais
    }

    /**
     * Define o perfil selecionado, atualiza o header e navega para a home.
     * @param {object} profile - O objeto do perfil selecionado.
     */
    async function selectAndEnterProfile(profile) {
        currentProfile = profile; // Define o perfil globalmente
        userDisplayName = profile.name; // Guarda o nome do perfil selecionado

        // **NOVO:** Salva o ID do perfil selecionado no localStorage
        localStorage.setItem(`starlight-lastProfile-${userId}`, profile.id);

        // Atualiza o botão de perfil no header com o avatar
        const avatarImg = new Image();
        avatarImg.src = currentProfile.avatar;
        avatarImg.className = 'w-full h-full object-cover rounded-full';
        headerProfileBtn.innerHTML = ''; // Limpa conteúdo anterior
        headerProfileBtn.appendChild(avatarImg);

        // Inicia o carregamento do conteúdo do Firestore (necessário após selecionar perfil)
        listenToFirestoreContent();
        listenToRequests(); // Escuta pedidos após selecionar perfil
        listenForNews(); // Escuta novidades após selecionar perfil
    }

    /**
     * Mostra o modal para adicionar ou editar um perfil.
     * @param {string|null} [profileId=null] - O ID do perfil a ser editado, ou null para adicionar.
     */
    function showProfileModal(profileId = null) {
        // Elementos do modal
        const modalTitle = document.getElementById('modal-title');
        const nameInput = document.getElementById('profile-name-input');
        const idInput = document.getElementById('profile-id-input'); // Campo oculto para ID
        const deleteBtn = document.getElementById('delete-profile-btn');

        // Popula as opções de avatar
        avatarOptionsContainer.innerHTML = AVATARS.map(avatar => `
            <img src="${avatar}" class="w-16 h-16 rounded-full cursor-pointer border-2 border-transparent hover:border-white transition-all" data-avatar="${avatar}">
        `).join('');

        if (profileId) { // Editando perfil existente
            modalTitle.textContent = 'Editar Perfil';
            const profile = profiles.find(p => p.id === profileId); // Encontra o perfil
            nameInput.value = profile.name; // Preenche o nome
            idInput.value = profile.id; // Preenche o ID (oculto)
            deleteBtn.classList.remove('hidden'); // Mostra botão de excluir
            // Marca o avatar atual como selecionado
            const currentAvatar = avatarOptionsContainer.querySelector(`img[data-avatar="${profile.avatar}"]`);
            if (currentAvatar) currentAvatar.classList.add('!border-purple-500', 'scale-110');
        } else { // Adicionando novo perfil
            modalTitle.textContent = 'Adicionar Perfil';
            nameInput.value = ''; // Limpa nome
            idInput.value = ''; // Limpa ID
            deleteBtn.classList.add('hidden'); // Esconde botão de excluir
        }

        profileModal.classList.remove('hidden'); // Mostra o modal
    }

    // Listener para seleção de avatar no modal
    avatarOptionsContainer.addEventListener('click', e => {
        if (e.target.tagName === 'IMG') { // Se clicou em uma imagem de avatar
            // Remove seleção de todos os avatares
            avatarOptionsContainer.querySelectorAll('img').forEach(img => img.classList.remove('!border-purple-500', 'scale-110'));
            // Marca o avatar clicado como selecionado
            e.target.classList.add('!border-purple-500', 'scale-110');
        }
    });

    // Listener para o botão "Salvar" do modal de perfil
    document.getElementById('save-profile-btn').addEventListener('click', async () => {
        const name = document.getElementById('profile-name-input').value.trim(); // Pega o nome
        const selectedAvatar = document.querySelector('#avatar-options .scale-110')?.dataset.avatar; // Pega o avatar selecionado
        const profileId = document.getElementById('profile-id-input').value; // Pega o ID (se estiver editando)

        // Validação simples
        if (!name || !selectedAvatar) {
            showToast('Por favor, preencha o nome e selecione um avatar.', true);
            return;
        }
        if (!userId) { // Verifica se o usuário ainda está logado
            showToast('Erro de autenticação. Por favor, recarregue a página.', true);
            return;
        }

        const profileData = { name, avatar: selectedAvatar }; // Dados a serem salvos

        try {
            if (profileId) { // Se tem ID, atualiza o perfil existente
                const docRef = doc(db, 'users', userId, 'profiles', profileId);
                await updateDoc(docRef, profileData);
                showToast('Perfil atualizado com sucesso!');
            } else { // Se não tem ID, adiciona um novo perfil
                const colRef = collection(db, 'users', userId, 'profiles');
                await addDoc(colRef, profileData);
                showToast('Perfil criado com sucesso!');
            }
            await loadProfiles(); // Recarrega a lista de perfis da UI
            profileModal.classList.add('hidden'); // Esconde o modal
        } catch (error) {
            console.error("Erro ao salvar perfil: ", error);
            showToast('Não foi possível salvar o perfil.', true);
        }
    });

    // Listener para o botão "Cancelar" do modal de perfil
    document.getElementById('cancel-profile-btn').addEventListener('click', () => profileModal.classList.add('hidden'));

    // Listener para o botão "Excluir" do modal de perfil
    document.getElementById('delete-profile-btn').addEventListener('click', async () => {
        const profileId = document.getElementById('profile-id-input').value; // Pega o ID do perfil
        if (profileId && profiles.length > 1) { // Só permite excluir se houver mais de um perfil
            // Mostra modal de confirmação customizado
            showConfirmationModal(
                'Excluir Perfil', // Título
                'Tem certeza que deseja excluir este perfil? Esta ação não pode ser desfeita.', // Mensagem
                async () => { // Função a ser executada se o usuário confirmar
                    try {
                        const docRef = doc(db, 'users', userId, 'profiles', profileId); // Referência do perfil
                        await deleteDoc(docRef); // Exclui do Firestore
                        showToast('Perfil excluído.');
                        await loadProfiles(); // Recarrega a lista de perfis da UI
                        profileModal.classList.add('hidden'); // Esconde o modal
                    } catch (error) {
                        console.error("Erro ao excluir perfil: ", error);
                        showToast('Não foi possível excluir o perfil.', true);
                    }
                }
            );
        } else { // Se for o único perfil
            showToast('Não é possível excluir o único perfil.', true);
        }
    });

    // Listener para o botão "Gerenciar Perfis" / "Concluído"
    manageProfilesBtn.addEventListener('click', () => {
        isEditMode = !isEditMode; // Alterna o modo de edição
        // Atualiza texto do botão e título da página
        manageProfilesBtn.querySelector('.glass-content').textContent = isEditMode ? 'Concluído' : 'Gerenciar Perfis';
        document.getElementById('profile-main-title').textContent = isEditMode ? 'Gerenciar Perfis' : 'Quem está assistindo?';
        renderProfiles(); // Re-renderiza os perfis para mostrar/esconder o ícone de edição
    });

    // Listener para o botão de perfil no header (leva para a tela de gerenciamento)
    headerProfileBtn.addEventListener('click', () => {
        // Reseta o estado de edição e força a seleção de perfil ao mudar o hash
        isEditMode = false;
        manageProfilesBtn.querySelector('.glass-content').textContent = 'Gerenciar Perfis';
        document.getElementById('profile-main-title').textContent = 'Quem está assistindo?';
        currentProfile = null; // **IMPORTANTE:** Limpa o perfil atual para forçar seleção
        localStorage.removeItem(`starlight-lastProfile-${userId}`); // Limpa o perfil salvo
        window.location.hash = 'manage-profile-view'; // Navega para a tela de gerenciamento
    });

    // --- Lógica de Autenticação e Troca de Formulário (Login/Registro) ---
    const switchToRegister = document.querySelector('.switch-to-register');
    const switchToLogin = document.querySelector('.switch-to-login');
    const loginFormContainer = document.querySelector('.form-container.login');
    const registerFormContainer = document.querySelector('.form-container.register');

    // Trocar para formulário de registro
    switchToRegister.addEventListener('click', (e) => {
        e.preventDefault();
        loginFormContainer.classList.remove('active');
        registerFormContainer.classList.add('active');
    });
    // Trocar para formulário de login
    switchToLogin.addEventListener('click', (e) => {
        e.preventDefault();
        registerFormContainer.classList.remove('active');
        loginFormContainer.classList.add('active');
    });

    // Submit do formulário de login
    document.getElementById('login-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        signInWithEmailAndPassword(auth, email, password)
            .catch((error) => { // Trata erros de login
                console.error("Erro de login:", error);
                showToast(`Erro: ${error.message}`, true);
            });
    });

    // Submit do formulário de registro
    document.getElementById('register-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;
        createUserWithEmailAndPassword(auth, email, password)
            .then(async (userCredential) => {
                // **NOVO:** Cria um perfil padrão após registro bem-sucedido
                const user = userCredential.user;
                if (user) {
                    const colRef = collection(db, 'users', user.uid, 'profiles');
                    await addDoc(colRef, { name: "Usuário", avatar: AVATARS[0] }); // Cria perfil inicial
                    // Não precisa fazer mais nada aqui, o onAuthStateChanged vai lidar com a navegação
                }
            })
            .catch((error) => { // Trata erros de registro
                console.error("Erro de registro:", error);
                showToast(`Erro: ${error.message}`, true);
            });
    });

    // Login com Google
    document.getElementById('google-signin-btn').addEventListener('click', () => {
        signInWithPopup(auth, googleProvider)
            .then(async (result) => {
                // **NOVO:** Verifica se é o primeiro login com Google e cria perfil se necessário
                const user = result.user;
                if (user) {
                    const profilesCol = collection(db, 'users', user.uid, 'profiles');
                    const snapshot = await getDocs(profilesCol);
                    if (snapshot.empty) { // Se não existem perfis, cria um
                        await addDoc(profilesCol, { name: user.displayName || "Usuário", avatar: user.photoURL || AVATARS[0] });
                    }
                    // onAuthStateChanged cuidará da navegação
                }
            })
            .catch((error) => { // Trata erros de login com Google
                console.error("Erro de login com Google:", error);
                showToast(`Erro: ${error.message}`, true);
            });
    });

    // Logout
    logoutBtn.addEventListener('click', () => {
        const currentUserId = userId; // Guarda o userId antes do logout
        signOut(auth).then(() => {
            // **NOVO:** Limpa o perfil salvo no localStorage ao sair
            if (currentUserId) {
                localStorage.removeItem(`starlight-lastProfile-${currentUserId}`);
            }
            // Para o listener de novidades se estiver ativo
            if (unsubscribeNewsListener) {
                unsubscribeNewsListener();
                unsubscribeNewsListener = null;
            }
            // O onAuthStateChanged vai detectar a mudança e redirecionar para o login
        }).catch((error) => { // Trata erros de logout
            console.error("Erro ao sair:", error);
            showToast(`Erro: ${error.message}`, true);
        });
    });

    // --- Lógica do Modal de Confirmação --- (sem alterações)
    function showConfirmationModal(title, message, onConfirm) {
        confirmTitle.textContent = title;
        confirmMessage.textContent = message;
        confirmCallback = onConfirm; // Armazena a função a ser chamada
        confirmModal.classList.remove('hidden'); // Mostra o modal
    }

    confirmOkBtn.addEventListener('click', () => { // Botão confirmar
        if (confirmCallback) {
            confirmCallback(); // Executa a função armazenada
        }
        confirmModal.classList.add('hidden'); // Esconde o modal
        confirmCallback = null; // Limpa a função
    });

    confirmCancelBtn.addEventListener('click', () => { // Botão cancelar
        confirmModal.classList.add('hidden'); // Apenas esconde o modal
        confirmCallback = null; // Limpa a função
    });

    // --- Busca TMDB para Pedidos --- (sem alterações)
    const tmdbSearchInput = document.getElementById('tmdb-search-input');
    tmdbSearchInput.addEventListener('input', () => { // Busca com debounce
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            handleTmdbSearch(tmdbSearchInput.value);
        }, 500);
    });

    async function handleTmdbSearch(query) {
        const resultsContainer = document.getElementById('tmdb-search-results');
        if (query.length < 3) { // Só busca com 3+ caracteres
            resultsContainer.innerHTML = '';
            return;
        }
        resultsContainer.innerHTML = `<div class="col-span-full">${glassSpinnerHTML.replace('min-h-screen', '')}</div>`; // Spinner
        const data = await fetchFromTMDB('search/multi', `query=${encodeURIComponent(query)}`); // Busca na API
        if (data && data.results) {
            // Filtra resultados (filmes/séries com poster)
            const filtered = data.results.filter(item => (item.media_type === 'movie' || item.media_type === 'tv') && item.poster_path);
            renderTmdbResults(filtered); // Renderiza os resultados
        } else {
            resultsContainer.innerHTML = `<p class="col-span-full text-center text-gray-400">Nenhum resultado encontrado.</p>`;
        }
    }

    function renderTmdbResults(results) {
        const container = document.getElementById('tmdb-search-results');
        if (results.length === 0) { // Mensagem se não houver resultados
            container.innerHTML = `<p class="col-span-full text-center text-gray-400">Nenhum resultado encontrado.</p>`;
            return;
        }
        // Cria um card para cada resultado
        container.innerHTML = results.map(item => {
            const posterPath = item.poster_path ? `${IMG_URL_POSTER}${item.poster_path}` : 'https://placehold.co/300x450/1c1917/FFFFFF?text=Sem+Imagem';
            return `
            <div class="cursor-pointer group tmdb-result-item" data-item='${JSON.stringify(item)}'> <!-- Armazena dados do item -->
                <div class="liquid-glass-card aspect-[2/3] bg-stone-800">
                    <div class="glass-filter"></div>
                    <div class="glass-overlay" style="--bg-color: rgba(0,0,0,0.1);"></div>
                    <div class="glass-specular"></div>
                    <div class="glass-content p-0">
                        <img src="${posterPath}" alt="${item.title || item.name}" class="w-full h-full object-cover rounded-[inherit]">
                    </div>
                </div>
                <h4 class="text-white text-xs mt-2 truncate">${item.title || item.name}</h4>
            </div>
            `;
        }).join('');
        attachGlassButtonListeners(); // Reatacha listeners visuais
    }

    // Listener para cliques nos resultados da busca TMDB
    document.getElementById('tmdb-search-results').addEventListener('click', (e) => {
        const itemElement = e.target.closest('.tmdb-result-item');
        if (itemElement) { // Se clicou em um item
            const itemData = JSON.parse(itemElement.dataset.item); // Pega os dados armazenados
            confirmAndAddRequest(itemData); // Chama função para confirmar e adicionar pedido
        }
    });

    // Listener para cliques nos botões de voto nos pedidos pendentes
    document.getElementById('pending-requests-container').addEventListener('click', e => {
        const voteButton = e.target.closest('.vote-btn');
        if (voteButton) { // Se clicou no botão de voto
            const requestId = voteButton.dataset.requestId; // Pega o ID do pedido
            handleVote(requestId); // Processa o voto
        }
    });

    /** Confirma e adiciona um pedido (ou voto) para um item do TMDB */
    async function confirmAndAddRequest(item) {
        const title = item.title || item.name; // Título do item
        // Mostra modal de confirmação
        showConfirmationModal(
            'Confirmar Pedido', // Título do modal
            `Deseja solicitar a adição de "${title}"?`, // Mensagem
            async () => { // Callback de confirmação
                if (!userId || !currentProfile) { // Verifica login e perfil
                    showToast("Você precisa estar logado e ter um perfil selecionado.", true);
                    return;
                }

                // Verifica se o item já existe no catálogo principal
                const alreadyInCatalog = firestoreContent.some(c => c.tmdb_id === item.id);
                if (alreadyInCatalog) {
                    showToast('Este item já está disponível no catálogo.', true);
                    return;
                }

                // Verifica se já existe um pedido pendente para este item
                const existingRequest = pendingRequests.find(r => r.tmdbId === item.id);

                if (existingRequest) { // Se já existe um pedido
                    // Verifica se o usuário atual já votou
                    const userHasRequested = existingRequest.requesters && existingRequest.requesters.some(r => r.userId === userId);
                    if (userHasRequested) {
                        showToast('Você já apoiou este pedido.', true); // Informa se já votou
                        return;
                    }
                    // Se não votou, adiciona o voto ao pedido existente
                    try {
                        const docRef = doc(db, 'pedidos', existingRequest.id);
                        await updateDoc(docRef, {
                            requesters: arrayUnion({ userId: userId, userName: currentProfile.name }) // Adiciona ao array
                        });
                        showToast('Seu apoio ao pedido foi adicionado!');
                    } catch (error) {
                        console.error("Erro ao apoiar pedido:", error);
                        showToast('Ocorreu um erro ao apoiar o pedido.', true);
                    }
                } else { // Se não existe pedido, cria um novo
                    const requestData = { // Dados do novo pedido
                        tmdbId: item.id,
                        title: item.title || item.name,
                        year: (item.release_date || item.first_air_date || '').substring(0, 4), // Pega o ano
                        posterUrl: item.poster_path ? `${IMG_URL_POSTER}${item.poster_path}` : 'https://placehold.co/300x450/1c1917/FFFFFF?text=Sem+Imagem',
                        mediaType: item.media_type,
                        status: 'pending', // Status inicial
                        createdAt: serverTimestamp(), // Data de criação
                        requesters: [{ userId: userId, userName: currentProfile.name }] // Array inicial de votantes
                    };

                    // Adiciona o novo pedido ao Firestore
                    try {
                        await addDoc(collection(db, 'pedidos'), requestData);
                        showToast('Pedido enviado com sucesso!');
                    } catch (error) {
                        console.error("Erro ao adicionar pedido:", error);
                        showToast('Ocorreu um erro ao enviar o pedido.', true);
                    }
                }
            }
        );
    }

    // --- Estado Inicial e Listener de Autenticação ---

    /** Mostra a tela de login e esconde o resto */
    function showLoginScreen() {
        userId = null; // Limpa userId
        currentProfile = null; // Limpa currentProfile
        // Esconde todas as views principais, header e footer
        document.querySelectorAll('.content-view').forEach(view => view.classList.add('hidden'));
        loginView.classList.remove('hidden'); // Mostra login
        document.querySelector('header').classList.add('hidden');
        document.querySelector('footer').classList.add('hidden');
        document.getElementById('main-background').style.opacity = 0; // Esconde background
    }

    /** Mostra a tela de seleção/gerenciamento de perfil */
    async function showProfileScreen() {
        // Esconde outras views, header e footer
        document.querySelectorAll('.content-view').forEach(view => view.classList.add('hidden'));
        loginView.classList.add('hidden');
        manageProfileView.classList.remove('hidden'); // Mostra gerenciamento de perfil
        document.querySelector('header').classList.add('hidden');
        document.querySelector('footer').classList.add('hidden');
        document.getElementById('main-background').style.opacity = 0; // Esconde background
        // Reseta o modo de edição
        isEditMode = false;
        manageProfilesBtn.querySelector('.glass-content').textContent = 'Gerenciar Perfis';
        document.getElementById('profile-main-title').textContent = 'Quem está assistindo?';
        await loadProfiles(); // Carrega e renderiza os perfis
    }

    // Listener principal de mudança de estado de autenticação
    onAuthStateChanged(auth, async (user) => {
        document.body.classList.remove('auth-loading'); // Torna o body visível
        if (user) { // Se o usuário está logado
            userId = user.uid; // Define o userId global
            userEmail = user.email; // Guarda email
            userDisplayName = user.displayName; // Guarda nome do Google (se houver)

            // Inicia listeners do Firestore que dependem do usuário
            listenForNotifications();
            // listenToRequests(); // Movido para depois da seleção de perfil

            initializePlayerUI(); // Inicializa UI do player (pode ser feito aqui)

            // **LÓGICA DE PERFIL NO LOGIN:**
            // Tenta carregar o último perfil do localStorage
            const lastProfileId = localStorage.getItem(`starlight-lastProfile-${userId}`);
            let autoSelectedProfile = false;
            if (lastProfileId) {
                await loadProfiles(); // Carrega perfis para verificar se o ID salvo é válido
                const foundProfile = profiles.find(p => p.id === lastProfileId);
                if (foundProfile) {
                    // Se encontrou, seleciona automaticamente e PULA a tela de seleção
                    selectAndEnterProfile(foundProfile); // Esta função agora SÓ seleciona o perfil
                    autoSelectedProfile = true;
                    handleNavigation(); // ADICIONE ESTA LINHA
                }
            }

            // Se nenhum perfil foi selecionado automaticamente, mostra a tela de seleção
            if (!autoSelectedProfile) {
                currentProfile = null; // Garante que currentProfile esteja nulo
                if (window.location.hash !== '#manage-profile-view') {
                    history.replaceState(null, '', '#manage-profile-view');
                }
                handleNavigation(); // Roda o roteador (vai cair na condição !currentProfile)
            }
            // Se um perfil foi selecionado (autoSelectedProfile = true),
            // selectAndEnterProfile já chamou handleNavigation, então não precisa chamar de novo.

        } else { // Se o usuário NÃO está logado
            userId = null;
            userEmail = null;
            userDisplayName = null;
            currentProfile = null;
            // Para o listener de novidades se estiver ativo
            if (unsubscribeNewsListener) {
                unsubscribeNewsListener();
                unsubscribeNewsListener = null;
            }
            // Garante que o hash seja #login-view
            if (window.location.hash !== '#login-view') {
                history.replaceState(null, '', '#login-view');
            }
            handleNavigation(); // Roda o roteador (vai cair na condição !userId)
        }
    });

    // --- Inicialização ---
    attachGlassButtonListeners(); // Adiciona listeners visuais iniciais
    window.addEventListener('resize', () => { // Listener para resize
        updateMobileNavIndicator(); // Atualiza nav mobile
        // Re-avalia qual listener de clique do player adicionar (mobile vs desktop)
        addPlayerEventListeners();
    });

    // Chama o roteador na carga inicial da página para exibir a view correta
    // O onAuthStateChanged pode chamar handleNavigation novamente, mas é seguro.
    // handleNavigation(); << Removido - onAuthStateChanged cuidará da chamada inicial.

    // -----------------------------------------------------------------
    // --- NOVO: Funções de Novidades, Likes, Comentários, Respostas ---
    // -----------------------------------------------------------------

    /** Escuta por atualizações na coleção 'news' e atualiza o cache */
    function listenForNews() {
        if (unsubscribeNewsListener) {
            unsubscribeNewsListener();
        }

        const q = query(collection(db, "news"), orderBy("isPinned", "desc"), orderBy("createdAt", "desc"));
        unsubscribeNewsListener = onSnapshot(q, (snapshot) => {
            const newsContainer = document.getElementById('news-items-container');

            snapshot.docChanges().forEach((change) => {
                const changedData = { id: change.doc.id, ...change.doc.data() };
                const existingCard = newsContainer ? newsContainer.querySelector(`.news-card[data-news-id="${change.doc.id}"]`) : null;

                if (change.type === "added") {
                    // Adiciona o novo post no cache e na tela
                    if (!existingCard) {
                        newsItemsCache.unshift(changedData); // Adiciona no início do array
                        if (window.location.hash === '#news-view' && newsContainer) {
                            // Remove mensagem de "nenhuma novidade" se existir
                            const placeholder = newsContainer.querySelector('p');
                            if (placeholder) placeholder.remove();

                            const newCard = createNewsCard(changedData);
                            newsContainer.prepend(newCard); // Adiciona no topo do feed
                            attachGlassButtonListeners();
                            lucide.createIcons();
                        }
                    }
                }
                if (change.type === "modified") {
                    // Atualiza o post existente no cache e na tela
                    const index = newsItemsCache.findIndex(item => item.id === change.doc.id);
                    if (index > -1) {
                        newsItemsCache[index] = changedData;
                    }
                    if (existingCard) {
                        // Esta é a função mágica que vamos criar no próximo passo
                        updateNewsCardUI(existingCard, changedData);
                    }
                }
                if (change.type === "removed") {
                    // Remove o post do cache e da tela
                    newsItemsCache = newsItemsCache.filter(item => item.id !== change.doc.id);
                    if (existingCard) {
                        existingCard.remove();
                    }
                }
            });
        }, (error) => {
            console.error("Erro ao escutar novidades: ", error);
        });
    }

    /** Renderiza o feed de novidades na tela */
    function renderNewsFeed() {
        const newsContainer = document.getElementById('news-view');
        if (!newsContainer) return;

        // Limpa o conteúdo anterior, exceto o título (se houver)
        // Assume que o título está fora de um container específico de itens
        const itemsContainerId = 'news-items-container';
        let itemsContainer = newsContainer.querySelector(`#${itemsContainerId}`);
        if (!itemsContainer) {
            // Se o container não existe, cria-o (ajuste conforme sua estrutura HTML)
            newsContainer.innerHTML = `
                <div class="max-w-3xl mx-auto pb-16 w-full px-4 md:px-6 space-y-8">
                    <h2 class="text-3xl sm:text-4xl font-bold text-white mb-8">Novidades</h2>
                    <div id="${itemsContainerId}" class="space-y-8"></div>
                </div>`;
            itemsContainer = newsContainer.querySelector(`#${itemsContainerId}`);
        } else {
            itemsContainer.innerHTML = ''; // Limpa apenas o container dos itens
        }


        if (newsItemsCache.length === 0) {
            itemsContainer.innerHTML = '<p class="text-center text-gray-400">Nenhuma novidade publicada ainda.</p>';
            return;
        }

        newsItemsCache.forEach(item => {
            const newsCard = createNewsCard(item);
            itemsContainer.prepend(newsCard);
        });
        attachGlassButtonListeners();
        lucide.createIcons();
    }

    /** Cria o elemento HTML para um card de novidade */
    function createNewsCard(item) {
        const card = document.createElement('div');
        card.className = 'news-card liquid-glass-card bg-stone-900/50 rounded-lg overflow-hidden'; // Estilo Liquid Glass
        card.dataset.newsId = item.id; // Guarda o ID

        const date = item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Data indisponível';

        // NOVO: Cria o selo "FIXADO" se o item tiver 'isPinned: true'
        const pinnedBadge = item.isPinned
            ? `<span class="text-xs font-bold bg-yellow-500/20 text-yellow-300 px-2 py-1 rounded-full ml-2">FIXADO</span>`
            : '';

        let contentHTML = '';

        // Renderiza o conteúdo principal (texto, imagem ou vídeo)
        switch (item.type) {
            case 'text':
                contentHTML = `<p class="text-stone-300 mt-2 whitespace-pre-wrap">${item.content}</p>`;
                break;
            case 'image':
                contentHTML = `<img src="${item.content}" alt="${item.title || 'Imagem da novidade'}" class="mt-4 rounded-lg max-w-full h-auto mx-auto">`;
                break;
            case 'video':
                contentHTML = `<div class="aspect-video mt-4"><iframe src="${item.content}" frameborder="0" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen class="w-full h-full rounded-lg"></iframe></div>`;
                break;
            default:
                contentHTML = `<p class="text-stone-500 mt-2">[Conteúdo ${item.type} não suportado]</p>`;
        }

        const likes = item.likes || [];
        const userHasLiked = userId ? likes.includes(userId) : false;
        const likeCount = item.likeCount || likes.length;

        card.innerHTML = `
            <div class="glass-filter"></div>
            <div class="glass-overlay"></div>
            <div class="glass-specular"></div>
            <div class="glass-content p-4 sm:p-6">
                ${item.title ? `<h3 class="text-xl font-semibold text-white">${item.title}</h3>` : ''}
                
                <p class="text-xs text-stone-400 mb-4 flex items-center">${date} ${pinnedBadge}</p>
                
                ${contentHTML}
                <div class="mt-4 pt-4 border-t border-white/10 flex items-center justify-between gap-4">
                    <button class="like-btn flex items-center gap-2 text-stone-400 hover:text-pink-500 transition-colors ${userHasLiked ? 'text-pink-500' : ''}" data-news-id="${item.id}">
                        <i data-lucide="${userHasLiked ? 'heart-handshake' : 'heart'}" class="w-5 h-5"></i>
                        <span class="like-count text-sm">${likeCount}</span>
                    </button>
                    <button class="comment-btn flex items-center gap-2 text-stone-400 hover:text-indigo-400 transition-colors" data-news-id="${item.id}">
                        <i data-lucide="message-square" class="w-5 h-5"></i>
                        <span class="comment-count-display text-sm">Comentar</span>
                    </button>
                </div>
                <div class="comments-section mt-4 hidden">
                    <div class="comment-input-area mb-4">
                        <textarea class="comment-input w-full p-2 bg-black/30 rounded-lg text-sm focus:ring-1 focus:ring-indigo-500 focus:outline-none border border-white/20" rows="2" placeholder="Escreva seu comentário..."></textarea>
                        <button class="submit-comment-btn bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded-md text-sm mt-2 float-right">Enviar</button>
                    </div>
                    <div class="comments-list space-y-3">
                        </div>
                </div>
            </div>`;

        // Adiciona listeners para os botões e área de comentários
        addNewsCardListeners(card);
        return card;
    }

    /** Adiciona listeners aos botões e elementos de um card de novidade */
    function addNewsCardListeners(cardElement) {
        const likeBtn = cardElement.querySelector('.like-btn');
        const commentBtn = cardElement.querySelector('.comment-btn');
        const commentsSection = cardElement.querySelector('.comments-section');
        const commentInput = cardElement.querySelector('.comment-input');
        const submitCommentBtn = cardElement.querySelector('.submit-comment-btn');
        const commentsList = cardElement.querySelector('.comments-list');
        const newsId = cardElement.dataset.newsId;

        // NOVO: Variável para armazenar a função que cancela o ouvinte de comentários
        let unsubscribeCommentsListener = null;

        likeBtn.addEventListener('click', () => handleLike(newsId, likeBtn));

        commentBtn.addEventListener('click', () => {
            commentsSection.classList.toggle('hidden');

            if (!commentsSection.classList.contains('hidden')) {
                // SEÇÃO ABRINDO: Liga o ouvinte em tempo real
                // loadComments retorna a função de cancelamento.
                unsubscribeCommentsListener = loadComments(newsId, commentsList);
            } else {
                // SEÇÃO FECHANDO: Cancela o ouvinte se ele estiver ligado
                if (unsubscribeCommentsListener) {
                    unsubscribeCommentsListener();
                    unsubscribeCommentsListener = null; // Limpa a variável
                }
            }
        });

        submitCommentBtn.addEventListener('click', () => submitComment(newsId, commentInput, commentsList));

        // Listener para submeter comentário com Enter (Shift+Enter para nova linha)
        commentInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submitComment(newsId, commentInput, commentsList);
            }
        });
    }

    /** Lida com o clique no botão de curtir */
    async function handleLike(newsId, likeBtn) {
        if (!userId) {
            showToast("Você precisa estar logado para curtir.", true);
            return;
        }
        const newsDocRef = doc(db, 'news', newsId);
        const likeIcon = likeBtn.firstElementChild;
        const likeCountSpan = likeBtn.querySelector('.like-count');
        const isCurrentlyLiked = likeBtn.classList.contains('text-pink-500');

        // Otimização: Atualiza UI imediatamente
        likeBtn.classList.toggle('text-pink-500');
        likeIcon.setAttribute('data-lucide', isCurrentlyLiked ? 'heart' : 'heart-handshake');
        lucide.createIcons({ nodes: [likeIcon] }); // Recria só o ícone clicado
        const currentCount = parseInt(likeCountSpan.textContent || '0');
        likeCountSpan.textContent = isCurrentlyLiked ? Math.max(0, currentCount - 1) : currentCount + 1;
        likeBtn.disabled = true; // Desabilita temporariamente

        try {
            if (isCurrentlyLiked) {
                // Remove o like
                await updateDoc(newsDocRef, {
                    likes: arrayRemove(userId),
                    likeCount: increment(-1) // Decrementa contador
                });
            } else {
                // Adiciona o like
                await updateDoc(newsDocRef, {
                    likes: arrayUnion(userId),
                    likeCount: increment(1) // Incrementa contador
                });
            }
            // A UI já foi atualizada, apenas reabilita o botão
        } catch (error) {
            console.error("Erro ao curtir/descurtir:", error);
            showToast("Erro ao processar o like.", true);
            // Reverte a UI em caso de erro
            likeBtn.classList.toggle('text-pink-500'); // Reverte a cor
            likeIcon.setAttribute('data-lucide', isCurrentlyLiked ? 'heart-handshake' : 'heart');
            lucide.createIcons({ nodes: [likeIcon] });
            likeCountSpan.textContent = currentCount; // Reverte contagem
        } finally {
            likeBtn.disabled = false; // Reabilita o botão
        }
    }

    /** Submete um novo comentário */
    async function submitComment(newsId, inputElement, commentsListElement) {
        if (!userId || !currentProfile) {
            showToast("Você precisa estar logado para comentar.", true);
            return;
        }
        const commentText = inputElement.value.trim();
        if (!commentText) {
            showToast("O comentário não pode estar vazio.", true);
            return;
        }

        const commentData = {
            userId: userId,
            userName: currentProfile.name || userEmail || "Usuário", // Usa nome do perfil ou email
            text: commentText,
            createdAt: serverTimestamp(),
            repliesCount: 0 // Inicia contador de respostas
        };

        inputElement.disabled = true; // Desabilita input durante envio
        const submitBtn = inputElement.nextElementSibling; // Assume que o botão é o próximo elemento
        if (submitBtn) submitBtn.disabled = true;

        try {
            const commentsColRef = collection(db, 'news', newsId, 'comments');
            // MUDANÇA 1: Guardamos o resultado do addDoc em uma nova variável "newCommentRef"
            const newCommentRef = await addDoc(commentsColRef, commentData);

            inputElement.value = ''; // Limpa input
            showToast('Comentário adicionado!');

            // Opcional: Adicionar o comentário localmente na UI imediatamente
            // MUDANÇA 2: Usamos a ID real (newCommentRef.id) em vez da ID temporária
            const newCommentCard = createCommentCard({ id: newCommentRef.id, ...commentData }, newsId);

            commentsListElement.prepend(newCommentCard); // Adiciona no início da lista
            attachGlassButtonListeners();
            lucide.createIcons();
        } catch (error) {
            console.error("Erro ao adicionar comentário:", error);
            showToast("Erro ao enviar comentário.", true);
        } finally {
            inputElement.disabled = false;
            if (submitBtn) submitBtn.disabled = false;
        }
    }

    // CÓDIGO NOVO E CORRIGIDO PARA loadComments
    /** Carrega e escuta os comentários de um post em tempo real. */
    // Esta função NÃO é mais async
    function loadComments(newsId, commentsListElement) {
        // A query para a coleção de comentários
        const q = query(collection(db, 'news', newsId, 'comments'), orderBy('createdAt', 'asc'));

        // Configura o ouvinte em tempo real (onSnapshot)
        // O onSnapshot retorna a função que cancela o ouvinte!
        const unsubscribe = onSnapshot(q, (snapshot) => {
            // Limpa o conteúdo (Spinner/mensagens) ANTES de reconstruir
            commentsListElement.innerHTML = '';

            if (snapshot.empty) {
                commentsListElement.innerHTML = '<p class="text-stone-400 text-sm text-center">Nenhum comentário ainda.</p>';
                return;
            }

            // Reconstrói a lista de comentários
            snapshot.forEach(doc => {
                const commentCard = createCommentCard({ id: doc.id, ...doc.data() }, newsId);
                commentsListElement.appendChild(commentCard);
            });

            attachGlassButtonListeners();
            lucide.createIcons();
        }, (error) => {
            console.error("Erro ao carregar comentários:", error);
            commentsListElement.innerHTML = '<p class="text-red-400 text-sm text-center">Erro ao carregar comentários.</p>';
        });

        // RETORNA a função de unsubscribe. Quem chamar 'loadComments' precisa guardar isso.
        return unsubscribe;
    }

    /** Cria o HTML para um card de comentário */
    function createCommentCard(comment, newsId) {
        const card = document.createElement('div');
        card.className = 'comment-card liquid-glass-card bg-stone-800/40 rounded-lg p-3';
        card.dataset.commentId = comment.id;

        const date = comment.createdAt?.toDate ? comment.createdAt.toDate().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + ' - ' + comment.createdAt.toDate().toLocaleDateString('pt-BR') : '';
        const repliesCount = comment.repliesCount || 0;

        card.innerHTML = `
             <div class="glass-filter"></div>
             <div class="glass-overlay" style="--bg-color: rgba(30, 30, 30, 0.2);"></div>
             <div class="glass-specular"></div>
             <div class="glass-content">
                <div class="flex items-center justify-between mb-1">
                    <span class="font-semibold text-sm text-indigo-300">${comment.userName || 'Usuário'}</span>
                    <span class="text-xs text-stone-400">${date}</span>
                </div>
                <p class="text-sm text-stone-200 whitespace-pre-wrap">${comment.text}</p>
                <div class="mt-2 flex items-center gap-4">
                     <button class="reply-btn text-xs text-stone-400 hover:text-indigo-400 flex items-center gap-1">
                         <i data-lucide="corner-down-left" class="w-3 h-3"></i> Responder
                     </button>
                     ${repliesCount > 0 ? `<button class="view-replies-btn text-xs text-stone-400 hover:text-indigo-400 flex items-center gap-1" data-count="${repliesCount}">
                         <i data-lucide="messages-square" class="w-3 h-3"></i> Ver ${repliesCount} ${repliesCount === 1 ? 'resposta' : 'respostas'}
                     </button>` : ''}
                </div>
                <div class="reply-input-area hidden mt-2 ml-4">
                    <textarea class="reply-input w-full p-2 bg-black/40 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none border border-white/10" rows="1" placeholder="Escreva sua resposta..."></textarea>
                    <button class="submit-reply-btn bg-indigo-600 hover:bg-indigo-700 text-white px-2 py-0.5 rounded-md text-xs mt-1 float-right">Enviar</button>
                </div>
                <div class="replies-list hidden mt-2 ml-4 space-y-2 border-l-2 border-white/10 pl-3">
                    </div>
             </div>
        `;
        addCommentCardListeners(card, newsId, comment.id);
        return card;
    }

    /** Adiciona listeners aos botões de um card de comentário */
    function addCommentCardListeners(cardElement, newsId, commentId) {
        const replyBtn = cardElement.querySelector('.reply-btn');
        const viewRepliesBtn = cardElement.querySelector('.view-replies-btn');
        const replyInputArea = cardElement.querySelector('.reply-input-area');
        const replyInput = cardElement.querySelector('.reply-input');
        const submitReplyBtn = cardElement.querySelector('.submit-reply-btn');
        const repliesList = cardElement.querySelector('.replies-list');

        replyBtn.addEventListener('click', () => replyInputArea.classList.toggle('hidden'));
        if (viewRepliesBtn) {
            viewRepliesBtn.addEventListener('click', () => {
                const isHidden = repliesList.classList.toggle('hidden');
                viewRepliesBtn.innerHTML = isHidden
                    ? `<i data-lucide="messages-square" class="w-3 h-3"></i> Ver ${viewRepliesBtn.dataset.count} ${viewRepliesBtn.dataset.count == 1 ? 'resposta' : 'respostas'}`
                    : `<i data-lucide="chevron-up" class="w-3 h-3"></i> Ocultar respostas`;
                lucide.createIcons({ nodes: [viewRepliesBtn] });
                if (!isHidden && repliesList.innerHTML === '') {
                    loadReplies(newsId, commentId, repliesList); // Carrega respostas ao expandir
                }
            });
        }
        submitReplyBtn.addEventListener('click', () => submitReply(newsId, commentId, replyInput, repliesList, viewRepliesBtn));

        replyInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submitReply(newsId, commentId, replyInput, repliesList, viewRepliesBtn);
            }
        });
    }

    /** Submete uma nova resposta a um comentário */
    async function submitReply(newsId, commentId, inputElement, repliesListElement, viewRepliesBtn) {
        if (!userId || !currentProfile) {
            showToast("Você precisa estar logado para responder.", true);
            return;
        }
        const replyText = inputElement.value.trim();
        if (!replyText) {
            showToast("A resposta não pode estar vazia.", true);
            return;
        }

        const replyData = {
            userId: userId,
            userName: currentProfile.name || userEmail || "Usuário",
            text: replyText,
            createdAt: serverTimestamp()
        };

        inputElement.disabled = true;
        const submitBtn = inputElement.nextElementSibling;
        if (submitBtn) submitBtn.disabled = true;

        try {
            const repliesColRef = collection(db, 'news', newsId, 'comments', commentId, 'replies');
            await addDoc(repliesColRef, replyData);

            // Incrementa o contador de respostas no documento do comentário
            const commentDocRef = doc(db, 'news', newsId, 'comments', commentId);
            await updateDoc(commentDocRef, { repliesCount: increment(1) });

            inputElement.value = '';
            inputElement.closest('.reply-input-area').classList.add('hidden'); // Esconde input area
            showToast('Resposta adicionada!');
            // Opcional: Adicionar resposta localmente na UI imediatamente
            const newReplyCard = createReplyCard({ id: 'temp-reply-' + Date.now(), ...replyData });
            repliesListElement.prepend(newReplyCard); // Adiciona no início
            repliesListElement.classList.remove('hidden'); // Garante que a lista esteja visível
            // Atualiza o botão "Ver respostas"
            const newCount = (parseInt(viewRepliesBtn?.dataset.count || '0') + 1);
            if (viewRepliesBtn) {
                viewRepliesBtn.dataset.count = newCount;
                viewRepliesBtn.innerHTML = `<i data-lucide="chevron-up" class="w-3 h-3"></i> Ocultar respostas`; // Assume que está expandido
                lucide.createIcons({ nodes: [viewRepliesBtn] });
            } else {
                // Se não havia botão (0 respostas), cria um agora (simplificado)
                const commentCard = inputElement.closest('.comment-card');
                const buttonContainer = commentCard.querySelector('.flex.items-center.gap-4'); // Container dos botões
                if (buttonContainer) {
                    const newViewRepliesBtn = document.createElement('button');
                    newViewRepliesBtn.className = "view-replies-btn text-xs text-stone-400 hover:text-indigo-400 flex items-center gap-1";
                    newViewRepliesBtn.dataset.count = 1;
                    newViewRepliesBtn.innerHTML = `<i data-lucide="chevron-up" class="w-3 h-3"></i> Ocultar respostas`;
                    buttonContainer.appendChild(newViewRepliesBtn);
                    // Adiciona listener ao novo botão (importante!)
                    addCommentCardListeners(commentCard, newsId, commentId);
                    lucide.createIcons({ nodes: [newViewRepliesBtn] });
                }
            }

        } catch (error) {
            console.error("Erro ao adicionar resposta:", error);
            showToast("Erro ao enviar resposta.", true);
        } finally {
            inputElement.disabled = false;
            if (submitBtn) submitBtn.disabled = false;
        }
    }

    /** Carrega as respostas de um comentário */
    function loadReplies(newsId, commentId, repliesListElement) {
        repliesListElement.innerHTML = `<div class="spinner mx-auto my-2 w-4 h-4 border-2"></div>`; // Spinner menor
        const q = query(collection(db, 'news', newsId, 'comments', commentId, 'replies'), orderBy('createdAt', 'asc')); // Ordena por mais antigas

        // Usar onSnapshot para atualizações
        onSnapshot(q, (snapshot) => {
            if (snapshot.empty) {
                repliesListElement.innerHTML = '<p class="text-stone-500 text-xs text-center">Nenhuma resposta ainda.</p>';
                return;
            }
            repliesListElement.innerHTML = ''; // Limpa spinner/conteúdo anterior
            snapshot.forEach(doc => {
                const replyCard = createReplyCard({ id: doc.id, ...doc.data() });
                repliesListElement.appendChild(replyCard);
            });
            attachGlassButtonListeners(); // Reanexa se houver botões futuros na resposta
            lucide.createIcons();
        }, (error) => {
            console.error("Erro ao carregar respostas:", error);
            repliesListElement.innerHTML = '<p class="text-red-400 text-xs text-center">Erro ao carregar respostas.</p>';
        });
    }

    /** Cria o HTML para um card de resposta */
    function createReplyCard(reply) {
        const card = document.createElement('div');
        card.className = 'reply-card liquid-glass-card bg-stone-700/30 rounded-md p-2';
        card.dataset.replyId = reply.id;
        const date = reply.createdAt?.toDate ? reply.createdAt.toDate().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';

        card.innerHTML = `
             <div class="glass-filter"></div>
             <div class="glass-overlay" style="--bg-color: rgba(40, 40, 40, 0.2);"></div>
             <div class="glass-specular"></div>
             <div class="glass-content">
                <div class="flex items-center justify-between mb-0.5">
                    <span class="font-semibold text-xs text-indigo-300">${reply.userName || 'Usuário'}</span>
                    <span class="text-xs text-stone-500">${date}</span>
                </div>
                <p class="text-xs text-stone-300 whitespace-pre-wrap">${reply.text}</p>
             </div>
        `;
        return card;
    }


    // --- Lógica de Pedidos --- (Adaptações)
    function listenToRequests() {
        const q = query(collection(db, "pedidos"), where("status", "==", "pending"));
        onSnapshot(q, (snapshot) => {
            pendingRequests = [];
            snapshot.forEach((doc) => {
                pendingRequests.push({ id: doc.id, ...doc.data() });
            });
            // Ordena no cliente por data de criação (mais recente primeiro)
            pendingRequests.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
            // Re-renderiza se a view de pedidos estiver ativa
            if (window.location.hash === '#requests-view') {
                renderPendingRequests();
            }
        }, (error) => {
            console.error("Erro ao escutar pedidos: ", error);
        });
    }

    // --- Estado Inicial e Listener de Autenticação ---

    /** Mostra a tela de login e esconde o resto */
    function showLoginScreen() {
        userId = null; // Limpa userId
        userEmail = null;
        userDisplayName = null;
        currentProfile = null; // Limpa currentProfile
        // Esconde todas as views principais, header e footer
        document.querySelectorAll('.content-view').forEach(view => view.classList.add('hidden'));
        loginView.classList.remove('hidden'); // Mostra login
        document.querySelector('header').classList.add('hidden');
        document.querySelector('footer').classList.add('hidden');
        document.getElementById('main-background').style.opacity = 0; // Esconde background
        // Para o listener de novidades se estiver ativo
        if (unsubscribeNewsListener) {
            unsubscribeNewsListener();
            unsubscribeNewsListener = null;
        }
    }

    /** Mostra a tela de seleção/gerenciamento de perfil */
    async function showProfileScreen() {
        // Esconde outras views, header e footer
        document.querySelectorAll('.content-view').forEach(view => view.classList.add('hidden'));
        loginView.classList.add('hidden');
        manageProfileView.classList.remove('hidden'); // Mostra gerenciamento de perfil
        document.querySelector('header').classList.add('hidden');
        document.querySelector('footer').classList.add('hidden');
        document.getElementById('main-background').style.opacity = 0; // Esconde background
        // Reseta o modo de edição
        isEditMode = false;
        manageProfilesBtn.querySelector('.glass-content').textContent = 'Gerenciar Perfis';
        document.getElementById('profile-main-title').textContent = 'Quem está assistindo?';
        await loadProfiles(); // Carrega e renderiza os perfis
    }

    // Listener principal de mudança de estado de autenticação
    onAuthStateChanged(auth, async (user) => {
        document.body.classList.remove('auth-loading'); // Torna o body visível
        if (user) { // Se o usuário está logado
            userId = user.uid; // Define o userId global
            userEmail = user.email; // Guarda email
            userDisplayName = user.displayName; // Guarda nome do Google (se houver)

            // Inicia listeners do Firestore que dependem do usuário
            listenForNotifications();
            // listenToRequests(); // Movido para depois da seleção de perfil
            // listenForNews(); // Movido para depois da seleção de perfil

            initializePlayerUI(); // Inicializa UI do player (pode ser feito aqui)

            // **LÓGICA DE PERFIL NO LOGIN:**
            // Tenta carregar o último perfil do localStorage
            const lastProfileId = localStorage.getItem(`starlight-lastProfile-${userId}`);
            let autoSelectedProfile = false;
            if (lastProfileId) {
                await loadProfiles(); // Carrega perfis para verificar se o ID salvo é válido
                const foundProfile = profiles.find(p => p.id === lastProfileId);
                if (foundProfile) {
                    // Se encontrou, seleciona automaticamente e PULA a tela de seleção
                    selectAndEnterProfile(foundProfile);
                    autoSelectedProfile = true;
                }
            }

            // Se nenhum perfil foi selecionado automaticamente, mostra a tela de seleção
            if (!autoSelectedProfile) {
                currentProfile = null; // Garante que currentProfile esteja nulo
                if (window.location.hash !== '#manage-profile-view') {
                    history.replaceState(null, '', '#manage-profile-view');
                }
                handleNavigation(); // Roda o roteador (vai cair na condição !currentProfile)
            }
            // Se um perfil foi selecionado (autoSelectedProfile = true),
            // selectAndEnterProfile já chamou handleNavigation, então não precisa chamar de novo.

        } else { // Se o usuário NÃO está logado
            userId = null;
            userEmail = null;
            userDisplayName = null;
            currentProfile = null;
            // Garante que o hash seja #login-view
            if (window.location.hash !== '#login-view') {
                history.replaceState(null, '', '#login-view');
            }
            handleNavigation(); // Roda o roteador (vai cair na condição !userId)
        }
    });
    /** Controla a visibilidade do header com base no scroll (específico da home) */
    function handleHeaderScroll() {
        // Se o header não for encontrado ou o player estiver ativo, não faça nada
        if (!headerElement || !playerView.classList.contains('hidden')) return;

        const currentHash = window.location.hash;
        const scrollY = window.scrollY;
        // Distância pequena de scroll para acionar (50 pixels)
        const threshold = 50;

        // Se estivermos na home (#home-view, #, ou vazio)
        if (currentHash === '#home-view' || currentHash === '' || currentHash === '#') {
            if (scrollY > threshold) {
                // Rolou para baixo: MOSTRA header
                headerElement.classList.remove('header-hidden');
            } else {
                // Está no topo: ESCONDE header
                headerElement.classList.add('header-hidden');
            }
        } else {
            // Em QUALQUER outra tela (séries, filmes, etc.),
            // o header deve estar sempre visível (remove a classe de esconder)
            headerElement.classList.remove('header-hidden');
        }
    }
    // --- Inicialização ---
    attachGlassButtonListeners(); // Adiciona listeners visuais iniciais
    window.addEventListener('scroll', handleHeaderScroll); // <-- LINHA ADICIONADA
    window.addEventListener('resize', () => { // Listener para resize
        updateMobileNavIndicator(); // Atualiza nav mobile
        // Re-avalia qual listener de clique do player adicionar (mobile vs desktop)
        addPlayerEventListeners();
    });
    // CÓDIGO NOVO (ADICIONAR ESTA FUNÇÃO)
    /**
     * Atualiza apenas os elementos visuais de um card de novidade que mudaram,
     * sem recriar o card inteiro.
     * @param {HTMLElement} cardElement - O elemento do card que já está na página.
     * @param {object} updatedData - Os novos dados do post vindos do Firestore.
     */
    function updateNewsCardUI(cardElement, updatedData) {
        // --- Atualiza o contador de curtidas ---
        const likeCountSpan = cardElement.querySelector('.like-count');
        const likeBtn = cardElement.querySelector('.like-btn');
        const likeIcon = likeBtn ? likeBtn.firstElementChild : null;

        if (likeCountSpan) {
            likeCountSpan.textContent = updatedData.likeCount || 0;
        }

        // --- Atualiza o ícone de curtida para o usuário atual ---
        if (likeBtn && likeIcon) {
            const userHasLiked = userId && (updatedData.likes || []).includes(userId);
            const isCurrentlyLiked = likeBtn.classList.contains('text-pink-500');

            if (userHasLiked && !isCurrentlyLiked) {
                likeBtn.classList.add('text-pink-500');
                likeIcon.setAttribute('data-lucide', 'heart-handshake');
                lucide.createIcons({ nodes: [likeIcon] });
            } else if (!userHasLiked && isCurrentlyLiked) {
                likeBtn.classList.remove('text-pink-500');
                likeIcon.setAttribute('data-lucide', 'heart');
                lucide.createIcons({ nodes: [likeIcon] });
            }
        }

        // --- Atualiza o contador de respostas (se existir no futuro) ---
        // Poderíamos adicionar lógica aqui para atualizar contadores de comentários/respostas se quiséssemos.
    }
}); // Fim do DOMContentLoaded