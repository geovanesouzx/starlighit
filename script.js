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
    increment
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', function () {
    lucide.createIcons();

    const FALLBACK_IMAGE = 'https://files.catbox.moe/sytt0s.gif';
    
    // NOME DA SUA COLEÇÃO NO FIRESTORE ONDE ESTÃO OS ANIMES
    // Se no seu banco a coleção se chama "animes", mude a palavra 'content' abaixo para 'animes'
    const CONTENT_COLLECTION = 'content'; 

    // Define um hash padrão se nenhum existir e não for #player
    if (!window.location.hash || window.location.hash === '#player') {
        history.replaceState(null, '', window.location.pathname + window.location.search);
        window.location.hash = '#home-view';
    }

    // --- NOVA Configuração do Firebase (Mango Anime) ---
    const firebaseConfig = {
        apiKey: "AIzaSyDLGgSoNwLy_f6FRG3jHmlNJ5AIb9MC7fs",
        authDomain: "mango-anime.firebaseapp.com",
        projectId: "mango-anime",
        storageBucket: "mango-anime.firebasestorage.app",
        messagingSenderId: "269303739791",
        appId: "1:269303739791:web:bee162ff744b83e41187fa"
    };

    // Inicializar Firebase
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);
    const googleProvider = new GoogleAuthProvider();

    let isFirstNavigation = true;

    let userId = null;
    let userEmail = null;
    let userDisplayName = null;

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

    let firestoreContent = [];
    let pendingRequests = [];
    let newsItemsCache = [];
    let unsubscribeNewsListener = null;

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
    let debounceTimer;
    const playerLoadingOverlay = document.getElementById('player-loading-overlay');

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
    let avatarsCache = null;

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

    const glassSpinnerHTML = `<div class="glass-spinner-wrapper min-h-screen"><div class="glass-spinner"><div class="glass-filter"></div><div class="glass-overlay"></div><div class="glass-specular"></div><div class="glass-content"><div class="spinner-ring"></div><div class="spinner-core"></div></div></div></div>`;

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
        if (!item || !userId || !currentProfile?.id) return;
        const itemId = String(item.docId || item.id);
        const docRef = doc(db, 'users', userId, 'profiles', currentProfile.id, 'my-list', itemId);
        const isInList = await checkIfInList(itemId);

        if (isInList) {
            await deleteDoc(docRef);
        } else {
            const itemToAdd = { ...item, media_type: item.media_type || (item.title ? 'movie' : 'tv') };
            await setDoc(docRef, itemToAdd);
        }

        updateListButtons(item);
        if (window.location.hash === '#mylist-view') {
            populateMyList();
        }
    }

    async function toggleMyListItem(item) {
        await handleListAction(item);
    }

    function updateListButtons(item) {
        if (currentHeroItem?.docId === item.docId) {
            updateListButton(document.getElementById('hero-add-to-list'), currentHeroItem);
        }
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
        snapshot.forEach(doc => {
            progressData[doc.id] = doc.data();
        });
        return progressData;
    }

    async function savePlayerProgress() {
        if (!videoPlayer.duration || !currentPlayerContext.key || !userId || !currentProfile?.id) return;

        const progressData = {
            currentTime: videoPlayer.currentTime,
            duration: videoPlayer.duration,
            lastWatched: Date.now(),
            item: currentPlayerContext.itemData,
            episode: currentPlayerContext.episodes ? currentPlayerContext.episodes[currentPlayerContext.currentIndex] : null,
        };

        const docRef = doc(db, 'users', userId, 'profiles', currentProfile.id, 'watch-progress', currentPlayerContext.key);
        await setDoc(docRef, progressData, { merge: true });
    }

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

    function getDailyShuffledList(originalList, cacheKey) {
        const CACHE_KEY_PREFIX = 'starlight-shuffled-list-';
        const TIMESTAMP_KEY_PREFIX = 'starlight-shuffle-timestamp-';
        const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

        const finalCacheKey = CACHE_KEY_PREFIX + cacheKey;
        const finalTimestampKey = TIMESTAMP_KEY_PREFIX + cacheKey;

        const now = new Date().getTime();
        const storedTimestamp = localStorage.getItem(finalTimestampKey);
        const storedContentJSON = localStorage.getItem(finalCacheKey);

        if (storedTimestamp && storedContentJSON && (now - storedTimestamp < TWENTY_FOUR_HOURS)) {
            try {
                const cachedContent = JSON.parse(storedContentJSON);
                if (cachedContent.length === originalList.length) {
                    return cachedContent;
                }
            } catch (e) {
                console.error(`Erro ao ler cache JSON para ${cacheKey}. Gerando novo.`, e);
            }
        }

        const newShuffledList = [...originalList];

        for (let i = newShuffledList.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [newShuffledList[i], newShuffledList[j]] = [newShuffledList[j], newShuffledList[i]];
        }

        try {
            localStorage.setItem(finalCacheKey, JSON.stringify(newShuffledList));
            localStorage.setItem(finalTimestampKey, now.toString());
        } catch (e) {
            console.error(`Erro ao salvar cache no localStorage para ${cacheKey}:`, e);
        }

        return newShuffledList;
    }

    function createContentCard(item) {
        if (!item) return '';

        const posterPath = (item.poster && item.poster.startsWith('http')) ? item.poster : FALLBACK_IMAGE;

        const progressBarHTML = item.progressPercent
            ? `<div class="cw-progress-track"><div class="cw-progress-fill" style="width: ${item.progressPercent}%"></div></div>`
            : '';

        const episodeInfoHTML = item.episodeInfo
            ? `<div class="absolute bottom-2 left-2 right-2 text-[10px] font-bold text-white bg-black/60 px-2 py-1 rounded backdrop-blur-sm truncate z-10">${item.episodeInfo}</div>`
            : '';

        return `
        <a href="#details/${item.docId}" class="carousel-item w-36 sm:w-48 cursor-pointer group block flex-shrink-0 relative">
            <div class="liquid-glass-card aspect-[2/3] bg-stone-800 overflow-hidden">
                 <div class="glass-filter"></div>
                 <div class="glass-distortion-overlay"></div>
                 <div class="glass-overlay" style="--bg-color: rgba(0,0,0,0.1);"></div>
                 <div class="glass-specular"></div>
                 <div class="glass-content p-0 h-full">
                     <img src="${posterPath}" alt="Pôster de ${item.title}" loading="lazy" class="w-full h-full object-cover rounded-[inherit]">
                     ${episodeInfoHTML}
                 </div>
                 ${progressBarHTML}
            </div>
        </a>`;
    };

    function createGridCard(item) {
        if (!item) return '';

        const posterPath = (item.poster && item.poster.startsWith('http')) ? item.poster : FALLBACK_IMAGE;

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
            document.getElementById('hero-overview').textContent = item.synopsis.length > 200 ? item.synopsis.substring(0, 200) + '...' : item.synopsis;
            const releaseYear = item.year;

            const metaContainer = document.getElementById('hero-meta');
            metaContainer.innerHTML = ``;
            await displayContentRating(item, metaContainer);
            metaContainer.innerHTML += `<span>${releaseYear}</span>`;

            await updateListButton(document.getElementById('hero-add-to-list'), item);
            
            const detailsBtn = document.getElementById('hero-details-btn');
            if (detailsBtn) {
                if (detailsBtn.clickHandler) {
                    detailsBtn.removeEventListener('click', detailsBtn.clickHandler);
                }
                detailsBtn.clickHandler = () => {
                    if (currentHeroItem && currentHeroItem.docId) {
                        window.location.hash = `#details/${currentHeroItem.docId}`;
                    }
                };
                detailsBtn.addEventListener('click', detailsBtn.clickHandler);

                const icon = detailsBtn.querySelector('i[data-lucide]');
                if (icon) {
                    lucide.createIcons({ nodes: [icon] });
                }
            }

            mainBackground.style.opacity = 1;
            heroContentWrapper.style.opacity = 1;
            heroContentWrapper.classList.remove('hero-fade-out');
        }, 500);
    }

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

    async function populateMyList() {
        const list = await getMyList();
        const container = document.getElementById('my-list-grid');
        if (!container) return;
        container.innerHTML = list.length === 0
            ? '<p class="col-span-full text-center text-gray-400">Sua lista está vazia.</p>'
            : list.map(item => createGridCard(item)).join('');
        attachGlassButtonListeners();
    }

    let unsubContent = null;
    let unsubFeatured = null;

    async function listenToFirestoreContent() {
        if (unsubContent) unsubContent();
        if (unsubFeatured) unsubFeatured();

        // Faz a leitura da sua base de dados no Firebase.
        // Utiliza a variável CONTENT_COLLECTION que definimos lá no topo (padrão: 'content')
        unsubContent = onSnapshot(collection(db, CONTENT_COLLECTION), (snapshot) => {
            firestoreContent = [];
            snapshot.forEach(doc => {
                firestoreContent.push({ docId: doc.id, ...doc.data() });
            });
            handleNavigation();
        });

        unsubFeatured = onSnapshot(doc(db, 'config', 'featured'), (docSnap) => {
            featuredItemIds = docSnap.exists() ? (docSnap.data().items || []) : [];
            handleNavigation();
        });
    }

    async function checkFulfilledRequests() {
        if (!userId) return;

        if (document.querySelector('.req-modal-active')) return;

        const q = query(collection(db, "pedidos"), where("status", "==", "completed"));
        const snapshot = await getDocs(q);

        let foundOne = false;

        snapshot.forEach(docSnap => {
            if (foundOne) return;

            const req = docSnap.data();
            const userRequestObj = req.requesters ? req.requesters.find(r => r.userId === userId) : null;

            if (userRequestObj) {
                foundOne = true;

                const modal = document.createElement('div');
                modal.className = 'req-modal-active fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/95 animate-fade-in transition-all duration-200';

                const poster = req.posterUrl || 'https://placehold.co/300x450?text=IMG';

                modal.innerHTML = `
                    <div class="relative w-full max-w-xl bg-[#0f0f0f] border border-white/10 rounded-2xl shadow-2xl overflow-hidden transform transition-all scale-100">
                        <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-600 to-pink-600"></div>
                        <div class="p-6 md:p-8 flex flex-col md:flex-row gap-6 items-start">
                            <div class="w-full md:w-32 flex-shrink-0">
                                <img src="${poster}" class="w-full rounded-lg shadow-lg border border-white/5 aspect-[2/3] object-cover bg-stone-800">
                            </div>
                            <div class="flex-1 w-full">
                                <div class="flex items-center gap-2 mb-2">
                                    <div class="bg-purple-500/10 text-purple-400 p-1.5 rounded-md">
                                        <i data-lucide="bell" class="w-4 h-4"></i>
                                    </div>
                                    <span class="text-xs font-bold text-stone-400 uppercase tracking-wider">Pedido Atendido</span>
                                </div>
                                <h2 class="text-2xl font-bold text-white leading-tight mb-2">
                                    ${req.title}
                                </h2>
                                <p class="text-stone-400 text-sm mb-6 leading-relaxed">
                                    Este conteúdo já foi adicionado ao catálogo e está pronto para assistir.
                                </p>
                                <div class="flex flex-col gap-3">
                                    <a href="#details/${req.contentId}" class="action-watch-btn w-full py-3 px-4 rounded-lg bg-stone-100 hover:bg-white text-black font-bold text-sm flex items-center justify-center gap-2 transition-colors">
                                        <i data-lucide="play" class="w-4 h-4 fill-current"></i>
                                        Assistir Agora
                                    </a>
                                    <button class="dismiss-req-btn w-full py-3 px-4 rounded-lg bg-transparent border border-white/10 hover:bg-white/5 text-stone-400 hover:text-white font-medium text-sm transition-colors">
                                        Fechar
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                `;

                const dismiss = async () => {
                    modal.style.pointerEvents = 'none';
                    modal.classList.remove('animate-fade-in');
                    modal.classList.add('opacity-0', 'scale-95');
                    setTimeout(() => modal.remove(), 200);

                    try {
                        const currentRequesters = req.requesters || [];
                        const updatedRequesters = currentRequesters.filter(r => r.userId !== userId);
                        await updateDoc(doc(db, 'pedidos', docSnap.id), {
                            requesters: updatedRequesters
                        });
                    } catch (e) { console.error("Erro ao dispensar:", e); }
                };

                modal.querySelector('.dismiss-req-btn').addEventListener('click', dismiss);
                modal.querySelector('.action-watch-btn').addEventListener('click', () => {
                    dismiss();
                });

                document.body.appendChild(modal);
            }
        });

        setTimeout(() => {
            lucide.createIcons();
        }, 100);
    }

    async function populateAllViews() {
        const carouselsContainer = document.getElementById('home-carousels-container');
        if (!carouselsContainer) return;
        carouselsContainer.innerHTML = '';

        if (userId && currentProfile) {
            if (typeof checkFulfilledRequests === 'function') {
                checkFulfilledRequests();
            }
        }

        if (userId && currentProfile) {
            try {
                const progressRef = collection(db, 'users', userId, 'profiles', currentProfile.id, 'watch-progress');
                const snapshot = await getDocs(progressRef);

                const moviesList = [];
                const seriesMap = {};

                snapshot.forEach(doc => {
                    const data = doc.data();
                    const percent = (data.currentTime / data.duration) * 100;

                    if (percent > 1 && percent < 95 && data.item) {
                        if (data.item.type === 'movie') {
                            moviesList.push({ ...data, progressPercent: percent });
                        }
                        else if (data.item.type === 'tv') {
                            const seriesId = data.item.docId || data.item.id;
                            if (!seriesMap[seriesId] || data.lastWatched > seriesMap[seriesId].lastWatched) {
                                seriesMap[seriesId] = { ...data, progressPercent: percent };
                            }
                        }
                    }
                });

                const continueWatchingItems = [...moviesList, ...Object.values(seriesMap)];
                continueWatchingItems.sort((a, b) => b.lastWatched - a.lastWatched);

                if (continueWatchingItems.length > 0) {
                    const section = document.createElement('section');
                    section.innerHTML = `
                        <div class="liquid-glass-card inline-block mb-6 rounded-full" style="--bg-color: rgba(30,30,30,0.3);">
                             <div class="glass-filter"></div><div class="glass-overlay"></div><div class="glass-specular"></div>
                             <h2 class="glass-content text-xl sm:text-2xl font-bold text-white px-6 py-2 flex items-center gap-2">
                                <i data-lucide="play-circle" class="w-6 h-6 text-purple-500"></i> Continuar Assistindo
                             </h2>
                        </div>
                        <div class="carousel-container relative">
                            <div class="carousel space-x-4 px-4 sm:px-6 lg:px-8 py-4 overflow-x-auto hide-scrollbar scroll-smooth" id="cw-carousel-track"></div>
                        </div>`;

                    const track = section.querySelector('#cw-carousel-track');

                    continueWatchingItems.forEach(data => {
                        const item = data.item;

                        let displayImage = item.poster;
                        if (item.type === 'tv' && data.episode && data.episode.still_path) {
                            if (data.episode.still_path.startsWith('http')) { displayImage = data.episode.still_path; }
                            else { displayImage = `https://image.tmdb.org/t/p/w500${data.episode.still_path}`; }
                        } else if (item.type === 'movie' && item.backdrop) { displayImage = item.backdrop; }

                        if (!displayImage || displayImage.includes('null')) {
                            displayImage = `https://placehold.co/400x225/1c1917/FFFFFF?text=${item.title || 'Sem Imagem'}`;
                        }

                        const epInfo = data.episode
                            ? `<div class="absolute top-2 right-2 text-[10px] font-bold text-white bg-gradient-to-r from-purple-600 to-pink-600 px-2 py-1 rounded backdrop-blur-md shadow-lg z-20 border border-white/10">T${data.episode.season_number} E${data.episode.episode_number}</div>`
                            : '';

                        const card = document.createElement('div');
                        card.className = 'carousel-item w-60 sm:w-72 cursor-pointer group block flex-shrink-0 relative cw-card-trigger';
                        card.playerData = data;

                        card.innerHTML = `
                            <div class="liquid-glass-card aspect-video bg-stone-800 overflow-hidden relative transition-transform duration-300 group-hover:scale-105 border border-white/5">
                                 <div class="glass-filter"></div><div class="glass-overlay" style="--bg-color: rgba(0,0,0,0.2);"></div><div class="glass-specular"></div>
                                 
                                 <div class="glass-content p-0 h-full relative">
                                     <img src="${displayImage}" alt="${item.title}" loading="lazy" class="w-full h-full object-cover rounded-[inherit]">
                                     
                                     <div class="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10">
                                         <div class="bg-white/10 backdrop-blur-md p-3 rounded-full border border-white/30 shadow-xl transform scale-0 group-hover:scale-100 transition-transform duration-300 hover:bg-purple-500/20">
                                             <i data-lucide="play" class="w-8 h-8 text-white fill-white ml-1"></i>
                                         </div>
                                     </div>
                                     ${epInfo}
                                 </div>
                                 
                                 <div style="position: absolute; bottom: 0; left: 0; right: 0; height: 4px; background: rgba(0,0,0,0.8); z-index: 20;">
                                    <div style="height: 100%; width: ${data.progressPercent}%; background: linear-gradient(90deg, #a855f7, #ec4899); box-shadow: 0 0 10px rgba(168, 85, 247, 0.8);"></div>
                                 </div>
                            </div>
                            <div class="mt-2 px-1">
                                <h4 class="text-sm font-bold text-white truncate group-hover:text-purple-400 transition-colors">${item.title || item.name}</h4>
                                ${data.episode ? `<p class="text-xs text-stone-400 truncate">${data.episode.title || 'Episódio ' + data.episode.episode_number}</p>` : ''}
                            </div>
                        `;
                        track.appendChild(card);
                    });

                    track.addEventListener('click', (e) => {
                        const card = e.target.closest('.cw-card-trigger');
                        if (card && card.playerData) {
                            e.preventDefault(); e.stopPropagation();
                            const data = card.playerData;
                            const item = data.item;
                            let context = {};

                            if (item.type === 'movie') {
                                context = { videoUrl: item.url, title: item.title || item.name, itemData: item, startTime: data.currentTime };
                            } else if (item.type === 'tv' && data.episode) {
                                let allEpisodes = [];
                                if (item.seasons && item.seasons[data.episode.season_number]) {
                                    allEpisodes = item.seasons[data.episode.season_number].episodes;
                                } else { allEpisodes = [data.episode]; }
                                const epIndex = allEpisodes.findIndex(ep => ep.episode_number === data.episode.episode_number);
                                const safeIndex = epIndex >= 0 ? epIndex : 0;
                                const epTitle = data.episode.title ? ` - ${data.episode.title}` : '';

                                context = {
                                    videoUrl: data.episode.url,
                                    title: `${item.title || item.name} - T${data.episode.season_number} E${data.episode.episode_number}${epTitle}`,
                                    itemData: item, episodes: allEpisodes, currentIndex: safeIndex, startTime: data.currentTime
                                };
                            }
                            showPlayer(context);
                        }
                    });
                    carouselsContainer.appendChild(section);
                }
            } catch (error) { console.error("Erro ao carregar Continuar Assistindo:", error); }
        }

        const allSeries = firestoreContent.filter(item => item.type === 'tv' && item.seasons);
        const latestEpisodesList = [];

        allSeries.forEach(serie => {
            const seasonKeys = Object.keys(serie.seasons).map(k => parseInt(k)).sort((a, b) => b - a);

            if (seasonKeys.length > 0) {
                const lastSeasonKey = seasonKeys[0];
                const season = serie.seasons[lastSeasonKey];

                if (season && season.episodes && season.episodes.length > 0) {
                    const lastEpisode = season.episodes[season.episodes.length - 1];

                    let sortDate = 0;

                    if (lastEpisode.air_date) {
                        sortDate = new Date(lastEpisode.air_date).getTime();
                    }
                    else if (serie.last_air_date) {
                        sortDate = new Date(serie.last_air_date).getTime();
                    }
                    else if (serie.updatedAt) {
                        sortDate = serie.updatedAt.toMillis ? serie.updatedAt.toMillis() : 0;
                    }
                    else {
                        sortDate = (serie.addedAt?.toMillis() || 0);
                    }

                    latestEpisodesList.push({
                        serieData: serie,
                        seasonNum: lastSeasonKey,
                        episodeData: lastEpisode,
                        sortDate: sortDate
                    });
                }
            }
        });

        latestEpisodesList.sort((a, b) => b.sortDate - a.sortDate);

        const topLatestEpisodes = latestEpisodesList.slice(0, 15);

        if (topLatestEpisodes.length > 0) {
            const section = document.createElement('section');
            section.innerHTML = `
                <div class="liquid-glass-card inline-block mb-6 rounded-full" style="--bg-color: rgba(30,30,30,0.3);">
                     <div class="glass-filter"></div><div class="glass-overlay"></div><div class="glass-specular"></div>
                     <h2 class="glass-content text-xl sm:text-2xl font-bold text-white px-6 py-2 flex items-center gap-2">
                        <i data-lucide="zap" class="w-6 h-6 text-yellow-400"></i> Últimos Episódios
                     </h2>
                </div>
                <div class="carousel-container relative">
                    <div class="carousel space-x-4 px-4 sm:px-6 lg:px-8 py-4 overflow-x-auto hide-scrollbar scroll-smooth" id="latest-ep-track"></div>
                </div>`;

            const track = section.querySelector('#latest-ep-track');

            topLatestEpisodes.forEach(data => {
                const ep = data.episodeData;
                const serie = data.serieData;

                let imagePath = ep.still_path
                    ? (ep.still_path.startsWith('http') ? ep.still_path : `https://image.tmdb.org/t/p/w500${ep.still_path}`)
                    : (serie.backdrop || serie.poster || 'https://files.catbox.moe/sytt0s.gif');

                const epTitle = ep.title || `Episódio ${ep.episode_number}`;
                const serieTitle = serie.title || serie.name;

                const card = document.createElement('div');
                card.className = 'carousel-item w-60 sm:w-72 cursor-pointer group block flex-shrink-0 relative latest-ep-trigger';

                card.playerContext = {
                    videoUrl: ep.url,
                    title: `${serieTitle} - T${data.seasonNum} E${ep.episode_number} - ${epTitle}`,
                    itemData: serie,
                    episodes: serie.seasons[data.seasonNum].episodes,
                    currentIndex: serie.seasons[data.seasonNum].episodes.findIndex(e => e.episode_number === ep.episode_number)
                };

                card.innerHTML = `
                    <div class="liquid-glass-card aspect-video bg-stone-800 overflow-hidden relative transition-transform duration-300 group-hover:scale-105 border border-white/5">
                         <div class="glass-filter"></div><div class="glass-overlay" style="--bg-color: rgba(0,0,0,0.2);"></div><div class="glass-specular"></div>
                         
                         <div class="glass-content p-0 h-full relative">
                             <img src="${imagePath}" alt="${serieTitle}" loading="lazy" class="w-full h-full object-cover rounded-[inherit]">
                             
                             <div class="absolute top-2 right-2 text-[10px] font-bold text-white bg-black/60 px-2 py-1 rounded backdrop-blur-md border border-white/10 shadow-lg z-20">
                                T${data.seasonNum} E${ep.episode_number}
                             </div>

                             <div class="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10">
                                 <div class="bg-white/10 backdrop-blur-md p-3 rounded-full border border-white/30 hover:bg-purple-500/20 transition-colors">
                                     <i data-lucide="play" class="w-8 h-8 text-white fill-white ml-1"></i>
                                 </div>
                             </div>
                         </div>
                    </div>
                    <div class="mt-2 px-1">
                        <h4 class="text-sm font-bold text-white truncate group-hover:text-yellow-400 transition-colors">${serieTitle}</h4>
                        <p class="text-xs text-stone-400 truncate flex justify-between">
                            <span>${epTitle}</span>
                            ${ep.air_date ? `<span class="text-stone-500 text-[10px]">${new Date(ep.air_date).toLocaleDateString('pt-BR')}</span>` : ''}
                        </p>
                    </div>
                `;
                track.appendChild(card);
            });

            track.addEventListener('click', (e) => {
                const card = e.target.closest('.latest-ep-trigger');
                if (card && card.playerContext) {
                    e.preventDefault(); e.stopPropagation();
                    showPlayer(card.playerContext);
                }
            });

            carouselsContainer.appendChild(section);
        }

        const recentlyAdded = [...firestoreContent].sort((a, b) => (b.addedAt?.toMillis() || 0) - (a.addedAt?.toMillis() || 0)).slice(0, 20);
        createCarousel(carouselsContainer, "Adicionado Recentemente", recentlyAdded);

        const allGenres = [...new Set(firestoreContent.flatMap(item => item.genres || []))];
        for (const genre of allGenres) {
            const originalGenreList = firestoreContent.filter(item => item.genres && item.genres.includes(genre));
            const shuffledGenreList = getDailyShuffledList(originalGenreList, genre);
            if (shuffledGenreList.length > 0) {
                createCarousel(carouselsContainer, genre, shuffledGenreList);
            }
        }
        attachGlassButtonListeners();
        lucide.createIcons();
    }

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

    function renderScreenContent(screenId, forceReload = false) {
        const screenElement = document.getElementById(screenId);
        if (!screenElement) return;

        if (screenId === 'home-view') {
            const featuredItems = featuredItemIds.map(id => firestoreContent.find(item => item.docId === id)).filter(Boolean);
            if (featuredItems.length > 0) {
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
        } else if (screenId === 'report-view') {
            lucide.createIcons();
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
        const finalImageUrl = (backgroundUrl && backgroundUrl.startsWith('http')) ? backgroundUrl : 'https://placehold.co/1280x720/0c0a09/ffffff?text=Mango+Anime';

        const posterUrl = (data.poster && data.poster.startsWith('http')) ? data.poster : 'https://files.catbox.moe/sytt0s.gif';

        detailsView.innerHTML = `
            <div class="fixed inset-0 z-[-1] bg-cover bg-center bg-no-repeat" style="background-image: url('${finalImageUrl}');">
                 <div class="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
                 <div class="absolute inset-0 details-gradient-overlay"></div>
            </div>

            <div class="relative w-full overflow-x-hidden">
                <button id="back-from-details" class="fixed top-6 left-6 z-20 bg-black/20 backdrop-blur-sm rounded-full p-2 hover:bg-black/40 transition-colors" aria-label="Voltar">
                    <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
                </button>

                <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 min-h-screen flex items-center pt-24 pb-12">
                    <div class="flex flex-col md:flex-row items-center md:items-start gap-8 lg:gap-12 w-full">
                        <div class="flex-shrink-0 w-48 sm:w-56 md:w-64 mx-auto md:mx-0">
                            <img src="${posterUrl}" alt="${title}" class="rounded-lg shadow-2xl w-full aspect-[2/3] object-cover bg-stone-800">
                        </div>
                        <div class="flex-1 mt-6 md:mt-0 text-center md:text-left w-full"> <h1 class="text-3xl md:text-5xl lg:text-6xl font-black text-white break-words" style="text-shadow: 2px 2px 8px rgba(0,0,0,0.7);">${title}</h1>
                            
                            <div id="details-meta" class="flex items-center justify-center md:justify-start flex-wrap gap-x-4 gap-y-2 mt-4 text-base text-stone-300">
                                </div>
                            <div class="mt-4 flex flex-wrap gap-2 justify-center md:justify-start">${genres}</div>
                            
                            <div class="mt-8 flex flex-wrap gap-4 justify-center md:justify-start">
                                <button id="details-watch-btn" class="glass-container glass-button rounded-full text-base sm:text-lg px-7 py-2.5 sm:px-8 sm:py-3"><div class="glass-filter"></div><div class="glass-overlay"></div><div class="glass-specular"></div><div class="glass-content flex items-center gap-2"><svg class="w-5 h-5 sm:w-6 sm:h-6" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"></path></svg>Assistir</div></button>
                                
                                <button id="details-add-to-list" class="glass-container glass-button rounded-full text-base sm:text-lg px-7 py-2.5 sm:px-8 sm:py-3"><div class="glass-filter"></div><div class="glass-overlay"></div><div class="glass-specular"></div><div class="glass-content flex items-center gap-2"></div></button>

                                <button id="details-report-btn" class="glass-container glass-button rounded-full text-base sm:text-lg px-7 py-2.5 sm:px-8 sm:py-3" style="--glass-highlight: rgba(239, 68, 68, 0.3);">
                                    <div class="glass-filter"></div><div class="glass-overlay"></div><div class="glass-specular"></div>
                                    <div class="glass-content flex items-center gap-2 text-red-400 hover:text-red-300 transition-colors">
                                        <i data-lucide="flag" class="w-5 h-5"></i>
                                        Reportar
                                    </div>
                                </button>
                            </div>
                            
                            <h3 class="mt-8 text-lg sm:text-xl font-semibold text-white">Sinopse</h3>
                            
                            <p class="mt-2 text-gray-300 max-w-2xl text-sm leading-relaxed break-words text-justify md:text-left mx-auto md:mx-0">${data.synopsis || data.overview || 'Sinopse não disponível.'}</p>
                            
                            <div id="tv-content-details" class="mt-10 w-full"></div> </div>
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

        const reportBtn = document.getElementById('details-report-btn');
        if (reportBtn) {
            reportBtn.addEventListener('click', () => {
                const contentName = title;
                window.location.hash = '#report-view';

                setTimeout(() => {
                    const reportInput = document.getElementById('report-content-name');
                    const reportDesc = document.getElementById('report-desc');
                    if (reportInput) {
                        reportInput.value = contentName;
                        reportInput.focus();
                    }
                    if (reportDesc) reportDesc.value = '';
                }, 100);
            });
            lucide.createIcons({ nodes: [reportBtn.querySelector('i')] });
        }

        document.getElementById('details-watch-btn').addEventListener('click', () => {
            if (data.type === 'movie') {
                showPlayer({ videoUrl: data.url, title: title, itemData: data });
            } else if (data.type === 'tv' && data.seasons) {
                const firstSeasonKey = Object.keys(data.seasons).sort((a, b) => parseInt(a) - parseInt(b))[0];
                const firstEpisode = data.seasons[firstSeasonKey]?.episodes?.[0];

                if (firstEpisode) {
                    const allEpisodesOfSeason = data.seasons[firstSeasonKey].episodes;
                    const epTitle = firstEpisode.title ? ` - ${firstEpisode.title}` : '';

                    const context = {
                        videoUrl: firstEpisode.url,
                        title: `${title} - T${firstSeasonKey} E${firstEpisode.episode_number || 1}${epTitle}`,
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

    function renderTvDetails(data) {
        const container = document.getElementById('tv-content-details');
        if (!container) return;

        const seasonKeys = Object.keys(data.seasons).sort((a, b) => parseInt(a) - parseInt(b));
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

                const stillPath = ep.still_path
                    ? (ep.still_path.startsWith('/') ? `https://image.tmdb.org/t/p/w300${ep.still_path}` : ep.still_path)
                    : 'https://files.catbox.moe/sytt0s.gif';

                const isComingSoon = !ep.url || ep.isComingSoon === true;
                const opacityClass = isComingSoon ? 'opacity-60' : '';
                const cursorClass = isComingSoon ? 'cursor-not-allowed' : 'cursor-pointer group';

                const overlayHTML = isComingSoon
                    ? `<div class="absolute inset-0 bg-black/50 flex items-center justify-center rounded-md border border-white/10">
                         <span class="text-[10px] font-bold text-white bg-stone-800 px-2 py-1 rounded tracking-wider">EM BREVE</span>
                       </div>`
                    : `<div class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                         <i data-lucide="play-circle" class="w-8 h-8 text-white"></i>
                       </div>`;

                const textBadge = isComingSoon
                    ? `<span class="ml-2 text-[10px] text-stone-400 border border-stone-600 px-1.5 py-0.5 rounded">Em Breve</span>`
                    : '';

                return `
                    <div class="episode-item glass-container glass-button rounded-lg overflow-hidden ${cursorClass} ${opacityClass}" data-index="${index}" data-season="${seasonKey}" data-coming-soon="${isComingSoon}">
                        <div class="glass-filter"></div>
                        <div class="glass-overlay" style="--glass-bg-color: rgba(25, 25, 25, 0.3);"></div>
                        <div class="glass-specular"></div>
                        <div class="glass-content flex items-start p-3 gap-4">
                            <div class="relative flex-shrink-0 w-32 sm:w-40 aspect-video">
                                <img src="${stillPath}" alt="Cena do episódio" class="w-full h-full rounded-md object-cover">
                                ${overlayHTML}
                            </div>
                            <div class="flex-1 min-w-0">
                                <h4 class="font-semibold text-white truncate flex items-center flex-wrap">
                                    ${index + 1}. ${epTitle}
                                    ${textBadge}
                                </h4>
                                <p class="text-xs text-stone-300 mt-1 max-h-16 overflow-hidden line-clamp-3">${epOverview}</p> 
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
                const isComingSoon = episodeItem.getAttribute('data-coming-soon') === 'true';

                if (isComingSoon) {
                    showToast("Este episódio estará disponível em breve!", true);
                    return;
                }

                const seasonKey = episodeItem.dataset.season;
                const episodeIndex = parseInt(episodeItem.dataset.index, 10);
                const allEpisodesOfSeason = data.seasons[seasonKey].episodes;
                const episode = allEpisodesOfSeason[episodeIndex];

                const epTitle = episode.title ? ` - ${episode.title}` : '';

                const context = {
                    videoUrl: episode.url,
                    title: `${data.title || data.name} - T${seasonKey} E${episode.episode_number || episodeIndex + 1}${epTitle}`,
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
    function attachGlassButtonListeners() { document.querySelectorAll('.glass-button, .liquid-glass-card, .player-control-btn, .glass-container[style*="--bg-color"], .glass-form, .news-card, .comment-card, .reply-card').forEach(element => { if (!element.hasGlassListener) { element.addEventListener('mousemove', handleMouseMove); element.addEventListener('mouseleave', handleMouseLeave); element.hasGlassListener = true; } }); }
    function updateMobileNavIndicator() { const indicator = document.getElementById('mobile-nav-indicator'); const activeItem = document.querySelector('#mobile-nav .mobile-nav-item.active'); if (indicator && activeItem) { const left = activeItem.offsetLeft; const width = activeItem.offsetWidth; indicator.style.width = `${width}px`; indicator.style.transform = `translateX(${left}px)`; } }
    function toggleSearchOverlay(show) { if (show) { searchOverlay.classList.remove('hidden'); searchInput.focus(); document.body.style.overflow = 'hidden'; } else { searchOverlay.classList.add('hidden'); searchInput.value = ''; searchResultsContainer.innerHTML = ''; document.body.style.overflow = 'auto'; } }

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


    async function showPlayer(context) {
        hidePlayer(false, true);
        await new Promise(resolve => setTimeout(resolve, 50));

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
                if (videoSrc) {
                    urlToLoad = videoSrc;
                }
            }
        } catch (e) {}

        if (Hls.isSupported() && urlToLoad.includes('.m3u8')) {
            hls = new Hls({
                maxBufferLength: 30,
                maxBufferSize: 60 * 1000 * 1000,
                startLevel: -1
            });
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

        if (context.episodes && context.episodes.length > 1) {
            nextEpisodeBtn.classList.remove('hidden');
            prevEpisodeBtn.classList.remove('hidden');
        } else {
            nextEpisodeBtn.classList.add('hidden');
            prevEpisodeBtn.classList.add('hidden');
        }

        attachGlassButtonListeners();
    }

    async function hidePlayer(updateHistory = true, isChangingEpisode = false) {
        if (updateHistory && currentPlayerContext.key) {
            await savePlayerProgress();
        }

        videoPlayer.pause();

        if (hls) {
            hls.destroy();
            hls = null;
        }
        videoPlayer.removeAttribute('src');
        videoPlayer.load();

        playerView.classList.add('hidden');
        playerLoadingOverlay.classList.add('hidden');
        document.body.style.overflow = 'auto';
        currentPlayerContext = {};

        if (!isChangingEpisode) {
            if (document.fullscreenElement) {
                document.exitFullscreen().catch(err => console.error("Erro ao sair da tela cheia:", err));
            }
            if (screen.orientation && typeof screen.orientation.unlock === 'function') {
                screen.orientation.unlock();
            }
        }

        videoPlayer.style.objectFit = 'contain';
        currentAspectRatio = 'contain';
        if (aspectRatioBtn) aspectRatioBtn.querySelector('.glass-content').innerHTML = ICONS.aspectContain;
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
            videoPlayer.play().catch(error => {
                if (error.name !== 'AbortError') { console.error("Video play error:", error); }
            });
        } else {
            videoPlayer.pause();
        }
    }

    function handleMobilePlayerClick() {
        clearTimeout(controlsTimeout);
        playerView.classList.add('controls-active');

        if (!videoPlayer.paused) {
            controlsTimeout = setTimeout(() => {
                playerView.classList.remove('controls-active');
            }, 3000);
        }
    }

    function handlePlayerClick() {
        clearTimeout(controlsTimeout);

        if (!playerView.classList.contains('controls-active')) {
            playerView.classList.add('controls-active');
        } else {
            togglePlay();
        }

        if (!videoPlayer.paused) {
            controlsTimeout = setTimeout(() => {
                playerView.classList.remove('controls-active');
            }, 3000);
        }
    }

    function addPlayerEventListeners() {
        const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        if (isTouchDevice) {
            videoPlayer.removeEventListener('click', handlePlayerClick);
            videoPlayer.removeEventListener('click', handleMobilePlayerClick);
            videoPlayer.addEventListener('click', handleMobilePlayerClick);
        } else {
            videoPlayer.removeEventListener('click', handleMobilePlayerClick);
            videoPlayer.removeEventListener('click', handlePlayerClick);
            videoPlayer.addEventListener('click', handlePlayerClick);
        }

        videoPlayer.addEventListener('playing', () => {
            if (playerLoadingOverlay) {
                playerLoadingOverlay.classList.add('hidden');
            }
        });

        videoPlayer.addEventListener('waiting', () => {
            if (playerLoadingOverlay) {
                playerLoadingOverlay.classList.remove('hidden');
            }
        });

        videoPlayer.addEventListener('play', () => {
            playPauseBtn.querySelector('.glass-content').innerHTML = ICONS.pause;
            clearTimeout(controlsTimeout);
            if (playerView.classList.contains('controls-active')) {
                controlsTimeout = setTimeout(() => {
                    playerView.classList.remove('controls-active');
                }, 3000);
            }
        });
        videoPlayer.addEventListener('pause', () => {
            playPauseBtn.querySelector('.glass-content').innerHTML = ICONS.play;
            clearTimeout(controlsTimeout);
            if (!videoPlayer.ended) {
                playerView.classList.add('controls-active');
            }
        });

        videoPlayer.addEventListener('ended', () => {
            if (currentPlayerContext.episodes && currentPlayerContext.currentIndex < currentPlayerContext.episodes.length - 1) {
                changeEpisode(1);
            } else {
                playPauseBtn.querySelector('.glass-content').innerHTML = ICONS.play;
                playerView.classList.add('controls-active');
                clearTimeout(controlsTimeout);
            }
        });

        videoPlayer.addEventListener('timeupdate', () => {
            if (isNaN(videoPlayer.currentTime)) return;
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
        });

        videoPlayer.addEventListener('loadedmetadata', () => {
            if (isNaN(videoPlayer.duration)) return;
            seekBar.max = videoPlayer.duration;
            durationEl.textContent = formatTime(videoPlayer.duration);
        });

        videoPlayer.addEventListener('volumechange', () => {
            volumeSlider.value = videoPlayer.volume;
            volumeBtn.querySelector('.glass-content').innerHTML = (videoPlayer.muted || videoPlayer.volume === 0) ? ICONS.volumeMute : ICONS.volumeHigh;
        });
    }

    seekBar.addEventListener('input', () => { videoPlayer.currentTime = seekBar.value; });
    volumeSlider.addEventListener('input', (e) => { videoPlayer.volume = e.target.value; videoPlayer.muted = e.target.value == 0; });
    volumeBtn.addEventListener('click', () => { videoPlayer.muted = !videoPlayer.muted; });
    rewindBtn.addEventListener('click', () => { videoPlayer.currentTime -= 10; });
    forwardBtn.addEventListener('click', () => { videoPlayer.currentTime += 10; });

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

    function changeEpisode(direction) {
        if (!currentPlayerContext.episodes) return;
        const newIndex = currentPlayerContext.currentIndex + direction;
        if (newIndex >= 0 && newIndex < currentPlayerContext.episodes.length) {
            const episode = currentPlayerContext.episodes[newIndex];
            const epTitle = episode.title ? ` - ${episode.title}` : '';

            const newContext = {
                ...currentPlayerContext,
                currentIndex: newIndex,
                title: `${currentPlayerContext.itemData.title || currentPlayerContext.itemData.name} - T${episode.season_number} E${episode.episode_number}${epTitle}`,
                videoUrl: episode.url
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
            history.back();
        }
    });

    playPauseBtn.addEventListener('click', togglePlay);
    playerBackBtn.addEventListener('click', () => history.back());

    playerView.addEventListener('mousemove', () => {
        if (window.innerWidth >= 768) {
            playerView.classList.add('controls-active');
            clearTimeout(controlsTimeout);
            if (!videoPlayer.paused) {
                controlsTimeout = setTimeout(() => {
                    playerView.classList.remove('controls-active');
                }, 3000);
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

    function createSettingsOptions() {
        const speedContainer = document.getElementById('settings-speed-options');
        const qualityContainer = document.getElementById('settings-quality-options');
        if (speedContainer.childElementCount > 1) return;

        const speeds = [0.5, 1, 1.5, 2];
        speeds.forEach(speed => {
            const button = document.createElement('button');
            button.className = 'settings-option-btn';
            button.textContent = `${speed}x`;
            if (speed === 1) button.classList.add('active');
            button.onclick = () => {
                videoPlayer.playbackRate = speed;
                speedContainer.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
            };
            speedContainer.appendChild(button);
        });

        const qualities = ["Auto", "1080p", "720p", "480p"];
        qualities.forEach(quality => {
            const button = document.createElement('button');
            button.className = 'settings-option-btn';
            button.textContent = quality;
            if (quality === "Auto") button.classList.add('active');
            button.onclick = () => {
                qualityContainer.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                console.log(`Qualidade definida para ${quality}. (Funcionalidade de troca manual não implementada)`);
            };
            qualityContainer.appendChild(button);
        });
    }

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
        addPlayerEventListeners();
    }

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

    let navDebounceTimer;

    async function handleNavigation() {
        clearTimeout(navDebounceTimer);

        navDebounceTimer = setTimeout(async () => {
            const hash = window.location.hash;

            if (isFirstNavigation) {
                isFirstNavigation = false;
                const currentHash = window.location.hash;
                if (currentHash.startsWith('#details/') || currentHash === '#player') {
                    sessionStorage.setItem('landedOnDetails', 'true');
                } else {
                    sessionStorage.setItem('landedOnDetails', 'false');
                }
            }

            if (sessionStorage.getItem('landedOnDetails') === 'true' && (hash === '' || hash === '#')) {
                sessionStorage.removeItem('landedOnDetails');
                history.replaceState(null, '', '#home-view');
                await handleNavigation();
                return;
            }

            if (!hash.startsWith('#details/') && hash !== '#player' && hash !== '' && hash !== '#') {
                sessionStorage.setItem('landedOnDetails', 'false');
            }

            if (!userId) {
                if (hash !== '#login-view') {
                    history.replaceState(null, '', '#login-view');
                }
                showLoginScreen();
                return;
            }

            if (!currentProfile) {
                const lastProfileId = localStorage.getItem(`starlight-lastProfile-${userId}`);
                let autoSelectedProfile = false;
                if (lastProfileId) {
                    if (!profiles || profiles.length === 0) {
                        await loadProfiles();
                    }
                    const foundProfile = profiles.find(p => p.id === lastProfileId);
                    if (foundProfile) {
                        selectAndEnterProfile(foundProfile);
                        autoSelectedProfile = true;
                        return;
                    }
                }

                if (!autoSelectedProfile) {
                    if (window.location.hash !== '#manage-profile-view') {
                        history.replaceState(null, '', '#manage-profile-view');
                    }
                    showProfileScreen();
                    return;
                }
            }

            if (!searchOverlay.classList.contains('hidden')) {
                toggleSearchOverlay(false);
            }

            if (hash.startsWith('#details/') || hash === '#player') {
                document.querySelector('header').classList.add('hidden');
                document.querySelector('footer').classList.add('hidden');
            } else {
                document.querySelector('header').classList.remove('hidden');
                document.querySelector('footer').classList.remove('hidden');
            }

            if (!hash.startsWith('#details/')) {
                detailsView.classList.add('hidden');
            }
            if (hash !== '#player') {
                if (!playerView.classList.contains('hidden')) {
                    hidePlayer(false, false);
                }
            }

            document.querySelectorAll('#view-container > .content-view').forEach(view => view.classList.add('hidden'));

            if (hash.startsWith('#details/')) {
                const docId = hash.split('/')[1];
                showDetailsView({ docId });
            } else if (hash === '#player') {
                if (playerView.classList.contains('hidden')) {
                    history.back();
                }
            } else {
                const targetId = hash.substring(1) || 'home-view';
                const targetView = document.getElementById(targetId);

                if (targetId !== 'report-view') {
                    const reportInput = document.getElementById('report-content-name');
                    const reportDesc = document.getElementById('report-desc');
                    if (reportInput) reportInput.value = '';
                    if (reportDesc) reportDesc.value = '';
                }

                if (targetView && targetView.classList.contains('content-view')) {
                    targetView.classList.remove('hidden');
                    renderScreenContent(targetId);
                } else {
                    document.getElementById('home-view').classList.remove('hidden');
                    renderScreenContent('home-view');
                    if (window.location.hash !== '#home-view') {
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
            handleHeaderScroll();

        }, 50);
    }

    window.addEventListener('popstate', handleNavigation);

    function listenForNotifications() {
        const q = query(collection(db, "notifications"));
        onSnapshot(q, (snapshot) => {
            notifications = [];
            snapshot.forEach((doc) => {
                notifications.push({ id: doc.id, ...doc.data() });
            });
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

            if (linkType === 'internal' && linkValue) {
                window.location.hash = `#details/${linkValue}`;
            } else if (linkType === 'external' && linkValue) {
                window.open(linkValue, '_blank');
            }
            notificationPanel.classList.remove('animate-fade-in-down');
            notificationPanel.classList.add('animate-fade-out-up');
            setTimeout(() => notificationPanel.classList.add('hidden'), 250);
        }
    });

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
            if (!docSnap.exists()) {
                showToast("Este pedido não existe mais.", true);
                return;
            }

            const requestData = docSnap.data();
            const requesters = requestData.requesters || [];

            const userHasVoted = requesters.some(r => r.userId === userId);

            if (userHasVoted) {
                const newRequesters = requesters.filter(r => r.userId !== userId);

                if (newRequesters.length === 0) {
                    await deleteDoc(docRef);
                    showToast('Pedido excluído (sem votos).');
                } else {
                    await updateDoc(docRef, {
                        requesters: newRequesters
                    });
                    showToast('Voto removido.');
                }

            } else {
                const userVote = { userId: userId, userName: currentProfile.name };
                await updateDoc(docRef, {
                    requesters: arrayUnion(userVote)
                });
                showToast('Obrigado pelo seu voto!');
            }
        } catch (error) {
            console.error("Erro ao processar voto:", error);
            showToast("Ocorreu um erro ao processar seu voto.", true);
        } finally {
            if (voteButton && document.body.contains(voteButton)) {
                voteButton.disabled = false;
            }
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
            const posterPath = (request.posterUrl && request.posterUrl.startsWith('http'))
                ? request.posterUrl
                : 'https://files.catbox.moe/sytt0s.gif';

            const requesterCount = (request.requesters || []).length;
            const userHasVoted = userId && (request.requesters || []).some(r => r.userId === userId);

            return `
                <div class="liquid-glass-card bg-stone-900/50 rounded-lg overflow-hidden flex flex-col p-4 gap-4">
                    <div class="glass-filter"></div>
                    <div class="glass-overlay"></div>
                    <div class="glass-specular"></div>
                    <div class="glass-content w-full flex items-start gap-4">
                        <img src="${posterPath}" alt="${request.title || request.name}" class="w-20 rounded-md aspect-[2/3] object-cover bg-stone-800">
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
    async function loadProfiles() {
        if (!userId) return;
        const profilesCol = collection(db, 'users', userId, 'profiles');
        const snapshot = await getDocs(profilesCol);
        profiles = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderProfiles();
    }

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
                if (isEditMode) {
                    showProfileModal(profile.id);
                } else {
                    selectAndEnterProfile(profile);
                }
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

    async function selectAndEnterProfile(profile) {
        currentProfile = profile;
        userDisplayName = profile.name;

        localStorage.setItem(`starlight-lastProfile-${userId}`, profile.id);

        const avatarImg = new Image();
        avatarImg.src = currentProfile.avatar;
        avatarImg.className = 'w-full h-full object-cover rounded-full';
        headerProfileBtn.innerHTML = '';
        headerProfileBtn.appendChild(avatarImg);

        listenToFirestoreContent();
        listenToRequests();
        listenForNews();

        const currentHash = window.location.hash;
        if (currentHash === '#manage-profile-view' || currentHash === '#login-view' || currentHash === '') {
            window.location.hash = 'home-view';
        }
    }

    async function loadAvatarsFromFirestore() {
        if (avatarsCache && Object.keys(avatarsCache).length > 0) {
            return avatarsCache;
        }

        try {
            const q = query(collection(db, 'avatars'), orderBy('category', 'asc'));
            const snapshot = await getDocs(q);
            const groups = {};

            if (snapshot.empty) {
                groups['Padrão'] = [
                    'https://pbs.twimg.com/media/EcGdw6xXsAMkqGF?format=jpg&name=large',
                    'https://pbs.twimg.com/media/FMs8_KeWYAAtoS3.jpg',
                    'https://acteia.ca/avatars/avatar_174.png'
                ];
            } else {
                snapshot.forEach(doc => {
                    const data = doc.data();
                    const cat = data.category || 'Geral';
                    if (!groups[cat]) groups[cat] = [];
                    groups[cat].push(data.url);
                });
            }
            avatarsCache = groups;
            return groups;
        } catch (error) {
            console.error("Erro ao carregar avatares:", error);
            return {
                'Erro': ['https://placehold.co/100x100?text=Erro']
            };
        }
    }

    async function showProfileModal(profileId = null) {
        const modalTitle = document.getElementById('modal-title');
        const nameInput = document.getElementById('profile-name-input');
        const idInput = document.getElementById('profile-id-input');
        const deleteBtn = document.getElementById('delete-profile-btn');
        const avatarContainer = document.getElementById('avatar-options');

        profileModal.classList.remove('hidden');

        avatarContainer.innerHTML = '<div class="spinner mx-auto my-8"></div>';

        const groupedAvatars = await loadAvatarsFromFirestore();

        avatarContainer.innerHTML = '';

        for (const [category, urls] of Object.entries(groupedAvatars)) {
            const catTitle = document.createElement('h4');
            catTitle.className = 'w-full text-stone-400 text-xs font-bold uppercase tracking-wider mb-3 mt-6 border-b border-white/10 pb-1 first:mt-0';
            catTitle.textContent = category;
            avatarContainer.appendChild(catTitle);

            const grid = document.createElement('div');
            grid.className = 'flex flex-wrap justify-center sm:justify-start gap-4 mb-2';

            grid.innerHTML = urls.map(url => `
                <img src="${url}" class="w-16 h-16 rounded-full cursor-pointer border-2 border-transparent hover:border-white transition-all object-cover hover:scale-110" data-avatar="${url}">
            `).join('');

            avatarContainer.appendChild(grid);
        }

        if (profileId) {
            modalTitle.textContent = 'Editar Perfil';
            const profile = profiles.find(p => p.id === profileId);
            if (profile) {
                nameInput.value = profile.name;
                idInput.value = profile.id;
                deleteBtn.classList.remove('hidden');

                const currentAvatarImg = avatarContainer.querySelector(`img[data-avatar="${profile.avatar}"]`);
                if (currentAvatarImg) currentAvatarImg.classList.add('!border-pink-500', 'ring-2', 'ring-purple-500', 'scale-110', 'shadow-[0_0_15px_rgba(236,72,153,0.5)]');
            }
        } else {
            modalTitle.textContent = 'Adicionar Perfil';
            nameInput.value = '';
            idInput.value = '';
            deleteBtn.classList.add('hidden');
        }
    }
    avatarOptionsContainer.addEventListener('click', e => {
        if (e.target.tagName === 'IMG') {
            avatarOptionsContainer.querySelectorAll('img').forEach(img =>
                img.classList.remove('!border-pink-500', 'ring-2', 'ring-purple-500', 'scale-110', 'shadow-[0_0_15px_rgba(236,72,153,0.5)]')
            );
            e.target.classList.add('!border-pink-500', 'ring-2', 'ring-purple-500', 'scale-110', 'shadow-[0_0_15px_rgba(236,72,153,0.5)]');
        }
    });

    document.getElementById('save-profile-btn').addEventListener('click', async () => {
        const name = document.getElementById('profile-name-input').value.trim();
        const selectedAvatar = document.querySelector('#avatar-options .scale-110')?.dataset.avatar;
        const profileId = document.getElementById('profile-id-input').value;

        if (!name || !selectedAvatar) {
            showToast('Por favor, preencha o nome e selecione um avatar.', true);
            return;
        }
        if (!userId) {
            showToast('Erro de autenticação. Por favor, recarregue a página.', true);
            return;
        }

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
            showConfirmationModal(
                'Excluir Perfil',
                'Tem certeza que deseja excluir este perfil? Esta ação não pode ser desfeita.',
                async () => {
                    try {
                        const docRef = doc(db, 'users', userId, 'profiles', profileId);
                        await deleteDoc(docRef);
                        showToast('Perfil excluído.');
                        await loadProfiles();
                        profileModal.classList.add('hidden');
                    } catch (error) {
                        console.error("Erro ao excluir perfil: ", error);
                        showToast('Não foi possível excluir o perfil.', true);
                    }
                }
            );
        } else {
            showToast('Não é possível excluir o único perfil.', true);
        }
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
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        signInWithEmailAndPassword(auth, email, password)
            .catch((error) => {
                console.error("Erro de login:", error);
                showToast(`Erro: ${error.message}`, true);
            });
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
                    await addDoc(colRef, { name: "Usuário", avatar: 'https://pbs.twimg.com/media/EcGdw6xXsAMkqGF?format=jpg&name=large' });
                }
            })
            .catch((error) => {
                console.error("Erro de registro:", error);
                showToast(`Erro: ${error.message}`, true);
            });
    });

    document.getElementById('google-signin-btn').addEventListener('click', () => {
        signInWithPopup(auth, googleProvider)
            .then(async (result) => {
                const user = result.user;
                if (user) {
                    const profilesCol = collection(db, 'users', user.uid, 'profiles');
                    const snapshot = await getDocs(profilesCol);
                    if (snapshot.empty) {
                        await addDoc(profilesCol, { name: user.displayName || "Usuário", avatar: user.photoURL || 'https://pbs.twimg.com/media/EcGdw6xXsAMkqGF?format=jpg&name=large' });
                    }
                }
            })
            .catch((error) => {
                console.error("Erro de login com Google:", error);
                showToast(`Erro: ${error.message}`, true);
            });
    });

    logoutBtn.addEventListener('click', () => {
        const currentUserId = userId;
        signOut(auth).then(() => {
            if (currentUserId) {
                localStorage.removeItem(`starlight-lastProfile-${currentUserId}`);
            }
            if (unsubscribeNewsListener) {
                unsubscribeNewsListener();
                unsubscribeNewsListener = null;
            }
        }).catch((error) => {
            console.error("Erro ao sair:", error);
            showToast(`Erro: ${error.message}`, true);
        });
    });

    function showConfirmationModal(title, message, onConfirm) {
        confirmTitle.textContent = title;
        confirmMessage.textContent = message;
        confirmCallback = onConfirm;
        confirmModal.classList.remove('hidden');
    }

    confirmOkBtn.addEventListener('click', () => {
        if (confirmCallback) {
            confirmCallback();
        }
        confirmModal.classList.add('hidden');
        confirmCallback = null;
    });

    confirmCancelBtn.addEventListener('click', () => {
        confirmModal.classList.add('hidden');
        confirmCallback = null;
    });

    const tmdbSearchInput = document.getElementById('tmdb-search-input');
    tmdbSearchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            handleTmdbSearch(tmdbSearchInput.value);
        }, 500);
    });

    async function handleTmdbSearch(query) {
        const resultsContainer = document.getElementById('tmdb-search-results');
        if (query.length < 3) {
            resultsContainer.innerHTML = '';
            return;
        }
        resultsContainer.innerHTML = `<div class="col-span-full">${glassSpinnerHTML.replace('min-h-screen', '')}</div>`;
        const data = await fetchFromTMDB('search/multi', `query=${encodeURIComponent(query)}`);
        if (data && data.results) {
            const filtered = data.results.filter(item => (item.media_type === 'movie' || item.media_type === 'tv') && item.poster_path);
            renderTmdbResults(filtered);
        } else {
            resultsContainer.innerHTML = `<p class="col-span-full text-center text-gray-400">Nenhum resultado encontrado.</p>`;
        }
    }

    function renderTmdbResults(results) {
        const container = document.getElementById('tmdb-search-results');
        if (results.length === 0) {
            container.innerHTML = `<p class="col-span-full text-center text-gray-400">Nenhum resultado encontrado.</p>`;
            return;
        }
        container.innerHTML = results.map(item => {
            const posterPath = item.poster_path
                ? `${IMG_URL_POSTER}${item.poster_path}`
                : 'https://files.catbox.moe/sytt0s.gif';

            return `
            <div class="cursor-pointer group tmdb-result-item" data-item='${JSON.stringify(item)}'> <div class="liquid-glass-card aspect-[2/3] bg-stone-800">
                    <div class="glass-filter"></div>
                    <div class="glass-overlay" style="--bg-color: rgba(0,0,0,0.1);"></div>
                    <div class="glass-specular"></div>
                    <div class="glass-content p-0">
                        <img src="${posterPath}" alt="${item.title || item.name}" class="w-full h-full object-cover rounded-[inherit] bg-stone-800">
                    </div>
                </div>
                <h4 class="text-white text-xs mt-2 truncate">${item.title || item.name}</h4>
            </div>
            `;
        }).join('');
        attachGlassButtonListeners();
    }

    document.getElementById('tmdb-search-results').addEventListener('click', (e) => {
        const itemElement = e.target.closest('.tmdb-result-item');
        if (itemElement) {
            const itemData = JSON.parse(itemElement.dataset.item);

            if (itemData.media_type === 'movie') {
                confirmAndAddRequest(itemData);
            } else if (itemData.media_type === 'tv') {
                openTvRequestModal(itemData);
            }
        }
    });

    document.getElementById('pending-requests-container').addEventListener('click', e => {
        const voteButton = e.target.closest('.vote-btn');
        if (voteButton) {
            const requestId = voteButton.dataset.requestId;
            handleVote(requestId);
        }
    });

    async function confirmAndAddRequest(item, isFromModal = false) {
        const titleToDisplay = item.displayTitle || item.title || item.name;
        const posterToSave = item.fullPosterUrl || (item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : 'https://placehold.co/300x450/1c1917/FFFFFF?text=Sem+Imagem');

        const executeAdd = async () => {
            if (!userId || !currentProfile) {
                showToast("Você precisa estar logado e ter um perfil selecionado.", true);
                return;
            }

            const existingRequest = pendingRequests.find(r => r.title === titleToDisplay);

            if (existingRequest) {
                const userHasRequested = existingRequest.requesters && existingRequest.requesters.some(r => r.userId === userId);
                if (userHasRequested) {
                    showToast('Você já apoiou este pedido.', true);
                    return;
                }
                try {
                    const docRef = doc(db, 'pedidos', existingRequest.id);
                    await updateDoc(docRef, {
                        requesters: arrayUnion({ userId: userId, userName: currentProfile.name })
                    });
                    showToast('Apoio adicionado!');
                } catch (error) {
                    console.error("Erro ao apoiar:", error);
                    showToast('Ocorreu um erro.', true);
                }
            } else {
                const requestData = {
                    tmdbId: item.id,
                    title: titleToDisplay,
                    originalTitle: item.title || item.name,
                    year: (item.release_date || item.first_air_date || '').substring(0, 4),
                    posterUrl: posterToSave,
                    mediaType: item.media_type,

                    requestType: item.requestDetail?.type || 'movie',
                    seasonNumber: item.requestDetail?.season || null,
                    episodeNumber: item.requestDetail?.episode || null,

                    status: 'pending',
                    createdAt: serverTimestamp(),
                    requesters: [{ userId: userId, userName: currentProfile.name }]
                };

                try {
                    await addDoc(collection(db, 'pedidos'), requestData);
                    showToast('Pedido enviado com sucesso!');
                } catch (error) {
                    console.error("Erro ao adicionar pedido:", error);
                    showToast('Ocorreu um erro ao enviar o pedido.', true);
                }
            }
        };

        if (isFromModal) {
            executeAdd();
        } else {
            showConfirmationModal('Confirmar Pedido', `Deseja solicitar "${titleToDisplay}"?`, executeAdd);
        }
    }

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
        if (unsubscribeNewsListener) {
            unsubscribeNewsListener();
            unsubscribeNewsListener = null;
        }
    }

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
                await loadProfiles();
                const foundProfile = profiles.find(p => p.id === lastProfileId);
                if (foundProfile) {
                    selectAndEnterProfile(foundProfile);
                    autoSelectedProfile = true;
                }
            }

            if (!autoSelectedProfile) {
                currentProfile = null;
                if (window.location.hash !== '#manage-profile-view') {
                    history.replaceState(null, '', '#manage-profile-view');
                }
                handleNavigation();
            }

        } else {
            userId = null;
            userEmail = null;
            userDisplayName = null;
            currentProfile = null;
            if (window.location.hash !== '#login-view') {
                history.replaceState(null, '', '#login-view');
            }
            handleNavigation();
        }
    });

    function handleHeaderScroll() {
        if (!headerElement || !playerView.classList.contains('hidden')) return;

        const currentHash = window.location.hash;
        const scrollY = window.scrollY;
        const threshold = 50;

        if (currentHash === '#home-view' || currentHash === '' || currentHash === '#') {
            if (scrollY > threshold) {
                headerElement.classList.remove('header-hidden');
            } else {
                headerElement.classList.add('header-hidden');
            }
        } else {
            headerElement.classList.remove('header-hidden');
        }
    }

    attachGlassButtonListeners();
    window.addEventListener('scroll', handleHeaderScroll);
    window.addEventListener('resize', () => {
        updateMobileNavIndicator();
        addPlayerEventListeners();
    });

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
                    if (!existingCard) {
                        newsItemsCache.unshift(changedData);
                        if (window.location.hash === '#news-view' && newsContainer) {
                            const placeholder = newsContainer.querySelector('p');
                            if (placeholder) placeholder.remove();

                            const newCard = createNewsCard(changedData);
                            newsContainer.prepend(newCard);
                            attachGlassButtonListeners();
                            lucide.createIcons();
                        }
                    }
                }
                if (change.type === "modified") {
                    const index = newsItemsCache.findIndex(item => item.id === change.doc.id);
                    if (index > -1) {
                        newsItemsCache[index] = changedData;
                    }
                    if (existingCard) {
                        updateNewsCardUI(existingCard, changedData);
                    }
                }
                if (change.type === "removed") {
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
            itemsContainer.prepend(newsCard);
        });
        attachGlassButtonListeners();
        lucide.createIcons();
    }

    function createNewsCard(item) {
        const card = document.createElement('div');
        card.className = 'news-card liquid-glass-card bg-stone-900/50 rounded-lg overflow-hidden';
        card.dataset.newsId = item.id;

        const date = item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Data indisponível';

        const pinnedBadge = item.isPinned
            ? `<span class="text-xs font-bold bg-yellow-500/20 text-yellow-300 px-2 py-1 rounded-full ml-2">FIXADO</span>`
            : '';

        let contentHTML = '';

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

        addNewsCardListeners(card);
        return card;
    }

    function addNewsCardListeners(cardElement) {
        const likeBtn = cardElement.querySelector('.like-btn');
        const commentBtn = cardElement.querySelector('.comment-btn');
        const commentsSection = cardElement.querySelector('.comments-section');
        const commentInput = cardElement.querySelector('.comment-input');
        const submitCommentBtn = cardElement.querySelector('.submit-comment-btn');
        const commentsList = cardElement.querySelector('.comments-list');
        const newsId = cardElement.dataset.newsId;

        let unsubscribeCommentsListener = null;

        likeBtn.addEventListener('click', () => handleLike(newsId, likeBtn));

        commentBtn.addEventListener('click', () => {
            commentsSection.classList.toggle('hidden');

            if (!commentsSection.classList.contains('hidden')) {
                unsubscribeCommentsListener = loadComments(newsId, commentsList);
            } else {
                if (unsubscribeCommentsListener) {
                    unsubscribeCommentsListener();
                    unsubscribeCommentsListener = null;
                }
            }
        });

        submitCommentBtn.addEventListener('click', () => submitComment(newsId, commentInput, commentsList));

        commentInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submitComment(newsId, commentInput, commentsList);
            }
        });
    }

    async function handleLike(newsId, likeBtn) {
        if (!userId) {
            showToast("Você precisa estar logado para curtir.", true);
            return;
        }
        const newsDocRef = doc(db, 'news', newsId);
        const likeIcon = likeBtn.firstElementChild;
        const likeCountSpan = likeBtn.querySelector('.like-count');
        const isCurrentlyLiked = likeBtn.classList.contains('text-pink-500');

        likeBtn.classList.toggle('text-pink-500');
        likeIcon.setAttribute('data-lucide', isCurrentlyLiked ? 'heart' : 'heart-handshake');
        lucide.createIcons({ nodes: [likeIcon] });
        const currentCount = parseInt(likeCountSpan.textContent || '0');
        likeCountSpan.textContent = isCurrentlyLiked ? Math.max(0, currentCount - 1) : currentCount + 1;
        likeBtn.disabled = true;

        try {
            if (isCurrentlyLiked) {
                await updateDoc(newsDocRef, {
                    likes: arrayRemove(userId),
                    likeCount: increment(-1)
                });
            } else {
                await updateDoc(newsDocRef, {
                    likes: arrayUnion(userId),
                    likeCount: increment(1)
                });
            }
        } catch (error) {
            console.error("Erro ao curtir/descurtir:", error);
            showToast("Erro ao processar o like.", true);
            likeBtn.classList.toggle('text-pink-500');
            likeIcon.setAttribute('data-lucide', isCurrentlyLiked ? 'heart-handshake' : 'heart');
            lucide.createIcons({ nodes: [likeIcon] });
            likeCountSpan.textContent = currentCount;
        } finally {
            likeBtn.disabled = false;
        }
    }

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
            userName: currentProfile.name || userEmail || "Usuário",
            text: commentText,
            createdAt: serverTimestamp(),
            repliesCount: 0
        };

        inputElement.disabled = true;
        const submitBtn = inputElement.nextElementSibling;
        if (submitBtn) submitBtn.disabled = true;

        try {
            const commentsColRef = collection(db, 'news', newsId, 'comments');
            const newCommentRef = await addDoc(commentsColRef, commentData);

            inputElement.value = '';
            showToast('Comentário adicionado!');

            const newCommentCard = createCommentCard({ id: newCommentRef.id, ...commentData }, newsId);

            commentsListElement.prepend(newCommentCard);
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

    function loadComments(newsId, commentsListElement) {
        const q = query(collection(db, 'news', newsId, 'comments'), orderBy('createdAt', 'asc'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            commentsListElement.innerHTML = '';

            if (snapshot.empty) {
                commentsListElement.innerHTML = '<p class="text-stone-400 text-sm text-center">Nenhum comentário ainda.</p>';
                return;
            }

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

        return unsubscribe;
    }

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
                    loadReplies(newsId, commentId, repliesList);
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

            const commentDocRef = doc(db, 'news', newsId, 'comments', commentId);
            await updateDoc(commentDocRef, { repliesCount: increment(1) });

            inputElement.value = '';
            inputElement.closest('.reply-input-area').classList.add('hidden');
            showToast('Resposta adicionada!');
            const newReplyCard = createReplyCard({ id: 'temp-reply-' + Date.now(), ...replyData });
            repliesListElement.prepend(newReplyCard);
            repliesListElement.classList.remove('hidden');
            const newCount = (parseInt(viewRepliesBtn?.dataset.count || '0') + 1);
            if (viewRepliesBtn) {
                viewRepliesBtn.dataset.count = newCount;
                viewRepliesBtn.innerHTML = `<i data-lucide="chevron-up" class="w-3 h-3"></i> Ocultar respostas`;
                lucide.createIcons({ nodes: [viewRepliesBtn] });
            } else {
                const commentCard = inputElement.closest('.comment-card');
                const buttonContainer = commentCard.querySelector('.flex.items-center.gap-4');
                if (buttonContainer) {
                    const newViewRepliesBtn = document.createElement('button');
                    newViewRepliesBtn.className = "view-replies-btn text-xs text-stone-400 hover:text-indigo-400 flex items-center gap-1";
                    newViewRepliesBtn.dataset.count = 1;
                    newViewRepliesBtn.innerHTML = `<i data-lucide="chevron-up" class="w-3 h-3"></i> Ocultar respostas`;
                    buttonContainer.appendChild(newViewRepliesBtn);
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

    function loadReplies(newsId, commentId, repliesListElement) {
        repliesListElement.innerHTML = `<div class="spinner mx-auto my-2 w-4 h-4 border-2"></div>`;
        const q = query(collection(db, 'news', newsId, 'comments', commentId, 'replies'), orderBy('createdAt', 'asc'));

        onSnapshot(q, (snapshot) => {
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
        });
    }

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

    function updateNewsCardUI(cardElement, updatedData) {
        const likeCountSpan = cardElement.querySelector('.like-count');
        const likeBtn = cardElement.querySelector('.like-btn');
        const likeIcon = likeBtn ? likeBtn.firstElementChild : null;

        if (likeCountSpan) {
            likeCountSpan.textContent = updatedData.likeCount || 0;
        }

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
    }

    const tvReqModal = document.getElementById('tv-request-modal');
    const reqSeasonValue = document.getElementById('req-season-value');
    const reqEpisodeValue = document.getElementById('req-episode-value');

    const reqSeasonTrigger = document.getElementById('req-season-trigger');
    const reqSeasonText = document.getElementById('req-season-text');
    const reqSeasonDropdown = document.getElementById('req-season-dropdown');
    const reqSeasonOptionsList = document.getElementById('req-season-options-list');

    const reqEpisodeTrigger = document.getElementById('req-episode-trigger');
    const reqEpisodeText = document.getElementById('req-episode-text');
    const reqEpisodeDropdown = document.getElementById('req-episode-dropdown');
    const reqEpisodeOptionsList = document.getElementById('req-episode-options-list');

    let currentRequestType = 'series';

    document.addEventListener('click', (e) => {
        if (!reqSeasonTrigger.contains(e.target)) reqSeasonDropdown.classList.add('hidden');
        if (!reqEpisodeTrigger.contains(e.target)) reqEpisodeDropdown.classList.add('hidden');
    });

    reqSeasonTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        reqEpisodeDropdown.classList.add('hidden');
        reqSeasonDropdown.classList.toggle('hidden');
    });

    reqEpisodeTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        if (reqEpisodeTrigger.disabled) return;
        reqSeasonDropdown.classList.add('hidden');
        reqEpisodeDropdown.classList.toggle('hidden');
    });

    let currentExistingSeriesData = null;

    async function openTvRequestModal(item) {
        document.getElementById('req-tmdb-id').value = item.id;
        document.getElementById('req-title').value = item.name;
        document.getElementById('req-year').value = (item.first_air_date || '').substring(0, 4);
        document.getElementById('req-poster').value = item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : '';

        currentExistingSeriesData = firestoreContent.find(c => c.tmdb_id === item.id && c.type === 'tv');

        currentRequestType = 'series';
        document.querySelectorAll('.req-type-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.type === 'series') btn.classList.add('active');
        });

        document.getElementById('req-season-container').classList.add('hidden');
        document.getElementById('req-episode-container').classList.add('hidden');

        reqSeasonText.textContent = 'Carregando...';
        reqSeasonValue.value = '';
        reqSeasonTrigger.disabled = true;

        reqEpisodeText.textContent = 'Selecione a temporada primeiro';
        reqEpisodeValue.value = '';
        reqEpisodeTrigger.disabled = true;

        reqSeasonOptionsList.innerHTML = '';
        reqEpisodeOptionsList.innerHTML = '';

        tvReqModal.classList.remove('hidden');

        const data = await fetchFromTMDB(`tv/${item.id}`);
        reqSeasonText.textContent = 'Selecione...';
        reqSeasonTrigger.disabled = false;

        if (data && data.seasons) {
            data.seasons.forEach(season => {
                if (season.season_number > 0) {
                    const option = document.createElement('div');
                    option.className = 'req-option';

                    let isSeasonAdded = false;
                    if (currentExistingSeriesData &&
                        currentExistingSeriesData.seasons &&
                        currentExistingSeriesData.seasons[season.season_number]) {
                        isSeasonAdded = true;
                    }

                    const seasonName = season.name || `Temporada ${season.season_number}`;

                    if (isSeasonAdded) {
                        option.innerHTML = `<span class="text-stone-500 line-through">${seasonName}</span> <span class="text-green-500 text-xs ml-2">(Já Disponível)</span>`;
                        option.style.cursor = 'not-allowed';
                    } else {
                        option.textContent = seasonName;
                    }

                    option.onclick = () => {
                        if (isSeasonAdded && currentRequestType === 'season') {
                            showToast('Esta temporada já está disponível no catálogo.', true);
                            return;
                        }

                        reqSeasonText.textContent = seasonName;
                        reqSeasonValue.value = season.season_number;
                        reqSeasonDropdown.classList.add('hidden');

                        if (currentRequestType === 'episode') {
                            loadEpisodesForDropdown(item.id, season.season_number);
                        }
                    };

                    reqSeasonOptionsList.appendChild(option);
                }
            });
        }
    }

    async function loadEpisodesForDropdown(tmdbId, seasonNum) {
        reqEpisodeText.textContent = 'Carregando...';
        reqEpisodeTrigger.disabled = true;
        reqEpisodeOptionsList.innerHTML = '';
        reqEpisodeValue.value = '';

        const data = await fetchFromTMDB(`tv/${tmdbId}/season/${seasonNum}`);

        reqEpisodeText.textContent = 'Selecione...';
        reqEpisodeTrigger.disabled = false;

        let existingEpisodesNumbers = [];
        if (currentExistingSeriesData &&
            currentExistingSeriesData.seasons &&
            currentExistingSeriesData.seasons[seasonNum] &&
            currentExistingSeriesData.seasons[seasonNum].episodes) {

            existingEpisodesNumbers = currentExistingSeriesData.seasons[seasonNum].episodes.map(e => e.episode_number);
        }

        if (data && data.episodes) {
            data.episodes.forEach(ep => {
                const option = document.createElement('div');
                option.className = 'req-option';

                const isEpAdded = existingEpisodesNumbers.includes(ep.episode_number);
                const epName = `Ep ${ep.episode_number}: ${ep.name}`;

                if (isEpAdded) {
                    option.innerHTML = `<span class="text-stone-500 line-through">${epName}</span> <span class="text-green-500 text-xs ml-2">(No Catálogo)</span>`;
                    option.style.cursor = 'not-allowed';
                } else {
                    option.textContent = epName;
                }

                option.onclick = () => {
                    if (isEpAdded) {
                        showToast('Este episódio já está disponível para assistir.', true);
                        return;
                    }
                    reqEpisodeText.textContent = `Ep ${ep.episode_number}: ${ep.name}`;
                    reqEpisodeValue.value = ep.episode_number;
                    reqEpisodeDropdown.classList.add('hidden');
                };

                reqEpisodeOptionsList.appendChild(option);
            });
        }
    }

    document.querySelectorAll('.req-type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.req-type-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentRequestType = btn.dataset.type;

            const sCont = document.getElementById('req-season-container');
            const eCont = document.getElementById('req-episode-container');

            if (currentRequestType === 'series') { sCont.classList.add('hidden'); eCont.classList.add('hidden'); }
            else if (currentRequestType === 'season') { sCont.classList.remove('hidden'); eCont.classList.add('hidden'); }
            else if (currentRequestType === 'episode') {
                sCont.classList.remove('hidden');
                eCont.classList.remove('hidden');
                if (reqSeasonValue.value) {
                    loadEpisodesForDropdown(document.getElementById('req-tmdb-id').value, reqSeasonValue.value);
                }
            }
        });
    });

    document.getElementById('cancel-tv-req-btn').addEventListener('click', () => tvReqModal.classList.add('hidden'));

    document.getElementById('confirm-tv-req-btn').addEventListener('click', () => {
        const title = document.getElementById('req-title').value;
        const seasonNum = reqSeasonValue.value;
        const episodeNum = reqEpisodeValue.value;
        let finalTitle = title;
        let type = 'series';

        if (currentRequestType === 'season') {
            if (!seasonNum) return showToast('Selecione a temporada.', true);
            finalTitle = `${title} - Temporada ${seasonNum}`;
            type = 'season';
        } else if (currentRequestType === 'episode') {
            if (!seasonNum || !episodeNum) return showToast('Selecione Temporada e Episódio.', true);
            finalTitle = `${title} - T${seasonNum} E${episodeNum}`;
            type = 'episode';
        }

        const customItem = {
            id: parseInt(document.getElementById('req-tmdb-id').value),
            title: title,
            displayTitle: finalTitle,
            name: title,
            first_air_date: document.getElementById('req-year').value,
            fullPosterUrl: document.getElementById('req-poster').value,
            media_type: 'tv',
            requestDetail: { type, season: seasonNum, episode: episodeNum }
        };

        tvReqModal.classList.add('hidden');
        confirmAndAddRequest(customItem, true);
    });

    const reportForm = document.getElementById('report-form');

    if (reportForm) {
        reportForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (!userId || !currentProfile) {
                showToast("Você precisa estar logado para reportar.", true);
                return;
            }

            const submitBtn = reportForm.querySelector('button[type="submit"]');
            const originalBtnText = submitBtn.innerText;

            submitBtn.disabled = true;
            submitBtn.innerText = "Enviando...";
            submitBtn.classList.add('opacity-70', 'cursor-not-allowed');

            const reportType = document.querySelector('input[name="report-type"]:checked').value;
            const contentName = document.getElementById('report-content-name').value.trim();
            const description = document.getElementById('report-desc').value.trim();

            if (!description) {
                showToast("Por favor, descreva o problema.", true);
                submitBtn.disabled = false;
                submitBtn.innerText = originalBtnText;
                submitBtn.classList.remove('opacity-70', 'cursor-not-allowed');
                return;
            }

            const reportData = {
                type: reportType,
                affectedContent: contentName || "Geral",
                description: description,
                userId: userId,
                userName: currentProfile.name,
                status: 'open',
                createdAt: serverTimestamp(),
                deviceInfo: navigator.userAgent
            };

            try {
                await addDoc(collection(db, 'reports'), reportData);

                showToast("Report enviado com sucesso! Obrigado.");
                reportForm.reset();

                setTimeout(() => {
                    window.location.hash = '#home-view';
                }, 2000);

            } catch (error) {
                console.error("Erro ao enviar report:", error);
                showToast("Erro ao enviar report. Tente novamente.", true);
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerText = originalBtnText;
                submitBtn.classList.remove('opacity-70', 'cursor-not-allowed');
            }
        });
    }

});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(registration => {
                console.log('Starlight PWA registrado com sucesso:', registration.scope);
            })
            .catch(error => {
                console.log('Falha ao registrar PWA:', error);
            });
    });
}

let deferredPrompt;
const installBtn = document.getElementById('install-app-btn');

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
});

async function installPWA() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`Usuário escolheu: ${outcome}`);
        deferredPrompt = null;
    }
}
