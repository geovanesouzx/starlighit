import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signInWithPopup,
    GoogleAuthProvider,
    signOut,
    signInAnonymously,
    signInWithCustomToken
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
    setLogLevel
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', async function() {
    lucide.createIcons();

    // Define um hash padrão se nenhum existir e não for #player ou #comments
    if (!window.location.hash || window.location.hash === '#player' || window.location.hash.startsWith('#comments/')) {
        history.replaceState(null, '', window.location.pathname + window.location.search); // Limpa hash problemático
        window.location.hash = '#home-view'; // Define um padrão inicial seguro
    }

    // --- Configuração do Firebase ---
    const firebaseConfig = typeof __firebase_config !== 'undefined'
        ? JSON.parse(__firebase_config)
        : {
            apiKey: "AIzaSyA791i8R8Bmrn3toFxFltZ40TU7PUavev8",
            authDomain: "starlight-max.firebaseapp.com",
            projectId: "starlight-max",
            storageBucket: "starlight-max.appspot.com",
            messagingSenderId: "120477177511",
            appId: "1:120477177511:web:5a75a2dd6d8089c829ed82"
        };

    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);
    const googleProvider = new GoogleAuthProvider();
    setLogLevel('debug');

    let userId = null;

    // --- AUTENTICAÇÃO INICIAL ---
    try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            console.log("Tentando login com token customizado...");
            await signInWithCustomToken(auth, __initial_auth_token);
            console.log("Login com token customizado bem-sucedido.");
        } else {
            console.log("Token customizado não encontrado, tentando login anônimo...");
            await signInAnonymously(auth);
            console.log("Login anônimo bem-sucedido.");
        }
    } catch (error) {
        console.error("Erro na autenticação inicial:", error);
        try {
            console.warn("Falha no login com token, tentando anônimo como fallback...");
            await signInAnonymously(auth);
            console.log("Login anônimo de fallback bem-sucedido.");
        } catch (anonError) {
            console.error("Erro no login anônimo de fallback:", anonError);
        }
    }
    // O userId será atualizado pelo onAuthStateChanged

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
    let hls = null;
    let notifications = [];
    let lastNotificationCheck = localStorage.getItem('starlight-lastNotificationCheck') || 0;
    let dismissedNotifications = JSON.parse(localStorage.getItem('starlight-dismissedNotifications')) || [];

    // Caches para Novidades e Comentários
    let newsItems = [];
    let newsLikes = new Map(); // newsId -> Set[profileId]
    let newsComments = new Map(); // newsId -> Array[comment] (Estrutura completa com ID)
    let unsubscribeNewsLikes = () => {};
    let unsubscribeNewsComments = () => {}; // Função para parar todos os listeners de comentários
    let currentNewsCommentsModalId = null; // ID do post no modal de comentários
    let replyToCommentId = null; // ID do comentário sendo respondido
    let replyToCommentAuthor = null; // Nome do autor do comentário sendo respondido

    let firestoreContent = [];
    let pendingRequests = [];

    // Elementos DOM
    const loginView = document.getElementById('login-view');
    const searchOverlay = document.getElementById('search-overlay');
    const searchInput = document.getElementById('search-input');
    const searchResultsContainer = document.getElementById('search-results');
    const searchIconBtn = document.getElementById('search-icon-btn');
    const closeSearchBtn = document.getElementById('close-search-btn');
    const notificationBtn = document.getElementById('notification-btn');
    const notificationPanel = document.getElementById('notification-panel');
    let debounceTimer;

    // Player (Filmes/Séries)
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

    // Player (Novidades)
    const newsPlayerView = document.getElementById('news-player-view');
    const newsPlayerVideo = document.getElementById('news-video-player');
    const newsPlayerTitle = document.getElementById('news-player-title');
    const newsPlayerCloseBtn = document.getElementById('news-player-close-btn');

    // Modal de Comentários (Novidades)
    const commentsModal = document.getElementById('comments-modal');
    const commentsModalTitle = document.getElementById('comments-modal-title');
    const commentsModalList = document.getElementById('comments-list');
    const commentsModalCloseBtn = document.getElementById('comments-modal-close-btn');
    const commentForm = document.getElementById('comment-form'); // Form no modal
    const commentInput = document.getElementById('comment-input');
    const replyIndicator = document.getElementById('reply-indicator');

    // Gerenciamento de Perfil
    const manageProfileView = document.getElementById('manage-profile-view');
    const manageProfilesBtn = document.getElementById('manage-profiles-btn');
    const profilesGrid = document.getElementById('profiles-grid');
    const profileModal = document.getElementById('profile-modal');
    const avatarOptionsContainer = document.getElementById('avatar-options');
    const headerProfileBtn = document.getElementById('header-profile-btn');
    const logoutBtn = document.getElementById('logout-btn');

    // Modal de Confirmação
    const confirmModal = document.getElementById('confirm-modal');
    const confirmTitle = document.getElementById('confirm-title');
    const confirmMessage = document.getElementById('confirm-message');
    const confirmOkBtn = document.getElementById('confirm-ok-btn');
    const confirmCancelBtn = document.getElementById('confirm-cancel-btn');
    let confirmCallback = null;

    // Estado de Gerenciamento de Perfil
    let profiles = [];
    let currentProfile = null;
    let isEditMode = false;
    const AVATARS = [
        'https://pbs.twimg.com/media/EcGdw6xXsAMkqGF?format=jpg&name=large',
        'https://pbs.twimg.com/media/FMs8_KeWYAAtoS3.jpg',
        'https://i.pinimg.com/736x/a8/31/b5/a831b58a3a067756a16518884967e812.jpg',
        'https://pbs.twimg.com/media/EcGdw6uXgAEpGA-.jpg'
    ];

    // Ícones SVG
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
        aspectCover: `<svg fill="currentColor" viewBox="0 0 24 24"><path d="M4 5h16v14H4V5z"></path></svg>`,
        heartOutline: `<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path></svg>`,
        heartFilled: `<svg fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg>`,
        comment: `<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 5.523-4.477 10-10 10S1 17.523 1 12 5.477 2 11 2s10 4.477 10 10z"></path></svg>`,
        reply: `<svg fill="currentColor" viewBox="0 0 24 24" class="w-4 h-4"><path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"></path></svg>`,
        trash: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12.576 0c.269.045.54.088.82.128m11.756 0A48.269 48.269 0 0 1 5.472 5.79m14.456 0L13.102 3.102m-6.84 2.688L5.614 3.102" /></svg>`,
        send: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" /></svg>`
    };

    /** Mostra notificação toast */
    function showToast(message, isError = false) {
        const toast = document.getElementById('notification-toast');
        if (!toast) return;
        toast.textContent = message;
        toast.style.backgroundColor = isError ? 'rgba(239, 68, 68, 0.7)' : 'rgba(34, 197, 94, 0.7)';
        toast.classList.remove('hidden', 'opacity-0');
        toast.classList.add('opacity-100');
        setTimeout(() => {
            toast.classList.remove('opacity-100');
            toast.classList.add('opacity-0');
            setTimeout(() => toast.classList.add('hidden'), 300);
        }, 3000);
    }

    // --- Funções de Dados do Firestore ---

    async function getMyList() {
        if (!userId || !currentProfile?.id) return [];
        const myListCol = collection(db, 'users', userId, 'profiles', currentProfile.id, 'my-list');
        const snapshot = await getDocs(myListCol);
        return snapshot.docs.map(doc => doc.data());
    }

    async function checkIfInList(itemId) {
        if (!userId || !currentProfile?.id) return false;
        const docRef = doc(db, 'users', userId, 'profiles', currentProfile.id, 'my-list', String(itemId));
        const docSnap = await getDoc(docRef);
        return docSnap.exists();
    }

    async function handleListAction(item) {
        if (!item || !userId || !currentProfile?.id) {
            showToast("Erro: Faça login e selecione um perfil para gerenciar sua lista.", true);
            return;
        }
        const itemId = String(item.docId || item.id);
        const docRef = doc(db, 'users', userId, 'profiles', currentProfile.id, 'my-list', itemId);
        const isInList = await checkIfInList(itemId);

        try {
            if (isInList) {
                await deleteDoc(docRef);
                showToast("Removido da sua lista.");
            } else {
                const itemToAdd = { ...item, media_type: item.media_type || (item.title ? 'movie' : 'tv') };
                delete itemToAdd.seasons;
                delete itemToAdd.episodes;
                await setDoc(docRef, itemToAdd);
                showToast("Adicionado à sua lista.");
            }
            updateListButtons(item);
            if (window.location.hash === '#mylist-view') populateMyList();
        } catch (error) {
            console.error("Erro ao adicionar/remover da lista:", error);
            showToast("Erro ao atualizar sua lista.", true);
        }
    }

    async function toggleMyListItem(item) {
        await handleListAction(item);
    }

    function updateListButtons(item) {
        if (!item) return; // Adiciona verificação
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


    async function getProgressStorage() {
        if (!userId || !currentProfile?.id) return {};
        const progressCol = collection(db, 'users', userId, 'profiles', currentProfile.id, 'watch-progress');
        const snapshot = await getDocs(progressCol);
        const progressData = {};
        snapshot.forEach(doc => { progressData[doc.id] = doc.data(); });
        return progressData;
    }

    async function savePlayerProgress() {
        if (!videoPlayer.duration || !currentPlayerContext.key || !userId || !currentProfile?.id) return;

        const progressData = {
            currentTime: videoPlayer.currentTime,
            duration: videoPlayer.duration,
            lastWatched: serverTimestamp(),
            itemInfo: {
                docId: currentPlayerContext.itemData?.docId,
                title: currentPlayerContext.itemData?.title || currentPlayerContext.itemData?.name,
                poster: currentPlayerContext.itemData?.poster,
                type: currentPlayerContext.itemData?.type
            },
            episodeInfo: currentPlayerContext.episodes
                ? {
                    title: currentPlayerContext.episodes[currentPlayerContext.currentIndex]?.title,
                    season_number: currentPlayerContext.episodes[currentPlayerContext.currentIndex]?.season_number,
                    episode_number: currentPlayerContext.episodes[currentPlayerContext.currentIndex]?.episode_number,
                    still_path: currentPlayerContext.episodes[currentPlayerContext.currentIndex]?.still_path
                  }
                : null,
        };
        const docRef = doc(db, 'users', userId, 'profiles', currentProfile.id, 'watch-progress', currentPlayerContext.key);
        try {
            await setDoc(docRef, progressData, { merge: true });
        } catch (error) {
            console.error("Erro ao salvar progresso:", error);
        }
    }

    // --- Funções de Criação de UI ---

    async function fetchFromTMDB(endpoint, params = '') {
        const url = `${API_URL}/${endpoint}?api_key=${API_KEY}&language=${LANGUAGE}&${params}`;
        try {
            const response = await fetch(url);
            if (!response.ok) {
                console.error(`HTTP error! status: ${response.status} for URL: ${url}`);
                return null;
            }
            return (await response.json());
        } catch (error) {
            console.error("Erro ao buscar dados do TMDB:", error);
            return null;
        }
    }

    function createCarousel(container, title, data) {
        if (!container || !data || data.length === 0) return;
        const section = document.createElement('section');
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
        container.appendChild(section);
        lucide.createIcons();
    }

    function createContentCard(item) {
        if (!item || !item.poster) return '';
        const posterPath = item.poster.startsWith('http') ? item.poster : `https://placehold.co/300x450/1c1917/FFFFFF?text=Sem+Imagem`;
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

    function createGridCard(item) {
        if (!item || !item.poster) return '';
        const posterPath = item.poster.startsWith('http') ? item.poster : `https://placehold.co/300x450/1c1917/FFFFFF?text=Sem+Imagem`;
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

    async function displayContentRating(item, container) {
        if (!item || !container || !item.rating) return;
        const certification = item.rating;
        const ratingClassMap = { 'Livre': 'rating-L', '10': 'rating-10', '12': 'rating-12', '14': 'rating-14', '16': 'rating-16', '18': 'rating-18' };
        const ratingClass = ratingClassMap[certification] || '';
        if (!ratingClass) return;

        const ratingElement = document.createElement('div');
        ratingElement.className = 'glass-container rating-box ' + ratingClass;
        ratingElement.innerHTML = `
            <div class="glass-filter"></div>
            <div class="glass-overlay"></div>
            <div class="glass-specular"></div>
            <div class="glass-content">${certification === 'Livre' ? 'L' : certification}</div>`;
        container.prepend(ratingElement);
    }

    function startHeroRotation() {
        if (heroCarouselInterval) clearInterval(heroCarouselInterval);
        const featuredItems = featuredItemIds.map(id => firestoreContent.find(item => item.docId === id)).filter(Boolean);
        if (featuredItems.length <= 1) return;

        let currentFeaturedIndex = 0;
        heroCarouselInterval = setInterval(() => {
            currentFeaturedIndex = (currentFeaturedIndex + 1) % featuredItems.length;
            updateHero(featuredItems[currentFeaturedIndex]);
        }, 8000);
    }

    async function updateHero(item) {
        if (!item) return;

        const heroContentWrapper = document.getElementById('hero-content-wrapper');
        const mainBackground = document.getElementById('main-background');

        heroContentWrapper.classList.add('hero-fade-out');
        mainBackground.style.opacity = 0;

        setTimeout(async () => {
            currentHeroItem = item;
            const backgroundUrl = item.backdrop;
            mainBackground.style.backgroundImage = `url('${backgroundUrl}')`;

            document.getElementById('hero-category').textContent = 'EM DESTAQUE';
            document.getElementById('hero-title').textContent = item.title || item.name;
            const synopsis = item.synopsis || item.overview || '';
            document.getElementById('hero-overview').textContent = synopsis.length > 200 ? synopsis.substring(0, 200) + '...' : synopsis;
            const releaseYear = item.year;

            const metaContainer = document.getElementById('hero-meta');
            metaContainer.innerHTML = ``;
            await displayContentRating(item, metaContainer);
            metaContainer.innerHTML += `<span>${releaseYear}</span>`;

            await updateListButton(document.getElementById('hero-add-to-list'), item);

            mainBackground.style.opacity = 1;
            heroContentWrapper.style.opacity = 1;
            heroContentWrapper.classList.remove('hero-fade-out');
        }, 500);
    }

    async function updateListButton(button, item) {
        if (!button || !item) return;
        if (!userId || !currentProfile?.id) {
            button.disabled = true;
            button.style.opacity = '0.5';
            button.style.cursor = 'not-allowed';
            const contentDiv = button.querySelector('.glass-content');
            if (contentDiv) {
                contentDiv.innerHTML = `<svg class="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg><span>Minha Lista</span>`;
            }
            return;
        }
        button.disabled = false;
        button.style.opacity = '1';
        button.style.cursor = 'pointer';

        const itemId = String(item.docId || item.id);
        const isInList = await checkIfInList(itemId);
        const contentDiv = button.querySelector('.glass-content');
        contentDiv.innerHTML = isInList
            ? `<svg class="w-5 h-5 sm:w-6 sm:h-6" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path></svg><span>Na Lista</span>`
            : `<svg class="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg><span>Minha Lista</span>`;

        if (button.clickHandler) {
            button.removeEventListener('click', button.clickHandler);
        }
        button.clickHandler = () => toggleMyListItem(item);
        button.addEventListener('click', button.clickHandler);
    }

    async function populateMyList() {
        const list = await getMyList();
        const container = document.getElementById('my-list-grid');
        if (!container) return;
        container.innerHTML = list.length === 0
            ? '<p class="col-span-full text-center text-gray-400">Sua lista está vazia.</p>'
            : list.map(item => createGridCard(item)).join('');
        attachGlassButtonListeners();
    }

    // --- Lógica Player de Vídeo (Novidades) ---
    function showNewsPlayer(url, title) {
        if (!newsPlayerView || !newsPlayerVideo) return;
        newsPlayerTitle.textContent = title || 'Vídeo';
        newsPlayerVideo.src = url;
        newsPlayerView.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }

    function hideNewsPlayer() {
        if (!newsPlayerView || !newsPlayerVideo) return;
        newsPlayerVideo.pause();
        newsPlayerVideo.removeAttribute('src');
        newsPlayerVideo.load();
        newsPlayerView.classList.add('hidden');
        if (playerView.classList.contains('hidden') && commentsModal.classList.contains('hidden')) { // Verifica modal de comentários também
            document.body.style.overflow = 'auto';
        }
    }
    if (newsPlayerCloseBtn) newsPlayerCloseBtn.addEventListener('click', hideNewsPlayer);
    // --- FIM: Lógica Player de Vídeo (Novidades) ---

    /** Escuta por atualizações na coleção 'content' */
    async function listenToFirestoreContent() {
        if (!userId) {
            console.log("listenToFirestoreContent: userId ausente, não iniciando listener.");
            return;
        }
        if (typeof window.unsubscribeContent === 'function') window.unsubscribeContent();
        if (typeof window.unsubscribeFeatured === 'function') window.unsubscribeFeatured();

        console.log("Iniciando listener para 'content'...");
        window.unsubscribeContent = onSnapshot(collection(db, 'content'), (snapshot) => {
            console.log("Recebido snapshot de 'content'.");
            firestoreContent = [];
            snapshot.forEach(doc => { firestoreContent.push({ docId: doc.id, ...doc.data() }); });
            console.log(`Cache de 'content' atualizado com ${firestoreContent.length} itens.`);

            if (typeof window.unsubscribeFeatured === 'function') window.unsubscribeFeatured();
            console.log("Iniciando listener para 'config/featured'...");
            window.unsubscribeFeatured = onSnapshot(doc(db, 'config', 'featured'), (docSnap) => {
                console.log("Recebido snapshot de 'config/featured'.");
                featuredItemIds = docSnap.exists() ? (docSnap.data().items || []) : [];
                console.log(`Itens em destaque atualizados: ${featuredItemIds.length > 0 ? featuredItemIds.join(', ') : 'Nenhum'}.`);
                handleNavigation();
            }, (error) => {
                console.error("Erro ao escutar config/featured:", error);
                featuredItemIds = [];
                handleNavigation();
            });
        }, (error) => {
            console.error("Erro ao escutar coleção 'content':", error);
            firestoreContent = [];
            handleNavigation();
        });
    }

    async function populateAllViews() {
        const carouselsContainer = document.getElementById('home-carousels-container');
        if (!carouselsContainer) return;
        carouselsContainer.innerHTML = '';

        if(firestoreContent.length === 0) {
            console.log("populateAllViews: firestoreContent vazio, não populando carrosséis.");
            carouselsContainer.innerHTML = '<p class="text-center text-gray-400">Carregando catálogo...</p>';
            return;
        }

        const recentlyAdded = [...firestoreContent]
            .sort((a, b) => (b.addedAt?.toMillis() || 0) - (a.addedAt?.toMillis() || 0))
            .slice(0, 20);
        createCarousel(carouselsContainer, "Adicionado Recentemente", recentlyAdded);

        const allGenres = [...new Set(firestoreContent.flatMap(item => item.genres || []))];
        for (const genre of allGenres) {
            const filteredContent = firestoreContent.filter(item => item.genres && item.genres.includes(genre));
            createCarousel(carouselsContainer, genre, filteredContent);
        }
        attachGlassButtonListeners();
    }

    // --- Navegação e Gerenciamento de Views ---

    const navLinks = document.querySelectorAll('.nav-item, .mobile-nav-item');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('data-target');
            if (!targetId) return;
            if (window.location.hash !== `#${targetId}`) {
                window.location.hash = targetId;
            } else {
                handleNavigation();
            }
        });
    });

    function renderScreenContent(screenId, forceReload = false) {
        const screenElement = document.getElementById(screenId);
        if (!screenElement) return;

        // Garante que mídia de outras seções pare
        if (screenId !== 'player-view') {
            if (!playerView.classList.contains('hidden')) {
                hidePlayer(false, false);
            }
        }
        if (screenId !== 'news-view') {
            stopNewsViewMedia();
        }
        if (screenId !== 'news-view' && screenId !== 'comments-modal') { // Fecha modal se sair de novidades
             if (!commentsModal.classList.contains('hidden')) {
                 closeCommentsModal();
             }
        }


        if (screenId === 'home-view') {
            const featuredItems = featuredItemIds.map(id => firestoreContent.find(item => item.docId === id)).filter(Boolean);
            if (featuredItems.length > 0) {
                updateHero(featuredItems[0]);
                startHeroRotation();
            } else if (firestoreContent.length > 0) {
                const mostRecent = [...firestoreContent].sort((a, b) => (b.addedAt?.toMillis() || 0) - (a.addedAt?.toMillis() || 0))[0];
                if(mostRecent) updateHero(mostRecent);
            } else {
                 document.getElementById('hero-content-wrapper').style.opacity = 0;
            }
            populateAllViews();
        } else if (screenId === 'series-view') {
            const grid = document.getElementById('series-grid');
            const series = firestoreContent.filter(item => item.type === 'tv');
            grid.innerHTML = series.length > 0 ? series.map(createGridCard).join('') : '<p class="col-span-full text-center text-gray-400">Nenhuma série encontrada.</p>';
        } else if (screenId === 'movies-view') {
            const grid = document.getElementById('movies-grid');
            const movies = firestoreContent.filter(item => item.type === 'movie');
            grid.innerHTML = movies.length > 0 ? movies.map(createGridCard).join('') : '<p class="col-span-full text-center text-gray-400">Nenhum filme encontrado.</p>';
        } else if (screenId === 'mylist-view') {
            populateMyList();
        } else if (screenId === 'requests-view') {
            renderPendingRequests();
        } else if (screenId === 'news-view') {
            renderNewsView();
            listenForNewsLikes();
            listenForNewsComments(); // Inicia listener de comentários
        } else {
            // Se saiu de uma view que tinha listeners específicos (como novidades), para eles
            if (typeof unsubscribeNewsLikes === 'function') unsubscribeNewsLikes();
            if (typeof unsubscribeNewsComments === 'function') unsubscribeNewsComments();
        }

        lucide.createIcons();
        attachGlassButtonListeners();
    }


    document.body.addEventListener('click', (e) => {
        const anchor = e.target.closest('a');
        if (anchor && anchor.hash.startsWith('#details/')) {
            e.preventDefault();
            window.location.hash = anchor.hash;
        }
    });

    async function showDetailsView(item) {
        document.querySelector('header').classList.add('hidden');
        document.querySelector('footer').classList.add('hidden');

        detailsView.classList.remove('hidden');
        detailsView.innerHTML = '<div class="spinner mx-auto mt-20"></div>';
        window.scrollTo(0, 0);

        const data = firestoreContent.find(i => i.docId === item.docId);
        if (!data) {
            detailsView.innerHTML = '<p class="text-center text-red-400 mt-20">Conteúdo não encontrado.</p>';
            return;
        }

        currentDetailsItem = data;
        const title = data.title || data.name;
        const releaseYear = data.year || '';
        const genres = data.genres ? data.genres.map(g => `<span class="bg-white/10 text-xs font-semibold px-2 py-1 rounded-full text-white">${g}</span>`).join('') : '';
        let duration = '';
        if (data.type === 'movie' && data.duration) {
            duration = data.duration;
        } else if (data.type === 'tv' && data.seasons) {
            duration = `${Object.keys(data.seasons).length} Temporada(s)`;
        }

        let backgroundUrl = data.backdrop;
        const finalImageUrl = backgroundUrl && backgroundUrl.startsWith('http') ? backgroundUrl : 'https://placehold.co/1280x720/0c0a09/ffffff?text=Starlight';
        const posterUrl = data.poster && data.poster.startsWith('http') ? data.poster : 'https://placehold.co/500x750/1a1a1a/ffffff?text=Capa';

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
                            <div id="details-meta" class="flex items-center justify-center md:justify-start flex-wrap gap-x-4 gap-y-2 mt-4 text-base text-stone-300"></div>
                            <div class="mt-4 flex flex-wrap gap-2 justify-center md:justify-start">${genres}</div>
                            <div class="mt-8 flex flex-wrap gap-4 justify-center md:justify-start">
                                <button id="details-watch-btn" class="glass-container glass-button rounded-full text-base sm:text-lg px-7 py-2.5 sm:px-8 sm:py-3"><div class="glass-filter"></div><div class="glass-overlay"></div><div class="glass-specular"></div><div class="glass-content flex items-center gap-2"><svg class="w-5 h-5 sm:w-6 sm:h-6" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"></path></svg>Assistir</div></button>
                                <button id="details-add-to-list" class="glass-container glass-button rounded-full text-base sm:text-lg px-7 py-2.5 sm:px-8 sm:py-3"><div class="glass-filter"></div><div class="glass-overlay"></div><div class="glass-specular"></div><div class="glass-content flex items-center gap-2"></div></button>
                            </div>
                            <h3 class="mt-8 text-lg sm:text-xl font-semibold text-white">Sinopse</h3>
                            <p class="mt-2 text-gray-300 max-w-2xl text-sm leading-relaxed">${data.synopsis || data.overview || 'Sinopse não disponível.'}</p>
                            <div id="tv-content-details" class="mt-10"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const detailsMetaContainer = detailsView.querySelector('#details-meta');
        if (detailsMetaContainer) {
            displayContentRating(data, detailsMetaContainer);
            detailsMetaContainer.innerHTML += `
                ${releaseYear ? `<span>${releaseYear}</span>` : ''}
                ${duration ? `<span>•</span><span>${duration}</span>` : ''}
            `;
        }

        document.getElementById('back-from-details').addEventListener('click', () => history.back());
        document.getElementById('details-watch-btn').addEventListener('click', () => {
            if (data.type === 'movie') {
                showPlayer({ videoUrl: data.url, title: title, itemData: data });
            } else if (data.type === 'tv' && data.seasons) {
                const firstSeasonKey = Object.keys(data.seasons).sort((a, b) => parseInt(a) - parseInt(b))[0];
                const firstEpisode = data.seasons[firstSeasonKey]?.episodes?.[0];

                if (firstEpisode && firstEpisode.url) { // Verifica se URL existe
                    const allEpisodesOfSeason = data.seasons[firstSeasonKey].episodes;
                    const context = {
                        videoUrl: firstEpisode.url,
                        title: `${title} - T${firstSeasonKey} E${firstEpisode.episode_number || 1}`,
                        itemData: data,
                        episodes: allEpisodesOfSeason,
                        currentIndex: 0
                    };
                    showPlayer(context);
                } else {
                    showToast("Link de vídeo não encontrado para o primeiro episódio.", true);
                }
            } else {
                 showToast("Link de vídeo não encontrado.", true);
            }
        });
        await updateListButton(document.getElementById('details-add-to-list'), data);

        if (data.type === 'tv' && data.seasons) {
            renderTvDetails(data);
        }
        attachGlassButtonListeners();
    }

    function renderTvDetails(data) {
        const container = document.getElementById('tv-content-details');
        if (!container) return;

        const seasonKeys = Object.keys(data.seasons || {}).sort((a, b) => parseInt(a) - parseInt(b));
        if (seasonKeys.length === 0) {
            container.innerHTML = '<p class="text-stone-400">Nenhuma temporada encontrada.</p>';
            return;
        }

        const savedSeason = localStorage.getItem(`starlight-selected-season-${data.docId}`);
        const firstSeasonKey = (savedSeason && data.seasons[savedSeason]) ? savedSeason : seasonKeys[0];

        container.innerHTML = `
            <div class="custom-select-container relative w-full md:w-64 mb-6">
                <button id="season-selector-button" class="glass-container glass-button rounded-lg w-full text-left">
                    <div class="glass-filter"></div>
                    <div class="glass-overlay" style="--glass-bg-color: rgba(25, 25, 25, 0.5);"></div>
                    <div class="glass-specular"></div>
                    <div class="glass-content flex justify-between items-center p-3">
                        <span id="selected-season-text">${data.seasons[firstSeasonKey]?.title || `Temporada ${firstSeasonKey}`}</span>
                        <i data-lucide="chevron-down" class="w-5 h-5 transition-transform"></i>
                    </div>
                </button>
                <div id="season-options" class="hidden custom-select-options glass-container rounded-lg animate-fade-in-down">
                    <div class="glass-filter"></div>
                    <div class="glass-overlay" style="--glass-bg-color: rgba(25, 25, 25, 0.7);"></div>
                    <div class="glass-specular"></div>
                    <div id="season-options-content" class="glass-content p-2">
                        ${seasonKeys.map(key => `<div class="custom-select-option p-3 rounded-md cursor-pointer" data-season="${key}">${data.seasons[key]?.title || `Temporada ${key}`}</div>`).join('')}
                    </div>
                </div>
            </div>
            <div id="episode-list-container" class="space-y-3"></div>
        `;
        lucide.createIcons();

        const renderEpisodes = (seasonKey) => {
            const season = data.seasons[seasonKey];
            const episodes = season?.episodes;
            const episodeContainer = document.getElementById('episode-list-container');
            if (!episodes || episodes.length === 0) {
                episodeContainer.innerHTML = '<p class="text-stone-400">Nenhum episódio encontrado para esta temporada.</p>';
                return;
            }
            episodeContainer.innerHTML = episodes.map((ep, index) => {
                const epTitle = ep.title || `Episódio ${ep.episode_number || index + 1}`;
                const epOverview = ep.overview || 'Sem descrição.';
                const stillPath = ep.still_path ? (ep.still_path.startsWith('/') ? `https://image.tmdb.org/t/p/w300${ep.still_path}` : ep.still_path) : 'https://placehold.co/300x168/1c1917/FFFFFF?text=Starlight';

                return `
                    <div class="episode-item glass-container glass-button rounded-lg overflow-hidden cursor-pointer ${!ep.url ? 'opacity-50 pointer-events-none' : ''}" data-index="${index}" data-season="${seasonKey}" ${!ep.url ? 'title="Link de vídeo indisponível"' : ''}>
                        <div class="glass-filter"></div>
                        <div class="glass-overlay" style="--glass-bg-color: rgba(25, 25, 25, 0.3);"></div>
                        <div class="glass-specular"></div>
                        <div class="glass-content flex items-start p-3 gap-4">
                            <div class="relative flex-shrink-0">
                                <img src="${stillPath}" alt="Cena do episódio" class="w-32 sm:w-40 rounded-md aspect-video object-cover">
                                ${ep.url ? `
                                <div class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <i data-lucide="play-circle" class="w-8 h-8 text-white"></i>
                                </div>` : ''}
                            </div>
                            <div class="flex-1">
                                <h4 class="font-semibold text-white">${index + 1}. ${epTitle}</h4>
                                <p class="text-xs text-stone-300 mt-1 max-h-16 overflow-hidden">${epOverview}</p>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
            lucide.createIcons();
        };

        renderEpisodes(firstSeasonKey);

        const seasonSelectorBtn = document.getElementById('season-selector-button');
        const seasonOptions = document.getElementById('season-options');

        seasonSelectorBtn.addEventListener('click', () => {
            const isHidden = seasonOptions.classList.toggle('hidden');
            seasonSelectorBtn.querySelector('i').style.transform = isHidden ? 'rotate(0deg)' : 'rotate(180deg)';
        });

        document.getElementById('season-options-content').addEventListener('click', (e) => {
            const option = e.target.closest('.custom-select-option');
            if (option) {
                const seasonKey = option.dataset.season;
                document.getElementById('selected-season-text').textContent = data.seasons[seasonKey]?.title || `Temporada ${seasonKey}`;
                renderEpisodes(seasonKey);
                localStorage.setItem(`starlight-selected-season-${data.docId}`, seasonKey);
                seasonSelectorBtn.click();
                attachGlassButtonListeners();
            }
        });

        document.getElementById('episode-list-container').addEventListener('click', (e) => {
            const episodeItem = e.target.closest('.episode-item');
            if (episodeItem) {
                const seasonKey = episodeItem.dataset.season;
                const episodeIndex = parseInt(episodeItem.dataset.index, 10);
                const allEpisodesOfSeason = data.seasons[seasonKey]?.episodes;

                if (!allEpisodesOfSeason || !allEpisodesOfSeason[episodeIndex]) {
                    showToast("Erro ao carregar dados do episódio.", true); return;
                }
                const episode = allEpisodesOfSeason[episodeIndex];
                if (!episode.url) {
                    showToast("Link de vídeo para este episódio não encontrado.", true); return;
                }

                const context = {
                    videoUrl: episode.url,
                    title: `${data.name} - T${seasonKey} E${episode.episode_number || episodeIndex + 1}`,
                    itemData: data,
                    episodes: allEpisodesOfSeason,
                    currentIndex: episodeIndex
                };
                showPlayer(context);
            }
        });
    }

    function handleMouseMove(e) { const rect = this.getBoundingClientRect(); const x = e.clientX - rect.left; const y = e.clientY - rect.top; const specular = this.querySelector('.glass-specular'); if (specular) specular.style.background = `radial-gradient(circle at ${x}px ${y}px, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.05) 30%, rgba(255,255,255,0) 60%)`; }
    function handleMouseLeave() { const specular = this.querySelector('.glass-specular'); if (specular) specular.style.background = 'none'; }
    function attachGlassButtonListeners() { document.querySelectorAll('.glass-button, .liquid-glass-card, .player-control-btn, .glass-container[style*="--bg-color"], .glass-form').forEach(element => { if (!element.hasGlassListener) { element.addEventListener('mousemove', handleMouseMove); element.addEventListener('mouseleave', handleMouseLeave); element.hasGlassListener = true; } }); }
    function updateMobileNavIndicator() { const indicator = document.getElementById('mobile-nav-indicator'); const activeItem = document.querySelector('#mobile-nav .mobile-nav-item.active'); if (indicator && activeItem) { const left = activeItem.offsetLeft; const width = activeItem.offsetWidth; indicator.style.width = `${width}px`; indicator.style.transform = `translateX(${left}px)`; } }
    function toggleSearchOverlay(show) { if (show) { searchOverlay.classList.remove('hidden'); searchInput.focus(); document.body.style.overflow = 'hidden'; } else { searchOverlay.classList.add('hidden'); searchInput.value = ''; searchResultsContainer.innerHTML = ''; if (playerView.classList.contains('hidden') && newsPlayerView.classList.contains('hidden') && commentsModal.classList.contains('hidden')) document.body.style.overflow = 'auto'; } }

    /** Realiza a busca no CATÁLOGO LOCAL */
    function performSearch(query) {
        if (query.length < 2) {
            searchResultsContainer.innerHTML = `<p class="col-span-full text-center text-gray-400">Digite pelo menos 2 caracteres.</p>`;
            return;
        }
        if (!firestoreContent || firestoreContent.length === 0) {
            searchResultsContainer.innerHTML = `<p class="col-span-full text-center text-gray-400">O catálogo está carregando...</p>`;
            return;
        }
        const lowerCaseQuery = query.toLowerCase();
        const results = firestoreContent.filter(item => (item.title || item.name || '').toLowerCase().includes(lowerCaseQuery));

        searchResultsContainer.innerHTML = results.length > 0
            ? results.map(item => createGridCard(item)).join('')
            : `<p class="col-span-full text-center text-gray-400">Nenhum resultado para "${query}" em nosso catálogo.</p>`;
        attachGlassButtonListeners();
    }


    // --- Funções do Player Principal (Filmes/Séries) ---

    async function showPlayer(context) {
        // 1. Reset se necessário (não reseta se for mudança de episódio)
        // A flag isChangingEpisode é controlada internamente
        // hidePlayer(false, true); // true indica mudança, não reseta UI/orientação
        // await new Promise(resolve => setTimeout(resolve, 50));

        let key;
        let itemData = context.itemData;
        if (!itemData || !context.videoUrl) {
            console.error("showPlayer chamado sem itemData ou videoUrl:", context);
            showToast("Erro ao carregar informações do vídeo.", true);
            // Se falhar ao iniciar, esconde o player para não ficar preso
            hidePlayer(false, false);
            return;
        }

        if (context.episodes && context.episodes[context.currentIndex]) {
            const episode = context.episodes[context.currentIndex];
            const seasonNum = episode.season_number ?? 1;
            const episodeNum = episode.episode_number ?? (context.currentIndex + 1);
            key = `tv-${itemData.docId}-s${seasonNum}-e${episodeNum}`;
        } else {
            key = `movie-${itemData.docId}`;
        }

        // Se a chave mudou OU se não havia chave antes, limpa o estado do player
        if (currentPlayerContext.key !== key) {
            console.log("Nova chave de player detectada, resetando estado anterior.");
            // Limpa HLS anterior se existir
            if (hls) {
                hls.destroy();
                hls = null;
            }
            videoPlayer.removeAttribute('src');
            videoPlayer.load(); // Força reset
            // Reseta UI do player
            seekBar.value = 0;
            seekProgressBar.style.width = '0%';
            currentTimeEl.textContent = '00:00';
            durationEl.textContent = '00:00';
            playPauseBtn.querySelector('.glass-content').innerHTML = ICONS.play;
        } else {
            console.log("Mesma chave de player, continuando...");
        }


        currentPlayerContext = { ...context, key, id: itemData.docId, itemData };

        if (window.location.hash !== '#player') {
            history.pushState({ view: 'player' }, '', '#player');
        }

        playerView.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        playerTitle.textContent = context.title;

        let urlToLoad = context.videoUrl;
        try {
            const urlObject = new URL(urlToLoad);
            if (urlObject.hostname.includes('api.anivideo.net') && urlObject.pathname.includes('videohls.php')) {
                const videoSrc = urlObject.searchParams.get('d');
                if (videoSrc) urlToLoad = videoSrc;
            }
        } catch (e) { console.warn("URL de vídeo inválida:", urlToLoad, e); }

        console.log("Tentando carregar URL no player:", urlToLoad);

        // Destroi HLS anterior ANTES de criar um novo
        if (hls) {
             console.log("Destruindo instância HLS anterior...");
             hls.destroy();
             hls = null;
        }

        if (Hls.isSupported() && urlToLoad.includes('.m3u8')) {
            console.log("Usando HLS.js para:", urlToLoad);
            hls = new Hls({ maxBufferLength: 30, maxBufferSize: 60 * 1000 * 1000, startLevel: -1 });

            hls.on(Hls.Events.ERROR, function (event, data) {
                console.error('HLS.js Error:', data);
                if (data.fatal) {
                    switch(data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            console.error("Erro fatal de rede HLS"); hls.startLoad(); break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            console.error("Erro fatal de mídia HLS"); hls.recoverMediaError(); break;
                        default:
                            showToast("Erro ao carregar o vídeo (HLS).", true); if(hls) hls.destroy(); hls = null; break;
                    }
                }
            });

            hls.loadSource(urlToLoad);
            hls.attachMedia(videoPlayer);
            hls.once(Hls.Events.MANIFEST_PARSED, () => { // Usar once para evitar múltiplos plays
                console.log("Manifesto HLS carregado.");
                if (context.startTime && context.startTime > 5) {
                    console.log("Pulando para tempo salvo (HLS):", context.startTime);
                    videoPlayer.currentTime = context.startTime;
                }
                videoPlayer.play().catch(e => console.error("Erro ao tentar play HLS:", e.name, e.message));
            });
        } else {
            console.log("Usando player nativo para:", urlToLoad);
            // Define o src APENAS se for diferente ou se não houver HLS
            if (videoPlayer.src !== urlToLoad) {
                 videoPlayer.src = urlToLoad;
            }
             // Usa 'canplay' ou 'loadedmetadata' - 'canplay' pode ser mais robusto
             const startPlayback = () => {
                 console.log("Metadados/canplay do vídeo nativo carregados.");
                 if (context.startTime && context.startTime > 5) {
                     console.log("Pulando para tempo salvo (nativo):", context.startTime);
                     videoPlayer.currentTime = context.startTime;
                 }
                 videoPlayer.play().catch(e => console.error("Erro ao tentar play nativo:", e.name, e.message));
             };
             // Remove listener antigo se existir, para evitar chamadas múltiplas
             videoPlayer.removeEventListener('canplay', startPlayback);
             videoPlayer.addEventListener('canplay', startPlayback, { once: true });

            videoPlayer.removeEventListener('error', handleVideoError); // Remove listener antigo
            videoPlayer.addEventListener('error', handleVideoError); // Adiciona novo
        }

        // Lógica de orientação/fullscreen (APENAS se não estiver trocando episódio)
        if (!context.isChangingEpisode && window.innerWidth < 768) {
            console.log("Entrando no modo mobile player...");
            if (!document.fullscreenElement) {
                try { await playerView.requestFullscreen(); } catch (err) { console.error("Falha ao ativar tela cheia:", err); }
            }
            try { if (screen.orientation && typeof screen.orientation.lock === 'function') await screen.orientation.lock('landscape'); } catch (err) { console.error("Falha ao bloquear orientação:", err); }
        }

        // Botões de episódio
        if (context.episodes && context.episodes.length > 1) {
            nextEpisodeBtn.classList.remove('hidden');
            prevEpisodeBtn.classList.remove('hidden');
            prevEpisodeBtn.disabled = context.currentIndex === 0;
            nextEpisodeBtn.disabled = context.currentIndex === context.episodes.length - 1;
        } else {
            nextEpisodeBtn.classList.add('hidden');
            prevEpisodeBtn.classList.add('hidden');
        }

        attachGlassButtonListeners();
        // Garante que os listeners do player estejam atualizados
        addPlayerEventListeners();
    }
     // Handler de erro separado para o player nativo
    function handleVideoError(e) {
         console.error("Erro no elemento <video>:", e, videoPlayer.error);
         showToast("Erro ao carregar o vídeo.", true);
         // Tenta esconder o player se houver erro crítico
         hidePlayer(false, false);
    }


    /** Esconde o player */
    async function hidePlayer(updateHistory = true, isChangingEpisode = false) {
        console.log(`hidePlayer chamado: updateHistory=${updateHistory}, isChangingEpisode=${isChangingEpisode}`);

        // Salva progresso apenas se estiver saindo de verdade e houver algo para salvar
        if (updateHistory && !isChangingEpisode && currentPlayerContext.key && videoPlayer.currentTime > 0) {
            console.log("Salvando progresso antes de fechar...");
            await savePlayerProgress();
        }

        videoPlayer.pause();

        // Destrói HLS se existir
        if (hls) {
            console.log("Destruindo instância HLS...");
            hls.destroy();
            hls = null;
        }

        // Limpa src e força load para parar downloads
        console.log("Resetando src e carregando vídeo vazio...");
        videoPlayer.removeAttribute('src');
        // Remove listeners específicos do vídeo ANTES de chamar load()
        videoPlayer.removeEventListener('canplay', null);
        videoPlayer.removeEventListener('loadedmetadata', null);
        videoPlayer.removeEventListener('error', handleVideoError);
        videoPlayer.load();

        playerView.classList.add('hidden');
        // Restaura scroll apenas se outros modais/players não estiverem ativos
        if (newsPlayerView.classList.contains('hidden') && commentsModal.classList.contains('hidden')) {
            document.body.style.overflow = 'auto';
        }

        // Limpa contexto APENAS se não estiver trocando de episódio
        if (!isChangingEpisode) {
            console.log("Limpando contexto do player.");
            currentPlayerContext = {};
        }

        // Sai do fullscreen e desbloqueia orientação (APENAS se não estiver trocando episódio)
        if (!isChangingEpisode) {
            console.log("Tentando sair do fullscreen e desbloquear orientação...");
            if (document.fullscreenElement === playerView || document.fullscreenElement === document.documentElement) { // Verifica se o elemento correto está em fullscreen
                 try {
                     await document.exitFullscreen();
                     console.log("Saída do fullscreen bem-sucedida.");
                 } catch (err) {
                     console.error("Erro ao sair da tela cheia:", err);
                 }
            }
             try {
                 if (screen.orientation && typeof screen.orientation.unlock === 'function' && screen.orientation.type.startsWith('landscape')) { // Só desbloqueia se estiver em landscape
                     screen.orientation.unlock();
                     console.log("Orientação desbloqueada.");
                 }
             } catch (err) {
                 console.error("Erro ao desbloquear orientação:", err);
             }

            // Reseta aspect ratio
             videoPlayer.style.objectFit = 'contain';
             currentAspectRatio = 'contain';
             if (aspectRatioBtn) aspectRatioBtn.querySelector('.glass-content').innerHTML = ICONS.aspectContain;
        }

         // Reseta UI do player apenas se não estiver trocando
         if (!isChangingEpisode) {
             seekBar.value = 0;
             seekProgressBar.style.width = '0%';
             currentTimeEl.textContent = '00:00';
             durationEl.textContent = '00:00';
             playPauseBtn.querySelector('.glass-content').innerHTML = ICONS.play;
         }

        // O history.back() é chamado pelo botão ou pelo popstate, não aqui.
    }

    function formatTime(timeInSeconds) {
        if (isNaN(timeInSeconds) || timeInSeconds < 0) { return "00:00"; }
        const hours = Math.floor(timeInSeconds / 3600);
        const minutes = Math.floor((timeInSeconds % 3600) / 60);
        const seconds = Math.floor(timeInSeconds % 60);
        const formattedMinutes = String(minutes).padStart(2, '0');
        const formattedSeconds = String(seconds).padStart(2, '0');
        return hours > 0 ? `${hours}:${formattedMinutes}:${formattedSeconds}` : `${formattedMinutes}:${formattedSeconds}`;
    }

    function togglePlay() {
        if (videoPlayer.paused) {
            videoPlayer.play().catch(error => { if (error.name !== 'AbortError') { console.error("Video play error:", error); } });
        } else {
            videoPlayer.pause();
        }
    }

     function handleMobilePlayerClick() {
         clearTimeout(controlsTimeout);
         if (!playerView.classList.contains('controls-active')) {
             playerView.classList.add('controls-active');
             if (!videoPlayer.paused) {
                 controlsTimeout = setTimeout(() => playerView.classList.remove('controls-active'), 3000);
             }
         } else {
             togglePlay(); // Pausa/Retoma no segundo toque
         }
     }

     function handlePlayerClick() { // Desktop
         clearTimeout(controlsTimeout);
         if (!playerView.classList.contains('controls-active')) {
             playerView.classList.add('controls-active');
         } else {
             togglePlay();
         }
         if (!videoPlayer.paused) {
             controlsTimeout = setTimeout(() => playerView.classList.remove('controls-active'), 3000);
         }
     }

    function addPlayerEventListeners() {
        // Remove listeners antigos antes de adicionar novos
        videoPlayer.removeEventListener('click', handlePlayerClick);
        videoPlayer.removeEventListener('click', handleMobilePlayerClick);
        videoPlayer.removeEventListener('play', handlePlayEvent);
        videoPlayer.removeEventListener('pause', handlePauseEvent);
        videoPlayer.removeEventListener('ended', handleEndedEvent);
        videoPlayer.removeEventListener('timeupdate', handleTimeUpdateEvent);
        // Remove listener específico de metadados antes de adicionar
        videoPlayer.removeEventListener('loadedmetadata', handleLoadedMetadataEvent);
        videoPlayer.removeEventListener('volumechange', handleVolumeChangeEvent);
         // Remove listener de erro ANTES de adicionar o novo
        videoPlayer.removeEventListener('error', handleVideoError);

        const isMobile = window.innerWidth < 768;
        videoPlayer.addEventListener('click', isMobile ? handleMobilePlayerClick : handlePlayerClick);
        videoPlayer.addEventListener('play', handlePlayEvent);
        videoPlayer.addEventListener('pause', handlePauseEvent);
        videoPlayer.addEventListener('ended', handleEndedEvent);
        videoPlayer.addEventListener('timeupdate', handleTimeUpdateEvent);
        videoPlayer.addEventListener('loadedmetadata', handleLoadedMetadataEvent); // Adiciona de volta
        videoPlayer.addEventListener('volumechange', handleVolumeChangeEvent);
         videoPlayer.addEventListener('error', handleVideoError); // Adiciona listener de erro novamente
    }

    function handlePlayEvent() {
        playPauseBtn.querySelector('.glass-content').innerHTML = ICONS.pause;
        clearTimeout(controlsTimeout);
        if (playerView.classList.contains('controls-active')) {
            controlsTimeout = setTimeout(() => playerView.classList.remove('controls-active'), 3000);
        }
    }

    function handlePauseEvent() {
        playPauseBtn.querySelector('.glass-content').innerHTML = ICONS.play;
        clearTimeout(controlsTimeout);
        if (!videoPlayer.ended) playerView.classList.add('controls-active');
    }

    async function handleEndedEvent() { // Tornada assíncrona para savePlayerProgress
        console.log("Vídeo terminou.");
         // Salva progresso final antes de mudar ou fechar
         if (videoPlayer.duration > 0) {
             videoPlayer.currentTime = videoPlayer.duration > 1 ? videoPlayer.duration - 1 : videoPlayer.duration; // Marca como quase concluído
             await savePlayerProgress(); // Espera salvar
         }

        if (currentPlayerContext.episodes && currentPlayerContext.currentIndex < currentPlayerContext.episodes.length - 1) {
            console.log("Passando para o próximo episódio...");
            changeEpisode(1);
        } else {
            console.log("Fim da série ou filme único.");
            playPauseBtn.querySelector('.glass-content').innerHTML = ICONS.play;
            playerView.classList.add('controls-active');
            clearTimeout(controlsTimeout);
            // Poderia fechar o player aqui se desejado:
            // setTimeout(() => history.back(), 1000); // Fecha após 1 seg
        }
    }

    function handleTimeUpdateEvent() {
        if (isNaN(videoPlayer.currentTime) || isNaN(videoPlayer.duration) || videoPlayer.duration <= 0) return;
        seekBar.value = videoPlayer.currentTime;
        const progressPercent = (videoPlayer.currentTime / videoPlayer.duration) * 100;
        seekProgressBar.style.width = `${progressPercent}%`;
        currentTimeEl.textContent = formatTime(videoPlayer.currentTime);

        const now = Date.now();
        if (now - lastProgressSaveTime > 5000) {
            savePlayerProgress();
            lastProgressSaveTime = now;
        }
    }

    function handleLoadedMetadataEvent() {
        if (isNaN(videoPlayer.duration) || videoPlayer.duration <= 0) {
            console.warn("Metadados carregados, mas duração inválida:", videoPlayer.duration);
            durationEl.textContent = '00:00';
            seekBar.max = 0;
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
    seekBar.addEventListener('input', () => { if(!isNaN(seekBar.value) && videoPlayer.duration > 0) videoPlayer.currentTime = seekBar.value; });
    volumeSlider.addEventListener('input', (e) => { videoPlayer.volume = e.target.value; videoPlayer.muted = e.target.value == 0; });
    volumeBtn.addEventListener('click', () => { videoPlayer.muted = !videoPlayer.muted; });
    rewindBtn.addEventListener('click', () => { if(!isNaN(videoPlayer.currentTime)) videoPlayer.currentTime = Math.max(0, videoPlayer.currentTime - 10); });
    forwardBtn.addEventListener('click', () => { if(!isNaN(videoPlayer.currentTime) && videoPlayer.duration > 0) videoPlayer.currentTime = Math.min(videoPlayer.duration, videoPlayer.currentTime + 10); });

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

    /** Muda para o episódio anterior ou próximo */
    function changeEpisode(direction) {
        if (!currentPlayerContext.episodes) return;
        const newIndex = currentPlayerContext.currentIndex + direction;
        if (newIndex >= 0 && newIndex < currentPlayerContext.episodes.length) {
            const episode = currentPlayerContext.episodes[newIndex];
            if (!episode.url) {
                showToast(`Erro: Link de vídeo não encontrado para o ${direction > 0 ? 'próximo' : 'anterior'} episódio.`, true);
                console.error("Link de vídeo ausente:", episode);
                videoPlayer.pause(); // Pausa no atual
                return;
            }
            const newContext = {
                ...currentPlayerContext,
                currentIndex: newIndex,
                title: `${currentPlayerContext.itemData.name} - T${episode.season_number || '?'} E${episode.episode_number || newIndex + 1}`,
                videoUrl: episode.url,
                startTime: 0,
                isChangingEpisode: true // Flag para showPlayer saber que é uma transição
            };
             // Salva progresso do episódio ATUAL antes de mudar
            savePlayerProgress().then(() => {
                 showPlayer(newContext); // Mostra o novo episódio DEPOIS de salvar
            });
        } else {
            console.log("Não há mais episódios nessa direção.");
            // Poderia fechar o player ou mostrar mensagem
            if (direction > 0) { // Se tentou ir além do último
                 // Fecha o player após um pequeno delay
                 showToast("Você terminou a temporada!");
                 setTimeout(() => history.back(), 1500);
            }
        }
    }


    nextEpisodeBtn.addEventListener('click', () => changeEpisode(1));
    prevEpisodeBtn.addEventListener('click', () => changeEpisode(-1));

    fullscreenBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
            // Tenta colocar o playerView em fullscreen primeiro
            playerView.requestFullscreen().catch(err => {
                 console.warn(`Erro ao colocar playerView em tela cheia (${err.message}), tentando body...`);
                 // Fallback: Tenta colocar o body inteiro em fullscreen
                 document.documentElement.requestFullscreen().catch(err2 => console.error(`Erro ao entrar em tela cheia (body): ${err2.message}`));
            });
        } else {
            document.exitFullscreen();
        }
    });


    document.addEventListener('fullscreenchange', () => {
        const isFullscreen = !!document.fullscreenElement;
        fullscreenBtn.querySelector('.glass-content').innerHTML = isFullscreen ? ICONS.exitFullscreen : ICONS.fullscreen;

        // CORREÇÃO: Não desbloquear orientação/sair do player ao sair do fullscreen via ESC
        // A orientação deve ser desbloqueada apenas pelo hidePlayer quando chamado explicitamente (botão voltar ou popstate)
        // if (!isFullscreen && !playerView.classList.contains('hidden') && currentPlayerContext.key) {
        //     console.log("Saiu do fullscreen via ESC ou botão do navegador.");
        //     // NÃO desbloquear orientação aqui automaticamente
        //     // if (screen.orientation && typeof screen.orientation.unlock === 'function') {
        //     //     screen.orientation.unlock();
        //     // }
        // }
    });


    playPauseBtn.addEventListener('click', togglePlay);
    // **CORREÇÃO:** O botão voltar deve APENAS chamar history.back().
    // O listener 'popstate' cuidará de chamar hidePlayer.
    playerBackBtn.addEventListener('click', () => {
        console.log("Botão Voltar do Player clicado, chamando history.back()");
        history.back();
    });

    playerView.addEventListener('mousemove', () => {
        if (window.innerWidth >= 768) {
            playerView.classList.add('controls-active');
            clearTimeout(controlsTimeout);
            if (!videoPlayer.paused) {
                controlsTimeout = setTimeout(() => playerView.classList.remove('controls-active'), 3000);
            }
        }
    });


    settingsBtn.addEventListener('click', (e) => { e.stopPropagation(); settingsPanel.classList.toggle('hidden'); });

    document.addEventListener('click', (e) => {
        if (!settingsPanel.classList.contains('hidden') && !settingsBtn.contains(e.target) && !settingsPanel.contains(e.target)) { settingsPanel.classList.add('hidden'); }
        if (!notificationPanel.classList.contains('hidden') && !notificationPanel.contains(e.target) && !notificationBtn.contains(e.target)) {
            notificationPanel.classList.remove('animate-fade-in-down');
            notificationPanel.classList.add('animate-fade-out-up');
            setTimeout(() => notificationPanel.classList.add('hidden'), 250);
        }
        const openSeasonSelectPanel = document.querySelector('#season-options:not(.hidden)');
        if (openSeasonSelectPanel && !openSeasonSelectPanel.closest('.custom-select-container').contains(e.target)) {
            document.getElementById('season-selector-button')?.click();
        }
         // Fecha modal de comentários ao clicar fora
        if (!commentsModal.classList.contains('hidden') && !commentsModal.querySelector('.liquid-glass-card').contains(e.target)) {
            closeCommentsModal();
        }
    });

    function createSettingsOptions() {
        const speedContainer = document.getElementById('settings-speed-options');
        const qualityContainer = document.getElementById('settings-quality-options');
        if (speedContainer.childElementCount > 1) return; // Já criado

         // Limpa containers
        speedContainer.innerHTML = '<h4 class="text-xs text-gray-300 px-3 pt-1 pb-2">Velocidade</h4>';
        qualityContainer.innerHTML = '<h4 class="text-xs text-gray-300 px-3 pt-1 pb-2">Qualidade</h4>';


        const speeds = [0.5, 1, 1.5, 2];
        speeds.forEach(speed => {
            const button = document.createElement('button');
            button.className = 'settings-option-btn w-full text-left p-2 rounded hover:bg-white/10 text-sm';
            button.textContent = `${speed}x`;
            if (speed === 1) button.classList.add('active', 'bg-white/5', 'font-semibold');
            button.onclick = () => {
                videoPlayer.playbackRate = speed;
                speedContainer.querySelectorAll('button').forEach(btn => btn.classList.remove('active', 'bg-white/5', 'font-semibold'));
                button.classList.add('active', 'bg-white/5', 'font-semibold');
            };
            speedContainer.appendChild(button);
        });

        // Placeholder para qualidade (HLS gerencia automaticamente)
        const qualities = ["Auto"];
        qualities.forEach(quality => {
            const button = document.createElement('button');
            button.className = 'settings-option-btn w-full text-left p-2 rounded hover:bg-white/10 text-sm';
            button.textContent = quality;
            if (quality === "Auto") button.classList.add('active', 'bg-white/5', 'font-semibold');
            button.onclick = () => {
                qualityContainer.querySelectorAll('button').forEach(btn => btn.classList.remove('active', 'bg-white/5', 'font-semibold'));
                button.classList.add('active', 'bg-white/5', 'font-semibold');
                console.log(`Qualidade definida para ${quality}. (HLS gerencia automaticamente)`);
                // Troca manual: hls.currentLevel = levelIndex;
            };
            qualityContainer.appendChild(button);
        });
    }

    document.getElementById('hero-watch-btn').addEventListener('click', () => {
        if (!currentHeroItem || !currentHeroItem.url) {
             showToast("Link de vídeo não encontrado para este item.", true);
             return;
        }
        showPlayer({
            videoUrl: currentHeroItem.url,
            title: currentHeroItem.title || currentHeroItem.name,
            itemData: currentHeroItem
        });
    });

    /** Inicializa UI do player */
    function initializeUI() {
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
        createSettingsOptions();
        addPlayerEventListeners(); // Garante que listeners sejam adicionados
    }

    // --- Listeners Gerais da UI (Busca, Notificações) ---
    searchIconBtn.addEventListener('click', () => toggleSearchOverlay(true));
    closeSearchBtn.addEventListener('click', () => toggleSearchOverlay(false));
    document.getElementById('search-overlay-bg').addEventListener('click', () => toggleSearchOverlay(false));

    searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => { performSearch(searchInput.value); }, 400);
    });

    const mobileSearchBtn = document.getElementById('mobile-search-btn');
    if (mobileSearchBtn) {
        mobileSearchBtn.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.mobile-nav-item').forEach(item => item.classList.remove('active'));
            mobileSearchBtn.classList.add('active');
            updateMobileNavIndicator();
            toggleSearchOverlay(true);
        });
    }

    notificationBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        renderNotifications();
        const isHidden = notificationPanel.classList.contains('hidden');
        if (isHidden) {
            notificationPanel.classList.remove('hidden', 'animate-fade-out-up');
            notificationPanel.classList.add('animate-fade-in-down');
        } else {
            notificationPanel.classList.remove('animate-fade-in-down');
            notificationPanel.classList.add('animate-fade-out-up');
            setTimeout(() => notificationPanel.classList.add('hidden'), 250);
        }
        if (notifications.length > 0 && notifications[0].createdAt) {
            const latestTimestamp = notifications[0].createdAt.toMillis ? notifications[0].createdAt.toMillis() : new Date(notifications[0].createdAt).getTime();
            lastNotificationCheck = latestTimestamp;
            localStorage.setItem('starlight-lastNotificationCheck', latestTimestamp);
            updateNotificationBell();
        }
    });

    // --- Roteador Central ---
    async function handleNavigation() {
        console.log(`[NAV] Hash: ${window.location.hash}, UserID: ${userId}, Profile: ${currentProfile?.id}`);
        const hash = window.location.hash;
        const previousHash = sessionStorage.getItem('starlight-previousHash') || '#home-view';

        // --- Rota Login ---
        if (!userId) {
            console.log("[NAV] Rota: Login");
            if (hash !== '#login-view') history.replaceState(null, '', '#login-view');
            showLoginScreen();
            sessionStorage.setItem('starlight-previousHash', '#login-view');
            return;
        }

        // --- Rota Seleção de Perfil ---
        if (!currentProfile) {
            console.log("[NAV] Rota: Seleção de Perfil");
            const lastProfileId = localStorage.getItem(`starlight-lastProfile-${userId}`);
            let autoSelected = false;
            if (lastProfileId) {
                if (!profiles || profiles.length === 0) await loadProfiles();
                const found = profiles.find(p => p.id === lastProfileId);
                if (found) {
                    await selectAndEnterProfile(found);
                    autoSelected = true;
                    // selectAndEnterProfile já define o hash e chama handleNavigation, então retorna
                    sessionStorage.setItem('starlight-previousHash', window.location.hash);
                    return;
                } else {
                    localStorage.removeItem(`starlight-lastProfile-${userId}`);
                }
            }
            if (!autoSelected) {
                if (hash !== '#manage-profile-view') history.replaceState(null, '', '#manage-profile-view');
                showProfileScreen();
                sessionStorage.setItem('starlight-previousHash', '#manage-profile-view');
                return;
            }
        }

        // --- Roteamento Principal (Logado + Perfil Selecionado) ---
        console.log("[NAV] Rota: Principal");
        if (!searchOverlay.classList.contains('hidden')) toggleSearchOverlay(false);
        if (!commentsModal.classList.contains('hidden') && !hash.startsWith('#comments/')) closeCommentsModal(); // Fecha modal se navegar para fora

        const isSpecialView = hash.startsWith('#details/') || hash === '#player' || hash.startsWith('#comments/');
        document.querySelector('header').classList.toggle('hidden', isSpecialView || !currentProfile);
        document.querySelector('footer').classList.toggle('hidden', isSpecialView || !currentProfile);

        // **CORREÇÃO: Lógica para fechar o player ao usar history.back() (popstate)**
        if (hash !== '#player' && !playerView.classList.contains('hidden')) {
             console.log("[NAV] Saindo da rota #player, chamando hidePlayer(true, false)...");
             // Chama hidePlayer para salvar progresso e limpar estado, mas NÃO chama history.back() de novo
             hidePlayer(true, false); // true para salvar, false pq não está trocando episódio
        }

        if (!hash.startsWith('#details/')) detailsView.classList.add('hidden');
        if (previousHash === '#news-view' && hash !== '#news-view' && !hash.startsWith('#comments/')) stopNewsViewMedia();

        document.querySelectorAll('#view-container > .content-view').forEach(view => view.classList.add('hidden'));

        let targetId = 'home-view';
        let targetView = null;

        if (hash.startsWith('#details/')) {
            const docId = hash.split('/')[1];
            if (docId) {
                console.log("[NAV] Rota: #details/", docId);
                targetId = 'details-view';
                showDetailsView({ docId });
                targetView = detailsView;
            } else {
                 console.log("[NAV] Rota: #details/ inválida, fallback para home");
                 history.replaceState(null, '', '#home-view'); hash = '#home-view'; targetId = 'home-view';
            }
        } else if (hash.startsWith('#comments/')) { // Rota para modal de comentários (permite link direto)
             const newsId = hash.split('/')[1];
             if (newsId) {
                 console.log("[NAV] Rota: #comments/", newsId);
                 targetId = 'news-view'; // A view de fundo será a de novidades
                 targetView = document.getElementById(targetId);
                 if (targetView) targetView.classList.remove('hidden');
                 renderScreenContent(targetId); // Renderiza novidades no fundo
                 openCommentsModal(newsId); // Abre o modal
             } else {
                 console.log("[NAV] Rota: #comments/ inválida, fallback para news");
                 history.replaceState(null, '', '#news-view'); hash = '#news-view'; targetId = 'news-view';
                 // A lógica abaixo tratará o #news-view
             }
         }


        if (targetId !== 'details-view' && !hash.startsWith('#comments/')) { // Se não for detalhes ou comentários
            if (hash === '#player') {
                console.log("[NAV] Rota: #player");
                targetId = 'player-view';
                // O player é mostrado por showPlayer(), não escondemos/mostramos aqui diretamente
                 // Se o player estiver escondido (acesso direto/refresh), volta
                 if (playerView.classList.contains('hidden') && !currentPlayerContext.key) {
                     console.log("[NAV] Acesso direto a #player detectado, voltando...");
                     const fallbackHash = previousHash !== '#player' ? previousHash : '#home-view';
                     history.replaceState(null, '', fallbackHash);
                     handleNavigation(); // Chama de novo
                     return;
                 }
                targetView = playerView; // Marca como view ativa
            } else {
                targetId = hash.substring(1) || 'home-view';
                console.log(`[NAV] Rota normal: #${targetId}`);
                targetView = document.getElementById(targetId);

                if (targetView && targetView.classList.contains('content-view')) {
                    console.log(`[NAV] Mostrando view normal: ${targetId}`);
                    targetView.classList.remove('hidden');
                    renderScreenContent(targetId);
                } else {
                    console.log(`[NAV] View #${targetId} inválida, fallback para home`);
                    targetId = 'home-view';
                    targetView = document.getElementById(targetId);
                    if (targetView) {
                        targetView.classList.remove('hidden');
                        renderScreenContent(targetId);
                    }
                    if (window.location.hash !== `#${targetId}`) history.replaceState(null, '', `#${targetId}`);
                }
            }
        }

        // Atualiza UI de Navegação
        document.querySelectorAll('.nav-item, .mobile-nav-item').forEach(l => l.classList.remove('active'));
        // Usa targetId que foi validado (ou fallback)
        document.querySelectorAll(`[data-target="${targetId}"]`).forEach(l => l.classList.add('active'));
        updateMobileNavIndicator();

        // Background e Rotação Hero
        document.getElementById('main-background').style.opacity = (targetId === 'home-view' && currentHeroItem) ? 1 : 0;
        if (targetId !== 'home-view' && heroCarouselInterval) { clearInterval(heroCarouselInterval); heroCarouselInterval = null; }

        sessionStorage.setItem('starlight-previousHash', `#${targetId}`);
        console.log(`[NAV] Navegação para #${targetId} concluída.`);
    }

    // Listener para o evento popstate (botões voltar/avançar do navegador)
    window.addEventListener('popstate', (event) => {
        console.log("[POPSTATE] Evento popstate disparado. Novo hash:", window.location.hash);
        // Chama handleNavigation para processar a mudança de hash
        handleNavigation();
    });


    // --- Lógica de Notificações ---
    function listenForNotifications() {
        if (!userId) return;
        console.log("Iniciando listener de notificações...");
        const q = query(collection(db, "notifications"), orderBy("createdAt", "desc"));
        if (typeof window.unsubscribeNotifications === 'function') window.unsubscribeNotifications();
        window.unsubscribeNotifications = onSnapshot(q, (snapshot) => {
            console.log("Recebido snapshot de notificações.");
            notifications = [];
            snapshot.forEach((doc) => { notifications.push({ id: doc.id, ...doc.data() }); });
            updateNotificationBell();
            if (!notificationPanel.classList.contains('hidden')) renderNotifications();
        }, (error) => { console.error("Erro ao escutar notificações:", error); });
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
        if (!avisosContainer || !novidadesContainer) return;

        const avisos = notifications.filter(n => n.type === 'Aviso');
        const novidades = notifications.filter(n => n.type === 'Novidade' && !dismissedNotifications.includes(n.id));

        const createNotifHTML = (notif, isDismissable) => {
            const dismissBtn = isDismissable ? `<button class="remove-notification-btn text-stone-500 hover:text-white ml-2" data-notif-id="${notif.id}"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>` : '';
            const linkDataAttrs = notif.link ? `data-link-type="${notif.link.type}" data-link-target="${notif.link.type === 'internal' && notif.link.docId ? `#details/${notif.link.docId}` : (notif.link.url || '')}"` : '';
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
            removeBtn.closest('.notification-item')?.remove();
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

            notificationPanel.classList.remove('animate-fade-in-down');
            notificationPanel.classList.add('animate-fade-out-up');
            setTimeout(() => notificationPanel.classList.add('hidden'), 250);

            if (linkType === 'internal' && linkTarget && linkTarget.startsWith('#details/')) {
                window.location.hash = linkTarget;
            } else if (linkType === 'external' && linkTarget) {
                window.open(linkTarget, '_blank');
            }
        }
    });


    // --- Lógica de Novidades ---
    function listenForNewsItems() {
        if (!userId) return;
        console.log("Iniciando listener de novidades...");
        const q = query(collection(db, "news"), orderBy("createdAt", "desc"));
        if (typeof window.unsubscribeNewsItems === 'function') window.unsubscribeNewsItems();
        window.unsubscribeNewsItems = onSnapshot(q, (snapshot) => {
            console.log("Recebido snapshot de novidades.");
            newsItems = [];
            snapshot.forEach((doc) => { newsItems.push({ id: doc.id, ...doc.data() }); });
            console.log(`Cache de novidades atualizado com ${newsItems.length} itens.`);
            if (window.location.hash === '#news-view') renderNewsView();
        }, (error) => {
            console.error("Erro ao escutar novidades: ", error);
            if (window.location.hash === '#news-view') {
                const container = document.getElementById('news-items-container');
                if(container) container.innerHTML = '<p class="text-red-400 text-center py-10">Erro ao carregar novidades.</p>';
            }
        });
    }

    function listenForNewsLikes() {
        if (!userId) return;
        console.log("Iniciando listener de likes de novidades...");
        if (typeof unsubscribeNewsLikes === 'function') unsubscribeNewsLikes();
        const q = query(collection(db, "news"));
        unsubscribeNewsLikes = onSnapshot(q, (snapshot) => {
            let changed = false;
            snapshot.docChanges().forEach((change) => {
                 if (change.type === "added" || change.type === "modified") {
                     const data = change.doc.data();
                    newsLikes.set(change.doc.id, new Set(data.likedBy || []));
                    changed = true;
                 } else if (change.type === "removed") {
                     newsLikes.delete(change.doc.id);
                     changed = true;
                 }
            });
            if (changed && window.location.hash === '#news-view') updateNewsItemsUI();
        }, (error) => { console.error("Erro ao escutar likes de novidades:", error); });
    }

     // Escuta por mudanças nos comentários (agora usa 'comentarios/{newsId}/comments')
     function listenForNewsComments() {
         if (!userId) return;
         console.log("Iniciando listener de comentários...");
         if (typeof unsubscribeNewsComments === 'function') {
             console.log("Parando listener de comentários anterior...");
             unsubscribeNewsComments(); // Chama a função para parar todos os listeners antigos
         }

         let commentUnsubscribers = {}; // Objeto para guardar unsubscribers por newsId
         let mainUnsubscribe = null; // Guarda o unsubscriber da coleção 'news'

         // 1. Escuta a coleção 'news' para saber quais posts existem
         const qNews = query(collection(db, "news"));
         console.log("Iniciando listener da coleção 'news' (para comentários)...");
         mainUnsubscribe = onSnapshot(qNews, (newsSnapshot) => {
             console.log("Recebido snapshot da coleção 'news' (para comentários).");
             const currentNewsIds = new Set();
             newsSnapshot.forEach(newsDoc => currentNewsIds.add(newsDoc.id));
             console.log(`Posts atuais encontrados: ${currentNewsIds.size}`);

             // 2. Cancela listeners de comentários de posts removidos
             Object.keys(commentUnsubscribers).forEach(newsId => {
                 if (!currentNewsIds.has(newsId)) {
                     console.log(`Post ${newsId} removido, parando listener de comentários.`);
                     commentUnsubscribers[newsId]();
                     delete commentUnsubscribers[newsId];
                     newsComments.delete(newsId);
                 }
             });

             // 3. Adiciona listeners para comentários de posts novos ou existentes
             currentNewsIds.forEach(newsId => {
                 if (!commentUnsubscribers[newsId]) { // Só adiciona se não existir
                     console.log(`Iniciando listener para comentários do post ${newsId}...`);
                     // **USA A COLEÇÃO CORRETA: 'comentarios/{newsId}/comments'**
                     const commentsQuery = query(collection(db, "comentarios", newsId, "comments"), orderBy("createdAt", "asc"));
                     commentUnsubscribers[newsId] = onSnapshot(commentsQuery, (commentsSnapshot) => {
                         console.log(`Recebido snapshot de comentários para ${newsId}.`);
                         const commentsList = [];
                         commentsSnapshot.forEach((commentDoc) => {
                             commentsList.push({ id: commentDoc.id, ...commentDoc.data() });
                         });
                         console.log(`Cache de comentários para ${newsId} atualizado com ${commentsList.length} comentários.`);
                         newsComments.set(newsId, commentsList); // Atualiza cache

                         if (window.location.hash === '#news-view') updateNewsItemsUI();
                         // Atualiza modal se estiver aberto para este post
                         if (currentNewsCommentsModalId === newsId && !commentsModal.classList.contains('hidden')) {
                              console.log(`Modal de comentários para ${newsId} aberto, re-renderizando.`);
                              renderComments(newsId);
                         }
                     }, (error) => {
                         console.error(`Erro ao escutar comentários para ${newsId}:`, error);
                         newsComments.set(newsId, []); // Limpa em caso de erro
                         if (window.location.hash === '#news-view') updateNewsItemsUI();
                         if (currentNewsCommentsModalId === newsId) renderComments(newsId);
                     });
                 }
             });

             // Atualiza UI geral caso posts tenham sido removidos e a view esteja ativa
             if (window.location.hash === '#news-view') {
                  // Garante que a UI seja atualizada mesmo se nenhum comentário mudou, mas um post foi removido
                  updateNewsItemsUI();
             }

         }, (error) => {
             console.error("Erro ao escutar coleção 'news' para comentários:", error);
             // Se falhar, cancela tudo
             if(mainUnsubscribe) mainUnsubscribe();
             Object.values(commentUnsubscribers).forEach(unsub => unsub());
             commentUnsubscribers = {};
             newsComments.clear();
             if (window.location.hash === '#news-view') updateNewsItemsUI();
         });

         // Define a função global de unsubscribe que para tudo
         unsubscribeNewsComments = () => {
             console.log("Parando todos os listeners de comentários...");
             if(mainUnsubscribe) mainUnsubscribe(); // Para o listener principal da coleção 'news'
             Object.values(commentUnsubscribers).forEach(unsub => unsub()); // Para listeners de cada post
             commentUnsubscribers = {}; // Limpa o objeto
             mainUnsubscribe = null;
             console.log("Listeners de comentários parados.");
         };
     }

    // Atualiza apenas a UI dos itens de novidades (contadores, botões)
    function updateNewsItemsUI() {
        const container = document.getElementById('news-items-container');
        if (!container) return;

        container.querySelectorAll('.news-item-card').forEach(card => {
            const newsId = card.dataset.newsId;
            const likeButton = card.querySelector('.like-button');
            const likeButtonContent = likeButton?.querySelector('.glass-content');
            const likeCountSpan = card.querySelector('.like-count'); // Span dentro do botão
            const commentCountSpan = card.querySelector('.comment-count'); // Span dentro do botão
            const commentButton = card.querySelector('.comment-button');

            if (!newsId || !likeButton || !likeButtonContent || !commentButton || !likeCountSpan || !commentCountSpan ) return; // Verifica todos

            // Atualiza Likes
            const likesSet = newsLikes.get(newsId) || new Set();
            const likeCount = likesSet.size;
            const userLiked = currentProfile && likesSet.has(currentProfile.id);

            likeButtonContent.innerHTML = `${userLiked ? ICONS.heartFilled : ICONS.heartOutline} <span class="like-count">${likeCount}</span>`; // Recria com span interno
            likeButton.classList.toggle('text-red-500', userLiked);
            likeButton.classList.toggle('text-slate-400', !userLiked);

            // Atualiza Comentários
            const commentsList = newsComments.get(newsId) || [];
            const commentCount = commentsList.length;
            const commentButtonContent = commentButton.querySelector('.glass-content');
            if (commentButtonContent) {
                 commentButtonContent.innerHTML = `${ICONS.comment} <span class="comment-count">${commentCount}</span>`; // Recria com span interno
            }
        });
        lucide.createIcons();
        attachGlassButtonListeners();
    }

    // Renderiza a view de Novidades completa
    function renderNewsView() {
        const container = document.getElementById('news-items-container');
        if (!container) return;
        if (newsItems.length === 0) {
            container.innerHTML = '<p class="text-slate-400 text-center py-10">Nenhuma novidade publicada ainda.</p>';
            return;
        }
        container.innerHTML = newsItems.map(item => createNewsItemCard(item)).join('');
        lucide.createIcons();
        attachGlassButtonListeners();
        updateNewsItemsUI(); // Aplica estado inicial de likes/comentários
    }

    function initializeGlassEffects() { attachGlassButtonListeners(); }

    function createNewsItemCard(item) {
        const date = item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Data indisponível';
        let contentHTML = '';
        let typeClass = '';
        const uniqueId = `iframe-${item.id}-${Math.random().toString(36).substring(7)}`;

        switch (item.type) {
            case 'text':
                contentHTML = `<p class="text-slate-300 mt-2 whitespace-pre-wrap">${item.content}</p>`;
                typeClass = 'news-item-text'; break;
            case 'image':
                contentHTML = `<img src="${item.content}" alt="${item.title || 'Imagem'}" class="mt-3 rounded-lg max-w-full h-auto shadow-lg">`;
                typeClass = 'news-item-image'; break;
            case 'video':
                const isYoutube = item.content.includes('youtube.com/embed') || item.content.includes('youtu.be');
                const aspectClass = isYoutube ? 'aspect-video' : '';
                contentHTML = `
                    <div class="relative ${aspectClass} mt-3 group news-iframe-container rounded-lg overflow-hidden shadow-lg bg-black" data-iframe-src="${item.content}">
                        <div id="overlay-${uniqueId}" class="absolute inset-0 flex items-center justify-center cursor-pointer z-10 bg-black/50 hover:bg-black/70 transition-colors news-iframe-play-overlay">
                            <i data-lucide="play-circle" class="w-16 h-16 text-white opacity-80 group-hover:opacity-100 transition-opacity"></i>
                        </div>
                        <div id="iframe-wrapper-${uniqueId}" class="w-full h-full ${isYoutube ? '' : 'min-h-[300px]'}"></div>
                    </div>`;
                typeClass = 'news-item-video'; break;
            case 'video_direct':
                contentHTML = `
                    <div class="relative mt-3 rounded-lg overflow-hidden cursor-pointer news-video-thumbnail group" data-video-url="${item.content}" data-video-title="${item.title || 'Vídeo'}">
                        <img src="${item.thumbnail || 'https://placehold.co/600x338/1f2937/a3a3a3?text=Video'}" alt="Thumbnail" class="w-full h-auto aspect-video object-cover">
                        <div class="absolute inset-0 bg-black/40 flex items-center justify-center group-hover:bg-black/60 transition-colors">
                            <i data-lucide="play-circle" class="w-16 h-16 text-white opacity-80 group-hover:opacity-100 transition-opacity"></i>
                        </div>
                    </div>`;
                typeClass = 'news-item-video-direct'; break;
            default:
                contentHTML = `<p class="text-slate-500 mt-2">[Tipo ${item.type}] ${item.content || ''}</p>`;
        }

        const likesSet = newsLikes.get(item.id) || new Set();
        const likeCount = likesSet.size;
        const userLiked = currentProfile && likesSet.has(currentProfile.id);
        const commentsList = newsComments.get(item.id) || [];
        const commentCount = commentsList.length;

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
                        <button class="comment-button glass-container glass-button rounded-full px-3 py-1.5 flex items-center gap-1.5 text-sm text-slate-400 hover:text-white">
                            <div class="glass-filter"></div><div class="glass-overlay !bg-opacity-10 hover:!bg-opacity-20"></div><div class="glass-specular"></div>
                            <div class="glass-content flex items-center gap-1.5">
                                ${ICONS.comment}
                                <span class="comment-count">${commentCount}</span>
                            </div>
                        </button>
                    </div>
                </div>
            </div>`;
    }

    // Listener delegado para a seção de novidades
    const newsContainer = document.getElementById('news-items-container');
    if (newsContainer) {
        newsContainer.addEventListener('click', (e) => {
            const likeButton = e.target.closest('.like-button');
            const commentButton = e.target.closest('.comment-button');
            const videoThumbnail = e.target.closest('.news-video-thumbnail');
            const iframeOverlay = e.target.closest('.news-iframe-play-overlay');

            if (likeButton) {
                const card = likeButton.closest('.news-item-card');
                const newsId = card?.dataset.newsId;
                if (newsId) handleNewsLike(newsId);
            } else if (commentButton) {
                const card = commentButton.closest('.news-item-card');
                const newsId = card?.dataset.newsId;
                if (newsId) {
                     // Adiciona hash ao histórico antes de abrir o modal
                    // history.pushState({ modal: 'comments', newsId }, '', `#comments/${newsId}`); // Removido para simplificar, abrirá modal sem mudar hash principal
                    openCommentsModal(newsId);
                }
            } else if (videoThumbnail) {
                const url = videoThumbnail.dataset.videoUrl;
                const title = videoThumbnail.dataset.videoTitle;
                if (url) showNewsPlayer(url, title);
            } else if (iframeOverlay) {
                const container = iframeOverlay.closest('.news-iframe-container');
                const iframeSrc = container?.dataset.iframeSrc;
                const wrapperId = iframeOverlay.id.replace('overlay-', 'iframe-wrapper-');
                const wrapper = document.getElementById(wrapperId);

                if (iframeSrc && wrapper) {
                    let finalSrc = iframeSrc;
                    if (iframeSrc.includes('youtube.com') || iframeSrc.includes('youtu.be')) {
                        try { const url = new URL(iframeSrc); url.searchParams.set('autoplay', '1'); finalSrc = url.toString(); } catch (error) { console.error("URL YouTube inválida:", iframeSrc, error); }
                    }
                    const allowAttribute = (iframeSrc.includes('youtube.com') || iframeSrc.includes('youtu.be')) ? 'allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; autoplay"' : 'allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"';
                    wrapper.innerHTML = `<iframe src="${finalSrc}" frameborder="0" sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-forms" ${allowAttribute} allowfullscreen class="w-full h-full absolute inset-0"></iframe>`;
                    iframeOverlay.classList.add('hidden');
                    console.log("Iframe carregado para:", finalSrc);
                } else { console.log("Não foi possível carregar o iframe."); }
            }
        });
    }

    async function handleNewsLike(newsId) {
        if (!userId || !currentProfile?.id) {
            showToast("Você precisa estar logado e ter um perfil selecionado para curtir.", true); return;
        }
        const newsDocRef = doc(db, "news", newsId);
        const profileId = currentProfile.id;
        try {
            await runTransaction(db, async (transaction) => {
                const newsDoc = await transaction.get(newsDocRef);
                if (!newsDoc.exists()) throw "Post não encontrado!";
                const data = newsDoc.data();
                const likedBy = data.likedBy || [];
                const userIndex = likedBy.indexOf(profileId);
                if (userIndex > -1) {
                    transaction.update(newsDocRef, { likedBy: arrayRemove(profileId) });
                } else {
                    transaction.update(newsDocRef, { likedBy: arrayUnion(profileId) });
                }
            });
        } catch (error) { console.error("Erro ao curtir/descurtir:", error); showToast("Erro ao processar o like.", true); }
    }
    // --- Fim da Lógica de Novidades ---


    // --- Lógica de Pedidos ---
    function listenToRequests() {
        if (!userId) return;
        console.log("Iniciando listener de pedidos...");
        const q = query(collection(db, "pedidos"), where("status", "==", "pending"));
        if (typeof window.unsubscribeRequests === 'function') window.unsubscribeRequests();
        window.unsubscribeRequests = onSnapshot(q, (snapshot) => {
            console.log("Recebido snapshot de pedidos pendentes.");
            pendingRequests = [];
            snapshot.forEach((doc) => { pendingRequests.push({ id: doc.id, ...doc.data() }); });
            pendingRequests.sort((a, b) => {
                const votesA = (a.requesters || []).length; const votesB = (b.requesters || []).length;
                if (votesB !== votesA) return votesB - votesA;
                return (a.createdAt?.toMillis() || 0) - (b.createdAt?.toMillis() || 0);
            });
            console.log(`Cache de pedidos atualizado com ${pendingRequests.length} itens.`);
            if (window.location.hash === '#requests-view') renderPendingRequests();
        }, (error) => {
            console.error("Erro ao escutar pedidos: ", error);
            if (window.location.hash === '#requests-view') {
                const container = document.getElementById('pending-requests-container');
                if(container) container.innerHTML = '<p class="col-span-full text-center text-red-400">Erro ao carregar pedidos.</p>';
            }
        });
    }

    async function handleVote(requestId) {
        if (!userId || !currentProfile?.id) { showToast("Selecione um perfil para votar.", true); return; }
        const docRef = doc(db, 'pedidos', requestId);
        const voteButton = document.querySelector(`.vote-btn[data-request-id="${requestId}"]`);
        if (voteButton) voteButton.disabled = true;
        const profileId = currentProfile.id;
        try {
            await runTransaction(db, async (transaction) => {
                const docSnap = await transaction.get(docRef);
                if (!docSnap.exists()) throw "Pedido não existe mais.";
                const requestData = docSnap.data();
                const requesters = requestData.requesters || [];
                const userVoteIndex = requesters.findIndex(r => r.userId === userId && r.profileId === profileId);
                if (userVoteIndex > -1) {
                    const updatedRequesters = requesters.filter((_, index) => index !== userVoteIndex);
                    transaction.update(docRef, { requesters: updatedRequesters });
                } else {
                    const userVote = { userId: userId, userName: currentProfile.name, profileId: profileId };
                    transaction.update(docRef, { requesters: arrayUnion(userVote) });
                }
            });
        } catch (error) { console.error("Erro ao processar voto:", error); showToast(typeof error === 'string' ? error : "Erro ao processar seu voto.", true);
        } finally { if (voteButton) voteButton.disabled = false; }
    }

    function renderPendingRequests() {
        const container = document.getElementById('pending-requests-container');
        if (!container) return;
        if (pendingRequests.length === 0) {
            container.innerHTML = '<p class="col-span-full text-center text-gray-400">Nenhum pedido em aberto.</p>'; return;
        }
        container.innerHTML = pendingRequests.map(request => {
            const posterPath = request.posterUrl || 'https://placehold.co/300x450/1c1917/FFFFFF?text=Sem+Imagem';
            const requesterCount = (request.requesters || []).length;
            const userHasVoted = userId && currentProfile && (request.requesters || []).some(r => r.userId === userId && r.profileId === currentProfile.id);
            return `
                <div class="liquid-glass-card bg-stone-900/50 rounded-lg overflow-hidden flex flex-col p-4 gap-4">
                    <div class="glass-filter"></div><div class="glass-overlay"></div><div class="glass-specular"></div>
                    <div class="glass-content w-full flex items-start gap-4">
                        <img src="${posterPath}" alt="${request.title || request.name}" class="w-20 rounded-md aspect-[2/3] object-cover">
                        <div class="flex-1">
                            <h4 class="font-bold text-white">${request.title} (${request.year || 'N/A'})</h4>
                            <p class="text-xs text-indigo-300 mt-1">${requesterCount} ${requesterCount === 1 ? 'voto' : 'votos'}</p>
                            <span class="text-xs font-semibold mt-2 inline-block px-2 py-1 rounded-full bg-yellow-500/20 text-yellow-300">Pendente</span>
                        </div>
                    </div>
                    <button class="vote-btn glass-container glass-button rounded-lg w-full mt-2 ${userHasVoted ? 'voted' : ''}" data-request-id="${request.id}">
                        <div class="glass-filter"></div><div class="glass-overlay"></div><div class="glass-specular"></div>
                        <div class="glass-content flex justify-center items-center gap-2 p-2 text-sm">
                            ${userHasVoted ? '<i data-lucide="minus-circle" class="w-4 h-4"></i> Remover Voto' : '<i data-lucide="plus-circle" class="w-4 h-4"></i> Apoiar Pedido'}
                        </div>
                    </button>
                </div>`;
        }).join('');
        attachGlassButtonListeners();
        lucide.createIcons();
    }

    // --- Lógica de Gerenciamento de Perfil ---
    async function loadProfiles() {
        if (!userId) return;
        console.log("Carregando perfis para userId:", userId);
        const profilesCol = collection(db, 'users', userId, 'profiles');
        try {
            const snapshot = await getDocs(profilesCol);
            profiles = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            console.log(`Perfis carregados (${profiles.length}):`, profiles.map(p => p.name));
            renderProfiles();
        } catch (error) { console.error("Erro ao carregar perfis:", error); profiles = []; renderProfiles(); }
    }

    function renderProfiles() {
        console.log("Renderizando perfis...");
        profilesGrid.innerHTML = '';
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
                <p class="text-center text-lg text-gray-300 group-hover:text-white mt-3 transition-colors">${profile.name}</p>`;
            profileCard.addEventListener('click', () => {
                if (isEditMode) showProfileModal(profile.id);
                else selectAndEnterProfile(profile);
            });
            profilesGrid.appendChild(profileCard);
        });

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
                <p class="text-center text-lg text-gray-300 group-hover:text-white mt-3 transition-colors">Adicionar Perfil</p>`;
            addProfileCard.addEventListener('click', () => showProfileModal());
            profilesGrid.appendChild(addProfileCard);
        }
        attachGlassButtonListeners();
        console.log("Renderização de perfis concluída.");
    }

    async function selectAndEnterProfile(profile) {
        console.log("Selecionando perfil:", profile.id, profile.name);
        currentProfile = profile;
        localStorage.setItem(`starlight-lastProfile-${userId}`, profile.id);

        const avatarImg = new Image();
        avatarImg.src = currentProfile.avatar;
        avatarImg.className = 'w-full h-full object-cover rounded-full';
        avatarImg.onerror = () => { headerProfileBtn.innerHTML = `<span class="text-xl">${profile.name.charAt(0).toUpperCase()}</span>`; };
        headerProfileBtn.innerHTML = '';
        headerProfileBtn.appendChild(avatarImg);

        console.log("Iniciando/Reiniciando listeners dependentes do perfil...");
        listenToFirestoreContent();
        listenToRequests();
        listenForNewsItems();
        listenForNewsLikes();
        listenForNewsComments(); // Inicia listener de comentários após selecionar perfil

        if (window.location.hash !== '#home-view') {
            console.log("Navegando para #home-view após seleção de perfil.");
            window.location.hash = '#home-view';
        } else {
            console.log("Já está na #home-view, forçando re-renderização.");
            handleNavigation();
        }
    }

    function showProfileModal(profileId = null) {
        const modalTitle = document.getElementById('modal-title');
        const nameInput = document.getElementById('profile-name-input');
        const idInput = document.getElementById('profile-id-input');
        const deleteBtn = document.getElementById('delete-profile-btn');

        avatarOptionsContainer.innerHTML = AVATARS.map(avatar => `
            <img src="${avatar}" class="w-16 h-16 rounded-full cursor-pointer border-2 border-transparent hover:border-white transition-all" data-avatar="${avatar}">`).join('');
        avatarOptionsContainer.querySelectorAll('img').forEach(img => img.classList.remove('!border-purple-500', 'scale-110'));

        if (profileId) {
            console.log("Abrindo modal para editar perfil:", profileId);
            modalTitle.textContent = 'Editar Perfil';
            const profile = profiles.find(p => p.id === profileId);
            if (!profile) { console.error("Perfil não encontrado:", profileId); showToast("Erro.", true); return; }
            nameInput.value = profile.name;
            idInput.value = profile.id;
            deleteBtn.classList.toggle('hidden', profiles.length <= 1);
            const currentAvatar = avatarOptionsContainer.querySelector(`img[data-avatar="${profile.avatar}"]`);
            if (currentAvatar) currentAvatar.classList.add('!border-purple-500', 'scale-110');
            else { const first = avatarOptionsContainer.querySelector('img'); if(first) first.classList.add('!border-purple-500', 'scale-110'); }
        } else {
            console.log("Abrindo modal para adicionar perfil.");
            modalTitle.textContent = 'Adicionar Perfil';
            nameInput.value = ''; idInput.value = ''; deleteBtn.classList.add('hidden');
            const first = avatarOptionsContainer.querySelector('img'); if(first) first.classList.add('!border-purple-500', 'scale-110');
        }
        profileModal.classList.remove('hidden');
    }

    avatarOptionsContainer.addEventListener('click', e => {
        if (e.target.tagName === 'IMG') {
            avatarOptionsContainer.querySelectorAll('img').forEach(img => img.classList.remove('!border-purple-500', 'scale-110'));
            e.target.classList.add('!border-purple-500', 'scale-110');
        }
    });

    document.getElementById('save-profile-btn').addEventListener('click', async () => {
        const name = document.getElementById('profile-name-input').value.trim();
        const selectedAvatarEl = document.querySelector('#avatar-options .scale-110');
        const selectedAvatar = selectedAvatarEl?.dataset.avatar;
        const profileId = document.getElementById('profile-id-input').value;
        const finalAvatar = selectedAvatar || avatarOptionsContainer.querySelector('img')?.dataset.avatar || AVATARS[0];

        if (!name) { showToast('Preencha o nome.', true); return; }
        if (!finalAvatar) { showToast('Selecione um avatar.', true); return; }
        if (!userId) { showToast('Erro de autenticação.', true); return; }

        const profileData = { name, avatar: finalAvatar };
        try {
            if (profileId) {
                console.log("Atualizando perfil:", profileId);
                await updateDoc(doc(db, 'users', userId, 'profiles', profileId), profileData);
                showToast('Perfil atualizado!');
            } else {
                console.log("Adicionando perfil:");
                await addDoc(collection(db, 'users', userId, 'profiles'), profileData);
                showToast('Perfil criado!');
            }
            await loadProfiles();
            profileModal.classList.add('hidden');
        } catch (error) { console.error("Erro ao salvar:", error); showToast('Erro ao salvar.', true); }
    });

    document.getElementById('cancel-profile-btn').addEventListener('click', () => profileModal.classList.add('hidden'));

    document.getElementById('delete-profile-btn').addEventListener('click', async () => {
        const profileId = document.getElementById('profile-id-input').value;
        if (profileId && profiles.length > 1) {
            showConfirmationModal('Excluir Perfil', 'Tem certeza?', async () => {
                try {
                    console.log("Excluindo perfil:", profileId);
                    await deleteDoc(doc(db, 'users', userId, 'profiles', profileId));
                    showToast('Perfil excluído.');
                    if (currentProfile?.id === profileId) {
                         console.log("Perfil atual excluído, limpando seleção...");
                         currentProfile = null;
                         localStorage.removeItem(`starlight-lastProfile-${userId}`);
                         // Para listeners
                         if (typeof window.unsubscribeContent === 'function') window.unsubscribeContent();
                         if (typeof window.unsubscribeFeatured === 'function') window.unsubscribeFeatured();
                         if (typeof window.unsubscribeNewsItems === 'function') window.unsubscribeNewsItems();
                         if (typeof unsubscribeNewsLikes === 'function') unsubscribeNewsLikes();
                         if (typeof unsubscribeNewsComments === 'function') unsubscribeNewsComments();
                         if (typeof window.unsubscribeRequests === 'function') window.unsubscribeRequests();
                         // Limpa caches
                         newsLikes.clear(); newsComments.clear(); pendingRequests = []; firestoreContent = [];
                         headerProfileBtn.innerHTML = '';
                         // Força volta para seleção
                         setTimeout(() => { window.location.hash = 'manage-profile-view'; handleNavigation(); }, 100);
                    }
                    await loadProfiles();
                    profileModal.classList.add('hidden');
                } catch (error) { console.error("Erro ao excluir:", error); showToast('Erro ao excluir.', true); }
            });
        } else if (profiles.length <= 1) { showToast('Não pode excluir o único perfil.', true); }
    });

    manageProfilesBtn.addEventListener('click', () => {
        isEditMode = !isEditMode;
        console.log("Modo edição:", isEditMode);
        manageProfilesBtn.querySelector('.glass-content').textContent = isEditMode ? 'Concluído' : 'Gerenciar Perfis';
        document.getElementById('profile-main-title').textContent = isEditMode ? 'Gerenciar Perfis' : 'Quem está assistindo?';
        renderProfiles();
    });

    headerProfileBtn.addEventListener('click', () => {
        console.log("Botão header profile clicado.");
        isEditMode = false; currentProfile = null;
        localStorage.removeItem(`starlight-lastProfile-${userId}`);
        // Para listeners
        if (typeof window.unsubscribeContent === 'function') window.unsubscribeContent();
        if (typeof window.unsubscribeFeatured === 'function') window.unsubscribeFeatured();
        if (typeof window.unsubscribeNewsItems === 'function') window.unsubscribeNewsItems();
        if (typeof unsubscribeNewsLikes === 'function') unsubscribeNewsLikes();
        if (typeof unsubscribeNewsComments === 'function') unsubscribeNewsComments();
        if (typeof window.unsubscribeRequests === 'function') window.unsubscribeRequests();
        // Limpa caches
        newsLikes.clear(); newsComments.clear(); pendingRequests = []; firestoreContent = [];
        headerProfileBtn.innerHTML = '';
        window.location.hash = 'manage-profile-view';
    });

    // --- Lógica de Autenticação Manual ---
    const switchToRegister = document.querySelector('.switch-to-register');
    const switchToLogin = document.querySelector('.switch-to-login');
    const loginFormContainer = document.querySelector('.form-container.login');
    const registerFormContainer = document.querySelector('.form-container.register');
    switchToRegister.addEventListener('click', (e) => { e.preventDefault(); loginFormContainer.classList.remove('active'); registerFormContainer.classList.add('active'); });
    switchToLogin.addEventListener('click', (e) => { e.preventDefault(); registerFormContainer.classList.remove('active'); loginFormContainer.classList.add('active'); });

    document.getElementById('login-form').addEventListener('submit', (e) => {
        e.preventDefault(); console.log("Login Email/Senha...");
        const email = document.getElementById('login-email').value; const password = document.getElementById('login-password').value;
        signInWithEmailAndPassword(auth, email, password).catch((error) => { console.error("Erro login:", error); showToast(`Erro: ${error.message}`, true); });
    });
    document.getElementById('register-form').addEventListener('submit', (e) => {
        e.preventDefault(); console.log("Registro Email/Senha...");
        const email = document.getElementById('register-email').value; const password = document.getElementById('register-password').value;
        createUserWithEmailAndPassword(auth, email, password).then(async (cred) => {
            const user = cred.user; console.log("Registro OK:", user.uid);
            if (user) {
                const colRef = collection(db, 'users', user.uid, 'profiles');
                const snap = await getDocs(colRef);
                if (snap.empty) {
                    console.log("Criando perfil padrão...");
                    const name = email.split('@')[0] || "Usuário";
                    const capName = name.charAt(0).toUpperCase() + name.slice(1);
                    await addDoc(colRef, { name: capName, avatar: AVATARS[0] });
                    console.log("Perfil padrão criado.");
                } else console.log("Perfis já existem.");
            }
        }).catch((error) => { console.error("Erro registro:", error); showToast(`Erro: ${error.message}`, true); });
    });
    document.getElementById('google-signin-btn').addEventListener('click', () => {
        console.log("Login Google...");
        signInWithPopup(auth, googleProvider).then(async (result) => {
            const user = result.user; console.log("Login Google OK:", user.uid);
            if (user) {
                const colRef = collection(db, 'users', user.uid, 'profiles');
                const snap = await getDocs(colRef);
                if (snap.empty) {
                    console.log("Criando perfil padrão Google...");
                    await addDoc(colRef, { name: user.displayName || "Usuário", avatar: user.photoURL || AVATARS[0] });
                    console.log("Perfil Google criado.");
                } else console.log("Perfis Google já existem.");
            }
        }).catch((error) => {
            console.error("Erro Google:", error);
            if (error.code === 'auth/popup-closed-by-user') showToast('Login cancelado.', true);
            else if (error.code === 'auth/popup-blocked') showToast('Popup bloqueado.', true);
            else showToast(`Erro: ${error.message}`, true);
        });
    });

    logoutBtn.addEventListener('click', () => {
        console.log("Logout clicado.");
        const currentId = userId;
        signOut(auth).then(() => {
            console.log("Logout OK.");
            if (currentId) localStorage.removeItem(`starlight-lastProfile-${currentId}`);
            // Limpa estado e para listeners
            userId = null; currentProfile = null; profiles = []; firestoreContent = []; pendingRequests = []; newsItems = [];
            newsLikes.clear(); newsComments.clear(); headerProfileBtn.innerHTML = '';
            console.log("Parando listeners...");
            if (typeof window.unsubscribeContent === 'function') window.unsubscribeContent();
            if (typeof window.unsubscribeFeatured === 'function') window.unsubscribeFeatured();
            if (typeof window.unsubscribeNotifications === 'function') window.unsubscribeNotifications();
            if (typeof window.unsubscribeNewsItems === 'function') window.unsubscribeNewsItems();
            if (typeof unsubscribeNewsLikes === 'function') unsubscribeNewsLikes();
            if (typeof unsubscribeNewsComments === 'function') unsubscribeNewsComments(); // Para todos de comentários
            if (typeof window.unsubscribeRequests === 'function') window.unsubscribeRequests();
            console.log("Listeners parados.");
            // onAuthStateChanged redirecionará
        }).catch((error) => { console.error("Erro logout:", error); showToast(`Erro: ${error.message}`, true); });
    });

    // --- Lógica Modal Confirmação ---
    function showConfirmationModal(title, message, onConfirm) {
        confirmTitle.textContent = title; confirmMessage.textContent = message; confirmCallback = onConfirm; confirmModal.classList.remove('hidden');
    }
    confirmOkBtn.addEventListener('click', () => { if (confirmCallback) confirmCallback(); confirmModal.classList.add('hidden'); confirmCallback = null; });
    confirmCancelBtn.addEventListener('click', () => { confirmModal.classList.add('hidden'); confirmCallback = null; });

    // --- Busca TMDB para Pedidos ---
    const tmdbSearchInput = document.getElementById('tmdb-search-input');
    if (tmdbSearchInput) tmdbSearchInput.addEventListener('input', () => { clearTimeout(debounceTimer); debounceTimer = setTimeout(() => handleTmdbSearch(tmdbSearchInput.value), 500); });
    async function handleTmdbSearch(query) {
        const resultsContainer = document.getElementById('tmdb-search-results');
        if (!resultsContainer) return;
        if (query.length < 3) { resultsContainer.innerHTML = ''; return; }
        resultsContainer.innerHTML = `<div class="col-span-full flex justify-center py-4"><div class="spinner"></div></div>`;
        const data = await fetchFromTMDB('search/multi', `query=${encodeURIComponent(query)}`);
        if (data?.results) renderTmdbResults(data.results.filter(i => (i.media_type === 'movie' || i.media_type === 'tv') && i.poster_path));
        else resultsContainer.innerHTML = `<p class="col-span-full text-center text-gray-400">Nenhum resultado no TMDB.</p>`;
    }
    function renderTmdbResults(results) {
        const container = document.getElementById('tmdb-search-results');
        if (!container) return;
        if (results.length === 0) { container.innerHTML = `<p class="col-span-full text-center text-gray-400">Nenhum filme/série no TMDB.</p>`; return; }
        container.innerHTML = results.map(item => {
            const poster = item.poster_path ? `${IMG_URL_POSTER}${item.poster_path}` : 'https://placehold.co/300x450/1c1917/FFFFFF?text=Sem+Imagem';
            const year = (item.release_date || item.first_air_date || '').substring(0, 4);
            return `
            <div class="cursor-pointer group tmdb-result-item" data-item='${JSON.stringify(item)}'>
                <div class="liquid-glass-card aspect-[2/3] bg-stone-800"><div class="glass-filter"></div><div class="glass-overlay"></div><div class="glass-specular"></div><div class="glass-content p-0"><img src="${poster}" alt="${item.title||item.name}" loading="lazy" class="w-full h-full object-cover rounded-[inherit]"></div></div>
                <h4 class="text-white text-xs mt-2 truncate">${item.title||item.name} ${year?`(${year})`:''}</h4>
            </div>`;
        }).join('');
        attachGlassButtonListeners();
    }
    const tmdbResultsContainer = document.getElementById('tmdb-search-results');
    if (tmdbResultsContainer) tmdbResultsContainer.addEventListener('click', (e) => {
        const itemEl = e.target.closest('.tmdb-result-item');
        if (itemEl) try { const data = JSON.parse(itemEl.dataset.item); confirmAndAddRequest(data); } catch (err) { console.error("Erro parse TMDB:", err); showToast("Erro.", true); }
    });
    const pendingRequestsContainer = document.getElementById('pending-requests-container');
    if (pendingRequestsContainer) pendingRequestsContainer.addEventListener('click', e => {
        const btn = e.target.closest('.vote-btn');
        if (btn) { const id = btn.dataset.requestId; if(id) handleVote(id); }
    });
    async function confirmAndAddRequest(item) {
        const title = item.title || item.name;
        showConfirmationModal('Confirmar Pedido', `Solicitar "${title}"?`, async () => {
            if (!userId || !currentProfile?.id) { showToast("Selecione um perfil.", true); return; }
            const inCatalog = firestoreContent.some(c => c.tmdb_id === item.id && c.type === item.media_type);
            if (inCatalog) { showToast('Já está no catálogo.', false); return; }
            const existing = pendingRequests.find(r => r.tmdbId === item.id && r.mediaType === item.media_type);
            if (existing) {
                const requested = existing.requesters && existing.requesters.some(r => r.userId === userId && r.profileId === currentProfile.id);
                if (requested) { showToast('Você já apoiou.', false); return; }
                try {
                    console.log("Apoiando pedido existente...");
                    await updateDoc(doc(db, 'pedidos', existing.id), { requesters: arrayUnion({ userId: userId, userName: currentProfile.name, profileId: currentProfile.id }) });
                    showToast('Apoio adicionado!');
                } catch (err) { console.error("Erro ao apoiar:", err); showToast('Erro ao apoiar.', true); }
            } else {
                console.log("Criando novo pedido...");
                const data = { tmdbId: item.id, title: item.title || item.name, year: (item.release_date || item.first_air_date || '').substring(0, 4), posterUrl: item.poster_path ? `${IMG_URL_POSTER}${item.poster_path}` : 'https://placehold.co/300x450/1c1917/FFFFFF?text=Sem+Imagem', mediaType: item.media_type, status: 'pending', createdAt: serverTimestamp(), requesters: [{ userId: userId, userName: currentProfile.name, profileId: currentProfile.id }] };
                try {
                    await addDoc(collection(db, 'pedidos'), data);
                    showToast('Pedido enviado!');
                    if(tmdbSearchInput) tmdbSearchInput.value = ''; if(tmdbResultsContainer) tmdbResultsContainer.innerHTML = '';
                } catch (err) { console.error("Erro ao pedir:", err); showToast('Erro ao pedir.', true); }
            }
        });
    }

    // --- Estado Inicial e Listener Principal Auth ---

    function showLoginScreen() { /* ... código mantido ... */ }
    async function showProfileScreen() { /* ... código mantido ... */ }

    onAuthStateChanged(auth, async (user) => {
        console.log("Auth state changed. User:", user ? user.uid : 'null');
        document.body.classList.remove('auth-loading');
        if (user) {
            userId = user.uid;
            console.log("Usuário logado:", userId);
            listenForNotifications();
            initializeUI(); // Inicializa UI geral (player, etc)

            const lastProfileId = localStorage.getItem(`starlight-lastProfile-${userId}`);
            let autoSelected = false;
            if (lastProfileId) {
                console.log("Tentando carregar último perfil:", lastProfileId);
                await loadProfiles(); // Espera carregar
                const found = profiles.find(p => p.id === lastProfileId);
                if (found) {
                    console.log("Último perfil válido, selecionando...");
                    await selectAndEnterProfile(found); // Espera selecionar
                    autoSelected = true;
                    // selectAndEnterProfile já define hash e chama handleNavigation
                } else {
                    console.log("Último perfil salvo inválido.");
                    localStorage.removeItem(`starlight-lastProfile-${userId}`);
                    currentProfile = null;
                }
            } else {
                console.log("Nenhum último perfil salvo.");
                currentProfile = null;
            }

            if (!autoSelected) {
                console.log("Nenhum perfil selecionado, mostrando tela de seleção...");
                // Para listeners dependentes
                 if (typeof window.unsubscribeContent === 'function') window.unsubscribeContent();
                 if (typeof window.unsubscribeFeatured === 'function') window.unsubscribeFeatured();
                 if (typeof window.unsubscribeNewsItems === 'function') window.unsubscribeNewsItems();
                 if (typeof unsubscribeNewsLikes === 'function') unsubscribeNewsLikes();
                 if (typeof unsubscribeNewsComments === 'function') unsubscribeNewsComments();
                 if (typeof window.unsubscribeRequests === 'function') window.unsubscribeRequests();
                 // Limpa caches
                 newsLikes.clear(); newsComments.clear(); pendingRequests = []; firestoreContent = [];
                 headerProfileBtn.innerHTML = '';
                // Força tela de seleção
                if (window.location.hash !== '#manage-profile-view') history.replaceState(null, '', '#manage-profile-view');
                handleNavigation(); // Chama para mostrar a tela de seleção
            }
             // Se autoSelected, selectAndEnterProfile já chamou handleNavigation

        } else { // Usuário deslogado
            console.log("Usuário deslogado.");
            showLoginScreen(); // Mostra login e para listeners
            if (window.location.hash !== '#login-view') history.replaceState(null, '', '#login-view');
            handleNavigation(); // Garante UI de login
        }
        sessionStorage.setItem('starlight-previousHash', window.location.hash);
        console.log("onAuthStateChanged concluído.");
    });

    // --- Inicialização ---
    initializeGlassEffects();
    window.addEventListener('resize', () => { updateMobileNavIndicator(); addPlayerEventListeners(); });
    console.log("Script inicializado, aguardando auth state...");

    // --- Funções e Listeners de Comentários ---

    function openCommentsModal(newsId) {
        console.log(`[openCommentsModal] Abrindo para: ${newsId}`);
        if (!newsId || !userId || !currentProfile?.id) { showToast("Selecione um perfil para comentar.", true); return; }
        const newsItem = newsItems.find(item => item.id === newsId);
        if (!newsItem) { console.error("Item não encontrado:", newsId); showToast("Erro.", true); return; }

        currentNewsCommentsModalId = newsId;
        commentsModalTitle.textContent = `Comentários em: ${newsItem?.title || 'Post'}`;
        commentsModalList.innerHTML = '<div class="spinner mx-auto my-8"></div>';
        renderComments(newsId); // Renderiza o que já tem no cache
        commentsModal.classList.remove('hidden');
        document.body.style.overflow = 'hidden'; // Bloqueia scroll do fundo
        commentInput.focus();
        cancelReply();
        setTimeout(() => lucide.createIcons({ nodes: [commentsModal] }), 50);
    }

    function closeCommentsModal() {
        commentsModal.classList.add('hidden');
        currentNewsCommentsModalId = null;
        if (playerView.classList.contains('hidden') && newsPlayerView.classList.contains('hidden')) { // Verifica players
            document.body.style.overflow = 'auto'; // Libera scroll do fundo
        }
        cancelReply();
        // Se a rota era #comments/, volta para #news-view
        // if (window.location.hash.startsWith('#comments/')) {
        //      history.replaceState(null, '', '#news-view'); // Não adiciona ao histórico
        //      handleNavigation(); // Atualiza a UI para news-view
        // }
    }

    async function handleCommentSubmit(event) {
        event.preventDefault();
        console.log("[handleCommentSubmit] Tentando enviar...");
        if (!userId || !currentProfile?.id || !currentNewsCommentsModalId) { console.log("Erro: Dados ausentes."); showToast("Erro.", true); return; }
        const commentText = commentInput.value.trim();
        if (!commentText) { console.log("Erro: Texto vazio."); return; }

        commentInput.disabled = true; commentForm.querySelector('button[type="submit"]').disabled = true;

        const commentData = {
            profileId: currentProfile.id, profileName: currentProfile.name, profileAvatar: currentProfile.avatar,
            text: commentText, createdAt: serverTimestamp(),
            replyTo: replyToCommentId || null,
            newsId: currentNewsCommentsModalId,
            likedBy: [] // Inicializa array de likes
        };

        try {
            console.log("[handleCommentSubmit] Adicionando à coleção 'comentarios':", commentData);
            // Salva em 'comentarios/{newsId}/comments'
            const commentsColRef = collection(db, "comentarios", currentNewsCommentsModalId, "comments");
            await addDoc(commentsColRef, commentData);
            console.log("Comentário adicionado.");
            commentInput.value = ''; cancelReply();
        } catch (error) { console.error("Erro:", error); showToast("Erro ao enviar.", true);
        } finally { commentInput.disabled = false; commentForm.querySelector('button[type="submit"]').disabled = false; commentInput.focus(); }
    }

    // Renderiza comentários no modal
    function renderComments(newsId) {
        const comments = newsComments.get(newsId) || [];
        commentsModalList.innerHTML = ''; // Limpa

        if (comments.length === 0) {
            commentsModalList.innerHTML = '<p class="text-slate-400 text-center py-4">Nenhum comentário ainda.</p>'; return;
        }

        const commentTree = {}; const topLevel = [];
        comments.forEach(c => {
            if (c.replyTo) { if (!commentTree[c.replyTo]) commentTree[c.replyTo] = []; commentTree[c.replyTo].push(c); }
            else { topLevel.push(c); }
        });
        Object.values(commentTree).forEach(replies => replies.sort((a,b)=>(a.createdAt?.toMillis()||0)-(b.createdAt?.toMillis()||0)));
        topLevel.sort((a,b)=>(a.createdAt?.toMillis()||0)-(b.createdAt?.toMillis()||0));

        const renderNode = (comment, level = 0) => {
            const date = comment.createdAt?.toDate ? comment.createdAt.toDate().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short'}) : '';
            const replies = commentTree[comment.id] || [];
            const isReplying = replyToCommentId === comment.id;
            const likedBy = comment.likedBy || [];
            const userLikedComment = currentProfile && likedBy.includes(currentProfile.id);
            const likeCount = likedBy.length;

            let replyHTML = replies.length > 0 ? `<div class="ml-6 mt-2 space-y-2 border-l-2 border-slate-700 pl-3">${replies.map(r => renderNode(r, level + 1)).join('')}</div>` : '';

            return `
            <div class="comment-item py-2 ${level === 0 ? 'border-b border-slate-700/50 pb-3 mb-1' : ''}" data-comment-id="${comment.id}">
                <div class="flex items-start gap-3">
                    <img src="${comment.profileAvatar || AVATARS[0]}" alt="${comment.profileName}" class="w-8 h-8 rounded-full flex-shrink-0 mt-1 shadow-md">
                    <div class="flex-1">
                        <p class="font-semibold text-sm text-white">${comment.profileName}
                           <span class="text-xs text-slate-400 font-normal ml-2">${date}</span>
                        </p>
                        <p class="text-slate-300 text-sm mt-0.5 whitespace-pre-wrap break-words">${comment.text}</p>
                        <div class="flex items-center gap-3 mt-1">
                             <button class="reply-button text-xs text-blue-400 hover:underline flex items-center gap-1" data-comment-id="${comment.id}" data-author-name="${comment.profileName}">
                                 ${ICONS.reply} Responder
                             </button>
                              <button class="comment-like-button text-xs flex items-center gap-1 ${userLikedComment ? 'text-red-500' : 'text-slate-400 hover:text-white'}" data-comment-id="${comment.id}">
                                  ${userLikedComment ? ICONS.heartFilled : ICONS.heartOutline}
                                  <span class="comment-like-count">${likeCount}</span>
                              </button>
                             ${comment.profileId === currentProfile?.id ? `
                             <button class="delete-comment-button text-xs text-slate-500 hover:text-red-400 flex items-center gap-1 ml-auto" data-comment-id="${comment.id}">
                                 ${ICONS.trash} Apagar
                             </button>` : ''}
                        </div>
                        ${isReplying ? '<span class="text-xs text-blue-400 ml-2">(Respondendo...)</span>' : ''}
                    </div>
                </div>
                ${replyHTML}
            </div>`;
        };
        commentsModalList.innerHTML = topLevel.map(c => renderNode(c)).join('');
        lucide.createIcons({ nodes: [commentsModalList] });
        // commentsModalList.scrollTop = commentsModalList.scrollHeight; // Evita scroll automático ao re-renderizar
    }

    // Listener para form, close, e botões dentro do modal de comentários
    commentForm.addEventListener('submit', handleCommentSubmit);
    commentsModalCloseBtn.addEventListener('click', closeCommentsModal);

    commentsModalList.addEventListener('click', (e) => {
        const replyBtn = e.target.closest('.reply-button');
        const likeBtn = e.target.closest('.comment-like-button');
        const deleteBtn = e.target.closest('.delete-comment-button');

        if (replyBtn) {
            const id = replyBtn.dataset.commentId; const name = replyBtn.dataset.authorName;
            console.log(`Responder clicado: ${id} (${name})`); startReply(id, name);
        } else if (likeBtn) {
            const id = likeBtn.dataset.commentId;
            console.log(`Like clicado: ${id}`); handleCommentLike(id);
        } else if (deleteBtn) {
            const id = deleteBtn.dataset.commentId;
            console.log(`Apagar clicado: ${id}`); handleCommentDelete(id);
        }
    });

    function startReply(id, name) {
        replyToCommentId = id; replyToCommentAuthor = name;
        replyIndicator.innerHTML = `<span>Respondendo a ${name}</span><button id="cancel-reply-btn-inner" class="text-red-400 hover:text-red-300 text-xs ml-auto">Cancelar</button>`;
        replyIndicator.classList.remove('hidden');
        const cancelBtn = document.getElementById('cancel-reply-btn-inner');
        if(cancelBtn) cancelBtn.addEventListener('click', cancelReply, { once: true });
        commentInput.focus();
        if (currentNewsCommentsModalId) renderComments(currentNewsCommentsModalId); // Re-render para mostrar "(Respondendo...)"
    }

    function cancelReply() {
        console.log("Cancelando resposta.");
        replyToCommentId = null; replyToCommentAuthor = null;
        replyIndicator.classList.add('hidden'); replyIndicator.innerHTML = '';
        const cancelBtn = document.getElementById('cancel-reply-btn-inner');
        if(cancelBtn) cancelBtn.removeEventListener('click', cancelReply);
        if (currentNewsCommentsModalId && !commentsModal.classList.contains('hidden')) {
             renderComments(currentNewsCommentsModalId); // Re-render para remover "(Respondendo...)"
        }
    }

    // Lida com like/unlike em um comentário
    async function handleCommentLike(commentId) {
        if (!userId || !currentProfile?.id || !currentNewsCommentsModalId) { showToast("Selecione perfil.", true); return; }
        // **CORREÇÃO: Caminho para o documento do comentário**
        const commentDocRef = doc(db, "comentarios", currentNewsCommentsModalId, "comments", commentId);
        const profileId = currentProfile.id;
        try {
            await runTransaction(db, async (transaction) => {
                const commentDoc = await transaction.get(commentDocRef);
                if (!commentDoc.exists()) throw "Comentário não encontrado!";
                const data = commentDoc.data();
                const likedBy = data.likedBy || [];
                if (likedBy.includes(profileId)) {
                     console.log(`Removendo like do comentário ${commentId}`);
                    transaction.update(commentDocRef, { likedBy: arrayRemove(profileId) });
                } else {
                     console.log(`Adicionando like ao comentário ${commentId}`);
                    transaction.update(commentDocRef, { likedBy: arrayUnion(profileId) });
                }
            });
            // UI atualiza via listener
        } catch (error) { console.error("Erro ao curtir/descurtir comentário:", error); showToast("Erro no like.", true); }
    }

    // Lida com a exclusão de um comentário
    async function handleCommentDelete(commentId) {
        if (!userId || !currentProfile?.id || !currentNewsCommentsModalId) return;
        // **CORREÇÃO: Caminho para o documento do comentário**
        const commentDocRef = doc(db, "comentarios", currentNewsCommentsModalId, "comments", commentId);
         // Verifica se o comentário pertence ao perfil atual (verificação no cliente)
        const comments = newsComments.get(currentNewsCommentsModalId) || [];
        const commentToDelete = comments.find(c => c.id === commentId);
         if (!commentToDelete || commentToDelete.profileId !== currentProfile.id) {
             console.log("Tentativa de apagar comentário de outro usuário ou comentário não encontrado.");
             showToast("Você só pode apagar seus próprios comentários.", true);
             return;
         }

        showConfirmationModal("Excluir Comentário", "Tem certeza?", async () => {
            try {
                 console.log(`Excluindo comentário ${commentId}...`);
                 // TODO: Considerar excluir respostas em cascata no futuro (requer função de backend ou lógica complexa no cliente)
                await deleteDoc(commentDocRef);
                 console.log("Comentário excluído.");
                showToast("Comentário excluído.");
                // UI atualiza via listener
            } catch (error) { console.error("Erro ao excluir comentário:", error); showToast("Erro ao excluir.", true); }
        });
    }

    // --- FIM: Comentários ---

     // Para mídia de novidades se a view for trocada
     function stopNewsViewMedia() {
         hideNewsPlayer();
         const newsIframeContainers = document.querySelectorAll('.news-iframe-container');
         newsIframeContainers.forEach(container => {
             const overlay = container.querySelector('.news-iframe-play-overlay');
             const wrapper = container.querySelector('[id^="iframe-wrapper-"]');
             if (wrapper) wrapper.innerHTML = ''; // Remove iframe
             if (overlay) overlay.classList.remove('hidden'); // Mostra overlay
         });
     }


}); // Fim DOMContentLoaded
