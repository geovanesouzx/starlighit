import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signInWithPopup,
    GoogleAuthProvider,
    signOut,
    signInAnonymously, // <-- ADICIONADO
    signInWithCustomToken // <-- ADICIONADO
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
    orderBy,
    onSnapshot,
    serverTimestamp,
    arrayUnion,
    arrayRemove,
    runTransaction,
    setLogLevel // <-- ADICIONADO
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', async function() { // <-- TORNADO ASSÍNCRONO
    lucide.createIcons();

    // Define um hash padrão se nenhum existir e não for #player
    if (!window.location.hash || window.location.hash === '#player') {
        history.replaceState(null, '', window.location.pathname + window.location.search); // Limpa #player
        window.location.hash = '#home-view'; // Define um padrão inicial
    }

    // --- Configuração do Firebase (CORRIGIDO) ---
    // Usa a configuração dinâmica injetada ou um fallback
    const firebaseConfig = typeof __firebase_config !== 'undefined'
        ? JSON.parse(__firebase_config)
        : {
            // Fallback com os dados do seu script original (MANTIDO CASO __firebase_config não exista)
            apiKey: "AIzaSyA791i8R8Bmrn3toFxFltZ40TU7PUavev8",
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
    setLogLevel('debug'); // Ativa logs detalhados do Firestore

    let userId = null; // Será definido após a autenticação

    // --- AUTENTICAÇÃO INICIAL (NOVO) ---
    try {
        // Tenta logar com o token injetado
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            console.log("Tentando login com token customizado...");
            await signInWithCustomToken(auth, __initial_auth_token);
            console.log("Login com token customizado bem-sucedido.");
        } else {
            // Se não houver token, tenta login anônimo
            console.log("Token customizado não encontrado, tentando login anônimo...");
            await signInAnonymously(auth);
            console.log("Login anônimo bem-sucedido.");
        }
    } catch (error) {
        console.error("Erro na autenticação inicial:", error);
        // Se o login anônimo falhar (ex: desabilitado no Firebase), o app ficará na tela de login
        // Se o login com token falhar, pode tentar anônimo como fallback se fizer sentido
        try {
            console.warn("Falha no login com token, tentando anônimo como fallback...");
            await signInAnonymously(auth);
            console.log("Login anônimo de fallback bem-sucedido.");
        } catch (anonError) {
            console.error("Erro no login anônimo de fallback:", anonError);
            // Mostrar mensagem de erro para o usuário aqui se necessário
        }
    }
    // O userId será atualizado pelo onAuthStateChanged logo em seguida


    // Constantes da API TMDB
    const API_KEY = '5954890d9e9b723ff3032f2ec429fec3';
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

    // Caches para Novidades
    let newsItems = [];
    let newsLikes = new Map(); // Armazena likes por newsId -> Set[profileId]
    // REMOVIDO: newsComments
    let unsubscribeNewsLikes = () => {}; // Função para parar listener de likes
    // REMOVIDO: unsubscribeNewsComments

    let firestoreContent = []; // Cache do conteúdo principal
    let pendingRequests = []; // Cache de pedidos pendentes

    // Elementos DOM frequentemente usados
    const loginView = document.getElementById('login-view');
    const searchOverlay = document.getElementById('search-overlay');
    const searchInput = document.getElementById('search-input');
    const searchResultsContainer = document.getElementById('search-results');
    const searchIconBtn = document.getElementById('search-icon-btn');
    const closeSearchBtn = document.getElementById('close-search-btn');
    const notificationBtn = document.getElementById('notification-btn');
    const notificationPanel = document.getElementById('notification-panel');
    let debounceTimer; // Timer para debounce de busca

    // Elementos do Player (Filmes/Séries)
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
    const aspectRatioBtn = document.getElementById('player-aspect-ratio-btn');
    let currentAspectRatio = 'contain';

    // Elementos do Player (Novidades)
    const newsPlayerView = document.getElementById('news-player-view');
    const newsPlayerVideo = document.getElementById('news-video-player');
    const newsPlayerTitle = document.getElementById('news-player-title');
    const newsPlayerCloseBtn = document.getElementById('news-player-close-btn');

    // REMOVIDO: Elementos do Modal de Comentários

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
        'https://i.pinimg.com/736x/a8/31/b5/a831b58a3a067756a16518884967e812.jpg',
        'https://pbs.twimg.com/media/EcGdw6uXgAEpGA-.jpg'
    ];

    // Ícones SVG para os controles do player e novidades
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
        aspectContain: `<svg fill="currentColor" viewBox="0 0 24 24"><path d="M2 5h2v14H2V5zm20 0h-2v14h2V5zM6 7h12v10H6V7z"></path></svg>`, // Ícone para 'contain'
        aspectCover: `<svg fill="currentColor" viewBox="0 0 24 24"><path d="M4 5h16v14H4V5z"></path></svg>` // Ícone para 'cover'
        , // Ícones para Novidades
        heartOutline: `<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path></svg>`,
        heartFilled: `<svg fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg>`,
        // REMOVIDO: comment icon
        // REMOVIDO: reply icon
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
        if (!userId || !currentProfile?.id) {
            console.log("getMyList: userId ou currentProfile?.id ausente.");
            return []; // Retorna vazio se não houver usuário ou perfil
        }
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
        if (!userId || !currentProfile?.id) {
            console.log("checkIfInList: userId ou currentProfile?.id ausente.");
            return false;
        }
        const docRef = doc(db, 'users', userId, 'profiles', currentProfile.id, 'my-list', String(itemId));
        const docSnap = await getDoc(docRef);
        return docSnap.exists(); // Retorna true se o documento existir
    }

    /**
     * Adiciona ou remove um item da "Minha Lista" e atualiza os botões correspondentes.
     * @param {object} item - O objeto do item (filme ou série).
     */
    async function handleListAction(item) {
        if (!item || !userId || !currentProfile?.id) {
            console.log("handleListAction: Item, userId ou currentProfile?.id ausente.");
            showToast("Erro: Faça login e selecione um perfil para gerenciar sua lista.", true);
            return;
        }
        const itemId = String(item.docId || item.id); // Usa docId se disponível (do Firestore), senão id (do TMDB)
        const docRef = doc(db, 'users', userId, 'profiles', currentProfile.id, 'my-list', itemId);
        const isInList = await checkIfInList(itemId);

        try {
            if (isInList) {
                await deleteDoc(docRef); // Remove se já estiver na lista
                showToast("Removido da sua lista.");
            } else {
                // Adiciona se não estiver, garantindo que 'media_type' esteja presente
                const itemToAdd = { ...item, media_type: item.media_type || (item.title ? 'movie' : 'tv') };
                // Remove dados potencialmente grandes que não são necessários na lista
                delete itemToAdd.seasons;
                delete itemToAdd.episodes;
                await setDoc(docRef, itemToAdd);
                showToast("Adicionado à sua lista.");
            }

            updateListButtons(item); // Atualiza a aparência dos botões relacionados
            // Se a view "Minha Lista" estiver ativa, recarrega seu conteúdo
            if (window.location.hash === '#mylist-view') {
                populateMyList();
            }
        } catch (error) {
            console.error("Erro ao adicionar/remover da lista:", error);
            showToast("Erro ao atualizar sua lista.", true);
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
        if (!userId || !currentProfile?.id) {
            console.log("getProgressStorage: userId ou currentProfile?.id ausente.");
            return {};
        }
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
            lastWatched: serverTimestamp(),       // Timestamp do servidor
            // Apenas referências básicas do item para economizar espaço
            itemInfo: {
                docId: currentPlayerContext.itemData?.docId,
                title: currentPlayerContext.itemData?.title || currentPlayerContext.itemData?.name,
                poster: currentPlayerContext.itemData?.poster,
                type: currentPlayerContext.itemData?.type
            },
            // Apenas referências básicas do episódio (se aplicável)
            episodeInfo: currentPlayerContext.episodes
                ? {
                    title: currentPlayerContext.episodes[currentPlayerContext.currentIndex]?.title,
                    season_number: currentPlayerContext.episodes[currentPlayerContext.currentIndex]?.season_number,
                    episode_number: currentPlayerContext.episodes[currentPlayerContext.currentIndex]?.episode_number,
                    still_path: currentPlayerContext.episodes[currentPlayerContext.currentIndex]?.still_path // Para UI "Continuar Assistindo"
                }
                : null,
        };

        // Referência do documento de progresso (ex: 'users/uid/profiles/pid/watch-progress/movie-123')
        const docRef = doc(db, 'users', userId, 'profiles', currentProfile.id, 'watch-progress', currentPlayerContext.key);
        // Salva (ou atualiza se já existir) os dados no Firestore
        try {
            await setDoc(docRef, progressData, { merge: true }); // 'merge: true' evita sobrescrever dados não enviados
            //console.log("Progresso salvo para:", currentPlayerContext.key);
        } catch (error) {
            console.error("Erro ao salvar progresso:", error);
        }
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
                     <img src="${posterPath}" alt="Pôster de ${item.title || item.name}" loading="lazy" class="w-full h-full object-cover rounded-[inherit]">
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
                     <img src="${posterPath}" alt="Pôster de ${item.title || item.name}" loading="lazy" class="w-full h-full object-cover rounded-[inherit]">
                 </div>
            </div>
            <h4 class="text-white text-sm mt-2 truncate">${item.title || item.name}</h4>
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
            const synopsis = item.synopsis || item.overview || ''; // Garante que é string
            document.getElementById('hero-overview').textContent = synopsis.length > 200 ? synopsis.substring(0, 200) + '...' : synopsis;
            const releaseYear = item.year; // Ano de lançamento

            // Atualiza a seção de metadados (classificação, ano)
            const metaContainer = document.getElementById('hero-meta');
            metaContainer.innerHTML = ``; // Limpa o conteúdo anterior
            await displayContentRating(item, metaContainer); // Adiciona a classificação
            metaContainer.innerHTML += `<span>${releaseYear}</span>`; // Adiciona o ano

            // Atualiza o botão "Minha Lista"
            await updateListButton(document.getElementById('hero-add-to-list'), item);

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
        if (!userId || !currentProfile?.id) { // Se não estiver logado/com perfil, desabilita o botão
            button.disabled = true;
            button.style.opacity = '0.5';
            button.style.cursor = 'not-allowed';
            const contentDiv = button.querySelector('.glass-content');
            if (contentDiv) {
                contentDiv.innerHTML = `<svg class="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg><span>Minha Lista</span>`;
            }
            return;
        }
        // Se logado, habilita o botão
        button.disabled = false;
        button.style.opacity = '1';
        button.style.cursor = 'pointer';

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


    // --- Lógica Player de Vídeo (Novidades) ---
    function showNewsPlayer(url, title) {
        if (!newsPlayerView || !newsPlayerVideo) return;
        newsPlayerTitle.textContent = title || 'Vídeo';
        newsPlayerVideo.src = url;
        newsPlayerView.classList.remove('hidden');
        document.body.style.overflow = 'hidden'; // Impede scroll do fundo
        // **NÃO ADICIONAR AUTOPLAY AQUI**
    }


    function hideNewsPlayer() {
        if (!newsPlayerView || !newsPlayerVideo) return;
        newsPlayerVideo.pause();
        newsPlayerVideo.removeAttribute('src'); // Remove a fonte para parar o carregamento
        newsPlayerVideo.load(); // Importante para parar downloads pendentes
        newsPlayerView.classList.add('hidden');
        // Só restaura o scroll se o player principal também não estiver ativo
        if (playerView.classList.contains('hidden')) {
            document.body.style.overflow = 'auto';
        }
    }

    // Listener para fechar o player de novidades
    if (newsPlayerCloseBtn) {
        newsPlayerCloseBtn.addEventListener('click', hideNewsPlayer);
    }
    // --- FIM: Lógica Player de Vídeo (Novidades) ---

    /**
     * Escuta por atualizações na coleção 'content' do Firestore e atualiza a UI.
     */
    async function listenToFirestoreContent() {
        if (!userId) { // Adiciona verificação de userId
            console.log("listenToFirestoreContent: userId ausente, não iniciando listener.");
            return;
        }
        // Garante que o listener antigo seja parado
        if (typeof window.unsubscribeContent === 'function') {
            window.unsubscribeContent();
        }
        if (typeof window.unsubscribeFeatured === 'function') {
            window.unsubscribeFeatured();
        }

        console.log("Iniciando listener para 'content'...");
        // Escuta a coleção 'content'
        window.unsubscribeContent = onSnapshot(collection(db, 'content'), (snapshot) => {
            console.log("Recebido snapshot de 'content'.");
            firestoreContent = []; // Limpa o cache local
            snapshot.forEach(doc => {
                // Adiciona cada item ao cache com seu ID do Firestore
                firestoreContent.push({ docId: doc.id, ...doc.data() });
            });
            console.log(`Cache de 'content' atualizado com ${firestoreContent.length} itens.`);

            // Escuta o documento 'featured' na coleção 'config' para saber quais itens destacar
            // Parar listener antigo de featured antes de criar novo
            if (typeof window.unsubscribeFeatured === 'function') {
                window.unsubscribeFeatured();
            }
            console.log("Iniciando listener para 'config/featured'...");
            window.unsubscribeFeatured = onSnapshot(doc(db, 'config', 'featured'), (docSnap) => {
                console.log("Recebido snapshot de 'config/featured'.");
                // Pega a lista de IDs de destaque, ou um array vazio se não existir
                featuredItemIds = docSnap.exists() ? (docSnap.data().items || []) : [];
                console.log(`Itens em destaque atualizados: ${featuredItemIds.length > 0 ? featuredItemIds.join(', ') : 'Nenhum'}.`);
                // Re-renderiza a tela atual com base nos novos dados
                handleNavigation(); // O roteador decidirá o que renderizar
            }, (error) => {
                console.error("Erro ao escutar config/featured:", error);
                featuredItemIds = []; // Define como vazio em caso de erro
                handleNavigation(); // Renderiza mesmo assim
            });
        }, (error) => {
            console.error("Erro ao escutar coleção 'content':", error);
            firestoreContent = []; // Limpa em caso de erro
            handleNavigation(); // Tenta renderizar
        });
    }


    /**
     * Popula a tela inicial com carrosséis (adicionados recentemente, por gênero).
     */
    async function populateAllViews() {
        const carouselsContainer = document.getElementById('home-carousels-container');
        if (!carouselsContainer) return; // Sai se o container não existir
        carouselsContainer.innerHTML = ''; // Limpa o container

        if(firestoreContent.length === 0) {
            console.log("populateAllViews: firestoreContent vazio, não populando carrosséis.");
            carouselsContainer.innerHTML = '<p class="text-center text-gray-400">Carregando catálogo...</p>';
            return;
        }

        // Carrossel "Adicionado Recentemente"
        const recentlyAdded = [...firestoreContent]
            // Ordena por data de adição (mais recente primeiro)
            .sort((a, b) => (b.addedAt?.toMillis() || 0) - (a.addedAt?.toMillis() || 0))
            .slice(0, 20); // Pega os 20 mais recentes
        createCarousel(carouselsContainer, "Adicionado Recentemente", recentlyAdded);

        // Carrosséis por Gênero
        // Pega todos os gêneros únicos de todos os itens
        const allGenres = [...new Set(firestoreContent.flatMap(item => item.genres || []))];
        for (const genre of allGenres) {
            // Filtra os itens que contêm o gênero atual
            const filteredContent = firestoreContent.filter(item => item.genres && item.genres.includes(genre));
            // Cria um carrossel para o gênero
            createCarousel(carouselsContainer, genre, filteredContent);
        }
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

            // Muda o hash da URL. O listener 'popstate' cuidará da lógica de mostrar/esconder.
            if (window.location.hash !== `#${targetId}`) {
                window.location.hash = targetId;
            } else {
                // Se já estiver na página, força a renderização (útil se dados mudaram)
                handleNavigation();
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

        // Garante que mídia de outras seções pare
        if (screenId !== 'player-view') {
            if (!playerView.classList.contains('hidden')) {
                hidePlayer(false, false);
            }
        }
        if (screenId !== 'news-view') {
            stopNewsViewMedia();
        }

        // Lógica de renderização específica para cada tela
        if (screenId === 'home-view') {
            // Pega os itens em destaque e atualiza o hero
            const featuredItems = featuredItemIds.map(id => firestoreContent.find(item => item.docId === id)).filter(Boolean);
            if (featuredItems.length > 0) {
                updateHero(featuredItems[0]); // Mostra o primeiro item
                startHeroRotation(); // Inicia a rotação
            } else if (firestoreContent.length > 0) {
                // Fallback se não houver featured, mostra o mais recente
                const mostRecent = [...firestoreContent].sort((a, b) => (b.addedAt?.toMillis() || 0) - (a.addedAt?.toMillis() || 0))[0];
                if(mostRecent) updateHero(mostRecent); // Verifica se existe
            } else {
                // Se não há nem featured nem content, limpa o hero
                document.getElementById('hero-content-wrapper').style.opacity = 0;
            }
            populateAllViews(); // Popula os carrosséis da home
        } else if (screenId === 'series-view') {
            const grid = document.getElementById('series-grid');
            const series = firestoreContent.filter(item => item.type === 'tv'); // Filtra apenas séries
            grid.innerHTML = series.length > 0 ? series.map(createGridCard).join('') : '<p class="col-span-full text-center text-gray-400">Nenhuma série encontrada.</p>'; // Cria a grid de séries
        } else if (screenId === 'movies-view') {
            const grid = document.getElementById('movies-grid');
            const movies = firestoreContent.filter(item => item.type === 'movie'); // Filtra apenas filmes
            grid.innerHTML = movies.length > 0 ? movies.map(createGridCard).join('') : '<p class="col-span-full text-center text-gray-400">Nenhum filme encontrado.</p>'; // Cria a grid de filmes
        } else if (screenId === 'mylist-view') {
            populateMyList(); // Popula a grid da "Minha Lista"
        } else if (screenId === 'requests-view') {
            renderPendingRequests(); // Renderiza os pedidos pendentes
        } else if (screenId === 'news-view') { // Seção Novidades
            renderNewsView(); // Renderiza a seção
            listenForNewsLikes(); // (Re)inicia listener de likes
            // REMOVIDO: listenForNewsComments
        } else {
            // Se saiu de uma view que tinha listeners específicos (como novidades), para eles
            if (typeof unsubscribeNewsLikes === 'function') unsubscribeNewsLikes();
            // REMOVIDO: unsubscribeNewsComments
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
            detailsView.innerHTML = '<p class="text-center text-red-400 mt-20">Conteúdo não encontrado.</p>';
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
        const finalImageUrl = backgroundUrl && backgroundUrl.startsWith('http') ? backgroundUrl : 'https://placehold.co/1280x720/0c0a09/ffffff?text=Starlight';
        const posterUrl = data.poster && data.poster.startsWith('http') ? data.poster : 'https://placehold.co/500x750/1a1a1a/ffffff?text=Capa';

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
            } else {
                showToast("Link de vídeo não encontrado.", true);
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
        const seasonKeys = Object.keys(data.seasons || {}).sort((a, b) => parseInt(a) - parseInt(b)); // Adiciona || {}
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
                const allEpisodesOfSeason = data.seasons[seasonKey]?.episodes; // Adiciona ? para segurança

                if (!allEpisodesOfSeason || !allEpisodesOfSeason[episodeIndex]) {
                    showToast("Erro ao carregar dados do episódio.", true);
                    return;
                }

                const episode = allEpisodesOfSeason[episodeIndex]; // Pega os dados do episódio

                if (!episode.url) {
                    showToast("Link de vídeo para este episódio não encontrado.", true);
                    return;
                }


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
    function attachGlassButtonListeners() { document.querySelectorAll('.glass-button, .liquid-glass-card, .player-control-btn, .glass-container[style*="--bg-color"], .glass-form').forEach(element => { if (!element.hasGlassListener) { element.addEventListener('mousemove', handleMouseMove); element.addEventListener('mouseleave', handleMouseLeave); element.hasGlassListener = true; } }); } // 'hasGlassListener' evita adicionar múltiplos listeners
    /** Atualiza a posição e tamanho do indicador da navegação mobile */
    function updateMobileNavIndicator() { const indicator = document.getElementById('mobile-nav-indicator'); const activeItem = document.querySelector('#mobile-nav .mobile-nav-item.active'); if (indicator && activeItem) { const left = activeItem.offsetLeft; const width = activeItem.offsetWidth; indicator.style.width = `${width}px`; indicator.style.transform = `translateX(${left}px)`; } }
    /** Mostra ou esconde o overlay de busca */
    function toggleSearchOverlay(show) { if (show) { searchOverlay.classList.remove('hidden'); searchInput.focus(); document.body.style.overflow = 'hidden'; } else { searchOverlay.classList.add('hidden'); searchInput.value = ''; searchResultsContainer.innerHTML = ''; document.body.style.overflow = 'auto'; } }

    // -----------------------------------------------------------------
    // --- FUNÇÃO DE BUSCA CORRIGIDA ---
    // -----------------------------------------------------------------
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
    // -----------------------------------------------------------------
    // --- FIM DA CORREÇÃO ---
    // -----------------------------------------------------------------


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
            showToast("Erro ao carregar informações do vídeo.", true);
            return;
        }
        if (!context.videoUrl) {
            console.error("showPlayer called without videoUrl in context.");
            showToast("Link de vídeo não encontrado.", true);
            return;
        }


        // Define a chave com base se é filme ou episódio de série
        if (context.episodes && context.episodes[context.currentIndex]) { // É uma série e o episódio existe
            const episode = context.episodes[context.currentIndex];
            // Garante que season_number e episode_number existam para a chave
            const seasonNum = episode.season_number ?? 1; // Fallback para 1 se não definido
            const episodeNum = episode.episode_number ?? (context.currentIndex + 1); // Fallback para index+1
            key = `tv-${itemData.docId}-s${seasonNum}-e${episodeNum}`;
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
            console.warn("URL de vídeo inválida ou não processável:", urlToLoad, e);
            // Tenta usar a URL original mesmo assim
        }

        console.log("Tentando carregar URL:", urlToLoad);

        // Configura HLS.js se for um stream .m3u8 e o navegador suportar
        if (Hls.isSupported() && urlToLoad.includes('.m3u8')) {
            console.log("Usando HLS.js para:", urlToLoad);
            hls = new Hls({
                maxBufferLength: 30,       // Segundos de buffer
                maxBufferSize: 60 * 1000 * 1000, // 60MB de buffer
                startLevel: -1              // Começa na qualidade automática
            });
            hls.on(Hls.Events.ERROR, function (event, data) { // <-- ADICIONADO LISTENER DE ERRO
                console.error('HLS.js Error:', data);
                if (data.fatal) {
                    switch(data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            console.error("Erro fatal de rede ao carregar stream HLS");
                            hls.startLoad(); // Tenta recarregar
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            console.error("Erro fatal de mídia");
                            hls.recoverMediaError(); // Tenta recuperar
                            break;
                        default:
                            showToast("Erro ao carregar o vídeo (HLS).", true);
                            hls.destroy(); // Destroi se não souber recuperar
                            break;
                    }
                }
            });

            hls.loadSource(urlToLoad); // Carrega a fonte
            hls.attachMedia(videoPlayer); // Anexa ao elemento <video>
            hls.on(Hls.Events.MANIFEST_PARSED, () => { // Quando o manifesto HLS for carregado
                console.log("Manifesto HLS carregado.");
                // Se houver um tempo inicial definido (ex: continuar assistindo), pula para ele
                if (context.startTime && context.startTime > 5) { // Só pula se for maior que 5s
                    console.log("Pulando para tempo salvo:", context.startTime);
                    videoPlayer.currentTime = context.startTime;
                }
                videoPlayer.play().catch(e => console.error("Erro ao tentar reproduzir o vídeo HLS:", e)); // Tenta iniciar a reprodução
            });
        } else { // Se não for HLS ou não for suportado, usa a tag <video> nativa
            console.log("Usando player nativo para:", urlToLoad);
            videoPlayer.src = urlToLoad; // Define a fonte do vídeo
            videoPlayer.addEventListener('loadedmetadata', () => { // Quando os metadados do vídeo carregarem
                console.log("Metadados do vídeo nativo carregados.");
                if (context.startTime && context.startTime > 5) {
                    console.log("Pulando para tempo salvo:", context.startTime);
                    videoPlayer.currentTime = context.startTime; // Pula se necessário
                }
                videoPlayer.play().catch(e => console.error("Erro ao tentar reproduzir o vídeo:", e)); // Tenta iniciar
            }, { once: true }); // Executa este listener apenas uma vez
            videoPlayer.addEventListener('error', (e) => { // Adiciona listener de erro nativo
                console.error("Erro no elemento <video>:", e, videoPlayer.error);
                showToast("Erro ao carregar o vídeo.", true);
            });
        }

        // 2. Lógica de orientação e tela cheia para mobile
        if (window.innerWidth < 768) { // Se for tela pequena (considerado mobile)
            if (!document.fullscreenElement) { // Só tenta entrar em fullscreen se já não estiver
                try {
                    await playerView.requestFullscreen();
                } catch (err) {
                    console.error("Não foi possível ativar tela cheia:", err);
                }
            }
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
            // Desabilita botões se no início/fim da lista
            prevEpisodeBtn.disabled = context.currentIndex === 0;
            nextEpisodeBtn.disabled = context.currentIndex === context.episodes.length - 1;
        } else {
            nextEpisodeBtn.classList.add('hidden');
            prevEpisodeBtn.classList.add('hidden');
        }

        attachGlassButtonListeners(); // Reatacha listeners visuais
    }

    /**
     * Esconde o player de vídeo e limpa seu estado.
     * @param {boolean} [updateHistory=true] - Se true, salva o progresso.
     * @param {boolean} [isChangingEpisode=false] - Se true, não desbloqueia a orientação (mobile).
     */
    async function hidePlayer(updateHistory = true, isChangingEpisode = false) {
        console.log(`hidePlayer chamado com updateHistory=${updateHistory}, isChangingEpisode=${isChangingEpisode}`);

        // Salva o progresso se updateHistory for true e houver um contexto válido e tempo > 0
        if (updateHistory && currentPlayerContext.key && videoPlayer.currentTime > 0) {
            console.log("Salvando progresso antes de fechar...");
            await savePlayerProgress();
        }

        videoPlayer.pause(); // Pausa o vídeo

        // Destrói a instância do HLS.js se existir
        if (hls) {
            console.log("Destruindo instância HLS...");
            hls.destroy();
            hls = null;
        }
        // Remove o atributo 'src' e chama 'load()' para parar completamente o download do vídeo
        console.log("Resetando src e carregando vídeo vazio...");
        videoPlayer.removeAttribute('src');
        videoPlayer.removeEventListener('error', null); // Remove listener de erro genérico se existir
        videoPlayer.load(); // Importante para parar downloads pendentes

        playerView.classList.add('hidden'); // Esconde a view do player
        // Só restaura o scroll se o player de novidades também não estiver ativo
        if (newsPlayerView.classList.contains('hidden')) {
            document.body.style.overflow = 'auto'; // Restaura a rolagem do body
        }
        console.log("Limpando contexto do player.");
        currentPlayerContext = {}; // Limpa o contexto do player

        // Sai da tela cheia e desbloqueia a orientação, a menos que esteja trocando de episódio
        if (!isChangingEpisode) {
            console.log("Não está trocando de episódio, tentando sair do fullscreen e desbloquear orientação...");
            if (document.fullscreenElement) {
                try {
                    await document.exitFullscreen();
                    console.log("Saída da tela cheia bem-sucedida.");
                } catch (err) {
                    console.error("Erro ao sair da tela cheia:", err);
                }
            }
            if (screen.orientation && typeof screen.orientation.unlock === 'function') {
                try {
                    screen.orientation.unlock(); // Desbloqueia a orientação da tela
                    console.log("Orientação desbloqueada.");
                } catch (err) {
                    console.error("Erro ao desbloquear orientação:", err);
                }
            }
        } else {
             console.log("Está trocando de episódio, mantendo orientação bloqueada.");
        }


        // Reseta o aspect ratio para o padrão
        videoPlayer.style.objectFit = 'contain';
        currentAspectRatio = 'contain';
        if (aspectRatioBtn) aspectRatioBtn.querySelector('.glass-content').innerHTML = ICONS.aspectContain;

        // Reseta a barra de progresso e tempos
        seekBar.value = 0;
        seekProgressBar.style.width = '0%';
        currentTimeEl.textContent = '00:00';
        durationEl.textContent = '00:00';
        playPauseBtn.querySelector('.glass-content').innerHTML = ICONS.play; // Garante ícone de play


        // O roteador (`handleNavigation`) cuidará do history.back() ou popstate se necessário.
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
        clearTimeout(controlsTimeout); // Limpa qualquer timeout anterior ao detectar um toque

        if (!playerView.classList.contains('controls-active')) {
            // Se controles escondidos -> PRIMEIRO TOQUE: Apenas MOSTRA os controles
            playerView.classList.add('controls-active');
            // Define novo timeout para esconder controles após 3s (somente se estiver tocando)
            if (!videoPlayer.paused) {
                controlsTimeout = setTimeout(() => {
                    playerView.classList.remove('controls-active');
                }, 3000);
            }
        } else {
            // Se controles visíveis -> SEGUNDO TOQUE: PAUSA/RETOMA o vídeo
            togglePlay(); // A função togglePlay já lida com play/pause
            // O listener 'play'/'pause' no addPlayerEventListeners vai gerenciar o timeout
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
        // Remove listeners antigos para evitar duplicidade
        videoPlayer.removeEventListener('click', handlePlayerClick);
        videoPlayer.removeEventListener('click', handleMobilePlayerClick);
        videoPlayer.removeEventListener('play', handlePlayEvent);
        videoPlayer.removeEventListener('pause', handlePauseEvent);
        videoPlayer.removeEventListener('ended', handleEndedEvent);
        videoPlayer.removeEventListener('timeupdate', handleTimeUpdateEvent);
        videoPlayer.removeEventListener('loadedmetadata', handleLoadedMetadataEvent);
        videoPlayer.removeEventListener('volumechange', handleVolumeChangeEvent);

        // Adiciona novos listeners
        const isMobile = window.innerWidth < 768;
        if (isMobile) {
            videoPlayer.addEventListener('click', handleMobilePlayerClick);
        } else {
            videoPlayer.addEventListener('click', handlePlayerClick);
        }
        videoPlayer.addEventListener('play', handlePlayEvent);
        videoPlayer.addEventListener('pause', handlePauseEvent);
        videoPlayer.addEventListener('ended', handleEndedEvent);
        videoPlayer.addEventListener('timeupdate', handleTimeUpdateEvent);
        videoPlayer.addEventListener('loadedmetadata', handleLoadedMetadataEvent);
        videoPlayer.addEventListener('volumechange', handleVolumeChangeEvent);
    }

    // Funções de handler separadas para os listeners do player
    function handlePlayEvent() {
        playPauseBtn.querySelector('.glass-content').innerHTML = ICONS.pause;
        clearTimeout(controlsTimeout);
        if (playerView.classList.contains('controls-active')) {
            controlsTimeout = setTimeout(() => {
                playerView.classList.remove('controls-active');
            }, 3000);
        }
    }

    function handlePauseEvent() {
        playPauseBtn.querySelector('.glass-content').innerHTML = ICONS.play;
        clearTimeout(controlsTimeout);
        if (!videoPlayer.ended) {
            playerView.classList.add('controls-active');
        }
    }

    function handleEndedEvent() {
        console.log("Vídeo terminou.");
        if (currentPlayerContext.episodes && currentPlayerContext.currentIndex < currentPlayerContext.episodes.length - 1) {
            console.log("Passando para o próximo episódio...");
            changeEpisode(1);
        } else {
            console.log("Fim da série ou filme único.");
            playPauseBtn.querySelector('.glass-content').innerHTML = ICONS.play;
            playerView.classList.add('controls-active');
            clearTimeout(controlsTimeout);
            // Salva o progresso final como concluído (ou quase)
            if (videoPlayer.duration > 0) {
                videoPlayer.currentTime = videoPlayer.duration - 1; // Marca como quase concluído
                savePlayerProgress();
            }
        }
    }

    function handleTimeUpdateEvent() {
        if (isNaN(videoPlayer.currentTime) || isNaN(videoPlayer.duration)) return; // Ignora se NaN
        seekBar.value = videoPlayer.currentTime;
        if (videoPlayer.duration > 0) { // Evita divisão por zero
            const progressPercent = (videoPlayer.currentTime / videoPlayer.duration) * 100;
            seekProgressBar.style.width = `${progressPercent}%`;
        } else {
            seekProgressBar.style.width = '0%';
        }
        currentTimeEl.textContent = formatTime(videoPlayer.currentTime);

        const now = Date.now();
        if (now - lastProgressSaveTime > 5000) { // Salva a cada 5 segundos
            savePlayerProgress();
            lastProgressSaveTime = now;
        }
    }

    function handleLoadedMetadataEvent() {
        if (isNaN(videoPlayer.duration) || videoPlayer.duration <= 0) {
            console.warn("Metadados carregados, mas duração inválida:", videoPlayer.duration);
            durationEl.textContent = '00:00';
            seekBar.max = 0; // Define max como 0 se a duração for inválida
            return;
        }
        seekBar.max = videoPlayer.duration;
        durationEl.textContent = formatTime(videoPlayer.duration);
    }

    function handleVolumeChangeEvent() {
        volumeSlider.value = videoPlayer.volume;
        volumeBtn.querySelector('.glass-content').innerHTML = (videoPlayer.muted || videoPlayer.volume === 0) ? ICONS.volumeMute : ICONS.volumeHigh;
    }


    // --- Listeners dos Controles do Player ---
    seekBar.addEventListener('input', () => { if(!isNaN(seekBar.value) && videoPlayer.duration > 0) videoPlayer.currentTime = seekBar.value; }); // Pular ao arrastar barra
    volumeSlider.addEventListener('input', (e) => { videoPlayer.volume = e.target.value; videoPlayer.muted = e.target.value == 0; }); // Ajustar volume
    volumeBtn.addEventListener('click', () => { videoPlayer.muted = !videoPlayer.muted; }); // Mutar/Desmutar
    rewindBtn.addEventListener('click', () => { if(!isNaN(videoPlayer.currentTime)) videoPlayer.currentTime = Math.max(0, videoPlayer.currentTime - 10); }); // Voltar 10s (com limite 0)
    forwardBtn.addEventListener('click', () => { if(!isNaN(videoPlayer.currentTime) && videoPlayer.duration > 0) videoPlayer.currentTime = Math.min(videoPlayer.duration, videoPlayer.currentTime + 10); }); // Avançar 10s (com limite duração)

    // Listener do botão de Aspect Ratio
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
            if (!episode.url) { // Verifica se o próximo episódio tem URL
                showToast(`Erro: Link de vídeo não encontrado para o ${direction > 0 ? 'próximo' : 'anterior'} episódio.`, true);
                console.error("Link de vídeo ausente para o episódio:", episode);
                // Mantém o player no episódio atual, mas pausa
                videoPlayer.pause();
                playPauseBtn.querySelector('.glass-content').innerHTML = ICONS.play;
                playerView.classList.add('controls-active');
                clearTimeout(controlsTimeout);
                return;
            }
            // Cria novo contexto com índice atualizado e novo título
            const newContext = {
                ...currentPlayerContext,
                currentIndex: newIndex,
                title: `${currentPlayerContext.itemData.name} - T${episode.season_number || '?'} E${episode.episode_number || newIndex + 1}`,
                videoUrl: episode.url, // IMPORTANTE: Atualizar a URL do vídeo
                startTime: 0 // Começa do início
            };
            showPlayer(newContext); // Mostra o player com o novo episódio
        } else {
            console.log("Não há mais episódios nessa direção.");
            // Poderia mostrar uma mensagem ou fechar o player
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

        // Se saiu da tela cheia E o player ainda deveria estar visível E não estamos trocando de episódio
        // (A verificação do currentPlayerContext ajuda a evitar voltar se o player foi fechado por outro motivo)
        // **CORREÇÃO MOBILE:** Não desbloquear orientação aqui se saiu do fullscreen via ESC,
        // pois o usuário pode querer continuar assistindo sem estar em fullscreen mas ainda em landscape.
        // A orientação será desbloqueada apenas quando o player for fechado (hidePlayer).
        /*
        if (!isFullscreen && !playerView.classList.contains('hidden') && currentPlayerContext.key) {
            if (screen.orientation && typeof screen.orientation.unlock === 'function') {
                 screen.orientation.unlock(); // REMOVIDO DAQUI
            }
        }
        */
    });


    // Listener botão play/pause principal
    playPauseBtn.addEventListener('click', togglePlay);
    // Listener botão voltar do player
    playerBackBtn.addEventListener('click', () => history.back()); // Usa histórico do navegador

    // Listener para mostrar controles ao mover o mouse sobre o player (desktop)
    playerView.addEventListener('mousemove', () => {
        if (window.innerWidth >= 768) { // Apenas Desktop
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
        const openSeasonSelectPanel = document.querySelector('#season-options:not(.hidden)');
        if (openSeasonSelectPanel && !openSeasonSelectPanel.closest('.custom-select-container').contains(e.target)) {
            document.getElementById('season-selector-button')?.click(); // Simula clique no botão para fechar
        }

        // REMOVIDO: Fechar modal de comentários
    });

    /** Cria as opções no painel de configurações do player (velocidade, qualidade) */
    function createSettingsOptions() {
        const speedContainer = document.getElementById('settings-speed-options');
        const qualityContainer = document.getElementById('settings-quality-options');
        // Só cria se ainda não existirem (evita duplicação)
        if (speedContainer.childElementCount > 1) return;

        // Limpa containers antes de adicionar (garantia extra)
        speedContainer.innerHTML = '<h4 class="text-xs text-gray-300 px-3 pt-1 pb-2">Velocidade</h4>';
        qualityContainer.innerHTML = '<h4 class="text-xs text-gray-300 px-3 pt-1 pb-2">Qualidade</h4>';


        // Opções de velocidade
        const speeds = [0.5, 1, 1.5, 2];
        speeds.forEach(speed => {
            const button = document.createElement('button');
            button.className = 'settings-option-btn w-full text-left p-2 rounded hover:bg-white/10 text-sm';
            button.textContent = `${speed}x`;
            if (speed === 1) button.classList.add('active', 'bg-white/5', 'font-semibold'); // Marca 1x como padrão
            button.onclick = () => { // Ao clicar
                videoPlayer.playbackRate = speed; // Muda velocidade do vídeo
                // Atualiza qual botão está ativo
                speedContainer.querySelectorAll('button').forEach(btn => btn.classList.remove('active', 'bg-white/5', 'font-semibold'));
                button.classList.add('active', 'bg-white/5', 'font-semibold');
            };
            speedContainer.appendChild(button);
        });

        // Opções de qualidade (Placeholder - HLS.js pode gerenciar isso dinamicamente se necessário)
        // A lógica atual usa qualidade automática (startLevel: -1)
        // Se precisar de troca manual, a lógica seria mais complexa, envolvendo hls.levels e hls.currentLevel
        const qualities = ["Auto"];
        qualities.forEach(quality => {
            const button = document.createElement('button');
            button.className = 'settings-option-btn w-full text-left p-2 rounded hover:bg-white/10 text-sm';
            button.textContent = quality;
            if (quality === "Auto") button.classList.add('active', 'bg-white/5', 'font-semibold'); // Marca Auto como padrão
            button.onclick = () => { // Ao clicar (ação placeholder)
                qualityContainer.querySelectorAll('button').forEach(btn => btn.classList.remove('active', 'bg-white/5', 'font-semibold'));
                button.classList.add('active', 'bg-white/5', 'font-semibold');
                console.log(`Qualidade definida para ${quality}. (HLS gerencia automaticamente)`);
                // NOTA: Troca manual de qualidade com HLS.js: hls.currentLevel = levelIndex;
            };
            qualityContainer.appendChild(button);
        });
    }


    // Listener para o botão "Assistir" na seção hero
    document.getElementById('hero-watch-btn').addEventListener('click', () => {
        if (!currentHeroItem) return; // Sai se não houver item no hero
        if (!currentHeroItem.url) {
            showToast("Link de vídeo não encontrado para este item.", true);
            return;
        }
        // Pega a URL do item no Firestore e inicia o player
        showPlayer({
            videoUrl: currentHeroItem.url, // Usa a URL do item do Firestore
            title: currentHeroItem.title || currentHeroItem.name,
            itemData: currentHeroItem
        });
    });

    /** Inicializa a UI do player (define ícones iniciais, adiciona listeners) */
    function initializeUI() {
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
        aspectRatioBtn.querySelector('.glass-content').innerHTML = ICONS.aspectContain;
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
            performSearch(searchInput.value);
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
        console.log(`[handleNavigation] Navegando para: ${window.location.hash}, UserID: ${userId}, CurrentProfile: ${currentProfile?.id}`);
        const hash = window.location.hash; // Pega o hash atual (ex: #home-view, #details/123)
        const previousHash = sessionStorage.getItem('starlight-previousHash') || '#home-view'; // Pega hash anterior

        // --- Rota de Autenticação ---
        if (!userId) { // Se o usuário NÃO está logado
            console.log("[handleNavigation] Usuário não logado, redirecionando para #login-view");
            if (hash !== '#login-view') {
                history.replaceState(null, '', '#login-view');
            }
            showLoginScreen();
            sessionStorage.setItem('starlight-previousHash', '#login-view'); // Atualiza hash anterior
            return;
        }

        // --- Rota de Seleção de Perfil ---
        if (!currentProfile) { // Se o usuário está logado, MAS NENHUM perfil foi selecionado
            console.log("[handleNavigation] Usuário logado, mas sem perfil selecionado.");
            const lastProfileId = localStorage.getItem(`starlight-lastProfile-${userId}`);
            let autoSelectedProfile = false;
            if (lastProfileId) {
                console.log("[handleNavigation] Tentando carregar último perfil:", lastProfileId);
                if (!profiles || profiles.length === 0) {
                    console.log("[handleNavigation] Carregando perfis...");
                    await loadProfiles();
                }
                const foundProfile = profiles.find(p => p.id === lastProfileId);
                if (foundProfile) {
                    console.log("[handleNavigation] Último perfil encontrado, selecionando:", foundProfile.id);
                    await selectAndEnterProfile(foundProfile); // selectAndEnterProfile chama handleNavigation de novo implicitamente via hash change
                    autoSelectedProfile = true;
                    // Não precisa mais nada aqui, selectAndEnterProfile já tratou a navegação
                    sessionStorage.setItem('starlight-previousHash', window.location.hash); // Atualiza hash anterior
                    return; // Importante retornar para evitar execução duplicada
                } else {
                    console.log("[handleNavigation] Último perfil salvo não encontrado, limpando localStorage.");
                    localStorage.removeItem(`starlight-lastProfile-${userId}`);
                }
            }
            if (!autoSelectedProfile) {
                console.log("[handleNavigation] Nenhum perfil autoselecionado, mostrando tela de seleção.");
                if (hash !== '#manage-profile-view') {
                    history.replaceState(null, '', '#manage-profile-view');
                }
                showProfileScreen();
                sessionStorage.setItem('starlight-previousHash', '#manage-profile-view'); // Atualiza hash anterior
                return;
            }
        }

        // --- Roteamento do Aplicativo (Usuário Logado e com Perfil Selecionado) ---
        console.log("[handleNavigation] Usuário logado e com perfil selecionado.");

        // Garante que overlays especiais sejam fechados
        if (!searchOverlay.classList.contains('hidden')) {
            toggleSearchOverlay(false);
        }

        // Esconde header/footer para views especiais
        const isSpecialView = hash.startsWith('#details/') || hash === '#player';
        document.querySelector('header').classList.toggle('hidden', isSpecialView || !currentProfile); // Esconde também se não tiver perfil
        document.querySelector('footer').classList.toggle('hidden', isSpecialView || !currentProfile); // Esconde também se não tiver perfil


        // Garante que views especiais sejam escondidas ao navegar para views normais
        if (!hash.startsWith('#details/')) detailsView.classList.add('hidden');

        // *** CORREÇÃO PLAYER NAVIGATION: Chama hidePlayer adequadamente ***
        if (hash !== '#player' && !playerView.classList.contains('hidden')) {
             console.log("[handleNavigation] Hash mudou de #player, chamando hidePlayer(true).");
             // 'true' para salvar progresso, 'false' para isChangingEpisode
             await hidePlayer(true, false); // Aguarda hidePlayer concluir (async)
        }


        // Para mídia de novidades se saiu dessa view
        if (previousHash === '#news-view' && hash !== '#news-view') {
            stopNewsViewMedia();
        }

        // Esconde todas as views principais
        document.querySelectorAll('#view-container > .content-view').forEach(view => view.classList.add('hidden'));

        // --- Lógica de Roteamento ---
        let targetId = 'home-view'; // Default
        let targetView = null;

        if (hash.startsWith('#details/')) {
            const docId = hash.split('/')[1];
            if (docId) {
                console.log("[handleNavigation] Rota: #details/", docId);
                targetId = 'details-view'; // Marcamos que é a view de detalhes
                showDetailsView({ docId }); // Mostra e renderiza
                targetView = detailsView; // detailsView já está visível
            } else {
                console.log("[handleNavigation] Rota: #details/ inválida, redirecionando para #home-view");
                history.replaceState(null, '', '#home-view'); // Hash inválido, volta pra home
                hash = '#home-view'; // Atualiza hash local para cair no else
                targetId = 'home-view'; // Define targetId para o fallback
            }
        }

        if (targetId !== 'details-view') { // Se não for detalhes (já tratado acima)
            if (hash === '#player') {
                console.log("[handleNavigation] Rota: #player");
                targetId = 'player-view';
                // O player é tratado por showPlayer(), não fazemos nada aqui exceto marcar targetId
                if (playerView.classList.contains('hidden')) {
                    // Se recarregou em #player ou tentou navegar direto, volta para o hash anterior
                    console.log("[handleNavigation] Tentativa de acesso direto a #player, voltando...");
                    const fallbackHash = previousHash !== '#player' ? previousHash : '#home-view';
                    history.replaceState(null, '', fallbackHash); // Volta para o anterior (ou home)
                    handleNavigation(); // Chama de novo para carregar a view correta
                    return; // Interrompe
                }
                targetView = playerView; // Marca a view ativa
            } else {
                targetId = hash.substring(1) || 'home-view'; // Pega ID da view normal
                console.log(`[handleNavigation] Rota normal: #${targetId}`);
                targetView = document.getElementById(targetId);

                if (targetView && targetView.classList.contains('content-view')) {
                    console.log(`[handleNavigation] Mostrando view: ${targetId}`);
                    targetView.classList.remove('hidden'); // Mostra a view correta
                    renderScreenContent(targetId); // Renderiza conteúdo
                } else { // Fallback para home se view inválida
                    console.log(`[handleNavigation] View #${targetId} inválida, redirecionando para #home-view`);
                    targetId = 'home-view';
                    targetView = document.getElementById(targetId);
                    if (targetView) { // Garante que a home existe
                        targetView.classList.remove('hidden');
                        renderScreenContent(targetId);
                    }
                    if (window.location.hash !== `#${targetId}`) {
                        history.replaceState(null, '', `#${targetId}`);
                    }
                }
            }
        }


        // --- Atualiza UI de Navegação ---
        document.querySelectorAll('.nav-item, .mobile-nav-item').forEach(l => l.classList.remove('active'));
        // Usa targetId que foi validado
        document.querySelectorAll(`[data-target="${targetId}"]`).forEach(l => l.classList.add('active'));
        updateMobileNavIndicator();

        // --- Atualiza Background e Rotação do Hero ---
        document.getElementById('main-background').style.opacity = (targetId === 'home-view' && currentHeroItem) ? 1 : 0;
        if (targetId !== 'home-view' && heroCarouselInterval) {
            clearInterval(heroCarouselInterval);
            heroCarouselInterval = null;
        }

        // Atualiza hash anterior para a próxima navegação
        sessionStorage.setItem('starlight-previousHash', `#${targetId}`);
        console.log(`[handleNavigation] Navegação para #${targetId} concluída.`);
    }


    // Adiciona os listeners de navegação do navegador
    window.addEventListener('popstate', handleNavigation);

    // --- Lógica de Notificações ---
    function listenForNotifications() {
        if (!userId) return; // Não escuta se não estiver logado
        console.log("Iniciando listener de notificações...");
        const q = query(collection(db, "notifications"), orderBy("createdAt", "desc"));
        // Garante que o listener antigo seja parado
        if (typeof window.unsubscribeNotifications === 'function') {
            window.unsubscribeNotifications();
        }
        window.unsubscribeNotifications = onSnapshot(q, (snapshot) => {
            console.log("Recebido snapshot de notificações.");
            notifications = [];
            snapshot.forEach((doc) => {
                notifications.push({ id: doc.id, ...doc.data() });
            });
            updateNotificationBell();
            // Re-renderiza se o painel estiver aberto
            if (!notificationPanel.classList.contains('hidden')) {
                renderNotifications();
            }
        }, (error) => {
            console.error("Erro ao escutar notificações:", error);
        });
    }

    function updateNotificationBell() {
        const hasNew = notifications.some(n => {
            const notifTime = n.createdAt ? (n.createdAt.toMillis ? n.createdAt.toMillis() : new Date(n.createdAt).getTime()) : 0;
            const isNew = notifTime > lastNotificationCheck;
            const isDismissed = n.type === 'Novidade' && dismissedNotifications.includes(n.id);
            return isNew && !isDismissed;
        });
        notificationBtn.classList.toggle('has-new', hasNew);
    }

    function renderNotifications() {
        const avisosContainer = document.getElementById('notifications-avisos');
        const novidadesContainer = document.getElementById('notifications-novidades');
        if (!avisosContainer || !novidadesContainer) return; // Adiciona verificação

        const avisos = notifications.filter(n => n.type === 'Aviso');
        const novidades = notifications.filter(n => n.type === 'Novidade' && !dismissedNotifications.includes(n.id));

        const createNotifHTML = (notif, isDismissable) => {
            const dismissBtn = isDismissable ? `<button class="remove-notification-btn text-stone-500 hover:text-white ml-2" data-notif-id="${notif.id}"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>` : '';
            const linkDataAttrs = notif.link
                ? `data-link-type="${notif.link.type}" data-link-target="${notif.link.type === 'internal' && notif.link.docId ? `#details/${notif.link.docId}` : (notif.link.url || '')}"` // CORRIGIDO: Usa #details/ para link interno
                : '';
            const cursorClass = notif.link ? 'cursor-pointer' : '';

            return `
                <div class="notification-item flex items-start justify-between gap-2 p-2 rounded-md transition-colors hover:bg-white/5 ${cursorClass}" ${linkDataAttrs}>
                    <div class="flex-grow">
                        <p class="font-bold text-white">${notif.title}</p>
                        <p class="text-stone-300 text-sm notification-message">${notif.message}</p>
                    </div>
                    ${dismissBtn}
                </div>`;
        };

        avisosContainer.innerHTML = avisos.length > 0 ? avisos.map(n => createNotifHTML(n, false)).join('') : '<p class="text-stone-400 text-center p-4">Nenhum aviso.</p>';
        novidadesContainer.innerHTML = novidades.length > 0 ? novidades.map(n => createNotifHTML(n, true)).join('') : '<p class="text-stone-400 text-center p-4">Nenhuma novidade.</p>';
    }

    // Listener para o painel de notificações
    notificationPanel.addEventListener('click', (e) => {
        const tab = e.target.closest('.notification-tab');
        if (tab) {
            notificationPanel.querySelectorAll('.notification-tab').forEach(t => t.classList.remove('active'));
            notificationPanel.querySelectorAll('.notification-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            const targetContent = document.getElementById(`notifications-${tab.dataset.tab}`);
            if (targetContent) targetContent.classList.add('active');
            return;
        }

        const removeBtn = e.target.closest('.remove-notification-btn');
        if (removeBtn) {
            const notifId = removeBtn.dataset.notifId;
            if (!dismissedNotifications.includes(notifId)) {
                dismissedNotifications.push(notifId);
                localStorage.setItem('starlight-dismissedNotifications', JSON.stringify(dismissedNotifications));
                updateNotificationBell();
            }
            removeBtn.closest('.notification-item')?.remove(); // Usa optional chaining
            // Verifica se a lista de novidades ficou vazia após remover
            const novidadesContainer = document.getElementById('notifications-novidades');
            if (novidadesContainer && novidadesContainer.children.length === 0) {
                novidadesContainer.innerHTML = '<p class="text-stone-400 text-center p-4">Nenhuma novidade.</p>';
            }
            return;
        }

        const notificationItem = e.target.closest('.notification-item[data-link-type]');
        if (notificationItem) {
            const linkType = notificationItem.dataset.linkType;
            const linkTarget = notificationItem.dataset.linkTarget;

            // Fecha o painel
            notificationPanel.classList.remove('animate-fade-in-down');
            notificationPanel.classList.add('animate-fade-out-up');
            setTimeout(() => notificationPanel.classList.add('hidden'), 250);

            if (linkType === 'internal' && linkTarget && linkTarget.startsWith('#details/')) { // CORRIGIDO: Verifica formato do link interno
                window.location.hash = linkTarget;
            } else if (linkType === 'external' && linkTarget) {
                window.open(linkTarget, '_blank');
            }
        }
    });


    // --- Lógica de Novidades ---
    function listenForNewsItems() {
        if (!userId) return; // Não escuta se não estiver logado
        console.log("Iniciando listener de novidades...");
        const q = query(collection(db, "news"), orderBy("createdAt", "desc"));
        // Garante que o listener antigo seja removido se existir
        if (typeof window.unsubscribeNewsItems === 'function') {
            window.unsubscribeNewsItems();
        }
        window.unsubscribeNewsItems = onSnapshot(q, (snapshot) => { // Armazena o unsubscriber globalmente
            console.log("Recebido snapshot de novidades.");
            newsItems = [];
            snapshot.forEach((doc) => {
                newsItems.push({ id: doc.id, ...doc.data() });
            });
            console.log(`Cache de novidades atualizado com ${newsItems.length} itens.`);
            if (window.location.hash === '#news-view') {
                renderNewsView();
            }
        }, (error) => {
            console.error("Erro ao escutar novidades: ", error);
            if (window.location.hash === '#news-view') {
                const container = document.getElementById('news-items-container');
                if(container) container.innerHTML = '<p class="text-red-400 text-center py-10">Erro ao carregar novidades.</p>';
            }
        });
    }


    // Escuta por mudanças nos likes
    function listenForNewsLikes() {
        if (!userId) return; // Não escuta se não estiver logado
        console.log("Iniciando listener de likes de novidades...");
        if (typeof unsubscribeNewsLikes === 'function') unsubscribeNewsLikes();
        const q = query(collection(db, "news")); // Escuta a coleção inteira
        unsubscribeNewsLikes = onSnapshot(q, (snapshot) => {
            let changed = false;
            console.log("Recebido snapshot de likes (docChanges).");
            snapshot.docChanges().forEach((change) => { // Ouve apenas as mudanças
                if (change.type === "added" || change.type === "modified") {
                    const data = change.doc.data();
                    newsLikes.set(change.doc.id, new Set(data.likedBy || []));
                    changed = true;
                } else if (change.type === "removed") {
                    newsLikes.delete(change.doc.id);
                    changed = true;
                }
            });

            if (changed && window.location.hash === '#news-view') {
                console.log("Likes alterados, atualizando UI de novidades.");
                updateNewsItemsUI(); // Atualiza apenas a UI se houver mudanças
            } else if (changed) {
                console.log("Likes alterados, mas não na view de novidades.");
            }
        }, (error) => {
            console.error("Erro ao escutar likes de novidades:", error);
        });
    }

    // REMOVIDO: listenForNewsComments

    // Atualiza apenas os contadores e estado dos botões na UI de Novidades
    function updateNewsItemsUI() {
        const container = document.getElementById('news-items-container');
        if (!container) return;

        container.querySelectorAll('.news-item-card').forEach(card => {
            const newsId = card.dataset.newsId;
            const likeButton = card.querySelector('.like-button');
            const likeButtonContent = likeButton?.querySelector('.glass-content'); // Pega o content div
            const likeCountSpan = card.querySelector('.like-count');
            // REMOVIDO: commentCountSpan
            // REMOVIDO: commentButton

            // Verifica se todos os elementos necessários existem (exceto comentários)
            if (!newsId || !likeButton || !likeButtonContent || !likeCountSpan ) return;


            // Atualiza Likes
            const likesSet = newsLikes.get(newsId) || new Set();
            const likeCount = likesSet.size;
            const userLiked = currentProfile && likesSet.has(currentProfile.id);

            // Garante que likeCountSpan exista antes de definir textContent
            if (likeCountSpan) likeCountSpan.textContent = likeCount;

            // Atualiza o conteúdo HTML do botão de like (ícone + contagem)
            likeButtonContent.innerHTML = `
                 ${userLiked ? ICONS.heartFilled : ICONS.heartOutline}
                 <span class="like-count">${likeCount}</span>
            `;
            likeButton.classList.toggle('text-red-500', userLiked);
            likeButton.classList.toggle('text-slate-400', !userLiked);

            // REMOVIDO: Atualiza Comentários
        });
        // Garante que lucide icons sejam recriados após mudança de SVG
        lucide.createIcons();
        attachGlassButtonListeners(); // Reatacha listeners para glass effect nos botões atualizados
    }



    function renderNewsView() {
        const container = document.getElementById('news-items-container');
        if (!container) return;

        if (newsItems.length === 0) {
            container.innerHTML = '<p class="text-slate-400 text-center py-10">Nenhuma novidade publicada ainda.</p>';
            return;
        }

        container.innerHTML = newsItems.map(item => createNewsItemCard(item)).join('');
        lucide.createIcons();
        attachGlassButtonListeners(); // Renomeado para clareza
        updateNewsItemsUI(); // Aplica estado inicial de likes

    }

    // Função auxiliar para inicializar efeitos de vidro
    function initializeGlassEffects() {
        attachGlassButtonListeners();
    }

    function createNewsItemCard(item) {
        const date = item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Data indisponível';
        let contentHTML = '';
        let typeClass = '';
        const uniqueId = `iframe-${item.id}-${Math.random().toString(36).substring(7)}`; // ID único para iframe e overlay

        switch (item.type) {
            case 'text':
                contentHTML = `<p class="text-slate-300 mt-2 whitespace-pre-wrap">${item.content}</p>`;
                typeClass = 'news-item-text';
                break;
            case 'image':
                contentHTML = `<img src="${item.content}" alt="${item.title || 'Imagem da novidade'}" class="mt-3 rounded-lg max-w-full h-auto shadow-lg">`;
                typeClass = 'news-item-image';
                break;
            case 'video': // Para iframes (YouTube, etc.)
                const isYoutube = item.content.includes('youtube.com/embed') || item.content.includes('youtu.be');
                const aspectClass = isYoutube ? 'aspect-video' : '';
                // Adiciona overlay e botão play para evitar autoplay indesejado
                contentHTML = `
                    <div class="relative ${aspectClass} mt-3 group news-iframe-container rounded-lg overflow-hidden shadow-lg bg-black" data-iframe-src="${item.content}">
                        <div id="overlay-${uniqueId}" class="absolute inset-0 flex items-center justify-center cursor-pointer z-10 bg-black/50 hover:bg-black/70 transition-colors news-iframe-play-overlay">
                             <i data-lucide="play-circle" class="w-16 h-16 text-white opacity-80 group-hover:opacity-100 transition-opacity"></i>
                        </div>
                        <div id="iframe-wrapper-${uniqueId}" class="w-full h-full ${isYoutube ? '' : 'min-h-[300px]'}">
                             <!-- Iframe será inserido aqui pelo JS ao clicar -->
                        </div>
                    </div>`;
                typeClass = 'news-item-video';
                break;
            case 'video_direct': // Para URLs de vídeo diretas
                contentHTML = `
                    <div class="relative mt-3 rounded-lg overflow-hidden cursor-pointer news-video-thumbnail group" data-video-url="${item.content}" data-video-title="${item.title || 'Vídeo'}">
                        <img src="${item.thumbnail || 'https://placehold.co/600x338/1f2937/a3a3a3?text=Video'}" alt="Thumbnail do vídeo" class="w-full h-auto aspect-video object-cover">
                        <div class="absolute inset-0 bg-black/40 flex items-center justify-center group-hover:bg-black/60 transition-colors">
                             <i data-lucide="play-circle" class="w-16 h-16 text-white opacity-80 group-hover:opacity-100 transition-opacity"></i>
                        </div>
                    </div>`;
                typeClass = 'news-item-video-direct';
                break;
            default:
                contentHTML = `<p class="text-slate-500 mt-2">[Tipo ${item.type}] ${item.content || ''}</p>`;
        }

        const likesSet = newsLikes.get(item.id) || new Set();
        const likeCount = likesSet.size;
        const userLiked = currentProfile && likesSet.has(currentProfile.id);
        // REMOVIDO: commentsList
        // REMOVIDO: commentCount

        return `
            <div class="liquid-glass-card news-item-card ${typeClass}" data-news-id="${item.id}" style="--bg-color: rgba(15, 23, 42, 0.5);">
                <div class="glass-filter"></div><div class="glass-overlay"></div><div class="glass-specular"></div>
                <div class="glass-content p-5 flex flex-col">
                    ${item.title ? `<h3 class="text-xl font-semibold text-white">${item.title}</h3>` : ''}
                    <p class="text-xs text-slate-400 mb-2">${date}</p>
                    <div class="flex-grow">${contentHTML}</div>
                    <div class="mt-4 pt-3 border-t border-slate-700/50 flex items-center gap-4">
                        <button class="like-button glass-container glass-button rounded-full px-3 py-1.5 flex items-center gap-1.5 text-sm ${userLiked ? 'text-red-500' : 'text-slate-400 hover:text-white'}">
                            <div class="glass-filter"></div><div class="glass-overlay !bg-opacity-10 hover:!bg-opacity-20"></div><div class="glass-specular"></div>
                            <div class="glass-content flex items-center gap-1.5">
                                ${userLiked ? ICONS.heartFilled : ICONS.heartOutline}
                                <span class="like-count">${likeCount}</span>
                            </div>
                        </button>
                        <!-- REMOVIDO: Botão de Comentários -->
                    </div>
                </div>
            </div>
        `;
    }

    // Listener de eventos delegado para a seção de novidades
    const newsContainer = document.getElementById('news-items-container');
    if (newsContainer) {
        newsContainer.addEventListener('click', (e) => {
            // console.log("Clique detectado na área de novidades:", e.target);

            const likeButton = e.target.closest('.like-button');
            // REMOVIDO: commentButton
            const videoThumbnail = e.target.closest('.news-video-thumbnail');
            const iframeOverlay = e.target.closest('.news-iframe-play-overlay');

            if (likeButton) {
                // console.log("Botão Like clicado");
                const card = likeButton.closest('.news-item-card');
                const newsId = card?.dataset.newsId;
                if (newsId) handleNewsLike(newsId);
            }
            // REMOVIDO: else if (commentButton)
            else if (videoThumbnail) {
                // console.log("Thumbnail de vídeo direto clicado");
                const url = videoThumbnail.dataset.videoUrl;
                const title = videoThumbnail.dataset.videoTitle;
                if (url) showNewsPlayer(url, title);
            } else if (iframeOverlay) {
                // console.log("Overlay de Iframe clicado");
                const container = iframeOverlay.closest('.news-iframe-container');
                const iframeSrc = container?.dataset.iframeSrc;
                const wrapperId = iframeOverlay.id.replace('overlay-', 'iframe-wrapper-');
                const wrapper = document.getElementById(wrapperId);

                if (iframeSrc && wrapper) {
                    let finalSrc = iframeSrc;
                    // Adiciona autoplay=1 APENAS se for YouTube para tentar iniciar
                    if (iframeSrc.includes('youtube.com') || iframeSrc.includes('youtu.be')) {
                        try {
                            const url = new URL(iframeSrc);
                            url.searchParams.set('autoplay', '1');
                            finalSrc = url.toString();
                        } catch (error) {
                            console.error("URL do YouTube inválida:", iframeSrc, error);
                            // Usa a URL original se der erro
                        }
                    }
                    // Define atributos allow e sandbox
                    const allowAttribute = (iframeSrc.includes('youtube.com') || iframeSrc.includes('youtu.be'))
                        ? 'allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; autoplay"'
                        : 'allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"'; // Sem autoplay explícito para outros

                    wrapper.innerHTML = `<iframe src="${finalSrc}" frameborder="0" sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-forms" ${allowAttribute} allowfullscreen class="w-full h-full absolute inset-0"></iframe>`; // Adicionado absolute inset-0
                    iframeOverlay.classList.add('hidden'); // Esconde o overlay
                    console.log("Iframe carregado para:", finalSrc);
                } else {
                    console.log("Não foi possível carregar o iframe. Src:", iframeSrc, "Wrapper:", wrapper);
                }
            }
        });
    }


    // Lida com o clique no botão de like
    async function handleNewsLike(newsId) {
        if (!userId || !currentProfile?.id) {
            showToast("Você precisa estar logado e ter um perfil selecionado para curtir.", true);
            return;
        }

        const newsDocRef = doc(db, "news", newsId);
        const profileId = currentProfile.id;

        try {
            await runTransaction(db, async (transaction) => {
                const newsDoc = await transaction.get(newsDocRef);
                if (!newsDoc.exists()) {
                    throw "Post não encontrado!";
                }

                const data = newsDoc.data();
                const likedBy = data.likedBy || [];
                // Verifica se o profileId já existe no array
                const userIndex = likedBy.indexOf(profileId);

                if (userIndex > -1) {
                    // Descurtir: Usa arrayRemove
                    console.log(`[handleNewsLike] Removendo like de ${profileId} do post ${newsId}`);
                    transaction.update(newsDocRef, { likedBy: arrayRemove(profileId) });
                } else {
                    // Curtir: Usa arrayUnion
                    console.log(`[handleNewsLike] Adicionando like de ${profileId} ao post ${newsId}`);
                    transaction.update(newsDocRef, { likedBy: arrayUnion(profileId) });
                }
            });
            console.log(`[handleNewsLike] Transação de like/unlike para ${newsId} concluída.`);
            // A UI será atualizada automaticamente pelo listener onSnapshot
        } catch (error) {
            console.error("Erro ao curtir/descurtir:", error);
            showToast("Erro ao processar o like.", true);
        }
    }
    // --- Fim da Lógica de Novidades ---


    // --- Lógica de Pedidos ---
    function listenToRequests() {
        if (!userId) return; // Não escuta se não estiver logado
        console.log("Iniciando listener de pedidos...");
        const q = query(collection(db, "pedidos"), where("status", "==", "pending"));
        // Garante que o listener antigo seja removido
        if (typeof window.unsubscribeRequests === 'function') {
            window.unsubscribeRequests();
        }
        window.unsubscribeRequests = onSnapshot(q, (snapshot) => {
            console.log("Recebido snapshot de pedidos pendentes.");
            pendingRequests = [];
            snapshot.forEach((doc) => {
                pendingRequests.push({ id: doc.id, ...doc.data() });
            });
            // Ordena por votos (desc) e depois por data (asc)
            pendingRequests.sort((a, b) => {
                const votesA = (a.requesters || []).length;
                const votesB = (b.requesters || []).length;
                if (votesB !== votesA) return votesB - votesA;
                return (a.createdAt?.toMillis() || 0) - (b.createdAt?.toMillis() || 0);
            });
            console.log(`Cache de pedidos atualizado com ${pendingRequests.length} itens.`);
            if (window.location.hash === '#requests-view') {
                renderPendingRequests();
            }
        }, (error) => {
            console.error("Erro ao escutar pedidos: ", error);
            if (window.location.hash === '#requests-view') {
                const container = document.getElementById('pending-requests-container');
                if(container) container.innerHTML = '<p class="col-span-full text-center text-red-400">Erro ao carregar pedidos.</p>';
            }
        });
    }


    async function handleVote(requestId) {
        if (!userId || !currentProfile?.id) { // Adiciona verificação de profileId
            showToast("Você precisa estar logado e ter um perfil selecionado para votar.", true);
            return;
        }
        const docRef = doc(db, 'pedidos', requestId);
        const voteButton = document.querySelector(`.vote-btn[data-request-id="${requestId}"]`);
        if (voteButton) voteButton.disabled = true; // Desabilita temporariamente

        const profileId = currentProfile.id; // Pega o ID do perfil atual

        try {
            await runTransaction(db, async (transaction) => {
                const docSnap = await transaction.get(docRef);
                if (!docSnap.exists()) {
                    throw "Este pedido não existe mais.";
                }
                const requestData = docSnap.data();
                const requesters = requestData.requesters || [];
                // Verifica se o voto *deste perfil específico* já existe
                const userVoteIndex = requesters.findIndex(r => r.userId === userId && r.profileId === profileId);

                if (userVoteIndex > -1) {
                    // Remover voto: Cria um novo array sem o voto do perfil atual
                    const updatedRequesters = requesters.filter((_, index) => index !== userVoteIndex);
                    console.log(`[handleVote] Removendo voto de ${profileId} do pedido ${requestId}`);
                    transaction.update(docRef, { requesters: updatedRequesters });
                } else {
                    // Adicionar voto: Usa arrayUnion com o objeto de voto completo
                    const userVote = { userId: userId, userName: currentProfile.name, profileId: profileId };
                    console.log(`[handleVote] Adicionando voto de ${profileId} ao pedido ${requestId}`);
                    transaction.update(docRef, { requesters: arrayUnion(userVote) });
                }
            });
            // O listener onSnapshot atualizará a UI
            // showToast(userVoteIndex > -1 ? 'Voto removido.' : 'Obrigado pelo seu voto!'); // Toast é opcional aqui, já que a UI atualiza
            console.log(`[handleVote] Transação de voto para ${requestId} concluída.`);

        } catch (error) {
            console.error("Erro ao processar voto:", error);
            showToast(typeof error === 'string' ? error : "Ocorreu um erro ao processar seu voto.", true);
        } finally {
            if (voteButton) voteButton.disabled = false; // Reabilita o botão
        }
    }


    function renderPendingRequests() {
        const container = document.getElementById('pending-requests-container');
        if (!container) return;
        if (pendingRequests.length === 0) {
            container.innerHTML = '<p class="col-span-full text-center text-gray-400">Nenhum pedido em aberto no momento.</p>';
            return;
        }

        container.innerHTML = pendingRequests.map(request => {
            const posterPath = request.posterUrl || 'https://placehold.co/300x450/1c1917/FFFFFF?text=Sem+Imagem';
            const requesterCount = (request.requesters || []).length;
            // Verifica se o perfil ATUAL já votou
            const userHasVoted = userId && currentProfile && (request.requesters || []).some(r => r.userId === userId && r.profileId === currentProfile.id);

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
                            ${userHasVoted
                                ? '<i data-lucide="minus-circle" class="w-4 h-4"></i> Remover Voto'
                                : '<i data-lucide="plus-circle" class="w-4 h-4"></i> Apoiar Pedido'
                            }
                        </div>
                     </button>
                </div>
            `;
        }).join('');
        attachGlassButtonListeners();
        lucide.createIcons();
    }


    // --- Lógica de Gerenciamento de Perfil ---
    /** Carrega os perfis do usuário logado do Firestore */
    async function loadProfiles() {
        if (!userId) {
            console.log("loadProfiles: userId ausente.");
            return;
        }
        console.log("Carregando perfis para userId:", userId);
        const profilesCol = collection(db, 'users', userId, 'profiles');
        try {
            const snapshot = await getDocs(profilesCol);
            profiles = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            console.log(`Perfis carregados (${profiles.length}):`, profiles.map(p => p.name));
            renderProfiles();
        } catch (error) {
            console.error("Erro ao carregar perfis:", error);
            profiles = []; // Limpa em caso de erro
            renderProfiles(); // Tenta renderizar (mostrará botão de adicionar)
        }
    }

    /** Renderiza os cards de perfil na tela de seleção/gerenciamento */
    function renderProfiles() {
        console.log("Renderizando perfis...");
        profilesGrid.innerHTML = ''; // Limpa a grid
        profiles.forEach((profile) => {
            const profileCard = document.createElement('div');
            profileCard.className = 'cursor-pointer group';
            profileCard.dataset.id = profile.id;
            profileCard.innerHTML = `
                <div class="relative w-full aspect-square liquid-glass-card">
                     <div class="glass-filter"></div><div class="glass-distortion-overlay"></div><div class="glass-overlay"></div><div class="glass-specular"></div>
                     <div class="glass-content p-0">
                         <img src="${profile.avatar}" alt="${profile.name}" class="w-full h-full object-cover rounded-[inherit]">
                         <div class="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity ${isEditMode ? '!opacity-100' : ''}">
                             <svg class="w-12 h-12 text-white ${isEditMode ? '' : 'hidden'}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L16.732 3.732z"></path></svg>
                         </div>
                     </div>
                </div>
                <p class="text-center text-lg text-gray-300 group-hover:text-white mt-3 transition-colors">${profile.name}</p>
            `;
            profileCard.addEventListener('click', () => {
                if (isEditMode) {
                    showProfileModal(profile.id);
                } else {
                    selectAndEnterProfile(profile);
                }
            });
            profilesGrid.appendChild(profileCard);
        });

        // Adiciona botão "Adicionar Perfil" se houver menos de 4
        if (profiles.length < 4) {
            const addProfileCard = document.createElement('div');
            addProfileCard.className = 'cursor-pointer group';
            addProfileCard.innerHTML = `
                <div class="relative w-full aspect-square liquid-glass-card flex items-center justify-center">
                    <div class="glass-filter"></div><div class="glass-distortion-overlay"></div><div class="glass-overlay"></div><div class="glass-specular"></div>
                    <div class="glass-content flex items-center justify-center">
                        <svg class="w-16 h-16 text-gray-400 group-hover:text-white transition-colors" style="transform: translateY(2px);" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6v12M6 12h12"></path></svg>
                    </div>
                </div>
                <p class="text-center text-lg text-gray-300 group-hover:text-white mt-3 transition-colors">Adicionar Perfil</p>
            `;
            addProfileCard.addEventListener('click', () => showProfileModal());
            profilesGrid.appendChild(addProfileCard);
        }
        attachGlassButtonListeners();
        console.log("Renderização de perfis concluída.");
    }

    /**
     * Define o perfil selecionado, atualiza o header e navega para a home.
     * @param {object} profile - O objeto do perfil selecionado.
     */
    async function selectAndEnterProfile(profile) {
        console.log("Selecionando perfil:", profile.id, profile.name);
        currentProfile = profile;
        localStorage.setItem(`starlight-lastProfile-${userId}`, profile.id);

        const avatarImg = new Image();
        avatarImg.src = currentProfile.avatar;
        avatarImg.className = 'w-full h-full object-cover rounded-full';
        avatarImg.onerror = () => { // Fallback se a imagem do avatar falhar
            headerProfileBtn.innerHTML = `<span class="text-xl">${profile.name.charAt(0).toUpperCase()}</span>`;
        };
        headerProfileBtn.innerHTML = ''; // Limpa antes de adicionar
        headerProfileBtn.appendChild(avatarImg);

        // **IMPORTANTE:** Iniciar/Reiniciar listeners que dependem do perfil AQUI
        console.log("Iniciando/Reiniciando listeners dependentes do perfil...");
        listenToFirestoreContent(); // Precisa recarregar o conteúdo se ele depender do perfil (ex: progresso)
        listenToRequests();
        listenForNewsItems();
        listenForNewsLikes(); // Precisa reiniciar para pegar os likes deste perfil
        // REMOVIDO: listenForNewsComments

        // Navega para a home view (se não estiver lá) ou força re-render
        if (window.location.hash !== '#home-view') {
            console.log("Navegando para #home-view após seleção de perfil.");
            window.location.hash = '#home-view';
        } else {
            console.log("Já está na #home-view, forçando re-renderização após seleção de perfil.");
            handleNavigation(); // Força a execução para garantir renderização correta
        }
    }


    /**
     * Mostra o modal para adicionar ou editar um perfil.
     * @param {string|null} [profileId=null] - O ID do perfil a ser editado, ou null para adicionar.
     */
    function showProfileModal(profileId = null) {
        const modalTitle = document.getElementById('modal-title');
        const nameInput = document.getElementById('profile-name-input');
        const idInput = document.getElementById('profile-id-input');
        const deleteBtn = document.getElementById('delete-profile-btn');

        avatarOptionsContainer.innerHTML = AVATARS.map(avatar => `
            <img src="${avatar}" class="w-16 h-16 rounded-full cursor-pointer border-2 border-transparent hover:border-white transition-all" data-avatar="${avatar}">
        `).join('');

        // Limpa seleção anterior
        avatarOptionsContainer.querySelectorAll('img').forEach(img => img.classList.remove('!border-purple-500', 'scale-110'));

        if (profileId) {
            console.log("Abrindo modal para editar perfil:", profileId);
            modalTitle.textContent = 'Editar Perfil';
            const profile = profiles.find(p => p.id === profileId);
            if (!profile) {
                console.error("Perfil para edição não encontrado:", profileId);
                showToast("Erro ao carregar dados do perfil.", true);
                return;
            }
            nameInput.value = profile.name;
            idInput.value = profile.id;
            // Mostra botão excluir apenas se houver mais de um perfil
            deleteBtn.classList.toggle('hidden', profiles.length <= 1);
            const currentAvatar = avatarOptionsContainer.querySelector(`img[data-avatar="${profile.avatar}"]`);
            if (currentAvatar) currentAvatar.classList.add('!border-purple-500', 'scale-110');
            else { // Fallback se o avatar salvo não estiver mais na lista AVATARS
                const firstAvatar = avatarOptionsContainer.querySelector('img');
                if (firstAvatar) firstAvatar.classList.add('!border-purple-500', 'scale-110');
            }
        } else {
            console.log("Abrindo modal para adicionar novo perfil.");
            modalTitle.textContent = 'Adicionar Perfil';
            nameInput.value = '';
            idInput.value = '';
            deleteBtn.classList.add('hidden');
            // Seleciona o primeiro avatar como padrão visualmente
            const firstAvatar = avatarOptionsContainer.querySelector('img');
            if (firstAvatar) firstAvatar.classList.add('!border-purple-500', 'scale-110');
        }

        profileModal.classList.remove('hidden');
    }


    // Listener para seleção de avatar no modal
    avatarOptionsContainer.addEventListener('click', e => {
        if (e.target.tagName === 'IMG') {
            avatarOptionsContainer.querySelectorAll('img').forEach(img => img.classList.remove('!border-purple-500', 'scale-110'));
            e.target.classList.add('!border-purple-500', 'scale-110');
        }
    });

    // Listener para o botão "Salvar" do modal de perfil
    document.getElementById('save-profile-btn').addEventListener('click', async () => {
        const name = document.getElementById('profile-name-input').value.trim();
        const selectedAvatarEl = document.querySelector('#avatar-options .scale-110'); // Pega o elemento
        const selectedAvatar = selectedAvatarEl?.dataset.avatar; // Pega o data attribute
        const profileId = document.getElementById('profile-id-input').value;

        // Se nenhum avatar foi selecionado (caso de adicionar sem clicar), pega o primeiro
        const finalAvatar = selectedAvatar || avatarOptionsContainer.querySelector('img')?.dataset.avatar || AVATARS[0];

        if (!name) {
            showToast('Por favor, preencha o nome do perfil.', true);
            return;
        }
        if (!finalAvatar) { // Verificação extra
            showToast('Por favor, selecione um avatar.', true);
            return;
        }
        if (!userId) {
            showToast('Erro de autenticação. Por favor, recarregue a página.', true);
            return;
        }

        const profileData = { name, avatar: finalAvatar };

        try {
            if (profileId) {
                console.log("Atualizando perfil:", profileId, profileData);
                const docRef = doc(db, 'users', userId, 'profiles', profileId);
                await updateDoc(docRef, profileData);
                showToast('Perfil atualizado com sucesso!');
            } else {
                console.log("Adicionando novo perfil:", profileData);
                const colRef = collection(db, 'users', userId, 'profiles');
                await addDoc(colRef, profileData);
                showToast('Perfil criado com sucesso!');
            }
            await loadProfiles(); // Recarrega a lista de perfis
            profileModal.classList.add('hidden'); // Fecha o modal
        } catch (error) {
            console.error("Erro ao salvar perfil: ", error);
            showToast('Não foi possível salvar o perfil.', true);
        }
    });


    // Listener para o botão "Cancelar" do modal de perfil
    document.getElementById('cancel-profile-btn').addEventListener('click', () => profileModal.classList.add('hidden'));

    // Listener para o botão "Excluir" do modal de perfil
    document.getElementById('delete-profile-btn').addEventListener('click', async () => {
        const profileId = document.getElementById('profile-id-input').value;
        if (profileId && profiles.length > 1) { // Só permite excluir se houver mais de um
            showConfirmationModal(
                'Excluir Perfil',
                'Tem certeza que deseja excluir este perfil? Esta ação não pode ser desfeita.',
                async () => {
                    try {
                        console.log("Excluindo perfil:", profileId);
                        const docRef = doc(db, 'users', userId, 'profiles', profileId);
                        await deleteDoc(docRef);
                        showToast('Perfil excluído.');
                        // Se o perfil excluído era o atual, limpa currentProfile e força seleção
                        if (currentProfile?.id === profileId) {
                            console.log("Perfil atual excluído, limpando seleção...");
                            currentProfile = null;
                            localStorage.removeItem(`starlight-lastProfile-${userId}`); // Limpa também o último selecionado
                            // Para listeners que dependiam do perfil
                            if (typeof window.unsubscribeNewsItems === 'function') window.unsubscribeNewsItems();
                            if (typeof unsubscribeNewsLikes === 'function') unsubscribeNewsLikes();
                            // REMOVIDO: unsubscribeNewsComments
                            if (typeof window.unsubscribeRequests === 'function') window.unsubscribeRequests();
                            // Limpa caches que dependem do perfil
                            newsLikes.clear();
                            // REMOVIDO: newsComments.clear();
                            pendingRequests = [];
                            firestoreContent = []; // Limpa catálogo principal também
                            headerProfileBtn.innerHTML = ''; // Limpa ícone do header

                            // Força a volta para a tela de seleção após um pequeno delay
                            setTimeout(() => {
                                window.location.hash = 'manage-profile-view';
                                handleNavigation(); // Chama para garantir que a tela de seleção seja mostrada
                            }, 100);
                        }
                        await loadProfiles(); // Recarrega a lista
                        profileModal.classList.add('hidden'); // Fecha o modal
                    } catch (error) {
                        console.error("Erro ao excluir perfil: ", error);
                        showToast('Não foi possível excluir o perfil.', true);
                    }
                }
            );
        } else if (profiles.length <= 1) {
            showToast('Não é possível excluir o único perfil.', true);
        }
    });


    // Listener para o botão "Gerenciar Perfis" / "Concluído"
    manageProfilesBtn.addEventListener('click', () => {
        isEditMode = !isEditMode;
        console.log("Modo edição de perfis:", isEditMode);
        manageProfilesBtn.querySelector('.glass-content').textContent = isEditMode ? 'Concluído' : 'Gerenciar Perfis';
        document.getElementById('profile-main-title').textContent = isEditMode ? 'Gerenciar Perfis' : 'Quem está assistindo?';
        renderProfiles(); // Re-renderiza para atualizar a UI (ícones de edição)
    });


    // Listener para o botão de perfil no header (leva para a tela de gerenciamento)
    headerProfileBtn.addEventListener('click', () => {
        console.log("Botão de perfil no header clicado.");
        isEditMode = false; // Garante que não está em modo de edição
        currentProfile = null; // Força seleção
        localStorage.removeItem(`starlight-lastProfile-${userId}`); // Limpa último salvo

        // Para listeners que dependiam do perfil ao voltar para seleção
        if (typeof window.unsubscribeNewsItems === 'function') window.unsubscribeNewsItems();
        if (typeof unsubscribeNewsLikes === 'function') unsubscribeNewsLikes();
        // REMOVIDO: unsubscribeNewsComments
        if (typeof window.unsubscribeRequests === 'function') window.unsubscribeRequests();
        // Limpa caches que dependem do perfil
        newsLikes.clear();
        // REMOVIDO: newsComments.clear();
        pendingRequests = [];
        firestoreContent = []; // Limpa catálogo principal também
        headerProfileBtn.innerHTML = ''; // Limpa ícone do header


        window.location.hash = 'manage-profile-view'; // Navega
        // handleNavigation será chamado pelo evento hashchange/popstate
    });

    // --- Lógica de Autenticação Manual (Login/Registro/Google) ---
    const switchToRegister = document.querySelector('.switch-to-register');
    const switchToLogin = document.querySelector('.switch-to-login');
    const loginFormContainer = document.querySelector('.form-container.login');
    const registerFormContainer = document.querySelector('.form-container.register');

    switchToRegister.addEventListener('click', (e) => {
        e.preventDefault();
        loginFormContainer.classList.remove('active');
        registerFormContainer.classList.add('active');
    });
    switchToLogin.addEventListener('click', (e) => {
        e.preventDefault();
        registerFormContainer.classList.remove('active');
        loginFormContainer.classList.add('active');
    });

    document.getElementById('login-form').addEventListener('submit', (e) => {
        e.preventDefault();
        console.log("Tentando login com Email/Senha...");
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        signInWithEmailAndPassword(auth, email, password)
            .catch((error) => {
                console.error("Erro de login:", error);
                showToast(`Erro: ${error.message}`, true);
            });
        // onAuthStateChanged cuidará do redirecionamento
    });

    document.getElementById('register-form').addEventListener('submit', (e) => {
        e.preventDefault();
        console.log("Tentando registro com Email/Senha...");
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;
        createUserWithEmailAndPassword(auth, email, password)
            .then(async (userCredential) => {
                const user = userCredential.user;
                console.log("Registro bem-sucedido, usuário:", user.uid);
                if (user) {
                    // Cria o primeiro perfil automaticamente após o registro
                    const colRef = collection(db, 'users', user.uid, 'profiles');
                    console.log("Verificando se já existem perfis...");
                    const snapshot = await getDocs(colRef);
                    if (snapshot.empty) {
                        console.log("Nenhum perfil encontrado, criando perfil padrão...");
                        // Tenta usar o nome do email como base, ou "Usuário"
                        const defaultName = email.split('@')[0] || "Usuário";
                        // Capitaliza a primeira letra
                        const capitalizedName = defaultName.charAt(0).toUpperCase() + defaultName.slice(1);
                        await addDoc(colRef, { name: capitalizedName, avatar: AVATARS[0] });
                        console.log("Perfil padrão criado.");
                    } else {
                        console.log("Perfis já existem, não criando perfil padrão.");
                    }
                }
                // onAuthStateChanged cuidará do redirecionamento e seleção de perfil
            })
            .catch((error) => {
                console.error("Erro de registro:", error);
                showToast(`Erro: ${error.message}`, true);
            });
    });

    document.getElementById('google-signin-btn').addEventListener('click', () => {
        console.log("Tentando login com Google...");
        signInWithPopup(auth, googleProvider)
            .then(async (result) => {
                const user = result.user;
                console.log("Login com Google bem-sucedido, usuário:", user.uid);
                if (user) {
                    // Cria perfil padrão se não existir (igual ao registro)
                    const profilesCol = collection(db, 'users', user.uid, 'profiles');
                    console.log("Verificando se já existem perfis (Google)...");
                    const snapshot = await getDocs(profilesCol);
                    if (snapshot.empty) {
                        console.log("Nenhum perfil encontrado (Google), criando perfil padrão...");
                        await addDoc(profilesCol, { name: user.displayName || "Usuário", avatar: user.photoURL || AVATARS[0] });
                        console.log("Perfil padrão (Google) criado.");
                    } else {
                        console.log("Perfis já existem (Google), não criando perfil padrão.");
                    }
                }
                // onAuthStateChanged cuidará do redirecionamento e seleção de perfil
            })
            .catch((error) => {
                console.error("Erro de login com Google:", error);
                // Trata erros comuns de popup bloqueado ou fechado pelo usuário
                if (error.code === 'auth/popup-closed-by-user') {
                    showToast('Login cancelado.', true);
                } else if (error.code === 'auth/popup-blocked') {
                    showToast('Popup bloqueado. Habilite popups para este site.', true);
                } else {
                    showToast(`Erro: ${error.message}`, true);
                }
            });
    });

    // Logout
    logoutBtn.addEventListener('click', () => {
        console.log("Botão Logout clicado.");
        const currentUserIdBeforeSignOut = userId; // Guarda o userId antes do logout
        signOut(auth).then(() => {
            console.log("Logout bem-sucedido.");
            // Limpa o último perfil selecionado para este usuário
            if (currentUserIdBeforeSignOut) {
                localStorage.removeItem(`starlight-lastProfile-${currentUserIdBeforeSignOut}`);
                console.log(`LocalStorage para ${currentUserIdBeforeSignOut} limpo.`);
            }
            // Limpa variáveis de estado
            userId = null;
            currentProfile = null;
            profiles = [];
            firestoreContent = [];
            pendingRequests = [];
            newsItems = [];
            newsLikes.clear();
            // REMOVIDO: newsComments.clear();
            headerProfileBtn.innerHTML = ''; // Limpa ícone do header

            // Para todos os listeners do Firestore que dependem de login/perfil
            console.log("Parando todos os listeners do Firestore...");
            if (typeof window.unsubscribeContent === 'function') window.unsubscribeContent();
            if (typeof window.unsubscribeFeatured === 'function') window.unsubscribeFeatured();
            if (typeof window.unsubscribeNotifications === 'function') window.unsubscribeNotifications(); // Notificações também param
            if (typeof window.unsubscribeNewsItems === 'function') window.unsubscribeNewsItems();
            if (typeof unsubscribeNewsLikes === 'function') unsubscribeNewsLikes();
            // REMOVIDO: unsubscribeNewsComments
            if (typeof window.unsubscribeRequests === 'function') window.unsubscribeRequests();
            console.log("Listeners parados.");


            // O onAuthStateChanged será chamado e redirecionará para a tela de login
            console.log("Redirecionando para a tela de login via onAuthStateChanged...");
            // Não é necessário chamar handleNavigation aqui, onAuthStateChanged fará isso.

        }).catch((error) => {
            console.error("Erro ao sair:", error);
            showToast(`Erro ao sair: ${error.message}`, true);
        });
    });

    // --- Lógica do Modal de Confirmação ---
    function showConfirmationModal(title, message, onConfirm) {
        confirmTitle.textContent = title;
        confirmMessage.textContent = message;
        confirmCallback = onConfirm; // Armazena a função a ser chamada
        confirmModal.classList.remove('hidden');
    }

    confirmOkBtn.addEventListener('click', () => {
        if (confirmCallback && typeof confirmCallback === 'function') {
            confirmCallback(); // Executa a função armazenada
        }
        confirmModal.classList.add('hidden');
        confirmCallback = null; // Limpa o callback
    });

    confirmCancelBtn.addEventListener('click', () => {
        confirmModal.classList.add('hidden');
        confirmCallback = null; // Limpa o callback
    });

    // --- Busca TMDB para Pedidos ---
    const tmdbSearchInput = document.getElementById('tmdb-search-input');
    if (tmdbSearchInput) { // Adiciona verificação se o elemento existe
        tmdbSearchInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                handleTmdbSearch(tmdbSearchInput.value);
            }, 500); // Aumenta debounce para TMDB
        });
    }

    async function handleTmdbSearch(query) {
        const resultsContainer = document.getElementById('tmdb-search-results');
        if (!resultsContainer) return; // Adiciona verificação
        if (query.length < 3) {
            resultsContainer.innerHTML = ''; // Limpa se a busca for muito curta
            return;
        }
        // Mostra spinner menor dentro da área de resultados
        resultsContainer.innerHTML = `<div class="col-span-full flex justify-center py-4"><div class="spinner"></div></div>`;
        const data = await fetchFromTMDB('search/multi', `query=${encodeURIComponent(query)}`);
        if (data && data.results) {
            // Filtra filmes e séries com poster
            const filtered = data.results.filter(item => (item.media_type === 'movie' || item.media_type === 'tv') && item.poster_path);
            renderTmdbResults(filtered);
        } else {
            resultsContainer.innerHTML = `<p class="col-span-full text-center text-gray-400">Nenhum resultado encontrado no TMDB.</p>`;
        }
    }

    function renderTmdbResults(results) {
        const container = document.getElementById('tmdb-search-results');
        if (!container) return; // Adiciona verificação
        if (results.length === 0) {
            container.innerHTML = `<p class="col-span-full text-center text-gray-400">Nenhum filme ou série encontrado no TMDB.</p>`;
            return;
        }
        container.innerHTML = results.map(item => {
            const posterPath = item.poster_path ? `${IMG_URL_POSTER}${item.poster_path}` : 'https://placehold.co/300x450/1c1917/FFFFFF?text=Sem+Imagem';
            const year = (item.release_date || item.first_air_date || '').substring(0, 4);
            return `
            <div class="cursor-pointer group tmdb-result-item" data-item='${JSON.stringify(item)}'>
                <div class="liquid-glass-card aspect-[2/3] bg-stone-800">
                    <div class="glass-filter"></div>
                    <div class="glass-overlay" style="--bg-color: rgba(0,0,0,0.1);"></div>
                    <div class="glass-specular"></div>
                    <div class="glass-content p-0">
                        <img src="${posterPath}" alt="${item.title || item.name}" loading="lazy" class="w-full h-full object-cover rounded-[inherit]">
                    </div>
                </div>
                <h4 class="text-white text-xs mt-2 truncate">${item.title || item.name} ${year ? `(${year})` : ''}</h4>
            </div>
            `;
        }).join('');
        attachGlassButtonListeners();
    }

    // Listener para cliques nos resultados da busca TMDB
    const tmdbResultsContainer = document.getElementById('tmdb-search-results');
    if (tmdbResultsContainer) { // Adiciona verificação
        tmdbResultsContainer.addEventListener('click', (e) => {
            const itemElement = e.target.closest('.tmdb-result-item');
            if (itemElement) {
                try {
                    const itemData = JSON.parse(itemElement.dataset.item);
                    confirmAndAddRequest(itemData);
                } catch (parseError) {
                    console.error("Erro ao parsear dados do item TMDB:", parseError);
                    showToast("Erro ao processar seleção.", true);
                }
            }
        });
    }

    // Listener para cliques nos botões de voto nos pedidos pendentes
    const pendingRequestsContainer = document.getElementById('pending-requests-container');
    if (pendingRequestsContainer) { // Adiciona verificação
        pendingRequestsContainer.addEventListener('click', e => {
            const voteButton = e.target.closest('.vote-btn');
            if (voteButton) {
                const requestId = voteButton.dataset.requestId;
                if (requestId) { // Garante que o ID existe
                    handleVote(requestId);
                }
            }
        });
    }


    /** Confirma e adiciona um pedido (ou voto) para um item do TMDB */
    async function confirmAndAddRequest(item) {
        const title = item.title || item.name;
        showConfirmationModal(
            'Confirmar Pedido',
            `Deseja solicitar a adição de "${title}"?`,
            async () => {
                if (!userId || !currentProfile?.id) { // Adiciona verificação de profileId
                    showToast("Você precisa estar logado e ter um perfil selecionado.", true);
                    return;
                }

                // Verifica se já existe no catálogo principal
                const alreadyInCatalog = firestoreContent.some(c => c.tmdb_id === item.id && c.type === item.media_type); // Verifica TMDB ID E tipo
                if (alreadyInCatalog) {
                    showToast('Este item já está disponível no catálogo.', false); // Mensagem informativa
                    return;
                }

                // Verifica se já existe um pedido pendente para este TMDB ID E tipo
                const existingRequest = pendingRequests.find(r => r.tmdbId === item.id && r.mediaType === item.media_type);

                if (existingRequest) {
                    console.log("Pedido existente encontrado:", existingRequest.id);
                    // Verifica se o perfil atual já votou neste pedido
                    const userHasRequested = existingRequest.requesters && existingRequest.requesters.some(r => r.userId === userId && r.profileId === currentProfile.id);
                    if (userHasRequested) {
                        showToast('Você já apoiou este pedido.', false); // Mensagem informativa
                        return;
                    }
                    try {
                        console.log("Adicionando voto ao pedido existente...");
                        const docRef = doc(db, 'pedidos', existingRequest.id);
                        await updateDoc(docRef, {
                            requesters: arrayUnion({ userId: userId, userName: currentProfile.name, profileId: currentProfile.id }) // Adiciona profileId
                        });
                        showToast('Seu apoio ao pedido foi adicionado!');
                    } catch (error) {
                        console.error("Erro ao apoiar pedido existente:", error);
                        showToast('Ocorreu um erro ao apoiar o pedido.', true);
                    }
                } else {
                    console.log("Nenhum pedido existente, criando novo...");
                    const requestData = {
                        tmdbId: item.id,
                        title: item.title || item.name,
                        year: (item.release_date || item.first_air_date || '').substring(0, 4),
                        posterUrl: item.poster_path ? `${IMG_URL_POSTER}${item.poster_path}` : 'https://placehold.co/300x450/1c1917/FFFFFF?text=Sem+Imagem',
                        mediaType: item.media_type,
                        status: 'pending',
                        createdAt: serverTimestamp(),
                        requesters: [{ userId: userId, userName: currentProfile.name, profileId: currentProfile.id }] // Adiciona profileId
                    };
                    try {
                        await addDoc(collection(db, 'pedidos'), requestData);
                        showToast('Pedido enviado com sucesso!');
                        // Limpa a busca do TMDB após adicionar
                        if(tmdbSearchInput) tmdbSearchInput.value = '';
                        if(tmdbResultsContainer) tmdbResultsContainer.innerHTML = '';

                    } catch (error) {
                        console.error("Erro ao adicionar novo pedido:", error);
                        showToast('Ocorreu um erro ao enviar o pedido.', true);
                    }
                }
            }
        );
    }


    // --- Estado Inicial e Listener Principal de Autenticação ---

    /** Mostra a tela de login e esconde o resto, parando listeners */
    function showLoginScreen() {
        console.log("Mostrando tela de login.");
        userId = null;
        currentProfile = null;
        document.querySelectorAll('.content-view').forEach(view => view.classList.add('hidden'));
        loginView.classList.remove('hidden');
        document.querySelector('header').classList.add('hidden');
        document.querySelector('footer').classList.add('hidden');
        document.getElementById('main-background').style.opacity = 0;
        stopNewsViewMedia();
        hideNewsPlayer();
        // Para listeners que dependem do usuário/perfil
        console.log("Parando listeners dependentes do usuário/perfil...");
        if (typeof window.unsubscribeContent === 'function') window.unsubscribeContent();
        if (typeof window.unsubscribeFeatured === 'function') window.unsubscribeFeatured();
        if (typeof window.unsubscribeNotifications === 'function') window.unsubscribeNotifications();
        if (typeof window.unsubscribeNewsItems === 'function') window.unsubscribeNewsItems();
        if (typeof unsubscribeNewsLikes === 'function') unsubscribeNewsLikes();
        // REMOVIDO: unsubscribeNewsComments
        if (typeof window.unsubscribeRequests === 'function') window.unsubscribeRequests();
        // Limpa caches que dependem do perfil
        newsLikes.clear();
        // REMOVIDO: newsComments.clear();
        pendingRequests = [];
        firestoreContent = []; // Limpa catálogo principal também
        profiles = []; // Limpa perfis
        headerProfileBtn.innerHTML = ''; // Limpa ícone do header
        console.log("Listeners parados e caches limpos.");
    }

    /** Mostra a tela de seleção/gerenciamento de perfil */
    async function showProfileScreen() {
        console.log("Mostrando tela de seleção de perfil.");
        document.querySelectorAll('.content-view').forEach(view => view.classList.add('hidden'));
        loginView.classList.add('hidden');
        manageProfileView.classList.remove('hidden');
        document.querySelector('header').classList.add('hidden');
        document.querySelector('footer').classList.add('hidden');
        document.getElementById('main-background').style.opacity = 0;
        isEditMode = false; // Garante que não está em modo de edição
        manageProfilesBtn.querySelector('.glass-content').textContent = 'Gerenciar Perfis';
        document.getElementById('profile-main-title').textContent = 'Quem está assistindo?';
        await loadProfiles(); // Carrega os perfis para exibição
        stopNewsViewMedia();
        hideNewsPlayer();
        // Para listeners que dependiam do perfil (caso o usuário volte para esta tela)
        console.log("Parando listeners dependentes do perfil (ao mostrar seleção)...");
        if (typeof window.unsubscribeContent === 'function') window.unsubscribeContent();
        if (typeof window.unsubscribeFeatured === 'function') window.unsubscribeFeatured();
        // Não para notificações aqui, pois são gerais do usuário
        if (typeof window.unsubscribeNewsItems === 'function') window.unsubscribeNewsItems();
        if (typeof unsubscribeNewsLikes === 'function') unsubscribeNewsLikes();
        // REMOVIDO: unsubscribeNewsComments
        if (typeof window.unsubscribeRequests === 'function') window.unsubscribeRequests();
        // Limpa caches que dependem do perfil
        newsLikes.clear();
        // REMOVIDO: newsComments.clear();
        pendingRequests = [];
        firestoreContent = []; // Limpa catálogo principal também
        headerProfileBtn.innerHTML = ''; // Limpa ícone do header
        console.log("Listeners parados e caches limpos (ao mostrar seleção).");

    }


    // Listener principal de mudança de estado de autenticação
    onAuthStateChanged(auth, async (user) => {
        console.log("Auth state changed. User:", user ? user.uid : 'null');
        document.body.classList.remove('auth-loading'); // Torna o body visível
        if (user) {
            userId = user.uid; // Define o userId globalmente
            console.log("Usuário logado:", userId);
            listenForNotifications(); // Notificações gerais não dependem de perfil
            initializeUI(); // Inicializa UI geral do player (ícones, etc.)

            // Tenta carregar o último perfil usado por este usuário
            const lastProfileId = localStorage.getItem(`starlight-lastProfile-${userId}`);
            let autoSelectedProfile = false;
            if (lastProfileId) {
                console.log("Tentando carregar último perfil:", lastProfileId);
                // Precisa carregar perfis para validar se o último ainda existe
                await loadProfiles(); // loadProfiles() agora é assíncrono e aguarda
                const foundProfile = profiles.find(p => p.id === lastProfileId);
                if (foundProfile) {
                    console.log("Último perfil válido encontrado, selecionando automaticamente...");
                    // Seleciona e entra - isso vai iniciar os listeners que dependem de perfil
                    // e chamar handleNavigation para ir para a home (ou hash atual)
                    await selectAndEnterProfile(foundProfile);
                    autoSelectedProfile = true;
                } else {
                    console.log("Último perfil salvo inválido, limpando localStorage.");
                    localStorage.removeItem(`starlight-lastProfile-${userId}`);
                    currentProfile = null; // Garante que currentProfile esteja nulo
                }
            } else {
                console.log("Nenhum último perfil salvo encontrado.");
                currentProfile = null; // Garante que currentProfile esteja nulo
            }

            // Se nenhum perfil foi selecionado automaticamente, força a tela de seleção
            if (!autoSelectedProfile) {
                console.log("Nenhum perfil selecionado automaticamente, mostrando tela de seleção...");
                // Garante que listeners dependentes do perfil estejam parados
                if (typeof window.unsubscribeContent === 'function') window.unsubscribeContent();
                if (typeof window.unsubscribeFeatured === 'function') window.unsubscribeFeatured();
                if (typeof window.unsubscribeNewsItems === 'function') window.unsubscribeNewsItems();
                if (typeof unsubscribeNewsLikes === 'function') unsubscribeNewsLikes();
                // REMOVIDO: unsubscribeNewsComments
                if (typeof window.unsubscribeRequests === 'function') window.unsubscribeRequests();
                // Limpa caches que dependem do perfil
                newsLikes.clear();
                // REMOVIDO: newsComments.clear();
                pendingRequests = [];
                firestoreContent = [];
                headerProfileBtn.innerHTML = '';

                // Força a exibição da tela de seleção de perfil
                if (window.location.hash !== '#manage-profile-view') {
                    history.replaceState(null, '', '#manage-profile-view');
                }
                // Chamamos handleNavigation DEPOIS de forçar o hash
                handleNavigation();
            }
            // Se autoSelectedProfile = true, selectAndEnterProfile já cuidou da navegação

        } else { // Usuário deslogado
            console.log("Usuário deslogado.");
            showLoginScreen(); // Mostra login e para listeners
            // Atualiza hash se necessário
            if (window.location.hash !== '#login-view') {
                history.replaceState(null, '', '#login-view');
            }
            handleNavigation(); // Chama para garantir que a UI de login apareça
        }
        // Atualiza o hash anterior após a mudança de auth/perfil
        sessionStorage.setItem('starlight-previousHash', window.location.hash);
        console.log("onAuthStateChanged concluído.");
    });

    // --- Inicialização ---
    initializeGlassEffects(); // Adiciona efeitos de vidro iniciais
    window.addEventListener('resize', () => {
        updateMobileNavIndicator();
        addPlayerEventListeners(); // Reavalia listeners do player (mobile/desktop) em resize
    });

    // A chamada inicial do handleNavigation foi movida para dentro do onAuthStateChanged
    // para garantir que a autenticação seja verificada antes de tentar rotear.
    console.log("Script inicializado, aguardando estado de autenticação...");


    // REMOVIDO: Funções e Listeners de Comentários

    // Função para parar iframes e player de novidades
    function stopNewsViewMedia() {
        hideNewsPlayer(); // Para o player modal
        // Reseta src de iframes na seção de novidades para pará-los e remove o iframe carregado
        const newsIframeContainers = document.querySelectorAll('.news-iframe-container');
        newsIframeContainers.forEach(container => {
            const overlay = container.querySelector('.news-iframe-play-overlay');
            const wrapper = container.querySelector('[id^="iframe-wrapper-"]'); // Encontra o wrapper pelo prefixo do ID

            if (wrapper) wrapper.innerHTML = ''; // Remove o iframe se existir
            if (overlay) overlay.classList.remove('hidden'); // Mostra o overlay de play novamente
        });
    }


}); // Fim do DOMContentLoaded
