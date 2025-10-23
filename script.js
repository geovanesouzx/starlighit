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
    arrayUnion,
    serverTimestamp,
    arrayRemove
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', function() {
    lucide.createIcons();

    // REMOVED: Session restore logic removed as requested.
    // Set initial hash if none exists
    if (!window.location.hash || window.location.hash === '#player') {
         window.location.hash = '#home-view';
    }

    // REMOVED: Event listeners saving location hash removed.

    // --- Configuração do Firebase ---
    // WARNING: API Keys are exposed client-side. Keep as requested.
    const firebaseConfig = {
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

    let userId = null;
    let authReady = false; // Flag to track auth state readiness

    // WARNING: API Key is exposed client-side. Keep as requested.
    const API_KEY = '5954890d9e9b723ff3032f2ec429fec3';
    const API_URL = 'https://api.themoviedb.org/3';
    const IMG_URL_POSTER = 'https://image.tmdb.org/t/p/w500';
    const IMG_URL_BACKGROUND = 'https://image.tmdb.org/t/p/original';
    const LANGUAGE = 'pt-BR';

    let currentHeroItem = null;
    let currentDetailsItem = null;
    let controlsTimeout;
    let currentPlayerContext = {};
    let lastActiveViewId = 'home-view';
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

    const loginView = document.getElementById('login-view');
    const searchOverlay = document.getElementById('search-overlay');
    const searchInput = document.getElementById('search-input');
    const searchResultsContainer = document.getElementById('search-results');
    const searchIconBtn = document.getElementById('search-icon-btn');
    const closeSearchBtn = document.getElementById('close-search-btn');
    const notificationBtn = document.getElementById('notification-btn');
    const notificationPanel = document.getElementById('notification-panel');
    let debounceTimer;

    // Player elements
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

    // Profile Management Elements
    const manageProfileView = document.getElementById('manage-profile-view');
    const manageProfilesBtn = document.getElementById('manage-profiles-btn');
    const profilesGrid = document.getElementById('profiles-grid');
    const profileModal = document.getElementById('profile-modal');
    const avatarOptionsContainer = document.getElementById('avatar-options');
    const headerProfileBtn = document.getElementById('header-profile-btn');
    const logoutBtn = document.getElementById('logout-btn');

    // Confirmation Modal Elements
    const confirmModal = document.getElementById('confirm-modal');
    const confirmTitle = document.getElementById('confirm-title');
    const confirmMessage = document.getElementById('confirm-message');
    const confirmOkBtn = document.getElementById('confirm-ok-btn');
    const confirmCancelBtn = document.getElementById('confirm-cancel-btn');
    let confirmCallback = null;

    let profiles = [];
    let currentProfile = null;
    let isEditMode = false;
    const AVATARS = [
        'https://pbs.twimg.com/media/EcGdw6xXsAMkqGF?format=jpg&name=large',
        'https://pbs.twimg.com/media/FMs8_KeWYAAtoS3.jpg',
        'https://i.pinimg.com/736x/a8/31/b5/a831b58a3a067756a16518884967e812.jpg',
        'https://pbs.twimg.com/media/EcGdw6uXgAEpGA-.jpg'
    ];

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
        back: `<svg fill="currentColor" viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"></path></svg>`
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

    // --- Firestore Data Functions ---
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
        const itemId = String(item.docId || item.id); // Use docId if available (Firestore), else id (TMDB potential)
        const docRef = doc(db, 'users', userId, 'profiles', currentProfile.id, 'my-list', itemId);
        const isInList = await checkIfInList(itemId);

        try {
            if (isInList) {
                await deleteDoc(docRef);
            } else {
                // Ensure media_type exists before saving
                const itemToAdd = { ...item, media_type: item.media_type || (item.title ? 'movie' : 'tv')};
                // Remove Firestore specific fields if they somehow exist on a TMDB object
                delete itemToAdd.docId;
                delete itemToAdd.addedAt;
                await setDoc(docRef, itemToAdd);
            }
            updateListButtons(item); // Update buttons based on the item clicked
            if (document.getElementById('mylist-view').classList.contains('active')) {
                populateMyList();
            }
        } catch (error) {
            console.error("Erro ao atualizar 'Minha Lista':", error);
            showToast("Não foi possível atualizar sua lista.", true);
        }
    }


    async function toggleMyListItem(item) {
        await handleListAction(item);
    }

    function updateListButtons(item) {
        // Match item based on docId (Firestore) or potentially id (if TMDB item was somehow passed)
        const checkId = item.docId || item.id;
        if (currentHeroItem && (currentHeroItem.docId === checkId || currentHeroItem.id === checkId)) {
            updateListButton(document.getElementById('hero-add-to-list'), currentHeroItem);
        }
        if (currentDetailsItem && (currentDetailsItem.docId === checkId || currentDetailsItem.id === checkId)) {
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
        try {
            await setDoc(docRef, progressData, { merge: true });
        } catch (error) {
            console.error("Erro ao salvar progresso:", error);
            // Optionally show a non-intrusive error indicator
        }
    }


    // --- UI Creation Functions ---
    async function fetchFromTMDB(endpoint, params = '') {
        // WARNING: API Key is exposed client-side. Keep as requested.
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
        if (!container || !data || data.length === 0) return; // Added container check
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

    // This card is specifically for Firestore content, linking to #details/docId
    function createContentCard(item) {
        if (!item || !item.poster || !item.docId) return ''; // Ensure docId exists
        const posterPath = item.poster.startsWith('http') ? item.poster : `https://placehold.co/300x450/1c1917/FFFFFF?text=Sem+Imagem`;
        return `
        <a href="#details/${item.docId}" class="carousel-item w-36 sm:w-48 cursor-pointer group block flex-shrink-0">
            <div class="liquid-glass-card aspect-[2/3] bg-stone-800">
                 <div class="glass-filter"></div>
                 <div class="glass-distortion-overlay"></div>
                 <div class="glass-overlay" style="--bg-color: rgba(0,0,0,0.1);"></div>
                 <div class="glass-specular"></div>
                 <div class="glass-content p-0">
                    <img src="${posterPath}" alt="Pôster de ${item.title || item.name}" loading="lazy" class="w-full h-full object-cover rounded-[inherit]" onerror="this.onerror=null;this.src='https://placehold.co/300x450/1c1917/FFFFFF?text=Sem+Imagem';">
                 </div>
            </div>
        </a>`;
    };

    function createGridCard(item) {
        if (!item || !item.poster || !item.docId) return ''; // Ensure docId exists
        const posterPath = item.poster.startsWith('http') ? item.poster : `https://placehold.co/300x450/1c1917/FFFFFF?text=Sem+Imagem`;
        return `
        <a href="#details/${item.docId}" class="group block cursor-pointer">
            <div class="liquid-glass-card aspect-[2/3] bg-stone-800">
                 <div class="glass-filter"></div>
                 <div class="glass-distortion-overlay"></div>
                 <div class="glass-overlay" style="--bg-color: rgba(0,0,0,0.1);"></div>
                 <div class="glass-specular"></div>
                 <div class="glass-content p-0">
                    <img src="${posterPath}" alt="Pôster de ${item.title || item.name}" loading="lazy" class="w-full h-full object-cover rounded-[inherit]" onerror="this.onerror=null;this.src='https://placehold.co/300x450/1c1917/FFFFFF?text=Sem+Imagem';">
                 </div>
            </div>
            <h4 class="text-white text-sm mt-2 truncate">${item.title || item.name}</h4>
        </a>`;
    };

    // --- Data Population Functions ---

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
        }, 8000); // 8 seconds
    }

    async function updateHero(item) {
        if (!item) return;

        const heroContentWrapper = document.getElementById('hero-content-wrapper');
        const mainBackground = document.getElementById('main-background');

        heroContentWrapper.classList.add('hero-fade-out');
        mainBackground.style.opacity = 0;

        // Preload background image
        const img = new Image();
        img.onload = async () => {
             // Use setTimeout to allow fade-out animation to complete
            setTimeout(async () => {
                currentHeroItem = item;
                mainBackground.style.backgroundImage = `url('${item.backdrop}')`;

                document.getElementById('hero-category').textContent = 'EM DESTAQUE';
                document.getElementById('hero-title').textContent = item.title || item.name;
                document.getElementById('hero-overview').textContent = item.synopsis && item.synopsis.length > 200 ? item.synopsis.substring(0, 200) + '...' : item.synopsis;
                const releaseYear = item.year;

                const metaContainer = document.getElementById('hero-meta');
                metaContainer.innerHTML = ``;
                await displayContentRating(item, metaContainer);
                if (releaseYear) metaContainer.innerHTML += `<span>${releaseYear}</span>`; // Check if year exists

                await updateListButton(document.getElementById('hero-add-to-list'), item);

                mainBackground.style.opacity = 1;
                heroContentWrapper.style.opacity = 1;
                heroContentWrapper.classList.remove('hero-fade-out');
            }, 300); // Slightly shorter than transition duration
        };
        img.onerror = () => { // Handle background image load error
             console.error("Failed to load background image:", item.backdrop);
             // Optionally set a default background or clear it
              setTimeout(async () => {
                  mainBackground.style.backgroundImage = 'none'; // Or a default placeholder
                  // Update text content anyway
                  currentHeroItem = item;
                  // ... (rest of the text update logic from above) ...
                  mainBackground.style.opacity = 1;
                  heroContentWrapper.style.opacity = 1;
                  heroContentWrapper.classList.remove('hero-fade-out');
              }, 300);
        };
        img.src = item.backdrop; // Start loading
    }


    async function updateListButton(button, item) {
        if (!button || !item) return;
        const itemId = String(item.docId || item.id);
        const isInList = await checkIfInList(itemId);
        const contentDiv = button.querySelector('.glass-content');
        contentDiv.innerHTML = isInList ? `<svg class="w-5 h-5 sm:w-6 sm:h-6" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path></svg><span>Na Lista</span>` : `<svg class="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg><span>Minha Lista</span>`;
        // Remove previous listener before adding a new one to prevent duplicates
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
        container.innerHTML = list.length === 0 ? '<p class="col-span-full text-center text-gray-400">Sua lista está vazia.</p>' : list.map(item => createGridCard(item)).join('');
        attachGlassButtonListeners();
    }

    // Listener for Firestore content changes
    let contentUnsubscribe = null;
    let featuredUnsubscribe = null;
    async function listenToFirestoreContent() {
        // Unsubscribe from previous listeners if they exist
        if (contentUnsubscribe) contentUnsubscribe();
        if (featuredUnsubscribe) featuredUnsubscribe();

        // Listen to content collection
        contentUnsubscribe = onSnapshot(collection(db, 'content'), (snapshot) => {
            firestoreContent = snapshot.docs.map(doc => ({ docId: doc.id, ...doc.data() }));

            // Only proceed if featured listener is also set up or already has data
            if (featuredItemIds.length > 0 || featuredUnsubscribe) {
                 const currentActiveViewId = getCurrentVisibleViewId();
                 renderScreenContent(currentActiveViewId, true); // Force reload as content changed
            }
        }, (error) => {
            console.error("Erro ao ouvir conteúdo do Firestore:", error);
            showToast("Não foi possível carregar o conteúdo.", true);
        });

        // Listen to featured items config
        featuredUnsubscribe = onSnapshot(doc(db, 'config', 'featured'), (docSnap) => {
            featuredItemIds = docSnap.exists() ? (docSnap.data().items || []) : [];
             // Only proceed if content listener is also set up or already has data
             if (firestoreContent.length > 0 || contentUnsubscribe) {
                 const currentActiveViewId = getCurrentVisibleViewId();
                 renderScreenContent(currentActiveViewId, true); // Force reload as featured items changed
             }
        }, (error) => {
             console.error("Erro ao ouvir destaques:", error);
             // Don't necessarily show toast, might just mean no featured items set
        });
    }

    function getCurrentVisibleViewId() {
        // Find the currently visible view based on class or hash
        const visibleView = document.querySelector('.content-view:not(.hidden)');
        if (visibleView) {
            return visibleView.id;
        }
        // Fallback to hash if no view is found (e.g., during initial load)
        const hash = window.location.hash;
        if (hash && hash.length > 1 && !hash.startsWith('#details/')) {
            return hash.substring(1);
        }
        return 'home-view'; // Default fallback
    }


    async function populateAllViews() {
        const carouselsContainer = document.getElementById('home-carousels-container');
        if (!carouselsContainer) return; // Added safety check
        carouselsContainer.innerHTML = ''; // Clear previous carousels

        // Filter and sort recently added content
        const recentlyAdded = [...firestoreContent]
          .filter(item => item.addedAt) // Ensure addedAt exists
          .sort((a, b) => (b.addedAt.toMillis() || 0) - (a.addedAt.toMillis() || 0))
          .slice(0, 20);
        if (recentlyAdded.length > 0) {
            createCarousel(carouselsContainer, "Adicionado Recentemente", recentlyAdded);
        }

        // Create carousels for genres
        const allGenres = [...new Set(firestoreContent.flatMap(item => item.genres || []))];
        for (const genre of allGenres) {
            const filteredContent = firestoreContent.filter(item => item.genres && item.genres.includes(genre));
            if (filteredContent.length > 0) { // Only create carousel if there's content
                 createCarousel(carouselsContainer, genre, filteredContent);
            }
        }
        attachGlassButtonListeners();
    }


    // --- Navigation and View Management ---
    const views = document.querySelectorAll('.content-view');
    const navLinks = document.querySelectorAll('.nav-item, .mobile-nav-item');

    // Function to handle navigation clicks
    function handleNavClick(targetId) {
        if (!targetId) return;

        // Update hash, which will trigger the popstate/hashchange listener
        window.location.hash = `#${targetId}`;

        // Close search overlay if open
        toggleSearchOverlay(false);
    }

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('data-target');
            handleNavClick(targetId); // Use common handler
        });
    });

    // Centralized function to show/hide UI elements based on view
    function updateAppUIForView(viewId) {
        const nonAppScreens = ['login-view', 'manage-profile-view'];
        const isAppScreen = !nonAppScreens.includes(viewId) && viewId !== 'details-view';
        const isDetailsScreen = viewId === 'details-view';

        const header = document.querySelector('header');
        const footer = document.querySelector('footer');

        if (header) header.classList.toggle('hidden', !isAppScreen);
        if (footer) footer.classList.toggle('hidden', !isAppScreen);

        document.getElementById('main-background').style.opacity = (viewId === 'home-view' && currentHeroItem) ? 1 : 0;

        // Stop hero rotation if not on home view
        if (viewId !== 'home-view' && heroCarouselInterval) {
            clearInterval(heroCarouselInterval);
            heroCarouselInterval = null;
        }

        // Update active nav links
        document.querySelectorAll('.nav-item, .mobile-nav-item').forEach(l => {
            l.classList.toggle('active', l.getAttribute('data-target') === viewId);
        });
        updateMobileNavIndicator();
    }


    // Function to render content for a specific screen ID
    function renderScreenContent(screenId, forceReload = false) {
        // Ensure auth is ready and profile is selected before rendering app screens
        if (!authReady && !['login-view'].includes(screenId)) {
             console.log("Auth not ready, delaying render for:", screenId);
             return; // Don't render app screens until auth is ready
        }
        if (!currentProfile && !['login-view', 'manage-profile-view'].includes(screenId)) {
            console.log("Profile not selected, delaying render for:", screenId);
            return; // Don't render main app without profile
        }


        const screenElement = document.getElementById(screenId);
        if (!screenElement ) {
             console.warn("Screen element not found:", screenId);
             return;
        }

        // Clear existing content if forcing reload or if it's a dynamic grid
        const needsClearing = forceReload || ['series-grid', 'movies-grid', 'my-list-grid', 'home-carousels-container', 'pending-requests-container'].includes(screenElement.querySelector('[id$="-grid"], [id$="-container"]')?.id);
        // if (needsClearing) {
        //     const dynamicContainer = screenElement.querySelector('[id$="-grid"], [id$="-container"]');
        //     if (dynamicContainer) dynamicContainer.innerHTML = ''; // Consider adding loading spinner here
        // }


        console.log("Rendering content for:", screenId); // Debug log

        // --- Specific view rendering logic ---
        if (screenId === 'home-view') {
            const featuredItems = featuredItemIds.map(id => firestoreContent.find(item => item.docId === id)).filter(Boolean);
            if(featuredItems.length > 0) {
                 // Update hero only if necessary or forced
                if (forceReload || !currentHeroItem || currentHeroItem.docId !== featuredItems[0].docId) {
                    updateHero(featuredItems[0]);
                }
                startHeroRotation(); // Restart rotation logic
            } else {
                 // Handle case with no featured items (e.g., clear hero section)
                 document.getElementById('hero-content-wrapper').style.opacity = 0;
                 if (heroCarouselInterval) clearInterval(heroCarouselInterval);
                 heroCarouselInterval = null;
            }
            populateAllViews(); // Repopulate carousels
        } else if (screenId === 'series-view') {
            const grid = document.getElementById('series-grid');
            if (grid) {
                const series = firestoreContent.filter(item => item.type === 'tv');
                grid.innerHTML = series.map(createGridCard).join('');
            }
        } else if (screenId === 'movies-view') {
            const grid = document.getElementById('movies-grid');
             if (grid) {
                const movies = firestoreContent.filter(item => item.type === 'movie');
                grid.innerHTML = movies.map(createGridCard).join('');
             }
        } else if (screenId === 'mylist-view') {
            populateMyList();
        } else if (screenId === 'requests-view') {
            renderPendingRequests(); // Assumes pendingRequests is updated by its listener
        }
         // Add other views like 'news-view' if they have dynamic content

        lucide.createIcons();
        attachGlassButtonListeners();
    }

    // Listener for clicks on dynamically added content cards
    document.body.addEventListener('click', (e) => {
        const anchor = e.target.closest('a');
        // Check specifically for links targeting #details/
        if (anchor && anchor.hash && anchor.hash.startsWith('#details/')) {
            e.preventDefault(); // Prevent default anchor navigation
            const targetHash = anchor.hash;
             // Only navigate if the hash is different from the current one
            if (window.location.hash !== targetHash) {
                 window.location.hash = targetHash; // Trigger hashchange/popstate
            } else {
                 // If hash is the same, explicitly call showDetailsView if needed (e.g., direct load)
                 // This might be redundant if handleLocationChange covers it.
                 const docId = targetHash.split('/')[1];
                 if(docId && (!currentDetailsItem || currentDetailsItem.docId !== docId)){
                      showDetailsView({ docId });
                 }
            }
        }
    });


    async function showDetailsView(item) {
        if (!item || !item.docId) {
             console.error("showDetailsView called without valid docId");
             // Optionally redirect to home or show error message
             window.location.hash = '#home-view';
             return;
        }

        // Hide other views and headers/footers
        document.querySelectorAll('.content-view').forEach(v => v.classList.add('hidden'));
        updateAppUIForView('details-view'); // Hide header/footer

        detailsView.classList.remove('hidden');
        detailsView.innerHTML = '<div class="spinner mx-auto mt-20"></div>'; // Loading indicator
        window.scrollTo(0, 0); // Scroll to top

        // Fetch data from Firestore based on docId
        const data = firestoreContent.find(i => i.docId === item.docId);

        if (!data) {
            detailsView.innerHTML = '<p class="text-center text-red-400 p-10">Conteúdo não encontrado.</p><button id="back-from-details-error" class="block mx-auto mt-4 bg-purple-600 px-4 py-2 rounded-full">Voltar</button>';
             const backBtnError = document.getElementById('back-from-details-error');
             if (backBtnError) {
                  backBtnError.addEventListener('click', () => history.back());
             }
            currentDetailsItem = null; // Clear current item
            return;
        }

        currentDetailsItem = data; // Set current item

        // --- Render Details HTML (similar to original, ensure robustness) ---
        const title = data.title || data.name || 'Título Indisponível';
        const releaseYear = data.year || '';
        const genres = Array.isArray(data.genres) ? data.genres.map(g => `<span class="bg-white/10 text-xs font-semibold px-2 py-1 rounded-full text-white">${g}</span>`).join('') : '';
        let duration = '';
        if (data.type === 'movie' && data.duration) {
            duration = data.duration;
        } else if (data.type === 'tv' && data.seasons && Object.keys(data.seasons).length > 0) {
            const seasonCount = Object.keys(data.seasons).length;
            duration = `${seasonCount} Temporada${seasonCount > 1 ? 's' : ''}`;
        }

        const backgroundUrl = data.backdrop || '';
        const finalImageUrl = backgroundUrl.startsWith('http') ? backgroundUrl : 'https://placehold.co/1280x720/0c0a09/ffffff?text=Starlight';
        const posterUrl = data.poster && data.poster.startsWith('http') ? data.poster : 'https://placehold.co/500x750/1a1a1a/ffffff?text=Capa';

        detailsView.innerHTML = `
            <div class="fixed inset-0 z-[-1] bg-cover bg-center bg-no-repeat details-backdrop">
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
                            <img src="${posterUrl}" alt="${title}" class="rounded-lg shadow-2xl w-full aspect-[2/3] object-cover" onerror="this.onerror=null;this.src='https://placehold.co/500x750/1a1a1a/ffffff?text=Capa';">
                        </div>
                        <div class="flex-1 mt-6 md:mt-0 text-center md:text-left">
                            <h1 class="text-3xl md:text-5xl lg:text-6xl font-black text-white" style="text-shadow: 2px 2px 8px rgba(0,0,0,0.7);">${title}</h1>
                            <div id="details-meta" class="flex items-center justify-center md:justify-start flex-wrap gap-x-4 gap-y-2 mt-4 text-base text-stone-300">
                                <!-- Rating and meta info added below -->
                            </div>
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

        // Set background image after rendering structure
         const backdropElement = detailsView.querySelector('.details-backdrop');
         if (backdropElement) backdropElement.style.backgroundImage = `url('${finalImageUrl}')`;


        // Add meta info (Rating, Year, Duration)
        const detailsMetaContainer = detailsView.querySelector('#details-meta');
        if (detailsMetaContainer) {
            await displayContentRating(data, detailsMetaContainer); // Rating first
            if (releaseYear) detailsMetaContainer.innerHTML += `<span>${releaseYear}</span>`;
            if (duration) detailsMetaContainer.innerHTML += `<span>•</span><span>${duration}</span>`;
        }

        // Add event listeners for buttons
        const backBtn = document.getElementById('back-from-details');
         if (backBtn) {
             // Use history.back() for proper navigation handling
            backBtn.addEventListener('click', () => history.back());
         }

        const watchBtn = document.getElementById('details-watch-btn');
         if (watchBtn) {
            watchBtn.addEventListener('click', () => {
                if (!data.url && !(data.type === 'tv' && data.seasons)) {
                    showToast("Conteúdo de vídeo não disponível no momento.", true);
                    return;
                }

                if (data.type === 'movie') {
                    showPlayer({ videoUrl: data.url, title: title, itemData: data });
                } else if (data.type === 'tv' && data.seasons) {
                    const firstSeasonKey = Object.keys(data.seasons).sort((a,b) => parseInt(a) - parseInt(b))[0];
                    const firstEpisode = data.seasons[firstSeasonKey]?.episodes?.[0];

                    if (firstEpisode && firstEpisode.url) {
                        const allEpisodesOfSeason = data.seasons[firstSeasonKey].episodes;
                        const context = {
                            videoUrl: firstEpisode.url,
                            title: `${title} - T${firstSeasonKey} E${firstEpisode.episode_number || 1}`,
                            itemData: data,
                            episodes: allEpisodesOfSeason.filter(ep => ep.url), // Only include episodes with URLs
                            currentIndex: 0 // Index within the filtered list
                        };
                        showPlayer(context);
                    } else {
                        showToast("Nenhum episódio disponível encontrado para iniciar.", true);
                    }
                }
            });
         }

        await updateListButton(document.getElementById('details-add-to-list'), data);

        // Render TV details if applicable
        if (data.type === 'tv' && data.seasons) {
            renderTvDetails(data);
        }
        attachGlassButtonListeners(); // Attach listeners to newly added elements
    }


    function renderTvDetails(data) {
        const container = document.getElementById('tv-content-details');
        if (!container) return;

        const seasonKeys = Object.keys(data.seasons || {}).sort((a, b) => parseInt(a) - parseInt(b));
        if (seasonKeys.length === 0) {
            container.innerHTML = '<p class="text-stone-400">Nenhuma temporada encontrada.</p>';
            return;
        }

        // Restore last selected season for this show, default to first
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
                     <div id="season-options-content" class="glass-content p-2 max-h-60 overflow-y-auto">
                         ${seasonKeys.map(key => `<div class="custom-select-option p-3 rounded-md cursor-pointer hover:bg-white/10" data-season="${key}">${data.seasons[key]?.title || `Temporada ${key}`}</div>`).join('')}
                     </div>
                </div>
            </div>
            <div id="episode-list-container" class="space-y-3"></div>
        `;
        lucide.createIcons();

        const renderEpisodes = (seasonKey) => {
            const season = data.seasons[seasonKey];
            const episodes = season?.episodes?.filter(ep => ep.url) || []; // Filter for episodes with URLs
            const episodeContainer = document.getElementById('episode-list-container');
             if (!episodeContainer) return; // Guard against null element

            if (episodes.length === 0) {
                episodeContainer.innerHTML = '<p class="text-stone-400">Nenhum episódio disponível para esta temporada.</p>';
                return;
            }
            episodeContainer.innerHTML = episodes.map((ep, index) => {
                const epTitle = ep.title || `Episódio ${ep.episode_number || index + 1}`;
                const epOverview = ep.overview || 'Sem descrição.';
                const stillPath = ep.still_path ? (ep.still_path.startsWith('/') ? `https://image.tmdb.org/t/p/w300${ep.still_path}`: ep.still_path) : 'https://placehold.co/300x168/1c1917/FFFFFF?text=Starlight';

                // Find the original index in the unfiltered list if needed for context
                const originalIndex = season?.episodes?.findIndex(origEp => origEp.episode_number === ep.episode_number) ?? index;

                return `
                    <div class="episode-item glass-container glass-button rounded-lg overflow-hidden cursor-pointer group" data-index="${originalIndex}" data-season="${seasonKey}">
                        <div class="glass-filter"></div>
                        <div class="glass-overlay" style="--glass-bg-color: rgba(25, 25, 25, 0.3);"></div>
                        <div class="glass-specular"></div>
                        <div class="glass-content flex items-start p-3 gap-4">
                             <div class="relative flex-shrink-0">
                                <img src="${stillPath}" alt="Cena do episódio" class="w-32 sm:w-40 rounded-md aspect-video object-cover" onerror="this.onerror=null;this.src='https://placehold.co/300x168/1c1917/FFFFFF?text=Starlight';">
                                <div class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <i data-lucide="play-circle" class="w-8 h-8 text-white"></i>
                                </div>
                             </div>
                            <div class="flex-1">
                                <h4 class="font-semibold text-white">${ep.episode_number || index + 1}. ${epTitle}</h4>
                                <p class="text-xs text-stone-300 mt-1 max-h-16 overflow-hidden">${epOverview}</p>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
            lucide.createIcons();
            attachGlassButtonListeners(); // Attach listeners after rendering episodes
        };

        renderEpisodes(firstSeasonKey);

        const seasonSelectorBtn = document.getElementById('season-selector-button');
        const seasonOptions = document.getElementById('season-options');
        const seasonOptionsContent = document.getElementById('season-options-content');
        const episodeListContainer = document.getElementById('episode-list-container');


        if (seasonSelectorBtn && seasonOptions && seasonOptionsContent) {
            seasonSelectorBtn.addEventListener('click', () => {
                const isHidden = seasonOptions.classList.toggle('hidden');
                seasonSelectorBtn.querySelector('i[data-lucide="chevron-down"]')?.style.setProperty('transform', isHidden ? 'rotate(0deg)' : 'rotate(180deg)'); // Use setProperty for robustness
             });

            seasonOptionsContent.addEventListener('click', (e) => {
                const option = e.target.closest('.custom-select-option');
                if (option) {
                    const seasonKey = option.dataset.season;
                    const selectedSeasonText = document.getElementById('selected-season-text');
                    if(selectedSeasonText) selectedSeasonText.textContent = data.seasons[seasonKey]?.title || `Temporada ${seasonKey}`;
                    renderEpisodes(seasonKey);
                    localStorage.setItem(`starlight-selected-season-${data.docId}`, seasonKey); // Save selected season
                    seasonSelectorBtn.click(); // Close dropdown
                }
            });
        }

        if (episodeListContainer) {
            episodeListContainer.addEventListener('click', (e) => {
                const episodeItem = e.target.closest('.episode-item');
                if(episodeItem){
                    const seasonKey = episodeItem.dataset.season;
                    const episodeIndex = parseInt(episodeItem.dataset.index, 10); // Use the original index
                    const seasonData = data.seasons[seasonKey];
                    const allEpisodesOfSeason = seasonData?.episodes || [];
                    const episode = allEpisodesOfSeason[episodeIndex]; // Get episode by original index

                    if (episode && episode.url) { // Check if the selected episode has a URL
                        const playableEpisodes = allEpisodesOfSeason.filter(ep => ep.url); // Filter again for context
                        const playableIndex = playableEpisodes.findIndex(pe => pe.episode_number === episode.episode_number);

                         const context = {
                             videoUrl: episode.url,
                             title: `${data.name} - T${seasonKey} E${episode.episode_number || episodeIndex + 1}`,
                             itemData: data,
                             episodes: playableEpisodes, // Pass only playable episodes
                             currentIndex: playableIndex >= 0 ? playableIndex : 0 // Index within playable list
                         };
                         showPlayer(context);
                    } else {
                         showToast("Vídeo não disponível para este episódio.", true);
                    }
                }
            });
        } else {
             console.error("Episode list container not found");
        }
    }


    function handleMouseMove(e) { const rect = this.getBoundingClientRect(); const x = e.clientX - rect.left; const y = e.clientY - rect.top; const specular = this.querySelector('.glass-specular'); if (specular) specular.style.background = `radial-gradient(circle at ${x}px ${y}px, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.05) 30%, rgba(255,255,255,0) 60%)`; }
    function handleMouseLeave() { const specular = this.querySelector('.glass-specular'); if (specular) specular.style.background = 'none'; }
    function attachGlassButtonListeners() { document.querySelectorAll('.glass-button, .liquid-glass-card, .player-control-btn, .glass-container[style*="--bg-color"], .glass-form').forEach(element => { if (!element.hasGlassListener) { element.addEventListener('mousemove', handleMouseMove); element.addEventListener('mouseleave', handleMouseLeave); element.hasGlassListener = true; }}); }
    function updateMobileNavIndicator() { const indicator = document.getElementById('mobile-nav-indicator'); const activeItem = document.querySelector('#mobile-nav .mobile-nav-item.active'); if (indicator && activeItem) { const left = activeItem.offsetLeft; const width = activeItem.offsetWidth; indicator.style.width = `${width}px`; indicator.style.transform = `translateX(${left}px)`; }}
    function toggleSearchOverlay(show) { if (show) { searchOverlay.classList.remove('hidden'); searchInput.focus(); document.body.style.overflow = 'hidden'; } else { searchOverlay.classList.add('hidden'); searchInput.value = ''; searchResultsContainer.innerHTML = ''; document.body.style.overflow = 'auto'; }}

    // Updated Search: Searches Firestore content only
    function performSearch(query) {
        if (!query || query.length < 2) {
            searchResultsContainer.innerHTML = `<p class="col-span-full text-center text-gray-400">Digite pelo menos 2 caracteres.</p>`;
            return;
        }
        searchResultsContainer.innerHTML = `<div class="col-span-full">${glassSpinnerHTML.replace('min-h-screen', '')}</div>`;

        const lowerCaseQuery = query.toLowerCase();
        // Filter local firestoreContent array
        const results = firestoreContent.filter(item =>
            (item.title && item.title.toLowerCase().includes(lowerCaseQuery)) ||
            (item.name && item.name.toLowerCase().includes(lowerCaseQuery))
            // Add more fields to search if needed (e.g., actors, description)
        );

        if (results.length > 0) {
            // Use createGridCard which links to #details/docId
            searchResultsContainer.innerHTML = results.map(item => createGridCard(item)).join('');
             attachGlassButtonListeners(); // Attach listeners for new cards
        } else {
            searchResultsContainer.innerHTML = `<p class="col-span-full text-center text-gray-400">Nenhum resultado para "${query}" no catálogo.</p>`;
        }
    }


    // --- Player Functions ---
    async function showPlayer(context) {
        // 1. Reset completo do player
        hidePlayer(false); // Chama o hidePlayer para limpar o estado sem mexer no histórico
        await new Promise(resolve => setTimeout(resolve, 50)); // Pequeno delay para garantir a limpeza

        let key;
        let itemData = context.itemData;
        if (!itemData || !itemData.docId) { // Ensure we have Firestore docId
            console.error("showPlayer called without valid itemData (docId missing).");
            showToast("Erro ao carregar informações do item.", true);
            return;
        }

        // Determine unique key for progress storage
        if (context.episodes && context.episodes.length > 0 && context.currentIndex < context.episodes.length) {
            const episode = context.episodes[context.currentIndex];
             // Ensure episode number and season number are valid
             if (episode && typeof episode.season_number !== 'undefined' && typeof episode.episode_number !== 'undefined') {
                key = `tv-${itemData.docId}-s${episode.season_number}-e${episode.episode_number}`;
             } else {
                  console.warn("Episode data missing season/episode number, using fallback key.");
                  // Fallback key using index - less reliable if episode order changes
                  key = `tv-${itemData.docId}-s${context.episodes[0]?.season_number ?? 0}-idx${context.currentIndex}`;
             }
        } else if (itemData.type === 'movie') {
            key = `movie-${itemData.docId}`;
        } else {
             console.error("Cannot determine player context key.");
             showToast("Erro ao iniciar o player.", true);
             return;
        }

        currentPlayerContext = { ...context, key, id: itemData.id, docId: itemData.docId, itemData }; // Store docId

        // Update URL hash, but only if not already #player
        if (window.location.hash !== '#player') {
             // Store the pre-player hash to return to it later
             currentPlayerContext.returnHash = window.location.hash || '#home-view';
             history.pushState({view: 'player', returnHash: currentPlayerContext.returnHash}, '', '#player');
        } else if (!currentPlayerContext.returnHash) {
             // If directly loaded on #player (shouldn't happen ideally), default return to home
             currentPlayerContext.returnHash = '#home-view';
        }


        playerView.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        playerTitle.textContent = context.title || 'Carregando...';

        let urlToLoad = context.videoUrl;
         if (!urlToLoad) {
             showToast("URL do vídeo não encontrada.", true);
             hidePlayer(); // Hide player immediately if no URL
             return;
         }

        // Keep URL cleaning logic as requested
         try {
             const urlObject = new URL(urlToLoad);
             if (urlObject.hostname.includes('api.anivideo.net') && urlObject.pathname.includes('videohls.php')) {
                 const videoSrc = urlObject.searchParams.get('d');
                 if (videoSrc) {
                     urlToLoad = videoSrc;
                 }
             }
         } catch (e) {
             // Invalid URL, proceed with original
             console.warn("Could not parse video URL for cleaning:", urlToLoad);
         }

        // Load video source using HLS.js if applicable
        if (Hls.isSupported() && urlToLoad.includes('.m3u8')) {
            hls = new Hls();
            hls.loadSource(urlToLoad);
            hls.attachMedia(videoPlayer);
            hls.on(Hls.Events.MANIFEST_PARSED, async () => {
                await tryResumeOrPlay(key); // Try to resume or start playback
            });
             hls.on(Hls.Events.ERROR, function (event, data) {
                console.error('HLS Error:', data);
                showToast(`Erro ao carregar vídeo (${data.type})`, true);
                hidePlayer(); // Hide player on critical HLS error
             });
        } else if (videoPlayer.canPlayType('application/vnd.apple.mpegurl') && urlToLoad.includes('.m3u8')) {
            // Native HLS support (Safari)
             videoPlayer.src = urlToLoad;
             videoPlayer.addEventListener('loadedmetadata', async () => {
                 await tryResumeOrPlay(key);
             }, { once: true });
        }
         else {
            // Standard video file
            videoPlayer.src = urlToLoad;
            videoPlayer.addEventListener('loadedmetadata', async () => {
                await tryResumeOrPlay(key);
            }, { once: true });
        }
         videoPlayer.addEventListener('error', (e) => {
             console.error("Video Player Error:", e);
             showToast("Erro ao carregar o vídeo.", true);
             hidePlayer(); // Hide on video element error
         });

        // Try to resume progress or start playing
        async function tryResumeOrPlay(progressKey) {
            let startTime = 0;
             if (userId && currentProfile?.id && progressKey) {
                const progressDocRef = doc(db, 'users', userId, 'profiles', currentProfile.id, 'watch-progress', progressKey);
                try {
                    const progressSnap = await getDoc(progressDocRef);
                    if (progressSnap.exists()) {
                        const data = progressSnap.data();
                         // Resume slightly before last point, avoid resuming if very close to end
                        if (data.currentTime && data.duration && data.currentTime < data.duration - 10) {
                            startTime = Math.max(0, data.currentTime - 2); // Resume 2s before
                        }
                    }
                } catch (error) {
                    console.error("Error fetching progress:", error);
                }
             }

            if (startTime > 0) {
                 videoPlayer.currentTime = startTime;
            }
             videoPlayer.play().catch(e => {
                  if (e.name !== 'NotAllowedError') { // Ignore errors due to autoplay restrictions
                      console.error("Erro ao tentar reproduzir o vídeo:", e);
                      showToast("Não foi possível iniciar a reprodução.", true);
                  }
             });
        }


        // Orientation/Fullscreen for mobile
        if (window.innerWidth < 768) {
             try {
                 // Only request fullscreen if not already in fullscreen
                 if (!document.fullscreenElement) {
                     await playerView.requestFullscreen();
                 }
                 if (screen.orientation && typeof screen.orientation.lock === 'function') {
                     await screen.orientation.lock('landscape').catch(err => console.warn("Could not lock orientation:", err)); // Don't fail if lock fails
                 }
             } catch (err) {
                 console.error("Não foi possível ativar tela cheia ou bloquear orientação:", err);
             }
        }

        // Show/hide next/prev episode buttons
        const hasMultipleEpisodes = context.episodes && context.episodes.length > 1;
        if (nextEpisodeBtn) nextEpisodeBtn.classList.toggle('hidden', !hasMultipleEpisodes || context.currentIndex >= context.episodes.length - 1);
        if (prevEpisodeBtn) prevEpisodeBtn.classList.toggle('hidden', !hasMultipleEpisodes || context.currentIndex <= 0);

        attachGlassButtonListeners();
    }

    async function hidePlayer(updateHistory = true) {
        const wasPlaying = !videoPlayer.paused;

        // Save progress BEFORE destroying player/HLS
        if (updateHistory && currentPlayerContext.key && videoPlayer.currentTime > 0) {
            await savePlayerProgress();
        }

        videoPlayer.pause();

        if (hls) {
            hls.destroy();
            hls = null;
        }
        // Reset video source and state
        videoPlayer.removeAttribute('src'); // Crucial to stop buffering/playback
        videoPlayer.load(); // Reset the media element
         // Reset UI elements that depend on duration/time
         seekBar.value = 0;
         seekProgressBar.style.width = '0%';
         currentTimeEl.textContent = formatTime(0);
         durationEl.textContent = formatTime(0);
         playPauseBtn.querySelector('.glass-content').innerHTML = ICONS.play; // Reset to play icon


        playerView.classList.add('hidden');
        document.body.style.overflow = 'auto'; // Restore scrolling

        // Exit fullscreen and unlock orientation if active
         try {
            if (document.fullscreenElement) {
                await document.exitFullscreen();
            }
            if (screen.orientation && typeof screen.orientation.unlock === 'function') {
                screen.orientation.unlock();
            }
         } catch(err) {
              console.warn("Error exiting fullscreen/unlocking orientation:", err);
         }


        // Navigate back in history ONLY if the current hash IS #player
        // This prevents going back too far if hidePlayer is called multiple times or unexpectedly
        if (updateHistory && window.location.hash === '#player') {
             // Decide where to go back to: the stored returnHash or just history.back()
             const returnHash = currentPlayerContext.returnHash || '#home-view';
             // Check if history.back() would land on the correct hash
             // This is complex, so safer to directly set the hash
             if (history.state && history.state.returnHash) {
                  window.location.hash = history.state.returnHash;
             } else {
                  history.back(); // Fallback if state wasn't pushed correctly
             }
        }

         // Clear context AFTER potential history navigation
        currentPlayerContext = {};
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
                if (error.name !== 'AbortError' && error.name !== 'NotAllowedError') { // Ignore Abort and Autoplay errors
                    console.error("Video play error:", error);
                    showToast("Não foi possível reproduzir.", true);
                 }
            });
        } else {
            videoPlayer.pause();
        }
    }

    // Combined click handler for player overlay (mobile and desktop)
    function handlePlayerOverlayClick(event) {
        // Prevent click events on controls from toggling play/pause
        if (event.target !== videoPlayer && !event.target.classList.contains('player-controls-wrapper')) {
             // Click was on a control element, just manage control visibility
             playerView.classList.add('controls-active');
             clearTimeout(controlsTimeout);
             if (!videoPlayer.paused) {
                 controlsTimeout = setTimeout(() => {
                     playerView.classList.remove('controls-active');
                 }, 3000);
             }
             return; // Don't toggle play/pause
        }

        // Click was on the video element itself or the wrapper background
        if (!playerView.classList.contains('controls-active')) {
            // Show controls
            playerView.classList.add('controls-active');
            clearTimeout(controlsTimeout);
            if (!videoPlayer.paused) {
                controlsTimeout = setTimeout(() => {
                    playerView.classList.remove('controls-active');
                }, 3000);
            }
        } else {
            // Controls are visible, toggle play/pause
             togglePlay();
             // Keep controls visible if paused, hide after timeout if playing
             clearTimeout(controlsTimeout);
             if (!videoPlayer.paused) {
                  controlsTimeout = setTimeout(() => {
                      playerView.classList.remove('controls-active');
                  }, 3000);
             }
        }
    }

    function addPlayerEventListeners() {
        videoPlayer.addEventListener('play', () => {
             playPauseBtn.querySelector('.glass-content').innerHTML = ICONS.pause;
             // Hide controls after timeout when playing starts
             clearTimeout(controlsTimeout);
             controlsTimeout = setTimeout(() => {
                 playerView.classList.remove('controls-active');
             }, 3000);
        });
        videoPlayer.addEventListener('pause', () => {
             playPauseBtn.querySelector('.glass-content').innerHTML = ICONS.play;
             // Keep controls visible when paused
             playerView.classList.add('controls-active');
             clearTimeout(controlsTimeout);
        });

        videoPlayer.addEventListener('ended', () => {
            if (currentPlayerContext.episodes && currentPlayerContext.currentIndex < currentPlayerContext.episodes.length - 1) {
                changeEpisode(1); // Auto-play next episode
            } else {
                playPauseBtn.querySelector('.glass-content').innerHTML = ICONS.play;
                playerView.classList.add('controls-active'); // Show controls at the end
                 // Optionally: Mark as watched completely here
                 savePlayerProgress(); // Save final state
            }
        });

        videoPlayer.addEventListener('timeupdate', () => {
            if (isNaN(videoPlayer.currentTime) || !isFinite(videoPlayer.duration)) return;
            seekBar.value = videoPlayer.currentTime;
            const progressPercent = (videoPlayer.currentTime / videoPlayer.duration) * 100;
            seekProgressBar.style.width = `${progressPercent}%`;
            currentTimeEl.textContent = formatTime(videoPlayer.currentTime);

            const now = Date.now();
            if (now - lastProgressSaveTime > 5000) { // Save every 5 seconds
                savePlayerProgress();
                lastProgressSaveTime = now;
            }
             // Update next/prev button visibility based on current time (optional, maybe not needed)
             // Consider disabling prev button if near start, next button if near end?
        });

        videoPlayer.addEventListener('loadedmetadata', () => {
            if (isNaN(videoPlayer.duration) || !isFinite(videoPlayer.duration)) {
                 durationEl.textContent = '--:--'; // Indicate unknown duration
                 seekBar.max = 1; // Prevent errors with NaN
                 return;
            };
            seekBar.max = videoPlayer.duration;
            durationEl.textContent = formatTime(videoPlayer.duration);
        });

        videoPlayer.addEventListener('volumechange', () => {
            volumeSlider.value = videoPlayer.volume;
            volumeBtn.querySelector('.glass-content').innerHTML = (videoPlayer.muted || videoPlayer.volume === 0) ? ICONS.volumeMute : ICONS.volumeHigh;
        });

        // Use the combined click handler
        playerView.addEventListener('click', handlePlayerOverlayClick);

    }

    // --- Player Control Event Listeners ---
    seekBar.addEventListener('input', () => {
        if (isFinite(videoPlayer.duration)) {
             videoPlayer.currentTime = seekBar.value;
             // Show current time immediately while scrubbing
             currentTimeEl.textContent = formatTime(seekBar.value);
        }
    });
    volumeSlider.addEventListener('input', (e) => { videoPlayer.volume = e.target.value; videoPlayer.muted = e.target.value == 0; });
    volumeBtn.addEventListener('click', (e) => { e.stopPropagation(); videoPlayer.muted = !videoPlayer.muted; }); // Stop propagation
    rewindBtn.addEventListener('click', (e) => { e.stopPropagation(); videoPlayer.currentTime = Math.max(0, videoPlayer.currentTime - 10); }); // Stop propagation, ensure not negative
    forwardBtn.addEventListener('click', (e) => { e.stopPropagation(); videoPlayer.currentTime = Math.min(videoPlayer.duration || 0, videoPlayer.currentTime + 10); }); // Stop propagation, ensure not beyond duration

    function changeEpisode(direction) {
        if (!currentPlayerContext.episodes || !currentPlayerContext.itemData) return;

        const newIndex = currentPlayerContext.currentIndex + direction;

        // Check if the new index is valid within the *playable* episodes array
        if (newIndex >= 0 && newIndex < currentPlayerContext.episodes.length) {
            const episode = currentPlayerContext.episodes[newIndex];
             if (!episode || !episode.url) {
                  showToast("Próximo episódio não está disponível.", true);
                  return; // Don't proceed if next/prev is unplayable
             }

            // Save progress of the current episode before switching
            savePlayerProgress();

            // Create new context for the next episode
            const newContext = {
                ...currentPlayerContext,
                videoUrl: episode.url,
                title: `${currentPlayerContext.itemData.name} - T${episode.season_number} E${episode.episode_number}`,
                currentIndex: newIndex,
                 startTime: 0 // Start next episode from beginning
            };
            // No need to change itemData or episodes array if just changing index

            showPlayer(newContext); // Load the new episode
        } else {
             console.log("No more episodes in this direction.");
             // Optionally show a message or close player if at the end
             if (direction > 0) { // If trying to go past the last episode
                  hidePlayer(); // Close player after last episode finishes implicitly
             }
        }
    }


    nextEpisodeBtn.addEventListener('click', (e) => { e.stopPropagation(); changeEpisode(1); }); // Stop propagation
    prevEpisodeBtn.addEventListener('click', (e) => { e.stopPropagation(); changeEpisode(-1); }); // Stop propagation

    fullscreenBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Stop propagation
        if (!document.fullscreenElement) {
            playerView.requestFullscreen().catch(err => console.error(`Fullscreen error: ${err.message}`));
        } else {
            document.exitFullscreen();
        }
    });

    // Fullscreen change listener remains largely the same
    document.addEventListener('fullscreenchange', () => {
        const isFullscreen = !!document.fullscreenElement;
        fullscreenBtn.querySelector('.glass-content').innerHTML = isFullscreen ? ICONS.exitFullscreen : ICONS.fullscreen;

        // Auto-hide player if exiting fullscreen on desktop? Maybe not desired.
        // if (!isFullscreen && !playerView.classList.contains('hidden') && window.innerWidth >= 768) {
        //     hidePlayer();
        // }
    });

    playPauseBtn.addEventListener('click', (e) => { e.stopPropagation(); togglePlay(); }); // Stop propagation
    playerBackBtn.addEventListener('click', (e) => { e.stopPropagation(); history.back(); }); // Stop propagation


    playerView.addEventListener('mousemove', () => {
        playerView.classList.add('controls-active');
        clearTimeout(controlsTimeout);
        if (!videoPlayer.paused) {
            controlsTimeout = setTimeout(() => {
                // Check again if still playing before hiding
                if (!videoPlayer.paused) {
                    playerView.classList.remove('controls-active');
                }
            }, 3000);
        }
    });

    // Stop propagation for settings button click
    settingsBtn.addEventListener('click', (e) => { e.stopPropagation(); settingsPanel.classList.toggle('hidden'); });

    // Global click listener to close settings/notification panels
    document.addEventListener('click', (e) => {
         // Close settings panel
        if (!settingsPanel.classList.contains('hidden') && !settingsBtn.contains(e.target) && !settingsPanel.contains(e.target)) {
             settingsPanel.classList.add('hidden');
        }
         // Close notification panel
        if (!notificationPanel.classList.contains('hidden') && !notificationPanel.contains(e.target) && !notificationBtn.contains(e.target)) {
            notificationPanel.classList.remove('animate-fade-in-down');
            notificationPanel.classList.add('animate-fade-out-up');
            setTimeout(() => notificationPanel.classList.add('hidden'), 250); // Match animation duration
        }
         // Close season selector dropdown
        const openSelectPanel = document.querySelector('#season-options:not(.hidden)');
        if (openSelectPanel && !openSelectPanel.closest('.custom-select-container').contains(e.target)) {
            document.getElementById('season-selector-button')?.click(); // Simulate click to close
        }
    });

    function createSettingsOptions() {
        const speedContainer = document.getElementById('settings-speed-options');
        const qualityContainer = document.getElementById('settings-quality-options');
        // Prevent re-creation if already populated
        if (!speedContainer || !qualityContainer || speedContainer.childElementCount > 1) return;

        const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
        speeds.forEach(speed => {
            const button = document.createElement('button');
            button.className = 'settings-option-btn w-full text-left p-2 rounded hover:bg-white/10';
            button.textContent = speed === 1 ? 'Normal' : `${speed}x`;
            if (speed === 1) button.classList.add('active', 'bg-purple-600/50');
            button.onclick = (e) => {
                 e.stopPropagation(); // Stop propagation
                videoPlayer.playbackRate = speed;
                speedContainer.querySelectorAll('button').forEach(btn => btn.classList.remove('active', 'bg-purple-600/50'));
                button.classList.add('active', 'bg-purple-600/50');
            };
            speedContainer.appendChild(button);
        });

         // Placeholder for quality - HLS quality switching needs HLS.js API integration
        // For now, just display options. Actual switching is complex.
        const qualities = hls ? ['Auto', ...hls.levels.map(level => `${level.height}p`).reverse()] : ['Auto'];
        qualityContainer.innerHTML = `<h4 class="text-xs text-gray-300 px-3 pt-1 pb-2">Qualidade</h4>`; // Reset content
        qualities.forEach((quality, index) => {
            const button = document.createElement('button');
            button.className = 'settings-option-btn w-full text-left p-2 rounded hover:bg-white/10';
            button.textContent = quality;
            button.dataset.level = quality === 'Auto' ? -1 : hls.levels.length - 1 - index ; // Map display order to HLS level index

            if (quality === "Auto") button.classList.add('active', 'bg-purple-600/50');

            button.onclick = (e) => {
                 e.stopPropagation(); // Stop propagation
                qualityContainer.querySelectorAll('button').forEach(btn => btn.classList.remove('active', 'bg-purple-600/50'));
                button.classList.add('active', 'bg-purple-600/50');
                if (hls) {
                     const levelIndex = parseInt(button.dataset.level);
                     hls.currentLevel = levelIndex; // Request level switch
                     console.log(`Qualidade solicitada: ${quality} (Nível HLS: ${levelIndex})`);
                } else {
                     console.log(`Qualidade selecionada: ${quality}. (HLS não ativo)`);
                }
            };
            qualityContainer.appendChild(button);
        });
    }

    // Event listener for Hero Watch Button
    const heroWatchBtn = document.getElementById('hero-watch-btn');
     if (heroWatchBtn) {
        heroWatchBtn.addEventListener('click', () => {
            if (!currentHeroItem || !currentHeroItem.url) {
                 showToast("Vídeo indisponível para este item.", true);
                 return;
            }
             // FIXED: Use the correct URL from the current hero item
            showPlayer({
                videoUrl: currentHeroItem.url,
                title: currentHeroItem.title || currentHeroItem.name,
                itemData: currentHeroItem // Pass Firestore data
            });
        });
     }


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
        createSettingsOptions(); // Create static options once
        addPlayerEventListeners(); // Add dynamic listeners
    }

    // --- Search Event Listeners ---
    searchIconBtn.addEventListener('click', () => toggleSearchOverlay(true));
    closeSearchBtn.addEventListener('click', () => toggleSearchOverlay(false));
    document.getElementById('search-overlay-bg').addEventListener('click', () => toggleSearchOverlay(false));
    searchInput.addEventListener('input', () => { clearTimeout(debounceTimer); debounceTimer = setTimeout(() => { performSearch(searchInput.value); }, 400); });

    const mobileSearchBtn = document.getElementById('mobile-search-btn');
    if (mobileSearchBtn) {
        mobileSearchBtn.addEventListener('click', (e) => {
            e.preventDefault();
            // Don't change hash for search, just open overlay
            toggleSearchOverlay(true);
             // Visually activate search button without changing view
            document.querySelectorAll('.mobile-nav-item').forEach(item => item.classList.remove('active'));
            mobileSearchBtn.classList.add('active');
            updateMobileNavIndicator();
        });
    }

    // --- Notification Event Listeners ---
    notificationBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        renderNotifications(); // Re-render every time it's opened
        const isHidden = notificationPanel.classList.contains('hidden');
        if (isHidden) {
            notificationPanel.classList.remove('hidden', 'animate-fade-out-up');
            notificationPanel.classList.add('animate-fade-in-down');
        } else {
            notificationPanel.classList.remove('animate-fade-in-down');
            notificationPanel.classList.add('animate-fade-out-up');
            setTimeout(() => notificationPanel.classList.add('hidden'), 250);
        }

        // Mark notifications as read when panel is opened
        if (notifications.length > 0 && notifications[0].createdAt) {
             // Use the timestamp of the latest notification fetched
            const latestTimestamp = notifications.reduce((latest, current) => {
                 const currentTime = current.createdAt?.toMillis ? current.createdAt.toMillis() : new Date(current.createdAt).getTime();
                 return Math.max(latest, currentTime);
            }, 0);

            // Update last check time only if there are newer notifications
             if (latestTimestamp > lastNotificationCheck) {
                lastNotificationCheck = latestTimestamp;
                localStorage.setItem('starlight-lastNotificationCheck', latestTimestamp);
             }
            updateNotificationBell(); // Update bell immediately (remove dot)
        }
    });

    // --- Hash Change and Popstate (Back Button) Handler ---
     function handleNavigationChange(event) {
        console.log("Navigation Change:", window.location.hash, "Event State:", event?.state); // Debug log

        // If auth is not ready, do nothing yet. Auth listener will handle initial load.
        if (!authReady) {
             console.log("Auth not ready, ignoring navigation change.");
             return;
        }

        const hash = window.location.hash;
        const wasPlayerOpen = !playerView.classList.contains('hidden');
        const wasDetailsOpen = !detailsView.classList.contains('hidden');

        // Determine the target view ID from the hash
        let targetViewId = 'home-view'; // Default
        if (hash.startsWith('#details/')) {
            targetViewId = 'details-view';
        } else if (hash && hash.length > 1 && document.getElementById(hash.substring(1))) {
            targetViewId = hash.substring(1);
        }

         // Close Player if navigating away from #player
         if (hash !== '#player' && wasPlayerOpen) {
            hidePlayer(false); // Hide UI without double-saving progress or history manipulation
         }

         // Close Details if navigating away from #details/...
         if (!hash.startsWith('#details/') && wasDetailsOpen) {
             detailsView.classList.add('hidden');
             currentDetailsItem = null; // Clear details item
         }


        // Handle showing the target view
        if (targetViewId === 'details-view') {
            const docId = hash.split('/')[1];
            showDetailsView({ docId }); // This function handles its own UI updates
        } else if (targetViewId === 'player') {
             // This case should ideally not be reached directly by hash change after initial load
             // Player is shown programmatically. If we land here, maybe go back?
             console.warn("Landed on #player via hash change/popstate unexpectedly.");
             if (history.state && history.state.returnHash) {
                  window.location.hash = history.state.returnHash; // Go back to where player was opened from
             } else {
                  window.location.hash = '#home-view'; // Fallback
             }
        } else {
            // Standard view (Home, Series, Movies, etc.)
            const targetView = document.getElementById(targetViewId);
            if (targetView) {
                 // Hide all other main content views
                document.querySelectorAll('.content-view').forEach(view => {
                    if (view.id !== targetViewId) {
                        view.classList.add('hidden');
                    }
                });
                targetView.classList.remove('hidden'); // Show target view
                updateAppUIForView(targetViewId); // Update header/footer/nav
                renderScreenContent(targetViewId); // Load content for the view
            } else {
                 // If target view doesn't exist, redirect to home
                 console.warn("Target view not found for hash:", hash, "Redirecting to home.");
                 window.location.hash = '#home-view';
            }
        }
     }

     window.addEventListener('hashchange', handleNavigationChange);
     // Use popstate for back/forward button navigation
     window.addEventListener('popstate', handleNavigationChange);



    // --- Notification Logic ---
    function listenForNotifications() {
        const q = query(collection(db, "notifications"), orderBy("createdAt", "desc"));
        onSnapshot(q, (snapshot) => {
            notifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            updateNotificationBell();
        }, (error) => {
             console.error("Erro ao ouvir notificações:", error);
        });
    }

    function updateNotificationBell() {
        // Check if there's any notification newer than the last check time
        // AND is not a 'Novidade' type that has been dismissed.
        const hasNew = notifications.some(n => {
            // Ensure createdAt exists and convert to timestamp
            const notifTime = n.createdAt?.toMillis ? n.createdAt.toMillis() : (n.createdAt ? new Date(n.createdAt).getTime() : 0);
            if (notifTime === 0) return false; // Skip if no valid timestamp

            const isNewer = notifTime > lastNotificationCheck;
            const isDismissed = n.type === 'Novidade' && dismissedNotifications.includes(n.id);

            return isNewer && !isDismissed;
        });

        notificationBtn.classList.toggle('has-new', hasNew);
    }


    function renderNotifications() {
        const avisosContainer = document.getElementById('notifications-avisos');
        const novidadesContainer = document.getElementById('notifications-novidades');
         if (!avisosContainer || !novidadesContainer) return;

        // Separate notifications by type
        const avisos = notifications.filter(n => n.type === 'Aviso');
        // Filter out dismissed 'Novidade' items
        const novidades = notifications.filter(n => n.type === 'Novidade' && !dismissedNotifications.includes(n.id));

        const createNotifHTML = (notif, isDismissable) => {
             // Basic sanitation or escaping might be needed here if content is user-generated
             const title = notif.title || 'Sem título';
             const message = notif.message || '';
            const dismissBtn = isDismissable ? `<button class="remove-notification-btn text-stone-500 hover:text-white ml-auto flex-shrink-0" data-notif-id="${notif.id}" aria-label="Dispensar"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>` : '';
            return `
                <div class="notification-item flex items-start gap-3 p-2 rounded-md transition-colors hover:bg-white/5">
                    <div class="flex-grow min-w-0"> <!-- Added min-w-0 for proper wrapping -->
                        <p class="font-semibold text-white text-sm truncate">${title}</p> <!-- Use truncate -->
                        <p class="text-stone-300 text-xs notification-message mt-1">${message}</p> <!-- Smaller text -->
                    </div>
                    ${dismissBtn}
                </div>`;
        };

        avisosContainer.innerHTML = avisos.length > 0 ? avisos.map(n => createNotifHTML(n, false)).join('') : '<p class="text-stone-400 text-center text-sm p-4">Nenhum aviso.</p>';
        novidadesContainer.innerHTML = novidades.length > 0 ? novidades.map(n => createNotifHTML(n, true)).join('') : '<p class="text-stone-400 text-center text-sm p-4">Nenhuma novidade.</p>';
    }

    // Event delegation for notification tabs and dismiss buttons
    notificationPanel.addEventListener('click', (e) => {
        // Handle tab switching
        const tab = e.target.closest('.notification-tab');
        if (tab) {
            notificationPanel.querySelectorAll('.notification-tab').forEach(t => t.classList.remove('active'));
            notificationPanel.querySelectorAll('.notification-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            const targetContent = document.getElementById(`notifications-${tab.dataset.tab}`);
            if (targetContent) targetContent.classList.add('active');
            return; // Stop processing if it was a tab click
        }

        // Handle dismiss button click
        const removeBtn = e.target.closest('.remove-notification-btn');
        if (removeBtn) {
            const notifId = removeBtn.dataset.notifId;
            if (notifId && !dismissedNotifications.includes(notifId)) {
                dismissedNotifications.push(notifId);
                // Persist dismissed IDs
                localStorage.setItem('starlight-dismissedNotifications', JSON.stringify(dismissedNotifications));
                updateNotificationBell(); // Update bell immediately
            }
             // Remove the item visually
            const itemToRemove = removeBtn.closest('.notification-item');
             if(itemToRemove) itemToRemove.remove();

             // Check if the container is now empty
             const novidadesContainer = document.getElementById('notifications-novidades');
             if (novidadesContainer && novidadesContainer.children.length === 0) {
                 novidadesContainer.innerHTML = '<p class="text-stone-400 text-center text-sm p-4">Nenhuma novidade.</p>';
             }
        }
    });


    // --- Requests Logic ---
    let requestsUnsubscribe = null;
    function listenToRequests() {
        if (requestsUnsubscribe) requestsUnsubscribe(); // Unsubscribe previous listener

        const q = query(collection(db, "pedidos"), where("status", "==", "pending"));
        requestsUnsubscribe = onSnapshot(q, (snapshot) => {
            pendingRequests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Sort client-side by creation date (descending)
             pendingRequests.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));

            // Re-render only if the requests view is currently visible
            if (!document.getElementById('requests-view').classList.contains('hidden')) {
                renderPendingRequests();
            }
        }, (error) => {
            console.error("Error listening to requests: ", error);
            // Optionally show toast only if the view is active?
            // showToast("Erro ao carregar pedidos.", true);
        });
    }

    async function handleVote(requestId) {
        if (!userId || !currentProfile) {
            showToast("Você precisa estar logado e ter um perfil selecionado para votar.", true);
            return;
        }
        const docRef = doc(db, 'pedidos', requestId);
        const voteButton = document.querySelector(`.vote-btn[data-request-id="${requestId}"]`);
        if (voteButton) voteButton.disabled = true; // Disable button during operation

        try {
            const docSnap = await getDoc(docRef);
            if (!docSnap.exists()) {
                showToast("Este pedido não existe mais.", true);
                 // Remove the item from the local array and re-render if necessary
                 pendingRequests = pendingRequests.filter(req => req.id !== requestId);
                 if (!document.getElementById('requests-view').classList.contains('hidden')) {
                      renderPendingRequests();
                 }
                return;
            }
            const requestData = docSnap.data();
            const requesters = requestData.requesters || [];
            // Check if user has already voted using userId
            const userVoteIndex = requesters.findIndex(r => r.userId === userId);

            if (userVoteIndex > -1) {
                // User has voted, remove the vote (using the object found)
                await updateDoc(docRef, {
                    requesters: arrayRemove(requesters[userVoteIndex])
                });
                showToast('Voto removido.');
            } else {
                // User has not voted, add the vote
                const userVote = { userId: userId, userName: currentProfile.name || 'Usuário' }; // Include username
                await updateDoc(docRef, {
                    requesters: arrayUnion(userVote)
                });
                showToast('Obrigado pelo seu voto!');
            }
            // No need to manually update UI here, onSnapshot will trigger re-render
        } catch (error) {
            console.error("Erro ao processar voto:", error);
            showToast("Ocorreu um erro ao processar seu voto.", true);
        } finally {
             if (voteButton) voteButton.disabled = false; // Re-enable button
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
            // Check if the current logged-in user has voted
            const userHasVoted = userId && (request.requesters || []).some(r => r.userId === userId);
            const title = request.title || request.name || 'Título desconhecido';
            const year = request.year || 'N/A';

            return `
                <div class="liquid-glass-card bg-stone-900/50 rounded-lg overflow-hidden flex flex-col p-4 gap-4">
                    <div class="glass-filter"></div>
                    <div class="glass-overlay"></div>
                    <div class="glass-specular"></div>
                    <div class="glass-content w-full flex items-start gap-4">
                        <img src="${posterPath}" alt="${title}" class="w-20 rounded-md aspect-[2/3] object-cover flex-shrink-0" onerror="this.onerror=null;this.src='https://placehold.co/200x300/1c1917/FFFFFF?text=Sem+Img';">
                        <div class="flex-1 min-w-0"> <!-- Added min-w-0 -->
                            <h4 class="font-bold text-white truncate">${title} (${year})</h4>
                            <p class="text-xs text-indigo-300 mt-1">${requesterCount} ${requesterCount === 1 ? 'voto' : 'votos'}</p>
                            <span class="text-xs font-semibold mt-2 inline-block px-2 py-1 rounded-full bg-yellow-500/20 text-yellow-300">Pendente</span>
                        </div>
                    </div>
                     <button class="vote-btn glass-container glass-button rounded-lg w-full mt-auto ${userHasVoted ? 'voted' : ''}" data-request-id="${request.id}">
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
        lucide.createIcons(); // Re-render Lucide icons
    }


    // --- Profile Management Logic ---
    async function loadProfiles() {
        if (!userId) return;
        profilesGrid.innerHTML = `<div class="col-span-full">${glassSpinnerHTML.replace('min-h-screen', '')}</div>`; // Loading indicator
        try {
            const profilesCol = collection(db, 'users', userId, 'profiles');
            const snapshot = await getDocs(profilesCol);
            profiles = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderProfiles(); // Render after fetching
        } catch (error) {
             console.error("Error loading profiles:", error);
             profilesGrid.innerHTML = '<p class="col-span-full text-center text-red-500">Erro ao carregar perfis.</p>';
             showToast("Não foi possível carregar os perfis.", true);
        }
    }

    function renderProfiles() {
        profilesGrid.innerHTML = ''; // Clear previous profiles or loading indicator
        profiles.forEach((profile) => {
            const profileCard = document.createElement('div');
            profileCard.className = 'cursor-pointer group text-center'; // Added text-center
            profileCard.dataset.id = profile.id;
            profileCard.innerHTML = `
                <div class="relative w-3/4 sm:w-full aspect-square liquid-glass-card mx-auto"> <!-- Centered image container -->
                     <div class="glass-filter"></div><div class="glass-distortion-overlay"></div><div class="glass-overlay"></div><div class="glass-specular"></div>
                     <div class="glass-content p-0">
                        <img src="${profile.avatar}" alt="${profile.name}" class="w-full h-full object-cover rounded-[inherit]" onerror="this.onerror=null;this.src='https://placehold.co/200x200/44403c/FFFFFF?text=Avatar';">
                        <div class="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity ${isEditMode ? '!opacity-100 bg-black/70' : ''}"> <!-- Darker overlay in edit mode -->
                            <svg class="w-10 h-10 sm:w-12 sm:h-12 text-white ${isEditMode ? '' : 'hidden'}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L16.732 3.732z"></path></svg>
                        </div>
                     </div>
                </div>
                <p class="text-center text-base sm:text-lg text-gray-300 group-hover:text-white mt-3 transition-colors truncate">${profile.name}</p>
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

        // Add "Add Profile" card if needed
        if (profiles.length < 4) {
            const addProfileCard = document.createElement('div');
            addProfileCard.className = 'cursor-pointer group text-center';
            addProfileCard.innerHTML = `
                <div class="relative w-3/4 sm:w-full aspect-square liquid-glass-card flex items-center justify-center mx-auto border-2 border-dashed border-gray-600 hover:border-gray-400 transition-colors"> <!-- Dashed border -->
                    <div class="glass-filter opacity-50"></div><div class="glass-distortion-overlay opacity-50"></div><div class="glass-overlay bg-transparent"></div><div class="glass-specular opacity-50"></div>
                    <div class="glass-content flex items-center justify-center">
                        <svg class="w-12 h-12 sm:w-16 sm:h-16 text-gray-400 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6v12M6 12h12"></path></svg>
                    </div>
                </div>
                <p class="text-center text-base sm:text-lg text-gray-300 group-hover:text-white mt-3 transition-colors">Adicionar Perfil</p>
            `;
            addProfileCard.addEventListener('click', () => showProfileModal());
            profilesGrid.appendChild(addProfileCard);
        }
         attachGlassButtonListeners(); // Ensure listeners are attached to new cards
    }


    async function selectAndEnterProfile(profile) {
        currentProfile = profile;

        // Update header profile button appearance
        const avatarImg = new Image();
        avatarImg.onload = () => {
            headerProfileBtn.innerHTML = ''; // Clear previous content
            headerProfileBtn.appendChild(avatarImg);
        };
        avatarImg.onerror = () => {
             headerProfileBtn.innerHTML = profile.name ? profile.name.charAt(0).toUpperCase() : '?'; // Fallback to initial
             headerProfileBtn.style.backgroundImage = ''; // Clear potential background image
             headerProfileBtn.classList.add('bg-purple-500'); // Ensure fallback background color
        };
        avatarImg.src = currentProfile.avatar;
        avatarImg.alt = `Avatar de ${currentProfile.name}`;
        avatarImg.className = 'w-full h-full object-cover rounded-full';
        headerProfileBtn.classList.remove('bg-purple-500'); // Remove initial background if image loads


        // Navigate to the last known view or home view
        const targetHash = window.location.hash || '#home-view';
         // Ensure we don't land on login/manage profile after selecting one
         if (targetHash === '#login-view' || targetHash === '#manage-profile-view' || targetHash === '#player' || targetHash.startsWith('#details/')) {
              window.location.hash = '#home-view'; // Redirect to home
         } else {
              handleNavigationChange(); // Trigger navigation to the correct view based on current hash
         }

        // Make sure app UI is visible (header/footer) - handleNavigationChange should do this
        updateAppUIForView(getCurrentVisibleViewId());

        // Start listening to content AFTER profile selection
        await listenToFirestoreContent(); // Fetch/listen to content for this profile
        await populateMyList(); // Fetch initial list for this profile
         // Fetch watch progress (optional, could be lazy-loaded)
         // await getProgressStorage();

         // Fetch notifications and requests (listeners should already be active from auth state change)
    }

    function showProfileModal(profileId = null) {
        const modalTitle = document.getElementById('modal-title');
        const nameInput = document.getElementById('profile-name-input');
        const idInput = document.getElementById('profile-id-input');
        const deleteBtn = document.getElementById('delete-profile-btn');

        avatarOptionsContainer.innerHTML = AVATARS.map(avatar => `
            <img src="${avatar}" alt="Opção de Avatar" class="w-16 h-16 rounded-full cursor-pointer border-2 border-transparent hover:border-white transition-all" data-avatar="${avatar}" onerror="this.onerror=null;this.style.display='none';">
        `).join('');

        let existingProfile = null;
        if (profileId) { // Editing existing profile
             existingProfile = profiles.find(p => p.id === profileId);
             if (!existingProfile) {
                  showToast("Perfil não encontrado para edição.", true);
                  return; // Don't open modal if profile doesn't exist
             }
            modalTitle.textContent = 'Editar Perfil';
            nameInput.value = existingProfile.name;
            idInput.value = existingProfile.id;
            deleteBtn.classList.remove('hidden');
            const currentAvatar = avatarOptionsContainer.querySelector(`img[data-avatar="${existingProfile.avatar}"]`);
            if(currentAvatar) currentAvatar.classList.add('!border-purple-500', 'scale-110');
            else { /* Handle case where saved avatar URL is no longer in AVATARS */ }
        } else { // Adding new profile
            modalTitle.textContent = 'Adicionar Perfil';
            nameInput.value = '';
            idInput.value = '';
            deleteBtn.classList.add('hidden');
            // Select the first avatar by default
             const firstAvatar = avatarOptionsContainer.querySelector('img');
             if (firstAvatar) firstAvatar.classList.add('!border-purple-500', 'scale-110');
        }

        profileModal.classList.remove('hidden');
    }

    avatarOptionsContainer.addEventListener('click', e => {
        if(e.target.tagName === 'IMG' && e.target.dataset.avatar) {
            avatarOptionsContainer.querySelectorAll('img').forEach(img => img.classList.remove('!border-purple-500', 'scale-110'));
            e.target.classList.add('!border-purple-500', 'scale-110');
        }
    });

    document.getElementById('save-profile-btn').addEventListener('click', async () => {
        const name = document.getElementById('profile-name-input').value.trim();
        const selectedAvatarElement = document.querySelector('#avatar-options .scale-110');
        const selectedAvatar = selectedAvatarElement?.dataset.avatar; // Get URL from selected element
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
        const saveBtn = document.getElementById('save-profile-btn');
        saveBtn.disabled = true; // Disable button during save

        try {
            if (profileId) { // Update existing profile
                const docRef = doc(db, 'users', userId, 'profiles', profileId);
                await updateDoc(docRef, profileData);
                showToast('Perfil atualizado com sucesso!');
            } else { // Add new profile
                if (profiles.length >= 4) {
                     showToast('Limite de perfis atingido.', true);
                     saveBtn.disabled = false;
                     return;
                }
                const colRef = collection(db, 'users', userId, 'profiles');
                await addDoc(colRef, profileData);
                showToast('Perfil criado com sucesso!');
            }
            await loadProfiles(); // Reload profiles from Firestore
            profileModal.classList.add('hidden'); // Close modal on success
        } catch (error) {
            console.error("Erro ao salvar perfil: ", error);
            showToast('Não foi possível salvar o perfil.', true);
        } finally {
            saveBtn.disabled = false; // Re-enable button
        }
    });


    document.getElementById('cancel-profile-btn').addEventListener('click', () => profileModal.classList.add('hidden'));

    document.getElementById('delete-profile-btn').addEventListener('click', async () => {
        const profileId = document.getElementById('profile-id-input').value;
        const profileToDelete = profiles.find(p => p.id === profileId);

        if (profileId && profileToDelete) {
             if (profiles.length <= 1) {
                 showToast('Não é possível excluir o único perfil.', true);
                 return;
             }

             // FIXED: Use custom confirmation modal
             showConfirmationModal(
                 'Excluir Perfil',
                 `Tem certeza que deseja excluir o perfil "${profileToDelete.name}"? Esta ação não pode ser desfeita.`,
                 async () => { // This function runs if user confirms
                     const deleteBtn = document.getElementById('delete-profile-btn');
                     deleteBtn.disabled = true; // Disable button during deletion
                     try {
                         const docRef = doc(db, 'users', userId, 'profiles', profileId);
                         await deleteDoc(docRef);
                         showToast('Perfil excluído.');
                         await loadProfiles(); // Refresh profile list
                         profileModal.classList.add('hidden'); // Close modal
                     } catch (error) {
                         console.error("Erro ao excluir perfil: ", error);
                         showToast('Não foi possível excluir o perfil.', true);
                     } finally {
                          deleteBtn.disabled = false; // Re-enable button
                     }
                 }
             );
        } else {
             showToast('Perfil inválido para exclusão.', true);
        }
    });


    manageProfilesBtn.addEventListener('click', () => {
        isEditMode = !isEditMode;
        manageProfilesBtn.querySelector('.glass-content').textContent = isEditMode ? 'Concluído' : 'Gerenciar Perfis';
        document.getElementById('profile-main-title').textContent = isEditMode ? 'Gerenciar Perfis' : 'Quem está assistindo?';
        renderProfiles(); // Re-render to show/hide edit icons
    });

    headerProfileBtn.addEventListener('click', () => {
        // Navigate to manage profiles screen via hash change
        window.location.hash = '#manage-profile-view';
    });


    // --- Form Switching & Firebase Auth Logic ---
    const switchToRegister = document.querySelector('.switch-to-register');
    const switchToLogin = document.querySelector('.switch-to-login');
    const loginFormContainer = document.querySelector('.form-container.login');
    const registerFormContainer = document.querySelector('.form-container.register');

    switchToRegister?.addEventListener('click', (e) => {
        e.preventDefault();
        loginFormContainer?.classList.remove('active');
        registerFormContainer?.classList.add('active');
    });

    switchToLogin?.addEventListener('click', (e) => {
        e.preventDefault();
        registerFormContainer?.classList.remove('active');
        loginFormContainer?.classList.add('active');
    });

    document.getElementById('login-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        signInWithEmailAndPassword(auth, email, password)
            .catch((error) => {
                console.error("Erro de login:", error.code, error.message);
                showToast(`Erro de login: ${error.code}`, true); // Show code, not full message
            });
    });

    document.getElementById('register-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;
        createUserWithEmailAndPassword(auth, email, password)
             // Automatically create a default profile on successful registration
            .then(async (userCredential) => {
                 const user = userCredential.user;
                 userId = user.uid; // Set userId immediately
                 const defaultProfile = {
                      name: email.split('@')[0], // Use part of email as default name
                      avatar: AVATARS[0] // Use first default avatar
                 };
                 const colRef = collection(db, 'users', userId, 'profiles');
                 await addDoc(colRef, defaultProfile);
                 // Auth state listener will handle showing the profile screen
            })
            .catch((error) => {
                console.error("Erro de registro:", error.code, error.message);
                showToast(`Erro de registro: ${error.code}`, true); // Show code, not full message
            });
    });

    document.getElementById('google-signin-btn')?.addEventListener('click', () => {
        signInWithPopup(auth, googleProvider)
             // Check if user is new, if so, create default profile
             .then(async (result) => {
                 const user = result.user;
                 userId = user.uid;
                 // Check if profiles collection exists or is empty
                 const profilesCol = collection(db, 'users', userId, 'profiles');
                 const snapshot = await getDocs(query(profilesCol, limit(1))); // Check if at least one profile exists
                 if (snapshot.empty) {
                      // New user or no profiles, create default
                      const defaultProfile = {
                           name: user.displayName || user.email.split('@')[0],
                           avatar: user.photoURL || AVATARS[0] // Use Google photo or default
                      };
                      await addDoc(profilesCol, defaultProfile);
                 }
                  // Auth state listener will handle showing the profile screen
             })
            .catch((error) => {
                console.error("Erro de login com Google:", error.code, error.message);
                showToast(`Erro com Google: ${error.code}`, true); // Show code, not full message
            });
    });

    logoutBtn.addEventListener('click', () => {
        showConfirmationModal('Sair da Conta', 'Tem certeza que deseja sair?', () => {
             signOut(auth).catch((error) => {
                 console.error("Erro ao sair:", error);
                 showToast(`Erro ao sair: ${error.message}`, true);
             });
        });
    });

    // --- Confirmation Modal Logic ---
    function showConfirmationModal(title, message, onConfirm) {
        confirmTitle.textContent = title;
        confirmMessage.textContent = message;
        // Remove previous listener before adding new one
        const newOkBtn = confirmOkBtn.cloneNode(true);
        confirmOkBtn.parentNode.replaceChild(newOkBtn, confirmOkBtn);
        confirmOkBtn = newOkBtn; // Update reference

        confirmOkBtn.addEventListener('click', () => {
            if (onConfirm) {
                onConfirm();
            }
            confirmModal.classList.add('hidden');
        }, { once: true }); // Use once to auto-remove listener

        confirmModal.classList.remove('hidden');
    }

    confirmCancelBtn.addEventListener('click', () => {
        confirmModal.classList.add('hidden');
        // No need to handle confirmCallback here as okBtn uses 'once'
    });

    // --- TMDB Search for Requests ---
    const tmdbSearchInput = document.getElementById('tmdb-search-input');
    tmdbSearchInput?.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            handleTmdbSearch(tmdbSearchInput.value);
        }, 500);
    });

    async function handleTmdbSearch(query) {
        const resultsContainer = document.getElementById('tmdb-search-results');
         if (!resultsContainer) return;

        if (!query || query.length < 3) {
            resultsContainer.innerHTML = ''; // Clear results if query is too short
            return;
        }
        resultsContainer.innerHTML = `<div class="col-span-full">${glassSpinnerHTML.replace('min-h-screen', '')}</div>`;
        const data = await fetchFromTMDB('search/multi', `query=${encodeURIComponent(query)}&include_adult=false`); // Added include_adult=false
        if (data && data.results) {
            const filtered = data.results.filter(item =>
                (item.media_type === 'movie' || item.media_type === 'tv') && item.poster_path
            );
            renderTmdbResults(filtered);
        } else {
            resultsContainer.innerHTML = `<p class="col-span-full text-center text-gray-400">Nenhum resultado encontrado no TMDB.</p>`;
        }
    }

    function renderTmdbResults(results) {
        const container = document.getElementById('tmdb-search-results');
         if (!container) return;

        if (results.length === 0) {
            container.innerHTML = `<p class="col-span-full text-center text-gray-400">Nenhum filme ou série encontrado no TMDB.</p>`;
            return;
        }
        container.innerHTML = results.map(item => {
            const posterPath = item.poster_path ? `${IMG_URL_POSTER}${item.poster_path}` : 'https://placehold.co/300x450/1c1917/FFFFFF?text=Sem+Imagem';
            const title = item.title || item.name || 'Desconhecido';
             const year = (item.release_date || item.first_air_date || '').substring(0, 4);
             // Escape single quotes in title for the JSON string
             const safeItemData = JSON.stringify(item).replace(/'/g, "\\'");
            return `
            <div class="cursor-pointer group tmdb-result-item text-center" data-item='${safeItemData}'>
                <div class="liquid-glass-card aspect-[2/3] bg-stone-800 mx-auto w-full"> <!-- Ensure card takes width -->
                    <div class="glass-filter"></div>
                    <div class="glass-overlay" style="--bg-color: rgba(0,0,0,0.1);"></div>
                    <div class="glass-specular"></div>
                    <div class="glass-content p-0">
                        <img src="${posterPath}" alt="${title}" loading="lazy" class="w-full h-full object-cover rounded-[inherit]" onerror="this.onerror=null;this.src='https://placehold.co/300x450/1c1917/FFFFFF?text=Sem+Imagem';">
                    </div>
                </div>
                <h4 class="text-white text-xs mt-2 truncate">${title} ${year ? `(${year})` : ''}</h4>
            </div>
            `;
        }).join('');
        attachGlassButtonListeners();
    }

    document.getElementById('tmdb-search-results')?.addEventListener('click', (e) => {
        const itemElement = e.target.closest('.tmdb-result-item');
        if (itemElement && itemElement.dataset.item) {
             try {
                const itemData = JSON.parse(itemElement.dataset.item);
                confirmAndAddRequest(itemData);
             } catch (err) {
                  console.error("Error parsing TMDB item data:", err);
                  showToast("Erro ao processar item selecionado.", true);
             }
        }
    });

    document.getElementById('pending-requests-container')?.addEventListener('click', e => {
        const voteButton = e.target.closest('.vote-btn');
        if (voteButton) {
            const requestId = voteButton.dataset.requestId;
            if (requestId) handleVote(requestId);
        }
    });

    async function confirmAndAddRequest(item) {
        const title = item.title || item.name || 'este item';
        const year = (item.release_date || item.first_air_date || '').substring(0, 4);
        const requestTitle = `${title}${year ? ` (${year})` : ''}`;

        // Check if item already exists in Firestore content (more reliable check)
         const alreadyInCatalog = firestoreContent.some(c => c.tmdbId === item.id && c.type === item.media_type);
         if (alreadyInCatalog) {
             showToast(`"${requestTitle}" já está disponível no catálogo.`, true);
             return;
         }

         // Check if a pending request already exists for this TMDB ID
         const existingRequest = pendingRequests.find(r => r.tmdbId === item.id && r.mediaType === item.media_type);

        showConfirmationModal(
            'Confirmar Pedido',
            `Deseja solicitar a adição de "${requestTitle}"?`,
            async () => {
                if (!userId || !currentProfile) {
                    showToast("Você precisa estar logado e ter um perfil selecionado.", true);
                    return;
                }

                if (existingRequest) {
                    // Request exists, check if user already voted
                    const userHasRequested = existingRequest.requesters && existingRequest.requesters.some(r => r.userId === userId);
                    if (userHasRequested) {
                        showToast('Você já apoiou este pedido.', true);
                        return; // Do nothing more
                    }
                    // Add user's vote to existing request
                    try {
                        const docRef = doc(db, 'pedidos', existingRequest.id);
                        await updateDoc(docRef, {
                            requesters: arrayUnion({ userId: userId, userName: currentProfile.name || 'Usuário' })
                        });
                        showToast('Seu apoio ao pedido foi adicionado!');
                         // Snapshot listener will update the UI
                    } catch (error) {
                        console.error("Erro ao apoiar pedido existente:", error);
                        showToast('Ocorreu um erro ao apoiar o pedido.', true);
                    }
                } else {
                    // Create a new request
                    const requestData = {
                        tmdbId: item.id,
                        title: item.title || item.name, // Store original title/name
                        year: year,
                        posterUrl: item.poster_path ? `${IMG_URL_POSTER}${item.poster_path}` : null, // Store path or null
                        mediaType: item.media_type,
                        status: 'pending',
                        createdAt: serverTimestamp(),
                        requesters: [{ userId: userId, userName: currentProfile.name || 'Usuário' }]
                    };

                    try {
                        await addDoc(collection(db, 'pedidos'), requestData);
                        showToast('Pedido enviado com sucesso!');
                         // Snapshot listener will update the UI
                    } catch (error) {
                        console.error("Erro ao adicionar novo pedido:", error);
                        showToast('Ocorreu um erro ao enviar o pedido.', true);
                    }
                }
                 // Clear search results after successful request/vote
                 document.getElementById('tmdb-search-results').innerHTML = '';
                 document.getElementById('tmdb-search-input').value = '';
            }
        );
    }


    // --- Initial Load and Auth State Change ---
    function showLoginScreen() {
        console.log("Showing Login Screen");
        userId = null;
        currentProfile = null;
        authReady = true; // Mark auth as ready (no user)
        // Ensure all app views are hidden
        views.forEach(view => view.classList.add('hidden'));
        // Show only login
        loginView.classList.remove('hidden');
        // Hide header/footer
        updateAppUIForView('login-view');
         // Clean up listeners if necessary
         if (contentUnsubscribe) contentUnsubscribe();
         if (featuredUnsubscribe) featuredUnsubscribe();
         if (requestsUnsubscribe) requestsUnsubscribe();
         contentUnsubscribe = null;
         featuredUnsubscribe = null;
         requestsUnsubscribe = null;
         firestoreContent = [];
         featuredItemIds = [];
         pendingRequests = [];
         profiles = [];
    }

    async function showProfileScreen() {
        console.log("Showing Profile Screen");
         // Hide other views
        views.forEach(view => view.classList.add('hidden'));
        loginView.classList.add('hidden'); // Ensure login is hidden
         // Show profile selection
        manageProfileView.classList.remove('hidden');
         // Hide header/footer for profile screen
         updateAppUIForView('manage-profile-view');

        // Reset edit mode state
        isEditMode = false;
        manageProfilesBtn.querySelector('.glass-content').textContent = 'Gerenciar Perfis';
        document.getElementById('profile-main-title').textContent = 'Quem está assistindo?';

        // Load profiles for the current user
        await loadProfiles();
    }


    onAuthStateChanged(auth, async (user) => {
        document.body.classList.remove('auth-loading'); // Show body content
        if (user) {
            console.log("Auth State Changed: User Logged In", user.uid);
            userId = user.uid;
            authReady = true; // Mark auth as ready

            // Start listeners that depend only on user ID
             listenForNotifications();
             listenToRequests();

            // Check if user has profiles, then show profile screen
            // Do this check here to avoid flicker if they have no profiles yet
            const profilesCol = collection(db, 'users', userId, 'profiles');
            const snapshot = await getDocs(query(profilesCol, limit(1)));
             if (snapshot.empty && (user.providerData.length === 0 || user.providerData[0].providerId === 'password')) {
                 // If email/pass user has no profiles, create one
                 console.log("Creating default profile for email user.");
                 const defaultProfile = {
                      name: user.email.split('@')[0],
                      avatar: AVATARS[0]
                 };
                 await addDoc(profilesCol, defaultProfile);
                  showProfileScreen(); // Now show profile screen
             } else if (snapshot.empty && user.providerData[0].providerId === 'google.com') {
                  // If Google user has no profiles, create one
                 console.log("Creating default profile for Google user.");
                  const defaultProfile = {
                       name: user.displayName || user.email.split('@')[0],
                       avatar: user.photoURL || AVATARS[0]
                  };
                  await addDoc(profilesCol, defaultProfile);
                  showProfileScreen(); // Now show profile screen
             }
             else {
                 // User exists and likely has profiles, show selection screen
                 showProfileScreen();
             }
            initializeUI(); // Initialize player UI elements etc.
        } else {
            console.log("Auth State Changed: User Logged Out");
            showLoginScreen(); // Show login if no user
        }

         // Trigger initial navigation handling AFTER auth state is determined
         // But only if a profile is selected OR user is logged out
         if ((user && currentProfile) || !user) {
            handleNavigationChange();
         }
    });

    // Initial setup calls
    attachGlassButtonListeners(); // Attach static listeners
    window.addEventListener('resize', updateMobileNavIndicator); // Handle mobile nav resizing

}); // End DOMContentLoaded

