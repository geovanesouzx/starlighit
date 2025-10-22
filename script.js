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
    // --- Configuração do Firebase ---
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
    const playerCenterPlayBtn = document.getElementById('player-center-play-btn');


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
        play: `<i data-lucide="play" class="w-8 h-8 ml-1"></i>`,
        pause: `<i data-lucide="pause" class="w-8 h-8"></i>`,
        skipForward: `<i data-lucide="skip-forward" class="w-6 h-6"></i>`,
        skipBackward: `<i data-lucide="skip-back" class="w-6 h-6"></i>`,
        rewind10: `<i data-lucide="rotate-ccw" class="w-6 h-6"></i>`,
        fastForward10: `<i data-lucide="rotate-cw" class="w-6 h-6"></i>`,
        volumeHigh: `<i data-lucide="volume-2" class="w-6 h-6"></i>`,
        volumeMute: `<i data-lucide="volume-x" class="w-6 h-6"></i>`,
        fullscreen: `<i data-lucide="maximize" class="w-6 h-6"></i>`,
        exitFullscreen: `<i data-lucide="minimize" class="w-6 h-6"></i>`,
        settings: `<i data-lucide="settings-2" class="w-6 h-6"></i>`,
        back: `<i data-lucide="arrow-left" class="w-6 h-6"></i>`
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
        const itemId = String(item.docId || item.id);
        const docRef = doc(db, 'users', userId, 'profiles', currentProfile.id, 'my-list', itemId);
        const isInList = await checkIfInList(itemId);

        if (isInList) {
            await deleteDoc(docRef);
        } else {
            const itemToAdd = { ...item, media_type: item.media_type || (item.title ? 'movie' : 'tv')};
            await setDoc(docRef, itemToAdd);
        }
        
        updateListButtons(item);
        if (document.getElementById('mylist-view').classList.contains('active')) {
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

    // --- UI Creation Functions ---
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
        if (!data || data.length === 0) return;
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
                    <img src="${posterPath}" alt="Pôster de ${item.title}" loading="lazy" class="w-full h-full object-cover rounded-[inherit]">
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
                    <img src="${posterPath}" alt="Pôster de ${item.title}" loading="lazy" class="w-full h-full object-cover rounded-[inherit]">
                 </div>
            </div>
            <h4 class="text-white text-sm mt-2 truncate">${item.title}</h4>
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
            heroContentWrapper.classList.remove('hero-fade-out');
        }, 500); 
    }
    
    async function updateListButton(button, item) {
        if (!button || !item) return;
        const itemId = String(item.docId || item.id);
        const isInList = await checkIfInList(itemId);
        const contentDiv = button.querySelector('.glass-content');
        contentDiv.innerHTML = isInList ? `<svg class="w-5 h-5 sm:w-6 sm:h-6" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path></svg><span>Na Lista</span>` : `<svg class="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg><span>Minha Lista</span>`;
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
    
    async function listenToFirestoreContent() {
        onSnapshot(collection(db, 'content'), (snapshot) => {
            firestoreContent = [];
            snapshot.forEach(doc => {
                firestoreContent.push({ docId: doc.id, ...doc.data() });
            });
            
            onSnapshot(doc(db, 'config', 'featured'), (docSnap) => {
                featuredItemIds = docSnap.exists() ? (docSnap.data().items || []) : [];
                const currentActiveView = document.querySelector('.content-view:not(.hidden)')?.id || 'home-view';
                renderScreenContent(currentActiveView, true);
            });
        });
    }

    async function populateAllViews() {
        const carouselsContainer = document.getElementById('home-carousels-container');
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
    
    // --- Navigation and View Management ---
    const views = document.querySelectorAll('.content-view');
    const navLinks = document.querySelectorAll('.nav-item, .mobile-nav-item');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('data-target');
            if (!targetId) return;
            
            lastActiveViewId = targetId;

            if (targetId !== 'home-view' && heroCarouselInterval) {
                clearInterval(heroCarouselInterval);
                heroCarouselInterval = null;
            } 

            document.querySelectorAll('.nav-item, .mobile-nav-item').forEach(l => l.classList.remove('active'));
            views.forEach(view => view.classList.add('hidden'));
            const targetView = document.getElementById(targetId);
            if(targetView) {
               targetView.classList.remove('hidden');
               renderScreenContent(targetId);
            }
            
            document.querySelectorAll(`[data-target="${targetId}"]`).forEach(l => l.classList.add('active'));
            updateMobileNavIndicator();
            document.getElementById('main-background').style.opacity = (targetId === 'home-view' && currentHeroItem) ? 1 : 0;
        });
    });
    
    function renderScreenContent(screenId, forceReload = false) {
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
        }
        lucide.createIcons();
        attachGlassButtonListeners();
    }

    document.body.addEventListener('click', (e) => {
        const anchor = e.target.closest('a');
        if (anchor && anchor.hash.startsWith('#details/')) {
            e.preventDefault();
            const docId = anchor.hash.split('/')[1];
            showDetailsView({ docId });
        }
    });

    function hideDetailsView() {
        history.back();
    }
    
    async function showDetailsView(item) {
        document.querySelector('header').classList.add('hidden');
        document.querySelector('footer').classList.add('hidden');
        document.querySelectorAll('.content-view').forEach(v => v.classList.add('hidden'));

        detailsView.classList.remove('hidden');
        detailsView.innerHTML = '<div class="spinner mx-auto mt-20"></div>';
        window.scrollTo(0, 0);
        history.pushState({view: 'details'}, '', `#details/${item.docId}`);
        
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
        const finalImageUrl = backgroundUrl.startsWith('http') ? backgroundUrl : 'https://placehold.co/1280x720/0c0a09/ffffff?text=Starlight';
        const posterUrl = data.poster.startsWith('http') ? data.poster : 'https://placehold.co/500x750/1a1a1a/ffffff?text=Capa';

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
        
        const detailsMetaContainer = detailsView.querySelector('#details-meta');
        if (detailsMetaContainer) {
            displayContentRating(data, detailsMetaContainer)
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
                // For TV shows, play the first available episode
                const firstSeasonKey = Object.keys(data.seasons).sort((a,b) => a - b)[0];
                const firstEpisode = data.seasons[firstSeasonKey][0];
                if (firstEpisode) {
                    const allEpisodesOfSeason = data.seasons[firstSeasonKey];
                    const context = {
                        videoUrl: firstEpisode.url,
                        title: `${title} - T${firstEpisode.season_number} E${firstEpisode.episode_number}`,
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
        const firstSeasonKey = seasonKeys[0];

        container.innerHTML = `
            <div class="custom-select-container relative w-full md:w-64 mb-6">
                <button id="season-selector-button" class="glass-container glass-button rounded-lg w-full text-left">
                    <div class="glass-filter"></div>
                    <div class="glass-overlay" style="--glass-bg-color: rgba(25, 25, 25, 0.5);"></div>
                    <div class="glass-specular"></div>
                    <div class="glass-content flex justify-between items-center p-3">
                        <span id="selected-season-text">${data.seasons[firstSeasonKey].title}</span>
                        <i data-lucide="chevron-down" class="w-5 h-5 transition-transform"></i>
                    </div>
                </button>
                <div id="season-options" class="hidden custom-select-options glass-container rounded-lg animate-fade-in-down">
                     <div class="glass-filter"></div>
                     <div class="glass-overlay" style="--glass-bg-color: rgba(25, 25, 25, 0.7);"></div>
                     <div class="glass-specular"></div>
                     <div id="season-options-content" class="glass-content p-2">
                        ${seasonKeys.map(key => `<div class="custom-select-option p-3 rounded-md cursor-pointer" data-season="${key}">${data.seasons[key].title}</div>`).join('')}
                     </div>
                </div>
            </div>
            <div id="episode-list-container" class="space-y-3"></div>
        `;
        lucide.createIcons();
        
        const renderEpisodes = (seasonKey) => {
            const season = data.seasons[seasonKey];
            const episodes = season.episodes;
            const episodeContainer = document.getElementById('episode-list-container');
            episodeContainer.innerHTML = episodes.map((ep, index) => {
                const epTitle = ep.title || `Episódio ${index + 1}`;
                const epOverview = ep.overview || 'Sem descrição.';
                const stillPath = ep.still_path ? (ep.still_path.startsWith('http') ? ep.still_path : `https://image.tmdb.org/t/p/w300${ep.still_path}`) : 'https://placehold.co/300x169/1c1917/999999?text=EP';

                return `
                    <div class="episode-item glass-container glass-button rounded-lg overflow-hidden cursor-pointer" data-index="${index}" data-season="${seasonKey}">
                        <div class="glass-filter"></div>
                        <div class="glass-overlay" style="--glass-bg-color: rgba(25, 25, 25, 0.3);"></div>
                        <div class="glass-specular"></div>
                        <div class="glass-content flex items-start p-3 gap-4">
                            <img src="${stillPath}" class="w-32 h-20 object-cover rounded-md flex-shrink-0">
                            <div class="flex-1">
                                <h4 class="font-semibold text-white">Ep ${index + 1}: ${epTitle}</h4>
                                <p class="text-xs text-stone-300 mt-1 synopsis-truncated-ep">${epOverview}</p>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
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
                document.getElementById('selected-season-text').textContent = data.seasons[seasonKey].title;
                renderEpisodes(seasonKey);
                seasonSelectorBtn.click(); // close dropdown
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
                 const seasonNumberMatch = data.seasons[seasonKey].title.match(/\d+/);
                 const seasonNumber = seasonNumberMatch ? seasonNumberMatch[0] : seasonKey;


                 const context = {
                    videoUrl: episode.url,
                    title: `${data.title} - T${seasonNumber} E${episodeIndex + 1}: ${episode.title}`,
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
    function attachGlassButtonListeners() { document.querySelectorAll('.glass-button, .liquid-glass-card, .player-control-btn, .glass-container[style*="--bg-color"], .glass-form').forEach(element => { if (!element.hasGlassListener) { element.addEventListener('mousemove', handleMouseMove); element.addEventListener('mouseleave', handleMouseLeave); element.hasGlassListener = true; }}); }
    function updateMobileNavIndicator() { const indicator = document.getElementById('mobile-nav-indicator'); const activeItem = document.querySelector('#mobile-nav .mobile-nav-item.active'); if (indicator && activeItem) { const left = activeItem.offsetLeft; const width = activeItem.offsetWidth; indicator.style.width = `${width}px`; indicator.style.transform = `translateX(${left}px)`; }}
    function toggleSearchOverlay(show) { if (show) { searchOverlay.classList.remove('hidden'); searchInput.focus(); document.body.style.overflow = 'hidden'; } else { searchOverlay.classList.add('hidden'); searchInput.value = ''; searchResultsContainer.innerHTML = ''; document.body.style.overflow = 'auto'; }}
    async function performSearch(query) { if(query.length < 2) { searchResultsContainer.innerHTML = `<p class="col-span-full text-center text-gray-400">Digite pelo menos 2 caracteres.</p>`; return; } searchResultsContainer.innerHTML = `<div class="col-span-full">${glassSpinnerHTML.replace('min-h-screen', '')}</div>`; const data = await fetchFromTMDB('search/multi', `query=${encodeURIComponent(query)}`); if(data && data.results) { const filteredResults = data.results.filter(item => (item.media_type === 'movie' || item.media_type === 'tv') && item.poster_path); if(filteredResults.length > 0) { searchResultsContainer.innerHTML = filteredResults.map(item => createContentCard(item, true)).join(''); } else { searchResultsContainer.innerHTML = `<p class="col-span-full text-center text-gray-400">Nenhum resultado para "${query}".</p>`; }} else { searchResultsContainer.innerHTML = `<p class="col-span-full text-center text-gray-400">Ocorreu um erro na busca.</p>`; }}
    
    // --- Player Functions ---
    async function showPlayer(context) {
        history.pushState({ playerOpen: true }, "Player");

        let urlToLoad = context.videoUrl;
        if (!urlToLoad) {
            showToast("URL do vídeo não encontrada.", true);
            history.back();
            return;
        }

        try {
            const urlObject = new URL(urlToLoad);
            if (urlObject.hostname.includes('api.anivideo.net') && urlObject.pathname.includes('videohls.php')) {
                const videoSrc = urlObject.searchParams.get('d');
                if (videoSrc) urlToLoad = videoSrc;
            }
        } catch (e) { /* Invalid URL, proceed with original */ }
        
        const playerContainer = document.getElementById('player-container');
        const loaderContainer = playerContainer.querySelector('.loader-container');
        
        playerView.classList.remove('hidden');
        playerContainer.classList.add('loading');
        
        if (window.innerWidth < 768) {
            try {
                await playerView.requestFullscreen();
                if (screen.orientation && typeof screen.orientation.lock === 'function') {
                    await screen.orientation.lock('landscape');
                }
            } catch (err) { console.warn("Fullscreen/orientation lock failed:", err); }
        }

        if (hls) hls.destroy();
        
        videoPlayer.src = '';
        videoPlayer.load();

        if (Hls.isSupported() && urlToLoad.includes('.m3u8')) {
            hls = new Hls();
            hls.loadSource(urlToLoad);
            hls.attachMedia(videoPlayer);
            hls.on(Hls.Events.MANIFEST_PARSED, () => videoPlayer.play().catch(e => console.error("Play error:", e)));
            hls.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal) {
                     console.error('HLS Fatal Error:', data);
                     playerContainer.innerHTML = `<div class="text-center text-red-400 p-4"><p>Erro ao carregar o vídeo.</p></div>`;
                }
            });
        } else {
            videoPlayer.src = urlToLoad;
            videoPlayer.play().catch(e => console.error("Play error:", e));
        }
    }

    async function hidePlayer() {
        if (videoPlayer) {
            videoPlayer.pause();
            videoPlayer.removeAttribute('src');
            videoPlayer.load();
        }
        if (hls) {
            hls.destroy();
            hls = null;
        }
        
        playerView.classList.add('hidden');
        
        if (document.fullscreenElement) await document.exitFullscreen();
        if (screen.orientation && typeof screen.orientation.unlock === 'function') screen.orientation.unlock();
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

    function handlePlayerClick(e) {
        const target = e.target;
        // Evita que o togglePlay seja acionado se o clique foi nos controles
        if(target === videoPlayer || target === playerCenterPlayBtn) {
            if (playerView.classList.contains('controls-active')) {
                togglePlay();
            } else {
                playerView.classList.add('controls-active');
            }
        }
        
        clearTimeout(controlsTimeout);
        if (!videoPlayer.paused) {
            controlsTimeout = setTimeout(() => {
                playerView.classList.remove('controls-active');
            }, 3000);
        }
    }
    
    function addPlayerEventListeners() {
        videoPlayer.addEventListener('play', () => { 
            playPauseBtn.innerHTML = ICONS.pause; 
            playerView.classList.remove('paused');
            lucide.createIcons();
        });
        videoPlayer.addEventListener('pause', () => { 
            playPauseBtn.innerHTML = ICONS.play; 
            playerView.classList.add('paused');
            lucide.createIcons();
            clearTimeout(controlsTimeout);
            playerView.classList.add('controls-active');
        });
        
        videoPlayer.addEventListener('ended', () => {
            if (currentPlayerContext.episodes && currentPlayerContext.currentIndex < currentPlayerContext.episodes.length - 1) {
                changeEpisode(1);
            } else {
                playPauseBtn.innerHTML = ICONS.play;
                lucide.createIcons();
            }
        });

        videoPlayer.addEventListener('timeupdate', () => {
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
        });

        videoPlayer.addEventListener('loadedmetadata', () => {
            if(isNaN(videoPlayer.duration)) return;
            seekBar.max = videoPlayer.duration;
            durationEl.textContent = formatTime(videoPlayer.duration);
        });

        videoPlayer.addEventListener('waiting', () => playerView.classList.add('loading'));
        videoPlayer.addEventListener('playing', () => playerView.classList.remove('loading'));
        videoPlayer.addEventListener('canplay', () => playerView.classList.remove('loading'));
        
        videoPlayer.addEventListener('volumechange', () => {
            volumeSlider.value = videoPlayer.volume;
            if (videoPlayer.muted || videoPlayer.volume === 0) volumeBtn.innerHTML = ICONS.volumeMute;
            else volumeBtn.innerHTML = ICONS.volumeHigh;
            lucide.createIcons();
        });

        playerView.addEventListener('click', handlePlayerClick);
    }
    
    seekBar.addEventListener('input', () => { videoPlayer.currentTime = seekBar.value; });
    volumeSlider.addEventListener('input', (e) => { videoPlayer.volume = e.target.value; videoPlayer.muted = e.target.value == 0; });
    volumeBtn.addEventListener('click', () => { videoPlayer.muted = !videoPlayer.muted; });
    rewindBtn.addEventListener('click', () => { videoPlayer.currentTime -= 10; });
    forwardBtn.addEventListener('click', () => { videoPlayer.currentTime += 10; });
    
    function changeEpisode(direction) {
        if (!currentPlayerContext.episodes) return;
        const newIndex = currentPlayerContext.currentIndex + direction;
        if (newIndex >= 0 && newIndex < currentPlayerContext.episodes.length) {
            const newContext = { ...currentPlayerContext, currentIndex: newIndex };
            const episode = newContext.episodes[newIndex];
            newContext.title = `${newContext.itemData.name} - T${episode.season_number} E${episode.episode_number}`;
            showPlayer(newContext);
        }
    }

    nextEpisodeBtn.addEventListener('click', () => changeEpisode(1));
    prevEpisodeBtn.addEventListener('click', () => changeEpisode(-1));

    fullscreenBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
            playerView.requestFullscreen().catch(err => console.error(`Fullscreen error: ${err.message}`));
        } else {
            document.exitFullscreen();
        }
    });
    
    document.addEventListener('fullscreenchange', () => {
        const isFullscreen = !!document.fullscreenElement;
        fullscreenBtn.innerHTML = isFullscreen ? ICONS.exitFullscreen : ICONS.fullscreen;
        lucide.createIcons();
    });

    playPauseBtn.addEventListener('click', togglePlay);
    playerBackBtn.addEventListener('click', () => history.back());

    playerView.addEventListener('mousemove', () => {
        playerView.classList.add('controls-active');
        clearTimeout(controlsTimeout);
        if (!videoPlayer.paused) {
            controlsTimeout = setTimeout(() => {
                playerView.classList.remove('controls-active');
            }, 3000);
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
        if(speedContainer.childElementCount > 1) return; 

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
                console.log(`Quality set to ${quality}. (Placeholder)`);
            };
            qualityContainer.appendChild(button);
        });
    }

    document.getElementById('hero-watch-btn').addEventListener('click', () => {
        if (!currentHeroItem) return;
        showPlayer({ 
            videoUrl: 'https://api.anivideo.net/videohls.php?d=https://cdn-s01.mywallpaper-4k-image.net/stream/o/one-piece-dublado-v2/78.mp4/index.m3u8&nocache1757330957', 
            title: currentHeroItem.title || currentHeroItem.name,
            itemData: currentHeroItem
        });
    });
    
    function initializeUI() {
        playPauseBtn.innerHTML = ICONS.pause;
        rewindBtn.innerHTML = ICONS.rewind10;
        forwardBtn.innerHTML = ICONS.fastForward10;
        nextEpisodeBtn.innerHTML = ICONS.skipForward;
        prevEpisodeBtn.innerHTML = ICONS.skipBackward;
        volumeBtn.innerHTML = ICONS.volumeHigh;
        fullscreenBtn.innerHTML = ICONS.fullscreen;
        settingsBtn.innerHTML = ICONS.settings;
        playerBackBtn.innerHTML = ICONS.back;
        playerCenterPlayBtn.innerHTML = ICONS.play;
        lucide.createIcons();

        createSettingsOptions();
        addPlayerEventListeners();
    }
    
    searchIconBtn.addEventListener('click', () => toggleSearchOverlay(true));
    closeSearchBtn.addEventListener('click', () => toggleSearchOverlay(false));
    document.getElementById('search-overlay-bg').addEventListener('click', () => toggleSearchOverlay(false));
    searchInput.addEventListener('input', () => { clearTimeout(debounceTimer); debounceTimer = setTimeout(() => { performSearch(searchInput.value); }, 400); });
    
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

    window.addEventListener('popstate', (event) => {
        const isPlayerOpen = !playerView.classList.contains('hidden');
        if (isPlayerOpen) {
            hidePlayer();
        }
        
        if (!event.state || !event.state.playerOpen) {
            const isDetailsOpen = !detailsView.classList.contains('hidden');
            if(isDetailsOpen) {
                detailsView.classList.add('hidden');
                detailsView.innerHTML = '';
                const lastView = document.getElementById(lastActiveViewId);
                if (lastView) lastView.classList.remove('hidden');

                if (document.getElementById('manage-profile-view').classList.contains('hidden')) {
                    document.querySelector('header').classList.remove('hidden');
                    document.querySelector('footer').classList.remove('hidden');
                }
            }
        }
    });

    // --- Notification Logic ---
    function listenForNotifications() {
        const q = query(collection(db, "notifications"), orderBy("createdAt", "desc"));
        onSnapshot(q, (snapshot) => {
            notifications = [];
            snapshot.forEach((doc) => {
                notifications.push({ id: doc.id, ...doc.data() });
            });
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

        if (hasNew) {
            notificationBtn.classList.add('has-new');
        } else {
            notificationBtn.classList.remove('has-new');
        }
    }
    
    function renderNotifications() {
        const avisosContainer = document.getElementById('notifications-avisos');
        const novidadesContainer = document.getElementById('notifications-novidades');

        const avisos = notifications.filter(n => n.type === 'Aviso');
        const novidades = notifications.filter(n => n.type === 'Novidade' && !dismissedNotifications.includes(n.id));

        const createNotifHTML = (notif, isDismissable) => {
            const dismissBtn = isDismissable ? `<button class="remove-notification-btn text-stone-500 hover:text-white" data-notif-id="${notif.id}"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>` : '';
            return `
                <div class="notification-item flex items-start gap-2 p-2 rounded-md transition-colors hover:bg-white/5">
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
        }
    });


    // --- Requests Logic ---
    function listenToRequests() {
        const q = query(collection(db, "pedidos"), where("status", "==", "pending"));
        onSnapshot(q, (snapshot) => {
            pendingRequests = [];
            snapshot.forEach((doc) => {
                pendingRequests.push({ id: doc.id, ...doc.data() });
            });
             // Sort client-side to avoid needing a composite index
             pendingRequests.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
            if (!document.getElementById('requests-view').classList.contains('hidden')) {
                 renderPendingRequests();
            }
        }, (error) => {
            console.error("Error listening to requests: ", error);
        });
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
            if (!docSnap.exists()) {
                showToast("Este pedido não existe mais.", true);
                return;
            }
            const requestData = docSnap.data();
            const requesters = requestData.requesters || [];
            const userVoteIndex = requesters.findIndex(r => r.userId === userId);
            const userVote = { userId: userId, userName: currentProfile.name };

            if (userVoteIndex > -1) {
                // User has voted, so remove the vote
                await updateDoc(docRef, {
                    requesters: arrayRemove(requesters[userVoteIndex])
                });
                showToast('Voto removido.');
            } else {
                // User has not voted, add the vote
                await updateDoc(docRef, {
                    requesters: arrayUnion(userVote)
                });
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
    
    // --- Profile Management Logic ---
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
        
        // Update header
        const avatarImg = new Image();
        avatarImg.src = currentProfile.avatar;
        avatarImg.className = 'w-full h-full object-cover rounded-full';
        headerProfileBtn.innerHTML = '';
        headerProfileBtn.appendChild(avatarImg);

        // Show main app
        loginView.classList.add('hidden');
        document.querySelector('header').classList.remove('hidden');
        document.querySelector('footer').classList.remove('hidden');
        manageProfileView.classList.add('hidden');
        document.getElementById('home-view').classList.remove('hidden');
        document.getElementById('main-background').style.opacity = 1;
        
        // Load all content
        listenToFirestoreContent();
    }

    function showProfileModal(profileId = null) {
        const modalTitle = document.getElementById('modal-title');
        const nameInput = document.getElementById('profile-name-input');
        const idInput = document.getElementById('profile-id-input');
        const deleteBtn = document.getElementById('delete-profile-btn');

        avatarOptionsContainer.innerHTML = AVATARS.map(avatar => `
            <img src="${avatar}" class="w-16 h-16 rounded-full cursor-pointer border-2 border-transparent hover:border-white transition-all" data-avatar="${avatar}">
        `).join('');

        if (profileId) { // Editing existing profile
            modalTitle.textContent = 'Editar Perfil';
            const profile = profiles.find(p => p.id === profileId);
            nameInput.value = profile.name;
            idInput.value = profile.id;
            deleteBtn.classList.remove('hidden');
            const currentAvatar = avatarOptionsContainer.querySelector(`img[data-avatar="${profile.avatar}"]`);
            if(currentAvatar) currentAvatar.classList.add('!border-purple-500', 'scale-110');
        } else { // Adding new profile
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
            if (profileId) { // Update
                const docRef = doc(db, 'users', userId, 'profiles', profileId);
                await updateDoc(docRef, profileData);
                showToast('Perfil atualizado com sucesso!');
            } else { // Add
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
            // NOTE: Using a simple confirm for now, a custom modal would be better.
            if (confirm('Tem certeza que deseja excluir este perfil? Esta ação não pode ser desfeita.')) {
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
         views.forEach(view => view.classList.add('hidden'));
         document.querySelector('header').classList.add('hidden');
         document.querySelector('footer').classList.add('hidden');
         manageProfileView.classList.remove('hidden');
         document.getElementById('main-background').style.opacity = 0;
         isEditMode = false;
         manageProfilesBtn.querySelector('.glass-content').textContent = 'Gerenciar Perfis';
         document.getElementById('profile-main-title').textContent = 'Quem está assistindo?';
         renderProfiles();
    });

    // --- Form Switching & Firebase Auth Logic ---
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
            .catch((error) => {
                console.error("Erro de registro:", error);
                showToast(`Erro: ${error.message}`, true);
            });
    });

    document.getElementById('google-signin-btn').addEventListener('click', () => {
        signInWithPopup(auth, googleProvider)
            .catch((error) => {
                console.error("Erro de login com Google:", error);
                showToast(`Erro: ${error.message}`, true);
            });
    });

    logoutBtn.addEventListener('click', () => {
        signOut(auth).catch((error) => {
             console.error("Erro ao sair:", error);
             showToast(`Erro: ${error.message}`, true);
        });
    });

    // --- Confirmation Modal Logic ---
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
    
    // --- TMDB Search for Requests ---
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
            const posterPath = item.poster_path ? `${IMG_URL_POSTER}${item.poster_path}` : 'https://placehold.co/300x450/1c1917/FFFFFF?text=Sem+Imagem';
            return `
            <div class="cursor-pointer group tmdb-result-item" data-item='${JSON.stringify(item)}'>
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
        attachGlassButtonListeners();
    }

    document.getElementById('tmdb-search-results').addEventListener('click', (e) => {
        const itemElement = e.target.closest('.tmdb-result-item');
        if (itemElement) {
            const itemData = JSON.parse(itemElement.dataset.item);
            confirmAndAddRequest(itemData);
        }
    });

    document.getElementById('pending-requests-container').addEventListener('click', e => {
        const voteButton = e.target.closest('.vote-btn');
        if (voteButton) {
            const requestId = voteButton.dataset.requestId;
            handleVote(requestId);
        }
    });

    async function confirmAndAddRequest(item) {
        const title = item.title || item.name;
        showConfirmationModal(
            'Confirmar Pedido',
            `Deseja solicitar a adição de "${title}"?`,
            async () => {
                if (!userId || !currentProfile) {
                    showToast("Você precisa estar logado e ter um perfil selecionado.", true);
                    return;
                }

                const alreadyInCatalog = firestoreContent.some(c => c.tmdb_id === item.id);
                if (alreadyInCatalog) {
                    showToast('Este item já está disponível no catálogo.', true);
                    return;
                }

                const existingRequest = pendingRequests.find(r => r.tmdbId === item.id);

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
                        showToast('Seu apoio ao pedido foi adicionado!');
                    } catch (error) {
                        console.error("Erro ao apoiar pedido:", error);
                        showToast('Ocorreu um erro ao apoiar o pedido.', true);
                    }
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
                    } catch (error) {
                        console.error("Erro ao adicionar pedido:", error);
                        showToast('Ocorreu um erro ao enviar o pedido.', true);
                    }
                }
            }
        );
    }
    
    // --- Initial Load and Auth State Change ---
    function showLoginScreen() {
        userId = null;
        currentProfile = null;
        views.forEach(view => view.classList.add('hidden'));
        loginView.classList.remove('hidden');
        document.querySelector('header').classList.add('hidden');
        document.querySelector('footer').classList.add('hidden');
    }

    async function showProfileScreen() {
         views.forEach(view => view.classList.add('hidden'));
         loginView.classList.add('hidden');
         manageProfileView.classList.remove('hidden');
         document.getElementById('main-background').style.opacity = 0;
         isEditMode = false;
         manageProfilesBtn.querySelector('.glass-content').textContent = 'Gerenciar Perfis';
         document.getElementById('profile-main-title').textContent = 'Quem está assistindo?';
         await loadProfiles();
    }

    onAuthStateChanged(auth, (user) => {
        if (user) {
            userId = user.uid;
            listenForNotifications();
            listenToRequests();
            showProfileScreen();
            initializeUI();
        } else {
            showLoginScreen();
        }
    });

    if (location.hash === '#player' || location.hash.startsWith('#details')) {
        history.replaceState(null, document.title, window.location.pathname + window.location.search);
    }
    
    attachGlassButtonListeners();
    window.addEventListener('resize', updateMobileNavIndicator);

});

