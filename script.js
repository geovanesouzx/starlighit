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
    orderBy,
    onSnapshot,
    serverTimestamp,
    arrayUnion,
    arrayRemove,
    runTransaction // Necessário para contadores de likes/comentários
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', function() {
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

    let userId = null;

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

    // NOVO: Caches para Novidades
    let newsItems = [];
    let newsLikes = new Map(); // Armazena likes por newsId -> Set[profileId]
    let newsComments = new Map(); // Armazena comentários por newsId -> Array[comment]
    let unsubscribeNewsLikes = () => {}; // Função para parar listener de likes
    let unsubscribeNewsComments = () => {}; // Função para parar listener de comentários
    let currentNewsCommentsModalId = null; // ID do post que está no modal de comentários
    let replyToCommentId = null; // ID do comentário sendo respondido
    let replyToCommentAuthor = null; // Nome do autor do comentário sendo respondido

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

    // NOVO: Elementos do Player (Novidades)
    const newsPlayerView = document.getElementById('news-player-view');
    const newsPlayerVideo = document.getElementById('news-video-player');
    const newsPlayerTitle = document.getElementById('news-player-title');
    const newsPlayerCloseBtn = document.getElementById('news-player-close-btn');

    // NOVO: Elementos do Modal de Comentários
    const commentsModal = document.getElementById('comments-modal');
    const commentsModalTitle = document.getElementById('comments-modal-title');
    const commentsModalList = document.getElementById('comments-list');
    const commentsModalCloseBtn = document.getElementById('comments-modal-close-btn');
    const commentForm = document.getElementById('comment-form');
    const commentInput = document.getElementById('comment-input');
    const replyIndicator = document.getElementById('reply-indicator'); // Elemento para mostrar a quem está respondendo
    const cancelReplyBtn = document.getElementById('cancel-reply-btn'); // Botão para cancelar resposta

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
        , // NOVO: Ícones para Novidades
        heartOutline: `<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path></svg>`,
        heartFilled: `<svg fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg>`,
        comment: `<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 5.523-4.477 10-10 10S1 17.523 1 12 5.477 2 11 2s10 4.477 10 10z"></path></svg>`,
        reply: `<svg fill="currentColor" viewBox="0 0 24 24" class="w-4 h-4"><path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"></path></svg>`
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
            const itemToAdd = { ...item, media_type: item.media_type || (item.title ? 'movie' : 'tv')};
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


    // --- NOVO: Lógica Player de Vídeo (Novidades) ---
    function showNewsPlayer(url, title) {
        if (!newsPlayerView || !newsPlayerVideo) return;
        newsPlayerTitle.textContent = title || 'Vídeo';
        newsPlayerVideo.src = url;
        newsPlayerView.classList.remove('hidden');
        document.body.style.overflow = 'hidden'; // Impede scroll do fundo
        newsPlayerVideo.play().catch(e => console.error("Erro ao iniciar player de novidades:", e));
    }

    function hideNewsPlayer() {
        if (!newsPlayerView || !newsPlayerVideo) return;
        newsPlayerVideo.pause();
        newsPlayerVideo.removeAttribute('src'); // Remove a fonte para parar o carregamento
        newsPlayerVideo.load();
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
        // Escuta a coleção 'content'
        onSnapshot(collection(db, 'content'), (snapshot) => {
            firestoreContent = []; // Limpa o cache local
            snapshot.forEach(doc => {
                // Adiciona cada item ao cache com seu ID do Firestore
                firestoreContent.push({ docId: doc.id, ...doc.data() });
            });

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
        if (!screenElement ) return; // Sai se a tela não for encontrada

        // Para iframes e player de novidades se sair da tela de novidades
        if (screenId !== 'news-view') {
            stopNewsViewMedia(); // NOVO
        }

        // Lógica de renderização específica para cada tela
        if (screenId === 'home-view') {
            // Pega os itens em destaque e atualiza o hero
            const featuredItems = featuredItemIds.map(id => firestoreContent.find(item => item.docId === id)).filter(Boolean);
            if(featuredItems.length > 0) {
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
        } else if (screenId === 'news-view') { // NOVO
            renderNewsView(); // Renderiza a seção de novidades
            // Inicia listeners de likes e comentários específicos para novidades
            listenForNewsLikes();
            listenForNewsComments();
        } else {
            // Se saiu da tela de novidades, para os listeners
            if (typeof unsubscribeNewsLikes === 'function') unsubscribeNewsLikes();
            if (typeof unsubscribeNewsComments === 'function') unsubscribeNewsComments();
            newsLikes.clear(); // Limpa caches
            newsComments.clear();
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
                const firstSeasonKey = Object.keys(data.seasons).sort((a,b) => parseInt(a) - parseInt(b))[0];
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
                const stillPath = ep.still_path ? (ep.still_path.startsWith('/') ? `https://image.tmdb.org/t/p/w300${ep.still_path}`: ep.still_path) : 'https://placehold.co/300x168/1c1917/FFFFFF?text=Starlight';

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
            if(episodeItem){ // Se clicou em um episódio
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
    function attachGlassButtonListeners() { document.querySelectorAll('.glass-button, .liquid-glass-card, .player-control-btn, .glass-container[style*="--bg-color"], .glass-form').forEach(element => { if (!element.hasGlassListener) { element.addEventListener('mousemove', handleMouseMove); element.addEventListener('mouseleave', handleMouseLeave); element.hasGlassListener = true; }}); } // 'hasGlassListener' evita adicionar múltiplos listeners
    /** Atualiza a posição e tamanho do indicador da navegação mobile */
    function updateMobileNavIndicator() { const indicator = document.getElementById('mobile-nav-indicator'); const activeItem = document.querySelector('#mobile-nav .mobile-nav-item.active'); if (indicator && activeItem) { const left = activeItem.offsetLeft; const width = activeItem.offsetWidth; indicator.style.width = `${width}px`; indicator.style.transform = `translateX(${left}px)`; }}
    /** Mostra ou esconde o overlay de busca */
    function toggleSearchOverlay(show) { if (show) { searchOverlay.classList.remove('hidden'); searchInput.focus(); document.body.style.overflow = 'hidden'; } else { searchOverlay.classList.add('hidden'); searchInput.value = ''; searchResultsContainer.innerHTML = ''; document.body.style.overflow = 'auto'; }}

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
            history.pushState({view: 'player'}, '', '#player');
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
        if(context.episodes && context.episodes.length > 1) {
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
        if(updateHistory && currentPlayerContext.key){
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
        // Só restaura o scroll se o player de novidades também não estiver ativo
        if (newsPlayerView.classList.contains('hidden')) {
             document.body.style.overflow = 'auto'; // Restaura a rolagem do body
        }
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
        if(aspectRatioBtn) aspectRatioBtn.querySelector('.glass-content').innerHTML = ICONS.aspectContain;

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
            if(isNaN(videoPlayer.currentTime)) return; // Ignora se currentTime for NaN
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
            if(isNaN(videoPlayer.duration)) return; // Ignora se duration for NaN
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
        const openSeasonSelectPanel = document.querySelector('#season-options:not(.hidden)');
        if (openSeasonSelectPanel && !openSeasonSelectPanel.closest('.custom-select-container').contains(e.target)) {
            document.getElementById('season-selector-button')?.click(); // Simula clique no botão para fechar
        }

        // NOVO: Fecha modal de comentários
        if (!commentsModal.classList.contains('hidden') && !commentsModal.querySelector('.liquid-glass-card').contains(e.target)) {
            // Verifica se o clique foi fora do card interno do modal
            closeCommentsModal();
        }
    });

    /** Cria as opções no painel de configurações do player (velocidade, qualidade) */
    function createSettingsOptions() {
        const speedContainer = document.getElementById('settings-speed-options');
        const qualityContainer = document.getElementById('settings-quality-options');
        // Só cria se ainda não existirem (evita duplicação)
        if(speedContainer.childElementCount > 1) return;

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

    // Listener para o botão "Assistir" na seção hero
    document.getElementById('hero-watch-btn').addEventListener('click', () => {
        if (!currentHeroItem) return; // Sai se não houver item no hero
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
        aspectRatioBtn.querySelector('.glass-content').innerHTML = ICONS.aspectContain; // NOVO
        createSettingsOptions(); // Cria opções de velocidade/qualidade
        addPlayerEventListeners(); // Adiciona listeners ao <video>
    }

    // --- Listeners Gerais da UI (Busca, Notificações) ---
    searchIconBtn.addEventListener('click', () => toggleSearchOverlay(true)); // Abrir busca (desktop)
    closeSearchBtn.addEventListener('click', () => toggleSearchOverlay(false)); // Fechar busca
    document.getElementById('search-overlay-bg').addEventListener('click', () => toggleSearchOverlay(false)); // Fechar ao clicar no fundo

    // Listener de busca com debounce (CORRIGIDO)
    searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            // Chama a nova função performSearch (que agora é síncrona)
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
        const hash = window.location.hash; // Pega o hash atual (ex: #home-view, #details/123)

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
                if(window.location.hash !== '#home-view') {
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
    }

    // Adiciona os listeners de navegação do navegador (botão voltar/avançar, mudança de hash)
    window.addEventListener('popstate', handleNavigation);
    // window.addEventListener('hashchange', handleNavigation); // Não precisamos mais do hashchange, popstate cobre tudo

    // --- Lógica de Notificações ---
    function listenForNotifications() {
        const q = query(collection(db, "notifications"), orderBy("createdAt", "desc")); // Usa orderBy
        onSnapshot(q, (snapshot) => {
            notifications = [];
            snapshot.forEach((doc) => {
                notifications.push({ id: doc.id, ...doc.data() });
            });
            // Ordenação não é mais necessária aqui, pois orderBy é usado na query
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
            // CORREÇÃO: Adiciona data attributes para o link
            const linkDataAttrs = notif.link
                ? `data-link-type="${notif.link.type}" data-link-target="${notif.link.type === 'internal' ? notif.link.docId : notif.link.url}"`
                : '';
            const cursorClass = notif.link ? 'cursor-pointer' : '';

            // CORREÇÃO: Remover o comentário incorreto
            return `
                <div class="notification-item flex items-start gap-2 p-2 rounded-md transition-colors hover:bg-white/5 ${cursorClass}" ${linkDataAttrs}>
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

    // Listener para o painel de notificações (troca de abas, dispensar, CLIQUE NO ITEM)
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

        // CORREÇÃO: Lidar com cliques nos itens de notificação
        const notificationItem = e.target.closest('.notification-item[data-link-type]');
        if (notificationItem) {
            const linkType = notificationItem.dataset.linkType;
            const linkTarget = notificationItem.dataset.linkTarget;

            if (linkType === 'internal' && linkTarget) {
                // Fecha o painel antes de navegar
                notificationPanel.classList.remove('animate-fade-in-down');
                notificationPanel.classList.add('animate-fade-out-up');
                setTimeout(() => notificationPanel.classList.add('hidden'), 250);
                // Navega para a página de detalhes
                window.location.hash = `#details/${linkTarget}`;
            } else if (linkType === 'external' && linkTarget) {
                // Abre link externo em nova aba
                window.open(linkTarget, '_blank');
                // Fecha o painel
                 notificationPanel.classList.remove('animate-fade-in-down');
                 notificationPanel.classList.add('animate-fade-out-up');
                 setTimeout(() => notificationPanel.classList.add('hidden'), 250);
            }
        }
    });

    // --- NOVO: Lógica de Novidades ---
    function listenForNewsItems() {
        const q = query(collection(db, "news"), orderBy("createdAt", "desc"));
        onSnapshot(q, (snapshot) => {
            newsItems = [];
            snapshot.forEach((doc) => {
                newsItems.push({ id: doc.id, ...doc.data() });
            });
            // Re-renderiza a view de novidades se ela estiver ativa
            if (window.location.hash === '#news-view') {
                renderNewsView();
            }
        }, (error) => {
            console.error("Erro ao escutar novidades: ", error);
            // Poderia mostrar erro na UI se a view estiver ativa
            if (window.location.hash === '#news-view') {
                 document.getElementById('news-items-container').innerHTML = '<p class="text-red-400">Erro ao carregar novidades.</p>';
            }
        });
    }

    // Escuta por mudanças nos likes de TODOS os posts de novidades
    function listenForNewsLikes() {
        // Para listener anterior, se houver
        if (typeof unsubscribeNewsLikes === 'function') unsubscribeNewsLikes();

        const q = query(collection(db, "news"));
        unsubscribeNewsLikes = onSnapshot(q, (snapshot) => {
            newsLikes.clear(); // Limpa o cache local de likes
            let needsUIRefresh = false;
            snapshot.forEach((doc) => {
                const data = doc.data();
                // Armazena os IDs dos perfis que curtiram em um Set para fácil verificação
                newsLikes.set(doc.id, new Set(data.likedBy || []));
                needsUIRefresh = true; // Marca que a UI precisa ser atualizada
            });
            // Atualiza a UI se a view de novidades estiver ativa
            if (needsUIRefresh && window.location.hash === '#news-view') {
                updateNewsItemsUI(); // Função separada para apenas atualizar likes/comentários na UI
            }
        }, (error) => {
            console.error("Erro ao escutar likes de novidades:", error);
        });
    }

    // Escuta por mudanças nos comentários de TODOS os posts de novidades
    function listenForNewsComments() {
        // Para listener anterior
        if (typeof unsubscribeNewsComments === 'function') unsubscribeNewsComments();

        // Listener para a coleção principal 'news' para detectar novos posts
        const qNews = query(collection(db, "news"));
        const unsubscribeMain = onSnapshot(qNews, (newsSnapshot) => {
            const currentNewsIds = new Set();
            newsSnapshot.forEach(newsDoc => currentNewsIds.add(newsDoc.id));

            // Array para guardar funções de unsubscribe de cada subcoleção
            let commentUnsubscribers = [];

            // Limpa comentários antigos
            newsComments.clear();

            // Itera sobre os posts de novidades atuais e escuta suas subcoleções de comentários
            currentNewsIds.forEach(newsId => {
                const commentsQuery = query(collection(db, "news", newsId, "comments"), orderBy("createdAt", "asc"));
                const unsubscribe = onSnapshot(commentsQuery, (commentsSnapshot) => {
                    const commentsList = [];
                    commentsSnapshot.forEach((commentDoc) => {
                        commentsList.push({ id: commentDoc.id, ...commentDoc.data() });
                    });
                    newsComments.set(newsId, commentsList); // Atualiza o cache de comentários para este post

                    // Atualiza a UI se a view de novidades estiver ativa
                    if (window.location.hash === '#news-view') {
                        updateNewsItemsUI();
                    }
                    // Se o modal de comentários estiver aberto para ESTE post, atualiza a lista
                    if (currentNewsCommentsModalId === newsId && !commentsModal.classList.contains('hidden')) {
                        renderComments(newsId);
                    }
                }, (error) => {
                    console.error(`Erro ao escutar comentários para news ${newsId}:`, error);
                });
                commentUnsubscribers.push(unsubscribe); // Guarda a função de unsubscribe
            });

            // Define a função global de unsubscribe para parar todos os listeners de comentários
            unsubscribeNewsComments = () => {
                unsubscribeMain(); // Para o listener principal
                commentUnsubscribers.forEach(unsub => unsub()); // Para todos os listeners de subcoleção
            };

        }, (error) => {
            console.error("Erro ao escutar coleção 'news':", error);
        });
    }

    // Atualiza apenas os contadores e estado dos botões na UI de Novidades
    function updateNewsItemsUI() {
        const container = document.getElementById('news-items-container');
        if (!container) return;

        container.querySelectorAll('.news-item-card').forEach(card => {
            const newsId = card.dataset.newsId;
            const likeButton = card.querySelector('.like-button');
            const likeCountSpan = card.querySelector('.like-count');
            const commentCountSpan = card.querySelector('.comment-count');

            if (!newsId || !likeButton || !likeCountSpan || !commentCountSpan) return;

            // Atualiza Likes
            const likesSet = newsLikes.get(newsId) || new Set();
            const likeCount = likesSet.size;
            const userLiked = currentProfile && likesSet.has(currentProfile.id);

            likeCountSpan.textContent = likeCount;
            likeButton.innerHTML = userLiked ? ICONS.heartFilled : ICONS.heartOutline;
            likeButton.classList.toggle('text-red-500', userLiked); // Pinta de vermelho se curtiu
            likeButton.classList.toggle('text-slate-400', !userLiked); // Cinza se não curtiu

            // Atualiza Comentários
            const commentsList = newsComments.get(newsId) || [];
            const commentCount = commentsList.length; // Contagem simples por enquanto
            commentCountSpan.textContent = commentCount;
        });
    }


    function renderNewsView() {
        const container = document.getElementById('news-items-container');
        if (!container) return;

        if (newsItems.length === 0) {
            container.innerHTML = '<p class="text-slate-400 text-center py-10">Nenhuma novidade publicada ainda.</p>';
            return;
        }

        container.innerHTML = newsItems.map(item => createNewsItemCard(item)).join('');
        lucide.createIcons(); // Recria ícones para os cards
        initializeGlassEffects(); // Aplica efeitos, se houver botões futuros
        updateNewsItemsUI(); // Aplica estado inicial de likes/comentários

        // Adiciona listeners para os novos elementos da news view
        addNewsViewListeners();
    }

    function createNewsItemCard(item) {
        const date = item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric'}) : 'Data indisponível';
        let contentHTML = '';
        let typeClass = '';

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
                const isYoutube = item.content.includes('youtube.com/embed');
                const aspectClass = isYoutube ? 'aspect-video' : '';
                // Adicionado sandbox para segurança e controle
                contentHTML = `<div class="${aspectClass} mt-3"><iframe src="${item.content}" frameborder="0" sandbox="allow-scripts allow-same-origin allow-presentation" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen class="w-full h-full rounded-lg shadow-lg ${isYoutube ? '' : 'min-h-[300px]'}"></iframe></div>`;
                typeClass = 'news-item-video';
                break;
            case 'video_direct': // Para URLs de vídeo diretas
                contentHTML = `
                    <div class="relative mt-3 rounded-lg overflow-hidden cursor-pointer news-video-thumbnail" data-video-url="${item.content}" data-video-title="${item.title || 'Vídeo'}">
                        <img src="${item.thumbnail || 'https://placehold.co/600x338/1f2937/a3a3a3?text=Video'}" alt="Thumbnail do vídeo" class="w-full h-auto aspect-video object-cover">
                        <div class="absolute inset-0 bg-black/40 flex items-center justify-center group-hover:bg-black/60 transition-colors">
                            <i data-lucide="play-circle" class="w-16 h-16 text-white opacity-80 group-hover:opacity-100 transition-opacity"></i>
                        </div>
                    </div>`;
                typeClass = 'news-item-video-direct';
                break;
            // Adicionar cases para 'upcoming' e 'poll' depois
            default: // Mantém o default anterior
                contentHTML = `<p class="text-slate-500 mt-2">[Tipo ${item.type}] ${item.content || ''}</p>`;
        }

        // Recupera likes e comentários (contagem inicial)
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
            </div>
        `;
    }

    // Adiciona listeners para botões de like, comment e play de vídeo na view de novidades
    function addNewsViewListeners() {
        const container = document.getElementById('news-items-container');
        if (!container) return;

        container.querySelectorAll('.like-button').forEach(button => {
            // Remove listener antigo para evitar duplicação
            button.replaceWith(button.cloneNode(true));
        });
        container.querySelectorAll('.comment-button').forEach(button => {
            button.replaceWith(button.cloneNode(true));
        });
         container.querySelectorAll('.news-video-thumbnail').forEach(thumb => {
            thumb.replaceWith(thumb.cloneNode(true));
        });


        // Novos Listeners
        container.addEventListener('click', (e) => {
            const likeButton = e.target.closest('.like-button');
            const commentButton = e.target.closest('.comment-button');
            const videoThumbnail = e.target.closest('.news-video-thumbnail');

            if (likeButton) {
                const card = likeButton.closest('.news-item-card');
                const newsId = card?.dataset.newsId;
                if (newsId) {
                    handleNewsLike(newsId);
                }
            } else if (commentButton) {
                const card = commentButton.closest('.news-item-card');
                const newsId = card?.dataset.newsId;
                if (newsId) {
                    openCommentsModal(newsId);
                }
            } else if (videoThumbnail) {
                const url = videoThumbnail.dataset.videoUrl;
                const title = videoThumbnail.dataset.videoTitle;
                if (url) {
                    showNewsPlayer(url, title);
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
                const likedBy = data.likedBy || []; // Array de profile IDs que curtiram
                const userIndex = likedBy.indexOf(profileId);

                if (userIndex > -1) {
                    // Usuário já curtiu -> Descurtir
                    likedBy.splice(userIndex, 1); // Remove do array
                    transaction.update(newsDocRef, { likedBy: likedBy });
                } else {
                    // Usuário não curtiu -> Curtir
                    likedBy.push(profileId); // Adiciona ao array
                    transaction.update(newsDocRef, { likedBy: likedBy });
                }
            });
            // A UI será atualizada automaticamente pelo listener onSnapshot
        } catch (error) {
            console.error("Erro ao curtir/descurtir:", error);
            showToast("Erro ao processar o like.", true);
        }
    }
    // --- Fim da Lógica de Novidades ---


    // --- Lógica de Pedidos ---
    function listenToRequests() {
        const q = query(collection(db, "pedidos"), where("status", "==", "pending"));
        onSnapshot(q, (snapshot) => {
            pendingRequests = [];
            snapshot.forEach((doc) => {
                pendingRequests.push({ id: doc.id, ...doc.data() });
            });
             // Ordena no cliente por contagem de votos (desc) e depois por data (asc)
             pendingRequests.sort((a, b) => {
                 const votesA = (a.requesters || []).length;
                 const votesB = (b.requesters || []).length;
                 if (votesB !== votesA) {
                     return votesB - votesA; // Mais votados primeiro
                 }
                 return (a.createdAt?.toMillis() || 0) - (b.createdAt?.toMillis() || 0); // Mais antigos primeiro (desempate)
             });
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

        // **NOVO:** Salva o ID do perfil selecionado no localStorage
        localStorage.setItem(`starlight-lastProfile-${userId}`, profile.id);

        // Atualiza o botão de perfil no header com o avatar
        const avatarImg = new Image();
        avatarImg.src = currentProfile.avatar;
        avatarImg.className = 'w-full h-full object-cover rounded-full';
        headerProfileBtn.innerHTML = ''; // Limpa conteúdo anterior
        headerProfileBtn.appendChild(avatarImg);

        // Navega para a home view (o roteador cuidará de mostrar/esconder)
        if (window.location.hash !== '#home-view') {
            window.location.hash = '#home-view';
        } else {
            // Se já estiver na home, força a execução do roteador para garantir a renderização
            handleNavigation();
        }

        // Inicia o carregamento do conteúdo do Firestore (necessário após selecionar perfil)
        listenToFirestoreContent();
        listenToRequests(); // Escuta pedidos após selecionar perfil
        listenForNewsItems(); // Escuta novidades após selecionar perfil
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
            if(currentAvatar) currentAvatar.classList.add('!border-purple-500', 'scale-110');
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
        if(e.target.tagName === 'IMG') { // Se clicou em uma imagem de avatar
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
        stopNewsViewMedia(); // Garante que mídia de novidades pare
        hideNewsPlayer(); // Garante que o player de novidades feche
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
        stopNewsViewMedia(); // Garante que mídia de novidades pare
        hideNewsPlayer(); // Garante que o player de novidades feche
    }

    // Listener principal de mudança de estado de autenticação
    onAuthStateChanged(auth, async (user) => {
        document.body.classList.remove('auth-loading'); // Torna o body visível
        if (user) { // Se o usuário está logado
            userId = user.uid; // Define o userId global
            // Inicia listeners do Firestore que dependem do usuário
            listenForNotifications();
            listenForNewsItems(); // NOVO

            initializeUI(); // Inicializa UI do player (pode ser feito aqui)

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
            currentProfile = null;
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

    // --- NOVO: Funções e Listeners de Comentários ---

    function openCommentsModal(newsId) {
        if (!newsId) return;
        const newsItem = newsItems.find(item => item.id === newsId);
        currentNewsCommentsModalId = newsId;

        commentsModalTitle.textContent = `Comentários em: ${newsItem?.title || 'Post'}`;
        renderComments(newsId); // Renderiza os comentários existentes
        commentsModal.classList.remove('hidden');
        document.body.style.overflow = 'hidden'; // Impede scroll do fundo
        commentInput.focus();
        cancelReply(); // Garante que não está respondendo a ninguém ao abrir
    }

    function closeCommentsModal() {
        commentsModal.classList.add('hidden');
        currentNewsCommentsModalId = null;
        // Só restaura o scroll se nenhum player estiver ativo
        if (playerView.classList.contains('hidden') && newsPlayerView.classList.contains('hidden')) {
            document.body.style.overflow = 'auto';
        }
        cancelReply(); // Limpa estado de resposta ao fechar
    }

    async function handleCommentSubmit(event) {
        event.preventDefault();
        if (!userId || !currentProfile || !currentNewsCommentsModalId) return;

        const commentText = commentInput.value.trim();
        if (!commentText) return; // Não envia comentário vazio

        const commentData = {
            profileId: currentProfile.id,
            profileName: currentProfile.name,
            profileAvatar: currentProfile.avatar,
            text: commentText,
            createdAt: serverTimestamp(),
            replyTo: replyToCommentId || null // Adiciona ID do comentário pai se for uma resposta
        };

        try {
            const commentsColRef = collection(db, "news", currentNewsCommentsModalId, "comments");
            await addDoc(commentsColRef, commentData);
            commentInput.value = ''; // Limpa o input
            cancelReply(); // Limpa o estado de resposta
            // O listener onSnapshot atualizará a lista
        } catch (error) {
            console.error("Erro ao adicionar comentário:", error);
            showToast("Erro ao enviar comentário.", true);
        }
    }

    function renderComments(newsId) {
        const comments = newsComments.get(newsId) || [];
        commentsModalList.innerHTML = ''; // Limpa lista

        if (comments.length === 0) {
            commentsModalList.innerHTML = '<p class="text-slate-400 text-center py-4">Nenhum comentário ainda.</p>';
            return;
        }

        // Agrupa respostas sob comentários pais
        const commentTree = {};
        const topLevelComments = [];

        comments.forEach(comment => {
            if (comment.replyTo) {
                if (!commentTree[comment.replyTo]) {
                    commentTree[comment.replyTo] = [];
                }
                commentTree[comment.replyTo].push(comment);
            } else {
                topLevelComments.push(comment);
            }
        });

        // Função recursiva para renderizar comentários e suas respostas
        const renderCommentNode = (comment, level = 0) => {
            const commentDate = comment.createdAt?.toDate ? comment.createdAt.toDate().toLocaleString('pt-BR') : '';
            const replies = commentTree[comment.id] || [];
            const isReplyingToThis = replyToCommentId === comment.id;

            let replyHTML = '';
            if (replies.length > 0) {
                replyHTML = `<div class="ml-8 mt-2 space-y-2 border-l-2 border-slate-700 pl-4">
                                ${replies.map(reply => renderCommentNode(reply, level + 1)).join('')}
                             </div>`;
            }

            return `
                <div class="comment-item py-3 ${level > 0 ? '' : 'border-b border-slate-700/50'}">
                    <div class="flex items-start gap-3">
                        <img src="${comment.profileAvatar || AVATARS[0]}" alt="${comment.profileName}" class="w-8 h-8 rounded-full flex-shrink-0">
                        <div class="flex-1">
                            <p class="font-semibold text-sm text-white">${comment.profileName}
                                <span class="text-xs text-slate-400 font-normal ml-2">${commentDate}</span>
                            </p>
                            <p class="text-slate-300 text-sm mt-1 whitespace-pre-wrap">${comment.text}</p>
                            <button class="reply-button text-xs text-blue-400 hover:underline mt-1" data-comment-id="${comment.id}" data-author-name="${comment.profileName}">Responder</button>
                             ${isReplyingToThis ? '<span class="text-xs text-blue-400 ml-2">(Respondendo...)</span>' : ''}
                        </div>
                    </div>
                    ${replyHTML}
                </div>
            `;
        };

        commentsModalList.innerHTML = topLevelComments.map(comment => renderCommentNode(comment)).join('');
    }


    // Listener para o form de comentário
    commentForm.addEventListener('submit', handleCommentSubmit);
    commentsModalCloseBtn.addEventListener('click', closeCommentsModal);

    // Listener para botões de responder dentro do modal
    commentsModalList.addEventListener('click', (e) => {
        const replyButton = e.target.closest('.reply-button');
        if (replyButton) {
            const commentId = replyButton.dataset.commentId;
            const authorName = replyButton.dataset.authorName;
            startReply(commentId, authorName);
        }
    });

    // Inicia o modo de resposta
    function startReply(commentId, authorName) {
        replyToCommentId = commentId;
        replyToCommentAuthor = authorName;
        replyIndicator.textContent = `Respondendo a ${authorName}`;
        replyIndicator.classList.remove('hidden');
        cancelReplyBtn.classList.remove('hidden');
        commentInput.focus();
        // Re-renderiza para mostrar "(Respondendo...)"
        if(currentNewsCommentsModalId) renderComments(currentNewsCommentsModalId);
    }

    // Cancela o modo de resposta
    function cancelReply() {
        replyToCommentId = null;
        replyToCommentAuthor = null;
        replyIndicator.classList.add('hidden');
        cancelReplyBtn.classList.add('hidden');
        replyIndicator.textContent = '';
         // Re-renderiza para remover "(Respondendo...)"
        if(currentNewsCommentsModalId && !commentsModal.classList.contains('hidden')) {
             renderComments(currentNewsCommentsModalId);
        }
    }

    // Listener para o botão de cancelar resposta
    cancelReplyBtn.addEventListener('click', cancelReply);

    // --- FIM: Funções e Listeners de Comentários ---

    // NOVO: Função para parar iframes e player de novidades
    function stopNewsViewMedia() {
        // Para player de novidades
        hideNewsPlayer();

        // Para iframes na tela de novidades
        const newsIframes = document.querySelectorAll('#news-items-container iframe');
        newsIframes.forEach(iframe => {
            const src = iframe.src;
            iframe.src = ''; // Remove src para parar
            iframe.src = src; // Readiciona src (opcional, pode deixar vazio se preferir)
        });
    }

});
