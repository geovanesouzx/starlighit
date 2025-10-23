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
    limit,
    startAfter,
    onSnapshot,
    serverTimestamp,
    arrayUnion,
    arrayRemove,
    increment,
    writeBatch // Import writeBatch for atomic operations if needed
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', function() {
    lucide.createIcons();

    // Define um hash padrão se nenhum existir e não for #player
    if (!window.location.hash || window.location.hash === '#player') {
        history.replaceState(null, '', window.location.pathname + window.location.search); // Limpa #player
        window.location.hash = '#home-view'; // Define um padrão inicial
    }

    // --- Configuração do Firebase ---
    // **IMPORTANTE:** Substitua pelas suas credenciais reais do Firebase
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
    let unsubscribeNewsListener = null; // Para parar de ouvir novidades ao deslogar
    let commentListeners = {}; // Armazena listeners de comentários ativos

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
    const aspectRatioBtn = document.getElementById('player-aspect-ratio-btn');
    let currentAspectRatio = 'contain';

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

    /**
     * Busca a lista de itens salvos ("Minha Lista") do perfil atual no Firestore.
     * @returns {Promise<Array>} - Uma promessa que resolve com a lista de itens.
     */
    async function getMyList() {
        if (!userId || !currentProfile?.id) return [];
        const myListCol = collection(db, 'users', userId, 'profiles', currentProfile.id, 'my-list');
        const snapshot = await getDocs(myListCol);
        return snapshot.docs.map(doc => doc.data());
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
        return docSnap.exists();
    }

    /**
     * Adiciona ou remove um item da "Minha Lista" e atualiza os botões correspondentes.
     * @param {object} item - O objeto do item (filme ou série).
     */
    async function handleListAction(item) {
        if (!item || !userId || !currentProfile?.id) return;
        const itemId = String(item.docId || item.id);
        const docRef = doc(db, 'users', userId, 'profiles', currentProfile.id, 'my-list', itemId);
        const isInList = await checkIfInList(itemId);

        try {
            if (isInList) {
                await deleteDoc(docRef);
                showToast(`${item.title || item.name} removido da sua lista.`);
            } else {
                const itemToAdd = { ...item, media_type: item.media_type || (item.title ? 'movie' : 'tv')};
                // Remove propriedades que não devem ser salvas (como funções ou listeners)
                delete itemToAdd.clickHandler;
                delete itemToAdd.hasGlassListener;
                await setDoc(docRef, itemToAdd);
                showToast(`${item.title || item.name} adicionado à sua lista.`);
            }
            updateListButtons(item);
            if (window.location.hash === '#mylist-view') {
                populateMyList();
            }
        } catch (error) {
            console.error("Erro ao atualizar 'Minha Lista':", error);
            showToast("Ocorreu um erro ao atualizar sua lista.", true);
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
        if (currentHeroItem?.docId === item.docId) {
             updateListButton(document.getElementById('hero-add-to-list'), currentHeroItem);
        }
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
            progressData[doc.id] = doc.data();
        });
        return progressData;
    }

    /**
     * Salva o progresso atual do vídeo no Firestore.
     * Executada periodicamente durante a reprodução.
     */
    async function savePlayerProgress() {
        if (!videoPlayer.duration || !currentPlayerContext.key || !userId || !currentProfile?.id) return;

        // Limpa dados do item antes de salvar para evitar excesso de dados
        const cleanItemData = {
            docId: currentPlayerContext.itemData.docId,
            title: currentPlayerContext.itemData.title || currentPlayerContext.itemData.name,
            poster: currentPlayerContext.itemData.poster,
            type: currentPlayerContext.itemData.type,
        };

        const progressData = {
            currentTime: videoPlayer.currentTime,
            duration: videoPlayer.duration,
            lastWatched: serverTimestamp(), // Usa serverTimestamp
            item: cleanItemData,
            episode: currentPlayerContext.episodes ? currentPlayerContext.episodes[currentPlayerContext.currentIndex] : null,
        };

        const docRef = doc(db, 'users', userId, 'profiles', currentProfile.id, 'watch-progress', currentPlayerContext.key);
        try {
            await setDoc(docRef, progressData, { merge: true });
        } catch (error) {
            console.error("Erro ao salvar progresso:", error);
            // Não mostrar toast para erros de salvamento de progresso para não incomodar o usuário
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
            return (await response.json());
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

    /**
     * Cria o HTML para um card de conteúdo (usado em carrosséis).
     * @param {object} item - O objeto do item (filme/série).
     * @returns {string} - O HTML do card.
     */
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

    /**
     * Cria o HTML para um card de conteúdo em grid (usado em Séries, Filmes, Minha Lista).
     * @param {object} item - O objeto do item.
     * @returns {string} - O HTML do card.
     */
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

    /**
     * Exibe a classificação indicativa do conteúdo.
     * @param {object} item - O objeto do item.
     * @param {HTMLElement} container - O elemento onde a classificação será adicionada.
     */
    async function displayContentRating(item, container) {
        if (!item || !container || !item.rating) return;
        const certification = item.rating;

        const ratingClassMap = {
            'Livre': 'rating-L', '10': 'rating-10', '12': 'rating-12',
            '14': 'rating-14', '16': 'rating-16', '18': 'rating-18',
        };

        const ratingClass = ratingClassMap[certification] || '';
        if (!ratingClass) return;

        const ratingElement = document.createElement('div');
        ratingElement.className = 'glass-container rating-box ' + ratingClass;
        ratingElement.innerHTML = `
            <div class="glass-filter"></div>
            <div class="glass-overlay"></div>
            <div class="glass-specular"></div>
            <div class="glass-content">${certification === 'Livre' ? 'L' : certification}</div>
        `;
        container.prepend(ratingElement);
    }

    /**
     * Inicia a rotação automática do conteúdo em destaque na tela inicial.
     */
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

    /**
     * Atualiza a seção "hero" (destaque principal) com os dados de um item.
     * @param {object} item - O item a ser exibido.
     */
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
            document.getElementById('hero-overview').textContent = item.synopsis.length > 200 ? item.synopsis.substring(0, 200) + '...' : item.synopsis;
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

    /**
     * Atualiza a aparência (ícone e texto) de um botão "Minha Lista".
     * @param {HTMLElement} button - O elemento do botão.
     * @param {object} item - O item associado ao botão.
     */
    async function updateListButton(button, item) {
        if (!button || !item) return;
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

    /**
     * Popula a seção "Minha Lista" com os itens salvos do usuário.
     */
    async function populateMyList() {
        const list = await getMyList();
        const container = document.getElementById('my-list-grid');
        if (!container) return;
        container.innerHTML = list.length === 0
            ? '<p class="col-span-full text-center text-gray-400">Sua lista está vazia.</p>'
            : list.map(item => createGridCard(item)).join('');
        attachGlassButtonListeners();
    }

    /**
     * Escuta por atualizações na coleção 'content' do Firestore e atualiza a UI.
     */
    async function listenToFirestoreContent() {
        onSnapshot(collection(db, 'content'), (snapshot) => {
            firestoreContent = [];
            snapshot.forEach(doc => {
                firestoreContent.push({ docId: doc.id, ...doc.data() });
            });

            onSnapshot(doc(db, 'config', 'featured'), (docSnap) => {
                featuredItemIds = docSnap.exists() ? (docSnap.data().items || []) : [];
                handleNavigation();
            });
        });
    }

    /**
     * Popula a tela inicial com carrosséis (adicionados recentemente, por gênero).
     */
    async function populateAllViews() {
        const carouselsContainer = document.getElementById('home-carousels-container');
        if (!carouselsContainer) return;
        carouselsContainer.innerHTML = '';

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
            }
        });
    });

    /**
     * Renderiza o conteúdo específico de uma tela principal (Home, Séries, Filmes, etc.).
     * @param {string} screenId - O ID da tela a ser renderizada.
     */
    function renderScreenContent(screenId) {
        const screenElement = document.getElementById(screenId);
        if (!screenElement ) return;

        if (screenId === 'home-view') {
            const featuredItems = featuredItemIds.map(id => firestoreContent.find(item => item.docId === id)).filter(Boolean);
            if(featuredItems.length > 0) {
                updateHero(featuredItems[0]);
                startHeroRotation();
            }
            populateAllViews();
        } else if (screenId === 'series-view') {
            const grid = document.getElementById('series-grid');
            const series = firestoreContent.filter(item => item.type === 'tv');
            grid.innerHTML = series.map(createGridCard).join('');
        } else if (screenId === 'movies-view') {
            const grid = document.getElementById('movies-grid');
            const movies = firestoreContent.filter(item => item.type === 'movie');
            grid.innerHTML = movies.map(createGridCard).join('');
        } else if (screenId === 'mylist-view') {
            populateMyList();
        } else if (screenId === 'requests-view') {
            renderPendingRequests();
        } else if (screenId === 'news-view') {
            renderNewsFeed();
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

    /**
     * Renderiza a tela de detalhes para um item específico.
     * @param {object} item - Objeto contendo o docId do item.
     */
    async function showDetailsView(item) {
        document.querySelector('header').classList.add('hidden');
        document.querySelector('footer').classList.add('hidden');
        detailsView.classList.remove('hidden');
        detailsView.innerHTML = '<div class="spinner mx-auto mt-20"></div>';
        window.scrollTo(0, 0);

        const data = firestoreContent.find(i => i.docId === item.docId);
        if (!data) {
            detailsView.innerHTML = '<p class="text-center text-red-400">Conteúdo não encontrado.</p>';
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
                const firstSeasonKey = Object.keys(data.seasons).sort((a,b) => parseInt(a) - parseInt(b))[0];
                const firstEpisode = data.seasons[firstSeasonKey]?.episodes?.[0];

                if (firstEpisode) {
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
                    showToast("Nenhum episódio encontrado.", true);
                }
            }
        });
        await updateListButton(document.getElementById('details-add-to-list'), data);

        if (data.type === 'tv' && data.seasons) {
            renderTvDetails(data);
        }
        attachGlassButtonListeners();
    }

    /**
     * Renderiza a seção de temporadas e episódios para uma série na tela de detalhes.
     * @param {object} data - Os dados da série.
     */
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
                                    <i data-lucide="play-circle" class="w-8 h-8 text-white"></i>
                                </div>
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
            if(episodeItem){
                const seasonKey = episodeItem.dataset.season;
                const episodeIndex = parseInt(episodeItem.dataset.index, 10);
                const allEpisodesOfSeason = data.seasons[seasonKey].episodes;
                const episode = allEpisodesOfSeason[episodeIndex];

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

    /** Efeito visual: Atualiza gradiente especular ao mover o mouse sobre elementos 'glass' */
    function handleMouseMove(e) { const rect = this.getBoundingClientRect(); const x = e.clientX - rect.left; const y = e.clientY - rect.top; const specular = this.querySelector('.glass-specular'); if (specular) specular.style.background = `radial-gradient(circle at ${x}px ${y}px, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.05) 30%, rgba(255,255,255,0) 60%)`; }
    /** Efeito visual: Remove gradiente especular ao tirar o mouse */
    function handleMouseLeave() { const specular = this.querySelector('.glass-specular'); if (specular) specular.style.background = 'none'; }
    /** Adiciona listeners para os efeitos visuais 'glass' a todos os elementos relevantes */
    function attachGlassButtonListeners() { document.querySelectorAll('.glass-button, .liquid-glass-card, .player-control-btn, .glass-container[style*="--bg-color"], .glass-form, .news-card, .comment-card, .reply-card').forEach(element => { if (!element.hasGlassListener) { element.addEventListener('mousemove', handleMouseMove); element.addEventListener('mouseleave', handleMouseLeave); element.hasGlassListener = true; }}); }
    /** Atualiza a posição e tamanho do indicador da navegação mobile */
    function updateMobileNavIndicator() { const indicator = document.getElementById('mobile-nav-indicator'); const activeItem = document.querySelector('#mobile-nav .mobile-nav-item.active'); if (indicator && activeItem) { const left = activeItem.offsetLeft; const width = activeItem.offsetWidth; indicator.style.width = `${width}px`; indicator.style.transform = `translateX(${left}px)`; }}
    /** Mostra ou esconde o overlay de busca */
    function toggleSearchOverlay(show) { if (show) { searchOverlay.classList.remove('hidden'); searchInput.focus(); document.body.style.overflow = 'hidden'; } else { searchOverlay.classList.add('hidden'); searchInput.value = ''; searchResultsContainer.innerHTML = ''; document.body.style.overflow = 'auto'; }}

    /**
     * Realiza a busca no CATÁLOGO LOCAL (firestoreContent) e exibe os resultados.
     */
    function performSearch(query) {
        if (query.length < 2) {
            searchResultsContainer.innerHTML = `<p class="col-span-full text-center text-gray-400">Digite pelo menos 2 caracteres.</p>`;
            return;
        }
        if (!firestoreContent || firestoreContent.length === 0) {
             searchResultsContainer.innerHTML = `<p class="col-span-full text-center text-gray-400">O catálogo está carregando. Tente novamente em alguns segundos.</p>`;
             return;
        }
        const lowerCaseQuery = query.toLowerCase();
        const results = firestoreContent.filter(item => {
            const title = (item.title || item.name || '').toLowerCase();
            return title.includes(lowerCaseQuery);
        });
        if (results.length > 0) {
            searchResultsContainer.innerHTML = results.map(item => createGridCard(item)).join('');
        } else {
            searchResultsContainer.innerHTML = `<p class="col-span-full text-center text-gray-400">Nenhum resultado para "${query}" em nosso catálogo.</p>`;
        }
        attachGlassButtonListeners();
    }


    // --- Funções do Player --- (Sem alterações significativas aqui, apenas a inicialização dos listeners)

    /**
     * Mostra e configura o player de vídeo.
     * @param {object} context - Informações sobre o vídeo a ser reproduzido.
     */
    async function showPlayer(context) {
        hidePlayer(false, true); // Limpa estado anterior, marca como 'isChangingEpisode'
        await new Promise(resolve => setTimeout(resolve, 50)); // Pequeno delay

        let key;
        let itemData = context.itemData;
        if (!itemData) {
            console.error("showPlayer called without itemData in context.");
            return;
        }

        if (context.episodes) {
            const episode = context.episodes[context.currentIndex];
            key = `tv-${itemData.docId}-s${episode.season_number}-e${episode.episode_number}`;
        } else {
            key = `movie-${itemData.docId}`;
        }

        currentPlayerContext = { ...context, key, id: itemData.docId, itemData };

        if (window.location.hash !== '#player') {
            history.pushState({view: 'player'}, '', '#player');
        }

        playerView.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        playerTitle.textContent = context.title;

        let urlToLoad = context.videoUrl;
         try {
             const urlObject = new URL(urlToLoad);
             if (urlObject.hostname.includes('api.anivideo.net') && urlObject.pathname.includes('videohls.php')) {
                 const videoSrc = urlObject.searchParams.get('d');
                 if (videoSrc) {
                     urlToLoad = videoSrc;
                 }
             }
         } catch (e) { /* URL inválida, usa a original */ }

        if (Hls.isSupported() && urlToLoad.includes('.m3u8')) {
            hls = new Hls({ maxBufferLength: 30, maxBufferSize: 60 * 1000 * 1000, startLevel: -1 });
            hls.loadSource(urlToLoad);
            hls.attachMedia(videoPlayer);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                if (context.startTime && context.startTime > 5) {
                    videoPlayer.currentTime = context.startTime;
                }
               videoPlayer.play().catch(e => console.error("Erro ao tentar reproduzir o vídeo HLS:", e));
            });
        } else {
            videoPlayer.src = urlToLoad;
            videoPlayer.addEventListener('loadedmetadata', () => {
                if (context.startTime && context.startTime > 5) {
                    videoPlayer.currentTime = context.startTime;
                }
               videoPlayer.play().catch(e => console.error("Erro ao tentar reproduzir o vídeo:", e));
            }, { once: true });
        }

        if (window.innerWidth < 768) {
           if (!document.fullscreenElement) {
               try { await playerView.requestFullscreen(); } catch (err) { console.error("Não foi possível ativar tela cheia:", err); }
           }
           try { if (screen.orientation && typeof screen.orientation.lock === 'function') { await screen.orientation.lock('landscape'); } } catch (err) { console.error("Não foi possível bloquear orientação:", err); }
        }

        if(context.episodes && context.episodes.length > 1) {
            nextEpisodeBtn.classList.remove('hidden');
            prevEpisodeBtn.classList.remove('hidden');
        } else {
            nextEpisodeBtn.classList.add('hidden');
            prevEpisodeBtn.classList.add('hidden');
        }

        attachGlassButtonListeners();
    }

    /**
     * Esconde o player de vídeo e limpa seu estado.
     * @param {boolean} [updateHistory=true] - Se true, salva o progresso e volta no histórico.
     * @param {boolean} [isChangingEpisode=false] - Se true, não desbloqueia a orientação (mobile).
     */
    async function hidePlayer(updateHistory = true, isChangingEpisode = false) {
        if(updateHistory && currentPlayerContext.key){
            await savePlayerProgress();
        }
        videoPlayer.pause();
        if (hls) { hls.destroy(); hls = null; }
        videoPlayer.removeAttribute('src');
        videoPlayer.load();
        playerView.classList.add('hidden');
        document.body.style.overflow = 'auto';
        currentPlayerContext = {};

        if (!isChangingEpisode) {
            if (document.fullscreenElement) { document.exitFullscreen().catch(err => console.error("Erro ao sair da tela cheia:", err)); }
            if (screen.orientation && typeof screen.orientation.unlock === 'function') { screen.orientation.unlock(); }
        }

        videoPlayer.style.objectFit = 'contain';
        currentAspectRatio = 'contain';
        if(aspectRatioBtn) aspectRatioBtn.querySelector('.glass-content').innerHTML = ICONS.aspectContain;
    }

    /**
     * Formata segundos para o formato HH:MM:SS ou MM:SS.
     * @param {number} timeInSeconds - Tempo em segundos.
     * @returns {string} - Tempo formatado.
     */
    function formatTime(timeInSeconds) {
        if (isNaN(timeInSeconds) || timeInSeconds < 0) { return "00:00"; }
        const hours = Math.floor(timeInSeconds / 3600);
        const minutes = Math.floor((timeInSeconds % 3600) / 60);
        const seconds = Math.floor(timeInSeconds % 60);
        const formattedMinutes = String(minutes).padStart(2, '0');
        const formattedSeconds = String(seconds).padStart(2, '0');
        return hours > 0 ? `${hours}:${formattedMinutes}:${formattedSeconds}` : `${formattedMinutes}:${formattedSeconds}`;
    }

    /** Alterna entre play e pause no vídeo */
    function togglePlay() {
        if (videoPlayer.paused) {
            videoPlayer.play().catch(error => { if (error.name !== 'AbortError') { console.error("Video play error:", error); } });
        } else {
            videoPlayer.pause();
        }
    }

    /** Manipula cliques na área do vídeo em dispositivos móveis */
    function handleMobilePlayerClick() {
        clearTimeout(controlsTimeout);
        if (!playerView.classList.contains('controls-active')) {
            playerView.classList.add('controls-active');
            if (!videoPlayer.paused) {
                controlsTimeout = setTimeout(() => { playerView.classList.remove('controls-active'); }, 3000);
            }
        } else {
            togglePlay();
        }
    }

    /** Manipula cliques na área do vídeo em desktop */
    function handlePlayerClick() {
        clearTimeout(controlsTimeout);
        if (!playerView.classList.contains('controls-active')) {
             playerView.classList.add('controls-active');
        } else {
            togglePlay();
        }
        if (!videoPlayer.paused) {
            controlsTimeout = setTimeout(() => { playerView.classList.remove('controls-active'); }, 3000);
        }
    }

    /** Adiciona listeners de evento ao elemento <video> */
    function addPlayerEventListeners() {
        // Remove listeners antigos
        videoPlayer.removeEventListener('click', handlePlayerClick);
        videoPlayer.removeEventListener('click', handleMobilePlayerClick);
        videoPlayer.removeEventListener('play', handlePlayEvent);
        videoPlayer.removeEventListener('pause', handlePauseEvent);
        videoPlayer.removeEventListener('ended', handleEndedEvent);
        videoPlayer.removeEventListener('timeupdate', handleTimeUpdateEvent);
        videoPlayer.removeEventListener('loadedmetadata', handleLoadedMetadataEvent);
        videoPlayer.removeEventListener('volumechange', handleVolumeChangeEvent);

        // Adiciona listeners corretos
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

    // Separação dos handlers de evento para clareza e remoção correta
    function handlePlayEvent() {
        playPauseBtn.querySelector('.glass-content').innerHTML = ICONS.pause;
        clearTimeout(controlsTimeout);
        if (playerView.classList.contains('controls-active')) {
            controlsTimeout = setTimeout(() => { playerView.classList.remove('controls-active'); }, 3000);
        }
    }
    function handlePauseEvent() {
        playPauseBtn.querySelector('.glass-content').innerHTML = ICONS.play;
        clearTimeout(controlsTimeout);
        if (!videoPlayer.ended) { playerView.classList.add('controls-active'); }
    }
    function handleEndedEvent() {
        if (currentPlayerContext.episodes && currentPlayerContext.currentIndex < currentPlayerContext.episodes.length - 1) {
            changeEpisode(1);
        } else {
            playPauseBtn.querySelector('.glass-content').innerHTML = ICONS.play;
            playerView.classList.add('controls-active');
            clearTimeout(controlsTimeout);
        }
    }
    function handleTimeUpdateEvent() {
        if(isNaN(videoPlayer.currentTime)) return;
        seekBar.value = videoPlayer.currentTime;
        if (videoPlayer.duration) {
            const progressPercent = (videoPlayer.currentTime / videoPlayer.duration) * 100;
            seekProgressBar.style.width = `${progressPercent}%`;
        }
        currentTimeEl.textContent = formatTime(videoPlayer.currentTime);

        const now = Date.now();
        if (now - lastProgressSaveTime > 5000) {
            savePlayerProgress();
            lastProgressSaveTime = now;
        }
    }
    function handleLoadedMetadataEvent() {
        if(isNaN(videoPlayer.duration)) return;
        seekBar.max = videoPlayer.duration;
        durationEl.textContent = formatTime(videoPlayer.duration);
    }
    function handleVolumeChangeEvent() {
        volumeSlider.value = videoPlayer.volume;
        volumeBtn.querySelector('.glass-content').innerHTML = (videoPlayer.muted || videoPlayer.volume === 0) ? ICONS.volumeMute : ICONS.volumeHigh;
    }

    // --- Listeners dos Controles do Player ---
    seekBar.addEventListener('input', () => { if(!isNaN(seekBar.value)) videoPlayer.currentTime = parseFloat(seekBar.value); });
    volumeSlider.addEventListener('input', (e) => { videoPlayer.volume = parseFloat(e.target.value); videoPlayer.muted = parseFloat(e.target.value) === 0; });
    volumeBtn.addEventListener('click', () => { videoPlayer.muted = !videoPlayer.muted; });
    rewindBtn.addEventListener('click', () => { videoPlayer.currentTime = Math.max(0, videoPlayer.currentTime - 10); });
    forwardBtn.addEventListener('click', () => { videoPlayer.currentTime = Math.min(videoPlayer.duration || Infinity, videoPlayer.currentTime + 10); });

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
        if (!currentPlayerContext.episodes) return;
        const newIndex = currentPlayerContext.currentIndex + direction;
        if (newIndex >= 0 && newIndex < currentPlayerContext.episodes.length) {
            const episode = currentPlayerContext.episodes[newIndex];
            const seasonNumber = episode.season_number || currentPlayerContext.itemData.seasons?.[Object.keys(currentPlayerContext.itemData.seasons).find(k => currentPlayerContext.itemData.seasons[k].episodes.includes(episode))] || '?'; // Fallback for season number if needed
            const newContext = {
                 ...currentPlayerContext,
                 currentIndex: newIndex,
                 title: `${currentPlayerContext.itemData.name} - T${seasonNumber} E${episode.episode_number}`,
                 videoUrl: episode.url,
                 startTime: 0 // Reset startTime when changing episodes
             };
            showPlayer(newContext);
        }
    }

    nextEpisodeBtn.addEventListener('click', () => changeEpisode(1));
    prevEpisodeBtn.addEventListener('click', () => changeEpisode(-1));

    fullscreenBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
            playerView.requestFullscreen().catch(err => console.error(`Erro ao entrar em tela cheia: ${err.message}`));
        } else {
            document.exitFullscreen();
        }
    });

    document.addEventListener('fullscreenchange', () => {
        const isFullscreen = !!document.fullscreenElement;
        fullscreenBtn.querySelector('.glass-content').innerHTML = isFullscreen ? ICONS.exitFullscreen : ICONS.fullscreen;
        if (!isFullscreen && !playerView.classList.contains('hidden')) {
             history.back(); // Volta se sair do fullscreen e o player deveria estar ativo
        }
    });

    playPauseBtn.addEventListener('click', togglePlay);
    playerBackBtn.addEventListener('click', () => history.back());

    playerView.addEventListener('mousemove', () => {
        if (window.innerWidth >= 768) { // Only on desktop
            playerView.classList.add('controls-active');
            clearTimeout(controlsTimeout);
            if (!videoPlayer.paused) {
                controlsTimeout = setTimeout(() => { playerView.classList.remove('controls-active'); }, 3000);
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
        const openSelectPanel = document.querySelector('#season-options:not(.hidden)');
        if (openSelectPanel && !openSelectPanel.closest('.custom-select-container').contains(e.target)) {
            document.getElementById('season-selector-button')?.click();
        }
    });

    /** Cria as opções no painel de configurações do player (velocidade, qualidade) */
    function createSettingsOptions() {
        const speedContainer = document.getElementById('settings-speed-options');
        const qualityContainer = document.getElementById('settings-quality-options');
        if(speedContainer.childElementCount > 1) return; // Already created

        const speeds = [0.5, 1, 1.5, 2];
        speedContainer.innerHTML = '<h4 class="text-xs text-gray-300 px-3 pt-1 pb-2">Velocidade</h4>'; // Reset title
        speeds.forEach(speed => {
            const button = document.createElement('button');
            button.className = 'settings-option-btn';
            button.textContent = `${speed}x`;
            if (speed === 1) button.classList.add('active');
            button.onclick = () => {
                videoPlayer.playbackRate = speed;
                speedContainer.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                settingsPanel.classList.add('hidden'); // Close panel on select
            };
            speedContainer.appendChild(button);
        });

        // Placeholder for quality - HLS.js handles auto quality switching
        qualityContainer.innerHTML = '<h4 class="text-xs text-gray-300 px-3 pt-1 pb-2">Qualidade</h4>'; // Reset title
        const qualities = ["Auto"]; // Only show Auto for now
        qualities.forEach(quality => {
             const button = document.createElement('button');
            button.className = 'settings-option-btn';
            button.textContent = quality;
            if (quality === "Auto") button.classList.add('active');
            button.onclick = () => {
                qualityContainer.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                settingsPanel.classList.add('hidden'); // Close panel on select
                // In HLS.js, setting hls.currentLevel = -1 enables auto quality
                if(hls) hls.currentLevel = -1;
                showToast("Qualidade definida para Automático.");
            };
            qualityContainer.appendChild(button);
        });
    }

    document.getElementById('hero-watch-btn').addEventListener('click', () => {
        if (!currentHeroItem) return;
        // Check if it's a series and handle differently if needed (e.g., start from first episode)
        if (currentHeroItem.type === 'tv' && currentHeroItem.seasons) {
             const firstSeasonKey = Object.keys(currentHeroItem.seasons).sort((a,b) => parseInt(a) - parseInt(b))[0];
             const firstEpisode = currentHeroItem.seasons[firstSeasonKey]?.episodes?.[0];
             if(firstEpisode) {
                 const allEpisodesOfSeason = currentHeroItem.seasons[firstSeasonKey].episodes;
                 const context = {
                     videoUrl: firstEpisode.url,
                     title: `${currentHeroItem.name} - T${firstSeasonKey} E${firstEpisode.episode_number || 1}`,
                     itemData: currentHeroItem,
                     episodes: allEpisodesOfSeason,
                     currentIndex: 0
                 };
                 showPlayer(context);
             } else {
                 showToast("Nenhum episódio encontrado para iniciar.", true);
             }
        } else if (currentHeroItem.url) { // It's a movie or item with a direct URL
             showPlayer({
                 videoUrl: currentHeroItem.url,
                 title: currentHeroItem.title || currentHeroItem.name,
                 itemData: currentHeroItem
             });
        } else {
            showToast("Vídeo não disponível para este item.", true);
        }
    });

    /** Inicializa a UI do player (define ícones iniciais, adiciona listeners) */
    function initializePlayerUI() {
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
        addPlayerEventListeners(); // Attach listeners to the video element
    }

    // --- Listeners Gerais da UI (Busca, Notificações) ---
    searchIconBtn.addEventListener('click', () => toggleSearchOverlay(true));
    closeSearchBtn.addEventListener('click', () => toggleSearchOverlay(false));
    document.getElementById('search-overlay-bg').addEventListener('click', () => toggleSearchOverlay(false));

    searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            performSearch(searchInput.value);
        }, 400);
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
    /** Função principal que lida com a navegação baseada no hash da URL */
    async function handleNavigation() {
        const hash = window.location.hash;

        // --- Rota de Autenticação ---
        if (!userId) {
            if (hash !== '#login-view') {
                history.replaceState(null, '', '#login-view');
            }
            showLoginScreen();
            return;
        }

        // --- Rota de Seleção de Perfil ---
        if (!currentProfile) {
            const lastProfileId = localStorage.getItem(`starlight-lastProfile-${userId}`);
            let autoSelectedProfile = false;
            if (lastProfileId) {
                if (!profiles || profiles.length === 0) {
                    await loadProfiles();
                }
                const foundProfile = profiles.find(p => p.id === lastProfileId);
                if (foundProfile) {
                    selectAndEnterProfile(foundProfile); // This will call handleNavigation again after setting profile
                    autoSelectedProfile = true;
                    return; // Important: Return here to avoid double execution after profile selection
                } else {
                     localStorage.removeItem(`starlight-lastProfile-${userId}`); // Clean up invalid stored ID
                }
            }

            // If no valid profile was auto-selected, force profile selection screen
            if (!autoSelectedProfile) {
                if (hash !== '#manage-profile-view') {
                    history.replaceState(null, '', '#manage-profile-view');
                }
                showProfileScreen(); // This renders the profile screen
                return; // Stop further routing until a profile is selected
            }
        }


        // --- Roteamento do Aplicativo (Usuário Logado e com Perfil Selecionado) ---

        if (!searchOverlay.classList.contains('hidden')) {
            toggleSearchOverlay(false);
        }

        // Cleanup listeners for comments/replies from previous views
        Object.values(commentListeners).forEach(unsubscribe => unsubscribe());
        commentListeners = {};

        if (hash.startsWith('#details/') || hash === '#player') {
            document.querySelector('header').classList.add('hidden');
            document.querySelector('footer').classList.add('hidden');
        } else {
            document.querySelector('header').classList.remove('hidden');
            document.querySelector('footer').classList.remove('hidden');
        }

        if (!hash.startsWith('#details/')) { detailsView.classList.add('hidden'); }
        if (hash !== '#player' && !playerView.classList.contains('hidden')) { hidePlayer(true, false); } // Save progress when navigating away normally

        document.querySelectorAll('#view-container > .content-view').forEach(view => view.classList.add('hidden'));

        if (hash.startsWith('#details/')) {
            const docId = hash.split('/')[1];
            showDetailsView({ docId });
        } else if (hash === '#player') {
            // Player visibility is handled by showPlayer/hidePlayer.
            // If hash is #player but view is hidden (e.g., page reload), go back.
             if (playerView.classList.contains('hidden')) {
                  history.back();
             }
        } else {
            const targetId = hash.substring(1) || 'home-view';
            const targetView = document.getElementById(targetId);

            if (targetView && targetView.classList.contains('content-view')) {
                targetView.classList.remove('hidden');
                renderScreenContent(targetId);
            } else {
                document.getElementById('home-view').classList.remove('hidden');
                renderScreenContent('home-view');
                if(window.location.hash !== '#home-view') {
                    history.replaceState(null, '', '#home-view');
                }
            }

            document.querySelectorAll('.nav-item, .mobile-nav-item').forEach(l => l.classList.remove('active'));
            document.querySelectorAll(`[data-target="${targetId}"]`).forEach(l => l.classList.add('active'));
            updateMobileNavIndicator();

            document.getElementById('main-background').style.opacity = (targetId === 'home-view' && currentHeroItem) ? 1 : 0;
            if (targetId !== 'home-view' && heroCarouselInterval) {
                clearInterval(heroCarouselInterval);
                heroCarouselInterval = null;
            }
        }
    }

    window.addEventListener('popstate', handleNavigation);


    // --- Lógica de Notificações --- (Sem alterações significativas)
    function listenForNotifications() {
        const q = query(collection(db, "notifications")); // Query without orderBy for client-side sort
        onSnapshot(q, (snapshot) => {
            notifications = [];
            snapshot.forEach((doc) => {
                notifications.push({ id: doc.id, ...doc.data() });
            });
            // Sort client-side
            notifications.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
            updateNotificationBell();
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
        const avisos = notifications.filter(n => n.type === 'Aviso');
        const novidades = notifications.filter(n => n.type === 'Novidade' && !dismissedNotifications.includes(n.id));

        const createNotifHTML = (notif, isDismissable) => {
            const dismissBtn = isDismissable ? `<button class="remove-notification-btn text-stone-500 hover:text-white" data-notif-id="${notif.id}"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>` : '';
            let linkDataAttr = '';
             if (notif.link) { linkDataAttr = `data-link-type="${notif.link.type}" data-link-value="${notif.link.url || notif.link.docId}"`; }
            return `
               <div class="notification-item flex items-start gap-2 p-2 rounded-md transition-colors hover:bg-white/5 ${notif.link ? 'cursor-pointer' : ''}" ${linkDataAttr}>
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
            document.getElementById(`notifications-${tab.dataset.tab}`).classList.add('active');
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
            removeBtn.closest('.notification-item').remove();
             return;
        }
        const notificationItem = e.target.closest('.notification-item[data-link-type]');
        if (notificationItem) {
             const linkType = notificationItem.dataset.linkType;
             const linkValue = notificationItem.dataset.linkValue;
             if (linkType === 'internal' && linkValue) { window.location.hash = `#details/${linkValue}`; }
             else if (linkType === 'external' && linkValue) { window.open(linkValue, '_blank'); }
             notificationPanel.classList.remove('animate-fade-in-down');
             notificationPanel.classList.add('animate-fade-out-up');
             setTimeout(() => notificationPanel.classList.add('hidden'), 250);
        }
    });


    // --- Lógica de Pedidos --- (Sem alterações significativas)
    function listenToRequests() {
        if (!userId) return; // Only listen if logged in
        const q = query(collection(db, "pedidos"), where("status", "==", "pending"));
        onSnapshot(q, (snapshot) => {
            pendingRequests = [];
            snapshot.forEach((doc) => {
                pendingRequests.push({ id: doc.id, ...doc.data() });
            });
             pendingRequests.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
            if (window.location.hash === '#requests-view') {
                 renderPendingRequests();
            }
        }, (error) => { console.error("Erro ao escutar pedidos: ", error); });
    }

    async function handleVote(requestId) {
        if (!userId || !currentProfile) {
            showToast("Você precisa estar logado para votar.", true);
            return;
        }
        const docRef = doc(db, 'pedidos', requestId);
        const voteButton = document.querySelector(`.vote-btn[data-request-id="${requestId}"]`);
        if (voteButton) voteButton.disabled = true;

        try {
            const docSnap = await getDoc(docRef);
            if (!docSnap.exists()) { showToast("Este pedido não existe mais.", true); return; }
            const requestData = docSnap.data();
            const requesters = requestData.requesters || [];
            const userVoteIndex = requesters.findIndex(r => r.userId === userId);
            const userVote = { userId: userId, userName: currentProfile.name };

            if (userVoteIndex > -1) {
                await updateDoc(docRef, { requesters: arrayRemove(requesters[userVoteIndex]) });
                showToast('Voto removido.');
            } else {
                await updateDoc(docRef, { requesters: arrayUnion(userVote) });
                showToast('Obrigado pelo seu voto!');
            }
        } catch (error) {
            console.error("Erro ao processar voto:", error);
            showToast("Ocorreu um erro ao processar seu voto.", true);
        } finally {
             if (voteButton) voteButton.disabled = false;
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
            const userHasVoted = userId && (request.requesters || []).some(r => r.userId === userId);
            return `
               <div class="liquid-glass-card bg-stone-900/50 rounded-lg overflow-hidden flex flex-col p-4 gap-4">
                   <div class="glass-filter"></div><div class="glass-overlay"></div><div class="glass-specular"></div>
                   <div class="glass-content w-full flex items-start gap-4">
                       <img src="${posterPath}" alt="${request.title || request.name}" class="w-20 rounded-md aspect-[2/3] object-cover">
                       <div class="flex-1">
                           <h4 class="font-bold text-white">${request.title || request.name} (${request.year || 'N/A'})</h4>
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
    /** Carrega os perfis do usuário logado do Firestore */
    async function loadProfiles() {
        if (!userId) return;
        const profilesCol = collection(db, 'users', userId, 'profiles');
        const snapshot = await getDocs(profilesCol);
        profiles = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderProfiles();
    }

    /** Renderiza os cards de perfil na tela de seleção/gerenciamento */
    function renderProfiles() {
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
               <p class="text-center text-lg text-gray-300 group-hover:text-white mt-3 transition-colors">${profile.name}</p>
            `;
            profileCard.addEventListener('click', () => {
                if (isEditMode) { showProfileModal(profile.id); }
                else { selectAndEnterProfile(profile); }
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
               <p class="text-center text-lg text-gray-300 group-hover:text-white mt-3 transition-colors">Adicionar Perfil</p>
            `;
            addProfileCard.addEventListener('click', () => showProfileModal());
            profilesGrid.appendChild(addProfileCard);
        }
         attachGlassButtonListeners();
    }

    /**
     * Define o perfil selecionado, atualiza o header e navega para a home.
     * @param {object} profile - O objeto do perfil selecionado.
     */
    async function selectAndEnterProfile(profile) {
        currentProfile = profile;
        userDisplayName = profile.name; // Use profile name for comments
        localStorage.setItem(`starlight-lastProfile-${userId}`, profile.id);

        const avatarImg = new Image();
        avatarImg.src = currentProfile.avatar;
        avatarImg.className = 'w-full h-full object-cover rounded-full';
        headerProfileBtn.innerHTML = '';
        headerProfileBtn.appendChild(avatarImg);

        // Start listening to content AFTER profile selection
        listenToFirestoreContent();
        listenToRequests();
        listenForNews();

        // Navigate only if not already on the target hash
        if (window.location.hash !== '#home-view') {
            window.location.hash = '#home-view';
        } else {
            handleNavigation(); // Force re-render if already on home
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

        if (profileId) {
            modalTitle.textContent = 'Editar Perfil';
            const profile = profiles.find(p => p.id === profileId);
            nameInput.value = profile.name;
            idInput.value = profile.id;
            deleteBtn.classList.remove('hidden');
            const currentAvatar = avatarOptionsContainer.querySelector(`img[data-avatar="${profile.avatar}"]`);
            if(currentAvatar) currentAvatar.classList.add('!border-purple-500', 'scale-110');
        } else {
            modalTitle.textContent = 'Adicionar Perfil';
            nameInput.value = '';
            idInput.value = '';
            deleteBtn.classList.add('hidden');
        }
        profileModal.classList.remove('hidden');
    }

    avatarOptionsContainer.addEventListener('click', e => {
        if(e.target.tagName === 'IMG') {
            avatarOptionsContainer.querySelectorAll('img').forEach(img => img.classList.remove('!border-purple-500', 'scale-110'));
            e.target.classList.add('!border-purple-500', 'scale-110');
        }
    });

    document.getElementById('save-profile-btn').addEventListener('click', async () => {
        const name = document.getElementById('profile-name-input').value.trim();
        const selectedAvatar = document.querySelector('#avatar-options .scale-110')?.dataset.avatar;
        const profileId = document.getElementById('profile-id-input').value;

        if (!name || !selectedAvatar) { showToast('Por favor, preencha o nome e selecione um avatar.', true); return; }
        if (!userId) { showToast('Erro de autenticação. Por favor, recarregue a página.', true); return; }

        const profileData = { name, avatar: selectedAvatar };
        try {
            if (profileId) {
                const docRef = doc(db, 'users', userId, 'profiles', profileId);
                await updateDoc(docRef, profileData);
                showToast('Perfil atualizado com sucesso!');
            } else {
                const colRef = collection(db, 'users', userId, 'profiles');
                await addDoc(colRef, profileData);
                showToast('Perfil criado com sucesso!');
            }
            await loadProfiles();
            profileModal.classList.add('hidden');
        } catch (error) {
            console.error("Erro ao salvar perfil: ", error);
            showToast('Não foi possível salvar o perfil.', true);
        }
    });

    document.getElementById('cancel-profile-btn').addEventListener('click', () => profileModal.classList.add('hidden'));

    document.getElementById('delete-profile-btn').addEventListener('click', async () => {
        const profileId = document.getElementById('profile-id-input').value;
         if (profileId && profiles.length > 1) {
             showConfirmationModal('Excluir Perfil', 'Tem certeza que deseja excluir este perfil? Esta ação não pode ser desfeita.',
                 async () => {
                     try {
                         const docRef = doc(db, 'users', userId, 'profiles', profileId);
                         await deleteDoc(docRef);
                         showToast('Perfil excluído.');
                         await loadProfiles();
                         profileModal.classList.add('hidden');
                         // If deleting the current profile, force re-selection
                         if (currentProfile && currentProfile.id === profileId) {
                            currentProfile = null;
                            localStorage.removeItem(`starlight-lastProfile-${userId}`);
                            window.location.hash = 'manage-profile-view'; // Go back to profile selection
                         }
                     } catch (error) {
                         console.error("Erro ao excluir perfil: ", error);
                         showToast('Não foi possível excluir o perfil.', true);
                     }
                 }
             );
         } else { showToast('Não é possível excluir o único perfil.', true); }
    });

    manageProfilesBtn.addEventListener('click', () => {
        isEditMode = !isEditMode;
        manageProfilesBtn.querySelector('.glass-content').textContent = isEditMode ? 'Concluído' : 'Gerenciar Perfis';
        document.getElementById('profile-main-title').textContent = isEditMode ? 'Gerenciar Perfis' : 'Quem está assistindo?';
        renderProfiles();
    });

    headerProfileBtn.addEventListener('click', () => {
        isEditMode = false;
        manageProfilesBtn.querySelector('.glass-content').textContent = 'Gerenciar Perfis';
        document.getElementById('profile-main-title').textContent = 'Quem está assistindo?';
        currentProfile = null;
        localStorage.removeItem(`starlight-lastProfile-${userId}`);
        window.location.hash = 'manage-profile-view';
    });

    // --- Lógica de Autenticação e Troca de Formulário (Login/Registro) ---
    const switchToRegister = document.querySelector('.switch-to-register');
    const switchToLogin = document.querySelector('.switch-to-login');
    const loginFormContainer = document.querySelector('.form-container.login');
    const registerFormContainer = document.querySelector('.form-container.register');

    switchToRegister.addEventListener('click', (e) => { e.preventDefault(); loginFormContainer.classList.remove('active'); registerFormContainer.classList.add('active'); });
    switchToLogin.addEventListener('click', (e) => { e.preventDefault(); registerFormContainer.classList.remove('active'); loginFormContainer.classList.add('active'); });

    document.getElementById('login-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        signInWithEmailAndPassword(auth, email, password)
            .catch((error) => { console.error("Erro de login:", error); showToast(`Erro: ${error.message}`, true); });
    });

    document.getElementById('register-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;
        createUserWithEmailAndPassword(auth, email, password)
            .then(async (userCredential) => {
                 const user = userCredential.user;
                 if (user) {
                     const colRef = collection(db, 'users', user.uid, 'profiles');
                     await addDoc(colRef, { name: "Usuário", avatar: AVATARS[0] });
                     // onAuthStateChanged handles navigation
                 }
            })
            .catch((error) => { console.error("Erro de registro:", error); showToast(`Erro: ${error.message}`, true); });
    });

    document.getElementById('google-signin-btn').addEventListener('click', () => {
        signInWithPopup(auth, googleProvider)
            .then(async (result) => {
                 const user = result.user;
                 if (user) {
                     const profilesCol = collection(db, 'users', user.uid, 'profiles');
                     const snapshot = await getDocs(profilesCol);
                     if (snapshot.empty) { // Create profile only if none exist
                          await addDoc(profilesCol, { name: user.displayName || "Usuário", avatar: user.photoURL || AVATARS[0] });
                     }
                     // onAuthStateChanged handles navigation
                 }
            })
            .catch((error) => { console.error("Erro de login com Google:", error); showToast(`Erro: ${error.message}`, true); });
    });

    logoutBtn.addEventListener('click', () => {
        const currentUserId = userId;
        signOut(auth).then(() => {
            if (currentUserId) { localStorage.removeItem(`starlight-lastProfile-${currentUserId}`); }
            if (unsubscribeNewsListener) { unsubscribeNewsListener(); unsubscribeNewsListener = null; }
            Object.values(commentListeners).forEach(unsubscribe => unsubscribe()); // Stop comment listeners
            commentListeners = {};
            // onAuthStateChanged handles redirect
        }).catch((error) => { console.error("Erro ao sair:", error); showToast(`Erro: ${error.message}`, true); });
    });

    // --- Lógica do Modal de Confirmação ---
    function showConfirmationModal(title, message, onConfirm) {
        confirmTitle.textContent = title;
        confirmMessage.textContent = message;
        confirmCallback = onConfirm;
        confirmModal.classList.remove('hidden');
    }
    confirmOkBtn.addEventListener('click', () => { if (confirmCallback) { confirmCallback(); } confirmModal.classList.add('hidden'); confirmCallback = null; });
    confirmCancelBtn.addEventListener('click', () => { confirmModal.classList.add('hidden'); confirmCallback = null; });

    // --- Busca TMDB para Pedidos ---
    const tmdbSearchInput = document.getElementById('tmdb-search-input');
    tmdbSearchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => { handleTmdbSearch(tmdbSearchInput.value); }, 500);
    });

    async function handleTmdbSearch(query) {
        const resultsContainer = document.getElementById('tmdb-search-results');
        if (query.length < 3) { resultsContainer.innerHTML = ''; return; }
        resultsContainer.innerHTML = `<div class="col-span-full">${glassSpinnerHTML.replace('min-h-screen', '')}</div>`;
        const data = await fetchFromTMDB('search/multi', `query=${encodeURIComponent(query)}`);
        if (data && data.results) {
            const filtered = data.results.filter(item => (item.media_type === 'movie' || item.media_type === 'tv') && item.poster_path);
            renderTmdbResults(filtered);
        } else { resultsContainer.innerHTML = `<p class="col-span-full text-center text-gray-400">Nenhum resultado encontrado.</p>`; }
    }

    function renderTmdbResults(results) {
        const container = document.getElementById('tmdb-search-results');
        if (results.length === 0) { container.innerHTML = `<p class="col-span-full text-center text-gray-400">Nenhum resultado encontrado.</p>`; return; }
        container.innerHTML = results.map(item => {
            const posterPath = item.poster_path ? `${IMG_URL_POSTER}${item.poster_path}` : 'https://placehold.co/300x450/1c1917/FFFFFF?text=Sem+Imagem';
            return `
            <div class="cursor-pointer group tmdb-result-item" data-item='${JSON.stringify(item)}'>
                <div class="liquid-glass-card aspect-[2/3] bg-stone-800">
                    <div class="glass-filter"></div><div class="glass-overlay" style="--bg-color: rgba(0,0,0,0.1);"></div><div class="glass-specular"></div>
                    <div class="glass-content p-0"><img src="${posterPath}" alt="${item.title || item.name}" class="w-full h-full object-cover rounded-[inherit]"></div>
                </div>
                <h4 class="text-white text-xs mt-2 truncate">${item.title || item.name}</h4>
            </div>`;
        }).join('');
        attachGlassButtonListeners();
    }

    document.getElementById('tmdb-search-results').addEventListener('click', (e) => {
        const itemElement = e.target.closest('.tmdb-result-item');
        if (itemElement) { const itemData = JSON.parse(itemElement.dataset.item); confirmAndAddRequest(itemData); }
    });

    document.getElementById('pending-requests-container').addEventListener('click', e => {
        const voteButton = e.target.closest('.vote-btn');
        if (voteButton) { const requestId = voteButton.dataset.requestId; handleVote(requestId); }
    });

    /** Confirma e adiciona um pedido (ou voto) para um item do TMDB */
    async function confirmAndAddRequest(item) {
        const title = item.title || item.name;
        showConfirmationModal('Confirmar Pedido', `Deseja solicitar a adição de "${title}"?`,
            async () => {
                if (!userId || !currentProfile) { showToast("Você precisa estar logado e ter um perfil selecionado.", true); return; }
                const alreadyInCatalog = firestoreContent.some(c => c.tmdb_id === item.id);
                if (alreadyInCatalog) { showToast('Este item já está disponível no catálogo.', true); return; }

                const existingRequest = pendingRequests.find(r => r.tmdbId === item.id);
                if (existingRequest) {
                    const userHasRequested = existingRequest.requesters && existingRequest.requesters.some(r => r.userId === userId);
                    if (userHasRequested) { showToast('Você já apoiou este pedido.', true); return; }
                    try {
                        const docRef = doc(db, 'pedidos', existingRequest.id);
                        await updateDoc(docRef, { requesters: arrayUnion({ userId: userId, userName: currentProfile.name }) });
                        showToast('Seu apoio ao pedido foi adicionado!');
                    } catch (error) { console.error("Erro ao apoiar pedido:", error); showToast('Ocorreu um erro ao apoiar o pedido.', true); }
                } else {
                    const requestData = {
                        tmdbId: item.id,
                        title: item.title || item.name,
                        year: (item.release_date || item.first_air_date || '').substring(0, 4),
                        posterUrl: item.poster_path ? `${IMG_URL_POSTER}${item.poster_path}` : 'https://placehold.co/300x450/1c1917/FFFFFF?text=Sem+Imagem',
                        mediaType: item.media_type,
                        status: 'pending',
                        createdAt: serverTimestamp(),
                        requesters: [{ userId: userId, userName: currentProfile.name }]
                    };
                    try {
                        await addDoc(collection(db, 'pedidos'), requestData);
                        showToast('Pedido enviado com sucesso!');
                    } catch (error) { console.error("Erro ao adicionar pedido:", error); showToast('Ocorreu um erro ao enviar o pedido.', true); }
                }
            }
        );
    }

    // --- Estado Inicial e Listener de Autenticação ---

    /** Mostra a tela de login e esconde o resto */
    function showLoginScreen() {
        userId = null;
        userEmail = null;
        userDisplayName = null;
        currentProfile = null;
        document.querySelectorAll('.content-view').forEach(view => view.classList.add('hidden'));
        loginView.classList.remove('hidden');
        document.querySelector('header').classList.add('hidden');
        document.querySelector('footer').classList.add('hidden');
        document.getElementById('main-background').style.opacity = 0;
        if (unsubscribeNewsListener) { unsubscribeNewsListener(); unsubscribeNewsListener = null; }
        Object.values(commentListeners).forEach(unsubscribe => unsubscribe());
        commentListeners = {};
    }

    /** Mostra a tela de seleção/gerenciamento de perfil */
    async function showProfileScreen() {
       document.querySelectorAll('.content-view').forEach(view => view.classList.add('hidden'));
       loginView.classList.add('hidden');
       manageProfileView.classList.remove('hidden');
       document.querySelector('header').classList.add('hidden');
       document.querySelector('footer').classList.add('hidden');
       document.getElementById('main-background').style.opacity = 0;
       isEditMode = false;
       manageProfilesBtn.querySelector('.glass-content').textContent = 'Gerenciar Perfis';
       document.getElementById('profile-main-title').textContent = 'Quem está assistindo?';
       await loadProfiles();
    }

    // Listener principal de mudança de estado de autenticação
    onAuthStateChanged(auth, async (user) => {
        document.body.classList.remove('auth-loading');
        if (user) {
            userId = user.uid;
            userEmail = user.email;
            userDisplayName = user.displayName; // Store original display name

            listenForNotifications(); // Can listen even before profile selection
            initializePlayerUI();

            const lastProfileId = localStorage.getItem(`starlight-lastProfile-${userId}`);
            let autoSelectedProfile = false;
            if (lastProfileId) {
                await loadProfiles(); // Load profiles to validate lastProfileId
                const foundProfile = profiles.find(p => p.id === lastProfileId);
                if (foundProfile) {
                    // selectAndEnterProfile calls handleNavigation internally
                    selectAndEnterProfile(foundProfile);
                    autoSelectedProfile = true;
                } else {
                    localStorage.removeItem(`starlight-lastProfile-${userId}`); // Clean invalid ID
                }
            }

            // If no profile was auto-selected, force the selection screen via handleNavigation
            if (!autoSelectedProfile) {
                 currentProfile = null; // Ensure profile is null
                 if (window.location.hash !== '#manage-profile-view') {
                     // Use replaceState to avoid adding the intermediate state to history
                     history.replaceState(null, '', '#manage-profile-view');
                 }
                 handleNavigation(); // Let the router show the profile screen
            }
            // If autoSelectedProfile is true, selectAndEnterProfile already started the process

        } else { // User is logged out
            userId = null;
            userEmail = null;
            userDisplayName = null;
            currentProfile = null;
            if (window.location.hash !== '#login-view') {
                history.replaceState(null, '', '#login-view');
            }
            handleNavigation(); // Let the router show the login screen
        }
    });

    // --- Inicialização ---
    attachGlassButtonListeners();
    window.addEventListener('resize', () => {
        updateMobileNavIndicator();
        addPlayerEventListeners(); // Re-evaluate player click listener on resize
    });
    // handleNavigation(); // Initial call is handled by onAuthStateChanged

    // -----------------------------------------------------------------
    // --- NOVO: Funções de Novidades, Likes, Comentários, Respostas ---
    // -----------------------------------------------------------------

    /** Escuta por atualizações na coleção 'news' e atualiza o cache */
    function listenForNews() {
        if (unsubscribeNewsListener) { unsubscribeNewsListener(); }
        if (!userId) return; // Don't listen if not logged in

        const q = query(collection(db, "news"), orderBy("createdAt", "desc"));
        unsubscribeNewsListener = onSnapshot(q, (snapshot) => {
            newsItemsCache = [];
            snapshot.forEach((doc) => {
                newsItemsCache.push({ id: doc.id, ...doc.data() });
            });
            if (window.location.hash === '#news-view') { renderNewsFeed(); }
        }, (error) => { console.error("Erro ao escutar novidades: ", error); });
    }

    /** Renderiza o feed de novidades na tela */
    function renderNewsFeed() {
        const newsContainer = document.getElementById('news-view');
        if (!newsContainer) return;
        const itemsContainerId = 'news-items-container';
        let itemsContainer = newsContainer.querySelector(`#${itemsContainerId}`);
        if (!itemsContainer) {
            newsContainer.innerHTML = `
                <div class="max-w-3xl mx-auto pb-16 w-full px-4 md:px-6 space-y-8">
                    <h2 class="text-3xl sm:text-4xl font-bold text-white mb-8">Novidades</h2>
                    <div id="${itemsContainerId}" class="space-y-8"></div>
                </div>`;
            itemsContainer = newsContainer.querySelector(`#${itemsContainerId}`);
        } else {
            itemsContainer.innerHTML = '';
        }

        if (newsItemsCache.length === 0) {
            itemsContainer.innerHTML = '<p class="text-center text-gray-400">Nenhuma novidade publicada ainda.</p>';
            return;
        }
        newsItemsCache.forEach(item => {
            const newsCard = createNewsCard(item);
            itemsContainer.appendChild(newsCard);
        });
        attachGlassButtonListeners();
        lucide.createIcons();
    }

    /** Cria o elemento HTML para um card de novidade */
    function createNewsCard(item) {
        const card = document.createElement('div');
        card.className = 'news-card liquid-glass-card bg-stone-900/50 rounded-lg overflow-hidden';
        card.dataset.newsId = item.id;

        const date = item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric'}) : 'Data indisponível';
        let contentHTML = '';
        switch (item.type) {
            case 'text': contentHTML = `<p class="text-stone-300 mt-2 whitespace-pre-wrap">${item.content}</p>`; break;
            case 'image': contentHTML = `<img src="${item.content}" alt="${item.title || 'Imagem da novidade'}" class="mt-4 rounded-lg max-w-full h-auto mx-auto">`; break;
            case 'video': contentHTML = `<div class="aspect-video mt-4"><iframe src="${item.content}" frameborder="0" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen class="w-full h-full rounded-lg"></iframe></div>`; break;
            default: contentHTML = `<p class="text-stone-500 mt-2">[Conteúdo ${item.type} não suportado]</p>`;
        }

        // CORREÇÃO: Usar likeCount se existir, senão o tamanho do array 'likes'
        const likeCount = typeof item.likeCount === 'number' ? item.likeCount : (item.likes || []).length;
        const userHasLiked = userId && (item.likes || []).includes(userId);

        card.innerHTML = `
            <div class="glass-filter"></div><div class="glass-overlay"></div><div class="glass-specular"></div>
            <div class="glass-content p-4 sm:p-6">
                ${item.title ? `<h3 class="text-xl font-semibold text-white">${item.title}</h3>` : ''}
                <p class="text-xs text-stone-400 mb-4">${date}</p>
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
                    <div class="comments-list space-y-3"></div>
                </div>
            </div>`;
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

        likeBtn.addEventListener('click', () => handleLike(newsId, likeBtn));
        commentBtn.addEventListener('click', () => {
             commentsSection.classList.toggle('hidden');
             // Load comments only when opening and if not already loaded/loading
             if (!commentsSection.classList.contains('hidden') && !commentListeners[newsId]) {
                 loadComments(newsId, commentsList);
             } else if (commentsSection.classList.contains('hidden') && commentListeners[newsId]) {
                 // Unsubscribe when closing comments section
                 commentListeners[newsId]();
                 delete commentListeners[newsId];
                 commentsList.innerHTML = ''; // Clear list when closing
             }
         });
        submitCommentBtn.addEventListener('click', () => submitComment(newsId, commentInput)); // Pass only needed args
        commentInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment(newsId, commentInput); }
        });
    }

    /** Lida com o clique no botão de curtir */
    async function handleLike(newsId, likeBtn) {
        if (!userId) { showToast("Você precisa estar logado para curtir.", true); return; }

        const newsDocRef = doc(db, 'news', newsId);
        const likeIcon = likeBtn.querySelector('i');
        const likeCountSpan = likeBtn.querySelector('.like-count');
        // Check current state from the DOM class, not from a potentially stale variable
        const isCurrentlyLiked = likeBtn.classList.contains('text-pink-500');

        // Optimistic UI Update
        const currentCount = parseInt(likeCountSpan.textContent || '0');
        const newCount = isCurrentlyLiked ? Math.max(0, currentCount - 1) : currentCount + 1;
        likeBtn.classList.toggle('text-pink-500', !isCurrentlyLiked); // Toggle based on NEW state
        likeIcon.setAttribute('data-lucide', !isCurrentlyLiked ? 'heart-handshake' : 'heart'); // Set icon based on NEW state
        lucide.createIcons({ nodes: [likeIcon] });
        likeCountSpan.textContent = newCount;
        likeBtn.disabled = true;

        try {
            // Update Firestore
            await updateDoc(newsDocRef, {
                likes: isCurrentlyLiked ? arrayRemove(userId) : arrayUnion(userId),
                likeCount: increment(isCurrentlyLiked ? -1 : 1)
            });
            // Firestore update successful, UI is already updated.
        } catch (error) {
            console.error("Erro ao curtir/descurtir:", error);
            showToast("Erro ao processar o like.", true);
            // Revert UI on error
            likeBtn.classList.toggle('text-pink-500', isCurrentlyLiked); // Revert to original state
            likeIcon.setAttribute('data-lucide', isCurrentlyLiked ? 'heart-handshake' : 'heart'); // Revert icon
            lucide.createIcons({ nodes: [likeIcon] });
            likeCountSpan.textContent = currentCount; // Revert count
        } finally {
             likeBtn.disabled = false;
        }
    }


    /** Submete um novo comentário */
    async function submitComment(newsId, inputElement) {
        if (!userId || !currentProfile) { showToast("Você precisa estar logado para comentar.", true); return; }
        const commentText = inputElement.value.trim();
        if (!commentText) { showToast("O comentário não pode estar vazio.", true); return; }

        const commentData = {
            userId: userId,
            userName: currentProfile.name || userEmail || "Usuário Anônimo", // Fallback name
            userAvatar: currentProfile.avatar || AVATARS[0], // Add avatar URL
            text: commentText,
            createdAt: serverTimestamp(),
            repliesCount: 0
        };

        const submitBtn = inputElement.nextElementSibling;
        inputElement.disabled = true;
        if (submitBtn) submitBtn.disabled = true;

        try {
            const commentsColRef = collection(db, 'news', newsId, 'comments');
            await addDoc(commentsColRef, commentData);
            inputElement.value = '';
            showToast('Comentário adicionado!');
            // No need to manually add to UI, onSnapshot will handle it.
        } catch (error) {
            console.error("Erro ao adicionar comentário:", error);
            showToast("Erro ao enviar comentário.", true);
        } finally {
             inputElement.disabled = false;
             if (submitBtn) submitBtn.disabled = false;
        }
    }

    /** Carrega e escuta os comentários de um post */
    function loadComments(newsId, commentsListElement) {
        // Unsubscribe from previous listener for this post if exists
        if (commentListeners[newsId]) {
            commentListeners[newsId]();
        }

        commentsListElement.innerHTML = `<div class="spinner mx-auto my-4"></div>`; // Show spinner initially

        const q = query(collection(db, 'news', newsId, 'comments'), orderBy('createdAt', 'desc'));

        // Store the unsubscribe function
        commentListeners[newsId] = onSnapshot(q, (snapshot) => {
            if (snapshot.empty) {
                commentsListElement.innerHTML = '<p class="text-stone-400 text-sm text-center">Nenhum comentário ainda.</p>';
                return;
            }
            commentsListElement.innerHTML = ''; // Clear previous comments/spinner
            snapshot.forEach(doc => {
                const commentCard = createCommentCard({ id: doc.id, ...doc.data() }, newsId);
                commentsListElement.appendChild(commentCard);
            });
            attachGlassButtonListeners();
            lucide.createIcons();
        }, (error) => {
             console.error("Erro ao carregar comentários:", error);
             commentsListElement.innerHTML = '<p class="text-red-400 text-sm text-center">Erro ao carregar comentários.</p>';
             delete commentListeners[newsId]; // Remove listener on error
        });
    }


    /** Cria o HTML para um card de comentário */
    function createCommentCard(comment, newsId) {
        const card = document.createElement('div');
        card.className = 'comment-card liquid-glass-card bg-stone-800/40 rounded-lg p-3';
        card.dataset.commentId = comment.id;

        const date = comment.createdAt?.toDate ? formatRelativeTime(comment.createdAt.toDate()) : ''; // Use relative time
        const repliesCount = comment.repliesCount || 0;
        const avatarUrl = comment.userAvatar || 'https://placehold.co/40x40/333/ccc?text=?'; // Fallback avatar

        card.innerHTML = `
            <div class="glass-filter"></div><div class="glass-overlay" style="--bg-color: rgba(30, 30, 30, 0.2);"></div><div class="glass-specular"></div>
            <div class="glass-content">
                <div class="flex items-start gap-3">
                    <img src="${avatarUrl}" alt="${comment.userName || 'Avatar'}" class="w-8 h-8 rounded-full flex-shrink-0 mt-1">
                    <div class="flex-1">
                        <div class="flex items-baseline justify-between mb-1">
                            <span class="font-semibold text-sm text-indigo-300">${comment.userName || 'Usuário Anônimo'}</span>
                            <span class="text-xs text-stone-400">${date}</span>
                        </div>
                        <p class="text-sm text-stone-200 whitespace-pre-wrap break-words">${comment.text}</p>
                        <div class="mt-2 flex items-center gap-4">
                            <button class="reply-btn text-xs text-stone-400 hover:text-indigo-400 flex items-center gap-1">
                                <i data-lucide="corner-down-left" class="w-3 h-3"></i> Responder
                            </button>
                            ${repliesCount > 0 ? `<button class="view-replies-btn text-xs text-stone-400 hover:text-indigo-400 flex items-center gap-1" data-count="${repliesCount}">
                                <i data-lucide="messages-square" class="w-3 h-3"></i> Ver ${repliesCount} ${repliesCount === 1 ? 'resposta' : 'respostas'}
                            </button>` : ''}
                        </div>
                    </div>
                </div>
                <div class="reply-input-area hidden mt-2 ml-11"> {/* Adjusted margin */}
                    <textarea class="reply-input w-full p-2 bg-black/40 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none border border-white/10" rows="1" placeholder="Escreva sua resposta..."></textarea>
                    <button class="submit-reply-btn bg-indigo-600 hover:bg-indigo-700 text-white px-2 py-0.5 rounded-md text-xs mt-1 float-right">Enviar</button>
                </div>
                <div class="replies-list hidden mt-2 ml-11 space-y-2 border-l-2 border-white/10 pl-3"></div> {/* Adjusted margin */}
            </div>`;
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
        const replyListenerKey = `${newsId}_${commentId}`; // Unique key for reply listener

        replyBtn.addEventListener('click', () => replyInputArea.classList.toggle('hidden'));

        if (viewRepliesBtn) {
            viewRepliesBtn.addEventListener('click', () => {
                const isHidden = repliesList.classList.toggle('hidden');
                const count = viewRepliesBtn.dataset.count;
                viewRepliesBtn.innerHTML = isHidden
                    ? `<i data-lucide="messages-square" class="w-3 h-3"></i> Ver ${count} ${count == 1 ? 'resposta' : 'respostas'}`
                    : `<i data-lucide="chevron-up" class="w-3 h-3"></i> Ocultar respostas`;
                lucide.createIcons({ nodes: [viewRepliesBtn] });

                if (!isHidden && !commentListeners[replyListenerKey]) { // Load only if opening and not loaded/loading
                    loadReplies(newsId, commentId, repliesList);
                } else if (isHidden && commentListeners[replyListenerKey]) {
                    // Unsubscribe replies when closing
                    commentListeners[replyListenerKey]();
                    delete commentListeners[replyListenerKey];
                    repliesList.innerHTML = ''; // Clear list
                }
            });
        }
        submitReplyBtn.addEventListener('click', () => submitReply(newsId, commentId, replyInput, repliesList, viewRepliesBtn)); // Pass viewRepliesBtn
        replyInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitReply(newsId, commentId, replyInput, repliesList, viewRepliesBtn); } // Pass viewRepliesBtn
        });
    }


    /** Submete uma nova resposta a um comentário */
    async function submitReply(newsId, commentId, inputElement, repliesListElement, viewRepliesBtn) { // Added viewRepliesBtn
        if (!userId || !currentProfile) { showToast("Você precisa estar logado para responder.", true); return; }
        const replyText = inputElement.value.trim();
        if (!replyText) { showToast("A resposta não pode estar vazia.", true); return; }

        const replyData = {
            userId: userId,
            userName: currentProfile.name || userEmail || "Usuário Anônimo",
            userAvatar: currentProfile.avatar || AVATARS[0], // Add avatar
            text: replyText,
            createdAt: serverTimestamp()
        };

        const submitBtn = inputElement.nextElementSibling;
        inputElement.disabled = true;
        if(submitBtn) submitBtn.disabled = true;

        try {
            const repliesColRef = collection(db, 'news', newsId, 'comments', commentId, 'replies');
            const commentDocRef = doc(db, 'news', newsId, 'comments', commentId);

            // Use a batch write to add reply and update count atomically
            const batch = writeBatch(db);
            batch.set(doc(repliesColRef), replyData); // Add new reply document (auto-generates ID)
            batch.update(commentDocRef, { repliesCount: increment(1) }); // Increment count
            await batch.commit(); // Commit both operations

            inputElement.value = '';
            inputElement.closest('.reply-input-area').classList.add('hidden');
            showToast('Resposta adicionada!');
            // onSnapshot for replies will handle UI update.
            // Ensure replies list is visible if it was hidden
             if (repliesListElement.classList.contains('hidden')) {
                  repliesListElement.classList.remove('hidden');
                   // Update the "View Replies" button text if it exists
                   if(viewRepliesBtn) {
                       const newCount = (parseInt(viewRepliesBtn.dataset.count || '0') + 1);
                       viewRepliesBtn.dataset.count = newCount; // Update count in data attribute
                       viewRepliesBtn.innerHTML = `<i data-lucide="chevron-up" class="w-3 h-3"></i> Ocultar respostas`;
                       lucide.createIcons({ nodes: [viewRepliesBtn] });
                   }
             }

        } catch (error) {
            console.error("Erro ao adicionar resposta:", error);
            showToast("Erro ao enviar resposta.", true);
        } finally {
            inputElement.disabled = false;
            if(submitBtn) submitBtn.disabled = false;
        }
    }


    /** Carrega e escuta as respostas de um comentário */
    function loadReplies(newsId, commentId, repliesListElement) {
        const listenerKey = `${newsId}_${commentId}`; // Unique key for listener
        // Unsubscribe previous listener if exists
        if (commentListeners[listenerKey]) {
            commentListeners[listenerKey]();
        }

        repliesListElement.innerHTML = `<div class="spinner mx-auto my-2 w-4 h-4 border-2"></div>`;
        const q = query(collection(db, 'news', newsId, 'comments', commentId, 'replies'), orderBy('createdAt', 'asc'));

        // Store the unsubscribe function
        commentListeners[listenerKey] = onSnapshot(q, (snapshot) => {
            if (snapshot.empty) {
                repliesListElement.innerHTML = '<p class="text-stone-500 text-xs text-center">Nenhuma resposta ainda.</p>';
                return;
            }
            repliesListElement.innerHTML = '';
            snapshot.forEach(doc => {
                const replyCard = createReplyCard({ id: doc.id, ...doc.data() });
                repliesListElement.appendChild(replyCard);
            });
             attachGlassButtonListeners();
             lucide.createIcons();
        }, (error) => {
             console.error("Erro ao carregar respostas:", error);
             repliesListElement.innerHTML = '<p class="text-red-400 text-xs text-center">Erro ao carregar respostas.</p>';
             delete commentListeners[listenerKey]; // Remove listener on error
        });
    }


    /** Cria o HTML para um card de resposta */
    function createReplyCard(reply) {
         const card = document.createElement('div');
         card.className = 'reply-card liquid-glass-card bg-stone-700/30 rounded-md p-2';
         card.dataset.replyId = reply.id;
         const date = reply.createdAt?.toDate ? formatRelativeTime(reply.createdAt.toDate()) : ''; // Use relative time
         const avatarUrl = reply.userAvatar || 'https://placehold.co/32x32/444/ccc?text=?'; // Fallback avatar for replies

         card.innerHTML = `
             <div class="glass-filter"></div><div class="glass-overlay" style="--bg-color: rgba(40, 40, 40, 0.2);"></div><div class="glass-specular"></div>
             <div class="glass-content">
                 <div class="flex items-start gap-2"> {/* Gap for avatar */}
                     <img src="${avatarUrl}" alt="${reply.userName || 'Avatar'}" class="w-6 h-6 rounded-full flex-shrink-0 mt-0.5"> {/* Smaller avatar */}
                     <div class="flex-1">
                         <div class="flex items-baseline justify-between mb-0.5">
                             <span class="font-semibold text-xs text-indigo-300">${reply.userName || 'Usuário Anônimo'}</span>
                             <span class="text-xs text-stone-500">${date}</span>
                         </div>
                         <p class="text-xs text-stone-300 whitespace-pre-wrap break-words">${reply.text}</p>
                     </div>
                 </div>
             </div>`;
         return card;
    }

    /** Formata o tempo relativo (ex: "há 5 minutos", "ontem") */
    function formatRelativeTime(date) {
        const now = new Date();
        const seconds = Math.round((now - date) / 1000);
        const minutes = Math.round(seconds / 60);
        const hours = Math.round(minutes / 60);
        const days = Math.round(hours / 24);
        const weeks = Math.round(days / 7);
        const months = Math.round(days / 30); // Approximate
        const years = Math.round(days / 365); // Approximate

        if (seconds < 60) return `agora`;
        if (minutes < 60) return `há ${minutes} min`;
        if (hours < 24) return `há ${hours} h`;
        if (days === 1) return `ontem`;
        if (days < 7) return `há ${days} d`;
        if (weeks === 1) return `há 1 sem`;
        if (weeks < 4) return `há ${weeks} sem`; // Use weeks up to a month
        if (months < 12) return `há ${months} m`;
        return `há ${years} a`;
    }

    // --- Lógica de Pedidos --- (Adaptações)
    function listenToRequests() {
        if (!userId) return;
        const q = query(collection(db, "pedidos"), where("status", "==", "pending"));
        onSnapshot(q, (snapshot) => {
            pendingRequests = [];
            snapshot.forEach((doc) => { pendingRequests.push({ id: doc.id, ...doc.data() }); });
            pendingRequests.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
            if (window.location.hash === '#requests-view') { renderPendingRequests(); }
        }, (error) => { console.error("Erro ao escutar pedidos: ", error); });
    }

    // --- Estado Inicial e Listener de Autenticação --- (Sem alterações na lógica principal, apenas garantia de limpeza de listeners)
    onAuthStateChanged(auth, async (user) => {
        document.body.classList.remove('auth-loading');
        if (user) {
            userId = user.uid;
            userEmail = user.email;
            userDisplayName = user.displayName;

            listenForNotifications();
            initializePlayerUI();

            const lastProfileId = localStorage.getItem(`starlight-lastProfile-${userId}`);
            let autoSelectedProfile = false;
            if (lastProfileId) {
                if (!profiles || profiles.length === 0) { // Load only if needed
                    await loadProfiles();
                }
                const foundProfile = profiles.find(p => p.id === lastProfileId);
                if (foundProfile) {
                    selectAndEnterProfile(foundProfile); // This now starts other listeners
                    autoSelectedProfile = true;
                    // No return needed here, selectAndEnterProfile handles nav
                } else {
                     localStorage.removeItem(`starlight-lastProfile-${userId}`);
                }
            }

            if (!autoSelectedProfile) {
                 currentProfile = null;
                 if (window.location.hash !== '#manage-profile-view') {
                     history.replaceState(null, '', '#manage-profile-view');
                 }
                 handleNavigation(); // Router will show profile screen because currentProfile is null
            }
            // If auto-selected, selectAndEnterProfile started navigation

        } else { // User logged out
            userId = null; userEmail = null; userDisplayName = null; currentProfile = null;
            // Clean up all listeners
            if (unsubscribeNewsListener) { unsubscribeNewsListener(); unsubscribeNewsListener = null; }
            Object.values(commentListeners).forEach(unsubscribe => unsubscribe());
            commentListeners = {};
            // Clear caches
            firestoreContent = []; pendingRequests = []; newsItemsCache = []; notifications = []; profiles = [];
            // Clear UI elements sensitive to user data (like header profile)
            headerProfileBtn.innerHTML = '?'; // Placeholder or initial

            if (window.location.hash !== '#login-view') {
                history.replaceState(null, '', '#login-view');
            }
            handleNavigation(); // Show login screen
        }
    });

    // --- Inicialização ---
    attachGlassButtonListeners();
    window.addEventListener('resize', () => {
        updateMobileNavIndicator();
        addPlayerEventListeners();
    });

}); // Fim do DOMContentLoaded
