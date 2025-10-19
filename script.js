import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, getDocs, onSnapshot, query, where, addDoc, serverTimestamp, updateDoc, doc, arrayUnion, getDoc, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyA791i8R8Bmrn3toFxFltZ40TU7PUavev8",
    authDomain: "starlight-max.firebaseapp.com",
    projectId: "starlight-max",
    storageBucket: "starlight-max.appspot.com",
    messagingSenderId: "120477177511",
    appId: "1:120477177511:web:5a75a2dd6d8089c829ed82"
};

try {
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);
    window.db = db;
    window.getDocs = getDocs;
    window.collection = collection;
    window.onSnapshot = onSnapshot;
    window.query = query;
    window.where = where;
    window.addDoc = addDoc;
    window.serverTimestamp = serverTimestamp;
    window.updateDoc = updateDoc;
    window.doc = doc;
    window.arrayUnion = arrayUnion;
    window.getDoc = getDoc;
    window.orderBy = orderBy;
    console.log("Firebase Initialized Successfully");
} catch (error) {
    console.error("Firebase Initialization Error:", error);
}

document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    
    const TMDB_API_KEY = '5954890d9e9b723ff3032f2ec429fec3';
    const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
    const TMDB_IMG_URL = 'https://image.tmdb.org/t/p/w500';
    const TMDB_STILL_URL = 'https://image.tmdb.org/t/p/w300';

    // ESTADO DA APLICAÇÃO
    let myList = [];
    let currentHeroItem = null;
    let hls; // Instância do HLS.js
    let firestoreContent = []; // Armazenará o conteúdo do Firestore
    let pendingRequests = []; // Armazenará os pedidos pendentes
    let userId = localStorage.getItem('starlight-userId') || `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    localStorage.setItem('starlight-userId', userId);
    let featuredItemIds = [];
    let heroCarouselInterval = null;
    let notifications = [];
    let lastNotificationCheck = localStorage.getItem('starlight-lastNotificationCheck') || 0;
    let dismissedNotifications = JSON.parse(localStorage.getItem('starlight-dismissedNotifications')) || [];

    // --- RATING UTILITY ---
    const getRatingBadge = (rating) => {
        const ratingValue = rating.replace(/\D/g, ''); // Extracts numbers (e.g., '12')
        let colorClass = '';
        
        // Map ratings to the new color scheme
        switch (rating) {
            case 'Livre':
                colorClass = 'rating-Livre'; break; // Verde
            case '10':
                colorClass = 'rating-10'; break; // Azul
            case '12':
                colorClass = 'rating-12'; break; // Amarelo
            case '14':
                colorClass = 'rating-14'; break; // Laranja
            case '16':
                colorClass = 'rating-16'; break; // Vermelho
            case '18':
                colorClass = 'rating-18'; break; // Preto
            default:
                colorClass = 'bg-stone-500'; // Fallback
        }

        const displayValue = rating === 'Livre' ? 'L' : ratingValue;
        
        return `<div class="rating-square ${colorClass}">${displayValue}</div>`;
    };

    const formatDuration = (duration) => {
          const minutes = parseInt(duration);
          if (isNaN(minutes) || minutes === 0) return 'N/A';
          if (minutes < 60) return `${minutes}m`;

          const hours = Math.floor(minutes / 60);
          const remainingMinutes = minutes % 60;
          let result = `${hours}h`;
          if (remainingMinutes > 0) result += ` ${remainingMinutes}m`;
          return result;
    };


    // ELEMENTOS DOM
    const header = document.getElementById('header');
    const main = document.getElementById('main-content');
    const detailsScreen = document.getElementById('screen-details');

    // --- CUSTOM MODALS ---
    const toast = document.getElementById('toast-notification');
    const toastMessage = document.getElementById('toast-message');
    let toastTimeout;

    function showToast(message, isError = false) {
        clearTimeout(toastTimeout);
        toastMessage.textContent = message;
        toast.classList.toggle('bg-red-600', isError);
        toast.classList.toggle('bg-indigo-600', !isError);
        toast.classList.remove('translate-x-[120%]');
        toastTimeout = setTimeout(() => {
            toast.classList.add('translate-x-[120%]');
        }, 3000);
    }

    const confirmModal = document.getElementById('confirm-modal');
    const confirmTitle = document.getElementById('confirm-title');
    const confirmMessage = document.getElementById('confirm-message');
    const confirmOkBtn = document.getElementById('confirm-ok-btn');
    const confirmCancelBtn = document.getElementById('confirm-cancel-btn');

    function showConfirm(title, message, onConfirm) {
        confirmTitle.textContent = title;
        confirmMessage.textContent = message;
        confirmModal.classList.remove('hidden');

        const hideConfirm = () => {
            confirmModal.classList.add('hidden');
            confirmOkBtn.removeEventListener('click', handleOk);
            confirmCancelBtn.removeEventListener('click', hideConfirm);
        };
        
        const handleOk = () => {
            onConfirm();
            hideConfirm();
        };

        confirmOkBtn.addEventListener('click', handleOk, { once: true });
        confirmCancelBtn.addEventListener('click', hideConfirm, { once: true });
    }


    // --- FUNÇÕES DE UTILIDADE E UI ---
    // Utility function to shuffle an array (Fisher-Yates)
    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    const showLoader = (element) => {
        element.innerHTML = '<div class="loader-container"><div class="loader"></div></div>';
    };

    const showError = (element, message) => {
        element.innerHTML = `<p class="col-span-full text-center text-red-400">${message}</p>`;
    };

    const toggleModal = (modalId) => {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        const isHidden = modal.classList.contains('hidden');
        document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
        if (isHidden) {
            modal.classList.remove('hidden');
            if (modalId === 'modal-busca') {
                const searchInput = document.getElementById('search-input');
                searchInput.value = '';
                document.getElementById('search-results-container').innerHTML = '';
                searchInput.focus();
            }
        }
    };
    
    const closeAllModals = () => {
          document.querySelectorAll('.modal').forEach(m => {
              if(m.id !== 'modal-video') m.classList.add('hidden');
          });
          const searchInput = document.getElementById('search-input');
          if(searchInput) searchInput.value = '';
          const searchResults = document.getElementById('search-results-container');
          if(searchResults) searchResults.innerHTML = '';
    }

    const handleHeaderStyle = () => {
        const isHomePage = location.hash === '#screen-home' || location.hash === '';
        const isDetailsPage = detailsScreen && !detailsScreen.classList.contains('hidden');
        const isScrolled = window.scrollY > 50;
        const isPlayerOpen = !document.getElementById('modal-video').classList.contains('hidden');

        if(isPlayerOpen) {
            header.classList.add('hidden'); 
            return;
        }
        header.classList.remove('hidden'); 

        header.style.zIndex = 50;

        if (isHomePage && !isDetailsPage) {
            main.style.paddingTop = '0';
            header.classList.toggle('scrolled', isScrolled);
        } else {
            main.style.paddingTop = `${header.offsetHeight}px`;
            header.classList.add('scrolled');
        }
    };


    // --- GERENCIAMENTO DA MINHA LISTA ---
    const saveMyList = () => localStorage.setItem('starlightMyList', JSON.stringify(myList));
    const loadMyList = () => {
        const storedList = localStorage.getItem('starlightMyList');
        myList = storedList ? JSON.parse(storedList) : [];
    };
    const isInMyList = (id) => myList.some(item => item.docId === id);

    const toggleMyListItem = (itemData) => {
        if (!itemData || !itemData.docId) return;
        if (isInMyList(itemData.docId)) {
            myList = myList.filter(item => item.docId !== itemData.docId);
        } else {
            myList.push({ docId: itemData.docId, type: itemData.type, title: itemData.title, poster: itemData.poster });
        }
        saveMyList();
        updateAllMyListButtons(itemData.docId);
        if (location.hash === '#screen-minha-lista') renderScreenContent('screen-minha-lista', true);
    };
    
    const updateAllMyListButtons = (id) => {
        const inList = isInMyList(id);
        document.querySelectorAll(`[data-list-btn-id="${id}"]`).forEach(btn => {
            const text = btn.querySelector('span');
            const existingIcon = btn.querySelector('i') || btn.querySelector('svg');
            if (existingIcon) existingIcon.remove();
            
            const newIcon = document.createElement('i');
            newIcon.dataset.lucide = inList ? 'check' : 'plus';
            const iconSizeClass = btn.id.includes('hero') ? 'w-7 h-7' : 'w-6 h-6';
            newIcon.classList.add(...iconSizeClass.split(' '));

            if (text) {
                btn.insertBefore(newIcon, text);
                text.textContent = inList ? 'Na Minha Lista' : 'Minha Lista';
            } else {
                btn.prepend(newIcon);
            }
        });
        lucide.createIcons();
    }

    // --- BUSCA E RENDERIZAÇÃO DE DADOS ---
    async function fetchFeaturedItems() {
        if (!window.db) return;
        try {
            // Fetch the data once immediately, as listener is async
            const docSnap = await window.getDoc(window.doc(window.db, 'config', 'featured'));
            if (docSnap.exists()) {
                featuredItemIds = docSnap.data().items || [];
            }
        } catch (error) {
            console.error("Error fetching initial featured items:", error);
        }
    }
    
    async function listenToFirestoreContent() {
        if (!window.db) {
            setTimeout(listenToFirestoreContent, 500);
            return;
        }
        // Use onSnapshot for real-time updates on content
        window.onSnapshot(window.collection(window.db, 'content'), (snapshot) => {
            firestoreContent = [];
            snapshot.forEach(doc => {
                firestoreContent.push({ docId: doc.id, ...doc.data() });
            });
            console.log("Conteúdo do Firestore atualizado em tempo real!", firestoreContent.length);
            // Trigger full UI refresh if we are on the home screen
            const currentScreen = location.hash.slice(1) || 'screen-home';
            if (currentScreen === 'screen-home' || currentScreen === 'screen-filmes' || currentScreen === 'screen-series') {
                renderScreenContent(currentScreen, true);
            }
        });

        // Use onSnapshot for real-time updates on featured items
        window.onSnapshot(window.doc(window.db, 'config', 'featured'), (docSnap) => {
            featuredItemIds = docSnap.exists() ? (docSnap.data().items || []) : [];
             console.log("Destaques atualizados em tempo real!");
            if (location.hash === '#screen-home' || location.hash === '') {
                renderScreenContent('screen-home', true);
            }
        });
    }
    
    // Função para buscar lançamentos no TMDB e filtrar pelo catálogo
    async function fetchNewReleases() {
        const url = `${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&language=pt-BR&sort_by=release_date.desc&include_adult=false&include_video=false&page=1&primary_release_date.lte=${new Date().toISOString().split('T')[0]}`;
         try {
            const response = await fetch(url);
            const data = await response.json();
            
            if (!data || !data.results) return [];

            // Filtra os 20 lançamentos mais recentes que JÁ ESTÃO no nosso catálogo
            const newReleases = data.results
                .filter(movie => movie.release_date && movie.release_date.substring(0,4) >= (new Date().getFullYear() - 1)) // Filtra por filmes lançados no último ano
                .map(movie => firestoreContent.find(item => String(item.tmdb_id) === String(movie.id)))
                .filter(item => item !== undefined)
                .slice(0, 20); 

            // Embaralha para que não fiquem na ordem estrita do TMDB
            return shuffleArray(newReleases);

        } catch (error) {
            console.error("Erro ao buscar lançamentos do TMDB:", error);
            return [];
        }
    }


    function listenForRequests() {
        if (!window.db) {
            setTimeout(listenForRequests, 500);
            return;
        }
        const q = window.query(window.collection(window.db, "pedidos"), window.where("status", "==", "pending"));
        window.onSnapshot(q, (snapshot) => {
            pendingRequests = [];
            snapshot.forEach((doc) => {
                pendingRequests.push({ id: doc.id, ...doc.data() });
            });
            if (location.hash === '#screen-pedidos') {
                renderPendingRequests();
            }
        });
    }

    const createContentCard = (item) => {
        if (!item || !item.poster) return '';
        const posterPath = item.poster.startsWith('http') ? item.poster : `https://placehold.co/300x450/1c1917/FFFFFF?text=Sem+Imagem`;
        return `<a href="#details/${item.docId}" class="carousel-item w-40 sm:w-48 cursor-pointer group block"><div class="relative aspect-[2/3] rounded-lg overflow-hidden"><img src="${posterPath}" alt="Pôster de ${item.title}" loading="lazy" class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"></div></a>`;
    };
    
    const createGridCard = (item) => {
         if (!item || !item.poster) return '';
        const posterPath = item.poster.startsWith('http') ? item.poster : `https://placehold.co/300x450/1c1917/FFFFFF?text=Sem+Imagem`;
        return `<a href="#details/${item.docId}" class="group block cursor-pointer"><div class="relative aspect-[2/3] rounded-lg overflow-hidden bg-stone-800"><img src="${posterPath}" alt="Pôster de ${item.title}" loading="lazy" class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"></div><h4 class="text-white text-sm mt-2 truncate">${item.title}</h4></a>`;
    };

    const createCarousel = (container, title, data) => {
        if(!data || data.length === 0) return;
        const section = document.createElement('section');
        section.innerHTML = `
            <h2 class="text-2xl sm:text-3xl font-bold text-white mb-4">${title}</h2>
            <div class="carousel-container -mx-4 sm:-mx-6 lg:-mx-8">
                <div class="carousel space-x-4 px-4 sm:px-6 lg:px-8">${data.map(item => createContentCard(item)).join('')}</div>
                <button class="carousel-btn prev" aria-label="Anterior"><i data-lucide="chevron-left" class="w-6 h-6"></i></button>
                <button class="carousel-btn next" aria-label="Próximo"><i data-lucide="chevron-right" class="w-6 h-6"></i></button>
            </div>`;
        container.appendChild(section);
        const carousel = section.querySelector('.carousel');
        const prevBtn = section.querySelector('.prev');
        const nextBtn = section.querySelector('.next');
        const updateButtons = () => {
            const { scrollLeft, scrollWidth, clientWidth } = carousel;
            prevBtn.disabled = scrollLeft <= 0;
            nextBtn.disabled = scrollLeft >= scrollWidth - clientWidth - 1;
        };
        const scrollAmount = () => carousel.clientWidth * 0.8;
        prevBtn.addEventListener('click', () => carousel.scrollBy({ left: -scrollAmount(), behavior: 'smooth' }));
        nextBtn.addEventListener('click', () => carousel.scrollBy({ left: scrollAmount(), behavior: 'smooth' }));
        carousel.addEventListener('scroll', updateButtons, { passive: true });
        updateButtons();
    };

    async function renderScreenContent(screenId, forceReload = false) {
        const screenElement = document.getElementById(screenId);
        if (!screenElement) return;
        
        // Render Home Screen
        if (screenId === 'screen-home') {
            const carouselsContainer = document.getElementById('home-carousels');
            showLoader(carouselsContainer);

            const heroSection = document.getElementById('hero-section');
            const heroBgImage = document.getElementById('hero-bg-image');
            const heroTitle = document.getElementById('hero-title');
            const heroMeta = document.getElementById('hero-meta');
            const heroOverview = document.getElementById('hero-overview');
            const heroListBtn = document.getElementById('hero-list-btn');

            const featuredItems = featuredItemIds.map(id => firestoreContent.find(item => item.docId === id)).filter(Boolean);
            let currentFeaturedIndex = 0;

            const updateHeroUI = (item) => {
                if (!item) return;
                currentHeroItem = item;
                heroBgImage.src = item.backdrop || '';
                heroTitle.textContent = item.title;
                
                // Display details
                const durationDisplay = item.type === 'movie' ? formatDuration(item.duration.replace(/\D/g, '')) : item.duration;
                const genresDisplay = item.genres ? item.genres.slice(0, 3).join(' • ') : '';
                
                const metaHtml = `
                    <span>${item.year}</span>
                    ${getRatingBadge(item.rating)}
                    <span>Duração: ${durationDisplay}</span>
                    ${genresDisplay ? `<span>${genresDisplay}</span>` : ''}
                `;
                heroMeta.innerHTML = metaHtml;

                heroOverview.textContent = item.synopsis;
                heroListBtn.dataset.listBtnId = item.docId;
                updateAllMyListButtons(item.docId);
            };
            
            if (featuredItems.length > 0) {
                updateHeroUI(featuredItems[0]);

                if (featuredItems.length > 1) {
                    clearInterval(heroCarouselInterval);
                    heroCarouselInterval = setInterval(() => {
                        currentFeaturedIndex = (currentFeaturedIndex + 1) % featuredItems.length;
                        heroSection.classList.add('fading');
                        setTimeout(() => {
                            updateHeroUI(featuredItems[currentFeaturedIndex]);
                            heroSection.classList.remove('fading');
                        }, 700); // Should match transition duration
                    }, 5000);
                }
            } else if (firestoreContent.length > 0) {
                // Fallback to a random item if no featured items are set
                updateHeroUI(firestoreContent[Math.floor(Math.random() * firestoreContent.length)]);
            } else {
                heroSection.innerHTML = '<p class="text-center">Nenhum conteúdo para exibir.</p>';
            }
            
            carouselsContainer.innerHTML = '';
            
            // 1. Carrossel: Adicionado Recentemente (os 10 últimos)
            const recentlyAdded = [...firestoreContent]
                .sort((a, b) => {
                    const dateA = a.addedAt?.toMillis ? a.addedAt.toMillis() : 0;
                    const dateB = b.addedAt?.toMillis ? b.addedAt.toMillis() : 0;
                    return dateB - dateA;
                })
                .slice(0, 10);
            createCarousel(carouselsContainer, "Adicionado Recentemente", recentlyAdded);

            // 2. Carrossel: Lançamentos (TMDB)
            const newReleases = await fetchNewReleases();
            createCarousel(carouselsContainer, "Lançamentos", newReleases);
            
            // 3. Carrosséis por Gênero
            const allGenres = [...new Set(firestoreContent.flatMap(item => item.genres || []))].filter(g => g && g !== 'Documentário');
            
            for (const genre of shuffleArray(allGenres)) {
                const filteredContent = firestoreContent.filter(item => item.genres && item.genres.includes(genre));
                // Shuffle content inside genre carousels to avoid repetition
                createCarousel(carouselsContainer, genre, shuffleArray(filteredContent));
            }

        } else if (screenId === 'screen-series') {
            renderFilteredGrid('tv');
        } else if (screenId === 'screen-filmes') {
            renderFilteredGrid('movie');
        } else if (screenId === 'screen-minha-lista') {
            const grid = document.getElementById('minha-lista-grid');
            const myListItems = myList.map(listItem => firestoreContent.find(content => content.docId === listItem.docId)).filter(Boolean);
            if (myListItems.length > 0) grid.innerHTML = myListItems.map(item => createContentCard(item)).join('');
            else grid.innerHTML = '<p class="col-span-full text-center text-stone-400">Sua lista está vazia.</p>';
        } else if (screenId === 'screen-pedidos') {
            renderPendingRequests();
        }
        lucide.createIcons();
    }

    // --- FILTER AND GRID RENDERING LOGIC ---
    function renderFilteredGrid(type) {
        const gridId = type === 'tv' ? 'series-grid' : 'filmes-grid';
        const grid = document.getElementById(gridId);
        if (!grid) {
            console.error(`Grid element with ID "${gridId}" not found.`);
            return;
        }
        let content = firestoreContent.filter(item => item.type === type);

        if (content.length > 0) {
            // Keep list dynamic (shuffled)
            grid.innerHTML = shuffleArray(content).map(item => createGridCard(item)).join('');
        } else {
            showError(grid, 'Nenhum conteúdo encontrado.');
        }
    }


    function renderDetailsScreen(docId) {
        document.body.classList.add('overflow-hidden');
        detailsScreen.classList.remove('hidden');
        detailsScreen.scrollTop = 0;
        showLoader(detailsScreen);

        const data = firestoreContent.find(item => item.docId === docId);
        if (!data) {
            showError(detailsScreen, 'Conteúdo não encontrado.');
            setTimeout(() => history.back(), 3000);
            return;
        }
        
        const watchButtonHtml = data.type === 'movie' ?
            `<button id="details-watch-btn" class="bg-white text-black font-bold py-4 px-10 rounded-full flex items-center space-x-2 text-xl hover:bg-stone-200" data-video-url="${data.url}"><i data-lucide="play" class="w-6 h-6 fill-current"></i><span>Assistir Filme</span></button>` :
            `<button disabled class="bg-stone-600 text-stone-400 font-bold py-4 px-10 rounded-full flex items-center space-x-2 text-xl cursor-not-allowed"><i data-lucide="list-video" class="w-6 h-6"></i><span>Selecione um EP</span></button>`;

        let seasonsHtml = '';
        if (data.type === 'tv' && data.seasons) {
            const seasonNumbers = Object.keys(data.seasons).sort((a,b) => a - b);
               if (seasonNumbers.length > 0) {
                     seasonsHtml = `
                          <div class="mt-12">
                              <div class="flex items-center space-x-4 mb-4">
                                  <h3 class="text-2xl sm:text-3xl font-bold">Temporadas</h3>
                                  <div id="custom-season-selector" class="custom-select-container">
                                      <div class="custom-select-trigger liquid-glass"><span class="selected-option-text">${data.seasons[seasonNumbers[0]].title}</span></div>
                                      <div class="custom-select-options liquid-glass">
                                          ${seasonNumbers.map(num => `<div class="custom-select-option" data-value="${num}">${data.seasons[num].title}</div>`).join('')}
                                      </div>
                                  </div>
                              </div>
                              <div id="episodes-container" class="min-h-[200px] relative"></div>
                          </div>`;
               }
        }
        
        const genresHtml = data.genres ? data.genres.map(g => `<span class="bg-purple-600/50 text-white text-sm px-3 py-1 rounded-full">${g}</span>`).join('') : '';
        const durationDisplay = data.type === 'movie' ? formatDuration(data.duration.replace(/\D/g, '')) : data.duration;

        detailsScreen.innerHTML = `
            <div style="background-image: url('${data.backdrop}');" class="fixed inset-0 bg-cover bg-center bg-no-repeat"><div class="absolute inset-0 details-gradient"></div></div>
            <div class="relative z-10">
                <button id="close-details-btn" class="fixed top-5 right-5 z-20 bg-black/50 rounded-full p-2 hover:bg-black/80"><i data-lucide="x" class="w-6 h-6"></i></button>
                <div class="container mx-auto px-4 sm:px-6 lg:px-8 flex items-center min-h-screen pt-20 pb-12">
                     <div class="w-full md:flex md:space-x-8 items-center">
                        <div class="flex-shrink-0 w-48 md:w-64 mx-auto md:mx-0"><img src="${data.poster}" alt="Pôster" class="w-full h-auto rounded-lg shadow-2xl"></div>
                        <div class="mt-6 md:mt-0 text-center md:text-left flex-grow">
                            <h1 class="text-5xl md:text-6xl font-bold">${data.title}</h1>
                            <div class="flex items-center justify-center md:justify-start flex-wrap gap-x-4 gap-y-2 mt-4 text-lg text-stone-300">
                                <span>${data.year}</span>
                                ${getRatingBadge(data.rating)}
                                <span>Duração: ${durationDisplay}</span>
                            </div>
                            <div class="mt-4 flex flex-wrap gap-2 justify-center md:justify-start">${genresHtml}</div>
                            <div class="mt-4 max-w-2xl mx-auto md:mx-0"><p class="text-stone-300 text-base leading-relaxed">${data.synopsis}</p></div>
                            <div class="mt-8 flex flex-wrap gap-4 justify-center md:justify-start">
                                ${watchButtonHtml}
                                <button data-list-btn-id="${data.docId}" id="details-list-btn" class="bg-white/20 backdrop-blur-sm text-white font-semibold py-4 px-10 rounded-full flex items-center space-x-2 text-xl hover:bg-white/30"><i data-lucide="plus" class="w-6 h-6"></i><span>Minha Lista</span></button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="container mx-auto px-4 sm:px-6 lg:px-8 pb-12">${seasonsHtml}</div>
            </div>`;
        
        document.getElementById('close-details-btn').addEventListener('click', () => history.back());
        document.getElementById('details-list-btn').addEventListener('click', () => toggleMyListItem(data));
        const watchBtn = document.getElementById('details-watch-btn');
        if (watchBtn && watchBtn.dataset.videoUrl) {
            watchBtn.addEventListener('click', () => playVideo(watchBtn.dataset.videoUrl));
        }
        updateAllMyListButtons(data.docId);

         if (data.type === 'tv' && data.seasons) {
             setupSeasonSelector(data);
         }
        lucide.createIcons();
    }
    
    function setupSeasonSelector(data) {
        const seasonSelectorContainer = document.getElementById('custom-season-selector');
        const episodesContainer = document.getElementById('episodes-container');
        if(!seasonSelectorContainer || !episodesContainer) return;

        const renderEpisodes = (seasonNumber) => {
            const season = data.seasons[seasonNumber];
            if (!season || !season.episodes) {
                showError(episodesContainer, 'Episódios não encontrados.');
                return;
            }
            episodesContainer.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-2 gap-4">${season.episodes.map((ep, index) => `
                <div class="episode-item group cursor-pointer" data-video-url="${ep.url}" style="--delay: ${index * 0.05}s;">
                    <div class="relative flex-shrink-0">
                        <img src="${ep.still_path ? `${TMDB_STILL_URL}${ep.still_path}` : 'https://placehold.co/120x67/1c1917/999999?text=EP'}" alt="Miniatura do Episódio" class="episode-thumbnail">
                        <div class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <i data-lucide="play-circle" class="w-8 h-8 text-white"></i>
                        </div>
                    </div>
                    <div class="episode-info">
                        <h4 class="font-bold text-white text-base truncate">Ep ${index + 1}: ${ep.title}</h4>
                        <p class="episode-synopsis">${ep.overview || 'Nenhuma sinopse disponível.'}</p>
                    </div>
                </div>`).join('')}</div>`;
            lucide.createIcons();
        };

        const trigger = seasonSelectorContainer.querySelector('.custom-select-trigger');
        const options = seasonSelectorContainer.querySelectorAll('.custom-select-option');
        const selectedText = seasonSelectorContainer.querySelector('.selected-option-text');

        trigger.addEventListener('click', () => seasonSelectorContainer.classList.toggle('open'));
        options.forEach(option => {
            option.addEventListener('click', () => {
                if (option.classList.contains('selected')) {
                    seasonSelectorContainer.classList.remove('open'); return;
                }
                options.forEach(opt => opt.classList.remove('selected'));
                option.classList.add('selected');
                selectedText.textContent = option.textContent;
                seasonSelectorContainer.classList.remove('open');
                renderEpisodes(option.dataset.value);
            });
        });
        document.addEventListener('click', (e) => {
            if (!seasonSelectorContainer.contains(e.target)) seasonSelectorContainer.classList.remove('open');
        });
        episodesContainer.addEventListener('click', (e) => {
            const episodeItem = e.target.closest('[data-video-url]');
            if(episodeItem) playVideo(episodeItem.dataset.videoUrl);
        });
        
        const firstSeason = Object.keys(data.seasons).sort((a,b) => a - b)[0];
        options[0].classList.add('selected');
        renderEpisodes(firstSeason);
    }

    // --- PLAYER DE VÍDEO ---
    function playVideo(originalUrl) {
        if (!originalUrl) {
            showToast("URL do vídeo não encontrada.", true);
            return;
        }
        
        let urlToLoad = originalUrl;
        try {
            const urlObject = new URL(originalUrl);
            if (urlObject.hostname.includes('api.anivideo.net') && urlObject.pathname.includes('videohls.php')) {
                const videoSrc = urlObject.searchParams.get('d');
                if (videoSrc) {
                    urlToLoad = videoSrc;
                    console.log("URL de vídeo extraída:", urlToLoad);
                }
            }
        } catch (e) {
            console.warn("Não foi possível analisar a URL, usando a original:", e);
        }

        const videoModal = document.getElementById('modal-video');
        const video = document.getElementById('player-video');
        const loaderContainer = videoModal.querySelector('.loader-container');
        
        videoModal.classList.remove('hidden');
        handleHeaderStyle();
        loaderContainer.innerHTML = '<div class="loader"></div>';
        loaderContainer.style.display = 'flex';

        if (hls) {
            hls.destroy();
            hls = null;
        }

        const isHlsStream = urlToLoad.includes('.m3u8');

        if (Hls.isSupported() && isHlsStream) {
             const hlsConfig = { startLevel: -1, capLevelToPlayerSize: true, maxBufferSize: 120, maxBufferLength: 30 };
             hls = new Hls(hlsConfig);
            hls.loadSource(urlToLoad);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                video.play().catch(e => console.error("Erro ao tentar reproduzir o vídeo:", e));
            });
            hls.on(Hls.Events.ERROR, function (event, data) {
                console.error('Erro HLS:', data);
                if (data.fatal) {
                    switch (data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            console.error("Erro de rede fatal;", data);
                            loaderContainer.innerHTML = `<div class="text-center text-red-400 p-4">
                                                          <i data-lucide="alert-triangle" class="w-12 h-12 mx-auto mb-2"></i>
                                                          <p class="font-bold">Erro ao carregar o vídeo.</p>
                                                          <p class="text-sm text-stone-400">O vídeo pode não estar disponível ou há um problema de rede.</p>
                                                        </div>`;
                            lucide.createIcons();
                            hls.destroy();
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            console.error("Erro de mídia fatal;", data);
                            hls.recoverMediaError();
                            break;
                        default:
                            hls.destroy();
                            break;
                    }
                }
            });
        } else {
            video.src = urlToLoad;
            video.play().catch(e => console.error("Erro ao tentar reproduzir o vídeo:", e));
        }
    }

    function stopVideo() {
        const videoModal = document.getElementById('modal-video');
        const video = document.getElementById('player-video');
        if (!videoModal || !video) return;

        video.pause();
        video.removeAttribute('src'); 
        video.load();
        if (hls) {
            hls.destroy();
            hls = null;
        }
        if (document.fullscreenElement) {
            document.exitFullscreen();
        }
        videoModal.classList.add('hidden');
        header.classList.remove('hidden');
        handleHeaderStyle();
    }

    function setupPlayerEventListeners() {
        const playerContainer = document.getElementById('player-container');
        const video = document.getElementById('player-video');
        const loader = playerContainer.querySelector('.loader-container');
        
        const playPauseBtn = document.getElementById('player-play-pause-btn');
        const centerPlayBtn = document.getElementById('player-center-play-btn');
        const rewindBtn = document.getElementById('player-rewind-btn');
        const forwardBtn = document.getElementById('player-forward-btn');
        const volumeBtn = document.getElementById('player-volume-btn');
        const volumeSlider = document.getElementById('player-volume-slider');
        const progressBar = document.getElementById('player-progress-bar');
        const progressBarContainer = document.getElementById('player-progress-bar-container');
        const timeDisplay = document.getElementById('player-time-display');
        const fullscreenBtn = document.getElementById('player-fullscreen-btn');
        const backBtn = document.getElementById('player-back-btn');

        backBtn.addEventListener('click', stopVideo);

        const formatTime = (seconds) => {
            if (isNaN(seconds)) return '00:00';
            const date = new Date(seconds * 1000);
            const hh = date.getUTCHours();
            const mm = date.getUTCMinutes();
            const ss = date.getUTCSeconds().toString().padStart(2, '0');
            if (hh) return `${hh}:${mm.toString().padStart(2, '0')}:${ss}`;
            return `${mm}:${ss}`;
        };

        const togglePlay = () => {
            if (video.paused) {
                video.play().catch(e => console.error("Erro ao reproduzir:", e));
            } else {
                video.pause();
            }
        };
        
        video.addEventListener('click', togglePlay);

        video.addEventListener('play', () => {
            playPauseBtn.innerHTML = `<i data-lucide="pause" class="w-7 h-7"></i>`;
            playerContainer.classList.remove('paused');
            lucide.createIcons();
        });
        video.addEventListener('pause', () => {
            playPauseBtn.innerHTML = `<i data-lucide="play" class="w-7 h-7"></i>`;
            playerContainer.classList.add('paused');
            lucide.createIcons();
        });
        video.addEventListener('waiting', () => { loader.style.display = 'flex'; });
        video.addEventListener('playing', () => { loader.style.display = 'none'; });
        video.addEventListener('canplay', () => { loader.style.display = 'none'; });
        video.addEventListener('loadedmetadata', () => {
            timeDisplay.textContent = `${formatTime(0)} / ${formatTime(video.duration)}`;
        });
        video.addEventListener('timeupdate', () => {
            if (video.duration) {
                const progressPercent = (video.currentTime / video.duration) * 100;
                progressBar.style.width = `${progressPercent}%`;
                timeDisplay.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
            }
        });
        video.addEventListener('volumechange', () => {
            volumeSlider.value = video.volume;
            if (video.muted || video.volume === 0) volumeBtn.innerHTML = `<i data-lucide="volume-x" class="w-6 h-6"></i>`;
            else if (video.volume < 0.5) volumeBtn.innerHTML = `<i data-lucide="volume-1" class="w-6 h-6"></i>`;
            else volumeBtn.innerHTML = `<i data-lucide="volume-2" class="w-6 h-6"></i>`;
            lucide.createIcons();
        });

        playPauseBtn.onclick = togglePlay;
        centerPlayBtn.onclick = togglePlay;
        rewindBtn.onclick = () => video.currentTime -= 10;
        forwardBtn.onclick = () => video.currentTime += 10;
        volumeBtn.onclick = () => video.muted = !video.muted;
        volumeSlider.oninput = (e) => video.volume = e.target.value;
        progressBarContainer.onclick = (e) => {
            if(video.duration) {
                const rect = progressBarContainer.getBoundingClientRect();
                const pos = (e.clientX - rect.left) / rect.width;
                video.currentTime = pos * video.duration;
            }
        };
        fullscreenBtn.onclick = () => {
            if (document.fullscreenElement) document.exitFullscreen();
            else playerContainer.requestFullscreen().catch(err => alert(`Erro: ${err.message}`));
        };
        document.addEventListener('fullscreenchange', () => {
            if (document.fullscreenElement) fullscreenBtn.innerHTML = `<i data-lucide="minimize" class="w-6 h-6"></i>`;
            else fullscreenBtn.innerHTML = `<i data-lucide="maximize" class="w-6 h-6"></i>`;
            lucide.createIcons();
        });
    }

    // --- NOTIFICATION LOGIC ---
    function listenForNotifications() {
        if (!window.db) {
            setTimeout(listenForNotifications, 500);
            return;
        }
        const q = window.query(window.collection(window.db, "notifications"), window.orderBy("createdAt", "desc"));
        window.onSnapshot(q, (snapshot) => {
            notifications = [];
            snapshot.forEach((doc) => {
                notifications.push({ id: doc.id, ...doc.data() });
            });
            updateNotificationBell();
        });
    }

    function updateNotificationBell() {
        const notificationsBtn = document.getElementById('notifications-btn');
        if (!notificationsBtn || notifications.length === 0) return;

        const latestTimestamp = notifications[0].createdAt ? (notifications[0].createdAt.toMillis ? notifications[0].createdAt.toMillis() : new Date(notifications[0].createdAt).getTime()) : 0;
        
        // Check if there's a new notification that hasn't been dismissed (if it's a Novidade)
        const newUndismissedNotification = notifications.find(n => {
            const notifTime = n.createdAt ? (n.createdAt.toMillis ? n.createdAt.toMillis() : new Date(n.createdAt).getTime()) : 0;
            const isNew = notifTime > lastNotificationCheck;
            const isDismissed = n.type === 'Novidade' && dismissedNotifications.includes(n.id);
            return isNew && !isDismissed;
        });
        
        if (newUndismissedNotification) {
            notificationsBtn.classList.add('has-new');
        } else {
            notificationsBtn.classList.remove('has-new');
        }
    }
    
    function renderNotifications() {
        const avisosContainer = document.getElementById('notifications-avisos');
        const novidadesContainer = document.getElementById('notifications-novidades');

        const avisos = notifications.filter(n => n.type === 'Aviso');
        const novidades = notifications.filter(n => n.type === 'Novidade' && !dismissedNotifications.includes(n.id));

        const createNotifHTML = (notif, isDismissable) => {
            const dismissBtn = isDismissable ? `<button class="remove-notification-btn text-stone-500 hover:text-white flex-shrink-0 ml-2" data-notif-id="${notif.id}"><i data-lucide="x" class="w-4 h-4"></i></button>` : '';
            
            let contentHTML = `
                <div class="flex-grow">
                    <p class="font-bold text-white">${notif.title}</p>
                    <p class="text-stone-300 text-sm">${notif.message}</p>
                </div>
            `;
            
            const classes = "notification-item flex items-start gap-2 p-2 rounded-md transition-colors w-full";
            
            if (notif.link) {
                const linkUrl = notif.link.type === 'internal' ? `#details/${notif.link.docId}` : notif.link.url;
                const target = notif.link.type === 'external' ? '_blank' : '_self';
                return `
                    <a href="${linkUrl}" target="${target}" class="${classes} hover:bg-white/10 cursor-pointer">
                        ${contentHTML}
                        <i data-lucide="${notif.link.type === 'external' ? 'external-link' : 'chevron-right'}" class="w-5 h-5 text-purple-400 flex-shrink-0 mt-1"></i>
                        ${dismissBtn}
                    </a>`;
            }
            
            // Non-clickable notification item
            return `<div class="${classes}">${contentHTML} ${dismissBtn}</div>`;
        };

        avisosContainer.innerHTML = avisos.length > 0 ? avisos.map(n => createNotifHTML(n, false)).join('<hr class="border-white/10 my-1">') : '<p class="text-stone-400 text-center p-4">Nenhum aviso.</p>';
        novidadesContainer.innerHTML = novidades.length > 0 ? novidades.map(n => createNotifHTML(n, true)).join('<hr class="border-white/10 my-1">') : '<p class="text-stone-400 text-center p-4">Nenhuma novidade.</p>';
        
        lucide.createIcons();
        
        // Set active tab if novidades has new items
        if (novidades.length > 0) {
              document.querySelectorAll('.notification-tab').forEach(tab => tab.classList.remove('active'));
              document.querySelectorAll('.notification-content').forEach(content => content.classList.remove('active'));
              document.querySelector('[data-tab="novidades"]').classList.add('active');
              document.getElementById('notifications-novidades').classList.add('active');
        } else {
              document.querySelector('[data-tab="avisos"]').classList.add('active');
              document.getElementById('notifications-avisos').classList.add('active');
        }
    }

    document.getElementById('modal-notificacoes').addEventListener('click', (e) => {
        // Handle tab switching
        if (e.target.matches('.notification-tab')) {
            document.querySelectorAll('.notification-tab').forEach(tab => tab.classList.remove('active'));
            document.querySelectorAll('.notification-content').forEach(content => content.classList.remove('active'));
            e.target.classList.add('active');
            document.getElementById(`notifications-${e.target.dataset.tab}`).classList.add('active');
        }

        // Handle dismiss button
        const removeBtn = e.target.closest('.remove-notification-btn');
        if (removeBtn) {
            const notifId = removeBtn.dataset.notifId;
            if (!dismissedNotifications.includes(notifId)) {
                dismissedNotifications.push(notifId);
                localStorage.setItem('starlight-dismissedNotifications', JSON.stringify(dismissedNotifications));
                updateNotificationBell(); 
            }
            const notifItem = removeBtn.closest('.notification-item');
            if (notifItem) {
                notifItem.style.transition = 'opacity 0.3s, height 0.3s';
                notifItem.style.opacity = '0';
                notifItem.style.height = '0';
                setTimeout(() => {
                   // Remove the associated separator HR element as well
                   let hr = notifItem.nextElementSibling;
                   if (hr && hr.tagName === 'HR') hr.remove();
                   notifItem.remove();
                   // Re-render if both lists are empty
                   if (document.getElementById('notifications-novidades').children.length === 0) renderNotifications();
                }, 300);
            }
        }
    });


    // --- NAVEGAÇÃO E ROTEAMENTO ---
    const handleLocationChange = () => {
        clearInterval(heroCarouselInterval);
        const isPlayerOpen = !document.getElementById('modal-video').classList.contains('hidden');
        if (isPlayerOpen) {
            stopVideo();
        }
        closeAllModals();

        const hash = location.hash;
        if (hash.startsWith('#details/')) {
            const docId = hash.split('/')[1];
            if (docId) renderDetailsScreen(docId);
        } else {
            detailsScreen.classList.add('hidden');
            document.body.classList.remove('overflow-hidden');
            const screenId = hash.slice(1) || 'screen-home';
            document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
            const activeScreen = document.getElementById(screenId);
            if (activeScreen) {
                activeScreen.classList.remove('hidden');
                renderScreenContent(screenId, true); // Force reload to get fresh data/carousels
            } else {
                document.getElementById('screen-home').classList.remove('hidden');
                renderScreenContent('screen-home', true);
            }
            document.querySelectorAll('.nav-link').forEach(link => {
                link.classList.toggle('active-nav', link.dataset.screen === screenId);
            });
        }
        handleHeaderStyle();
        window.scrollTo(0, 0);
    };

    // --- LÓGICA DE PEDIDOS ---
    
    let tmdbSearchTimeout;
    const tmdbSearchInput = document.getElementById('tmdb-search-input');
    const tmdbSearchResultsContainer = document.getElementById('tmdb-search-results');
    const pendingRequestsContainer = document.getElementById('pending-requests-container');

    tmdbSearchInput.addEventListener('input', (e) => {
        clearTimeout(tmdbSearchTimeout);
        const query = e.target.value;
        if (query.length > 2) {
            tmdbSearchTimeout = setTimeout(() => searchTMDBForRequest(query), 500);
        } else {
            tmdbSearchResultsContainer.innerHTML = '';
        }
    });

    async function searchTMDBForRequest(query) {
         const url = `${TMDB_BASE_URL}/search/multi?api_key=${TMDB_API_KEY}&language=pt-BR&query=${encodeURIComponent(query)}`;
         try {
            const response = await fetch(url);
            const data = await response.json();
            const validResults = data.results.filter(r => (r.media_type === 'movie' || r.media_type === 'tv') && r.poster_path);
            
            if (validResults.length === 0) {
                tmdbSearchResultsContainer.innerHTML = `<p class="col-span-full text-center text-gray-400">Nenhum resultado encontrado.</p>`;
                return;
            }

            tmdbSearchResultsContainer.innerHTML = validResults.map(item => {
                const title = item.title || item.name;
                const year = (item.release_date || item.first_air_date || '').split('-')[0];
                const posterUrl = `${TMDB_IMG_URL}${item.poster_path}`;
                return `
                    <div class="group cursor-pointer" onclick='handleRequestSelection(${JSON.stringify(item)})'>
                        <div class="relative aspect-[2/3] rounded-lg overflow-hidden bg-gray-800 transition-all duration-300 group-hover:ring-2 group-hover:ring-indigo-500">
                            <img src="${posterUrl}" alt="${title}" class="w-full h-full object-cover">
                        </div>
                        <h4 class="font-bold mt-2 truncate">${title}</h4>
                        <p class="text-sm text-gray-400">${year}</p>
                    </div>
                `;
            }).join('');

        } catch (error) {
            console.error("Erro ao pesquisar no TMDB:", error);
            tmdbSearchResultsContainer.innerHTML = `<p class="col-span-full text-center text-red-400">Erro ao buscar.</p>`;
        }
    }

    window.handleRequestSelection = async (item) => {
         // 1. Check if item already exists in catalog
        const existingItem = firestoreContent.find(c => String(c.tmdb_id) === String(item.id));
        if (existingItem) {
            showToast("Este item já está disponível no catálogo!");
            location.hash = `#details/${existingItem.docId}`;
            return;
        }

        // 2. Check if a pending request already exists
        const existingRequest = pendingRequests.find(r => String(r.tmdbId) === String(item.id));
        if (existingRequest) {
            showToast("Este item já foi solicitado. Você pode votar nele na lista abaixo.");
            return;
        }
        
        // 3. Create new request
        showConfirm('Confirmar Pedido', `Tem a certeza que quer pedir "${item.title || item.name}"?`, async () => {
            try {
                const newRequest = {
                    tmdbId: item.id,
                    mediaType: item.media_type,
                    title: item.title || item.name,
                    posterUrl: `${TMDB_IMG_URL}${item.poster_path}`,
                    year: (item.release_date || item.first_air_date || '').split('-')[0],
                    status: "pending",
                    requesters: [userId],
                    createdAt: window.serverTimestamp()
                };
                await window.addDoc(window.collection(window.db, "pedidos"), newRequest);
                showToast("Pedido enviado com sucesso!");
                tmdbSearchResultsContainer.innerHTML = '';
                tmdbSearchInput.value = '';
            } catch(error) {
                console.error("Erro ao criar pedido:", error);
                showToast("Não foi possível criar o pedido.", true);
            }
        });
    }

    function renderPendingRequests() {
        if (!pendingRequestsContainer) return;

        if (pendingRequests.length === 0) {
            pendingRequestsContainer.innerHTML = '<p class="text-gray-500 col-span-full">Ainda não há pedidos em aberto.</p>';
            return;
        }

        pendingRequestsContainer.innerHTML = pendingRequests.map(req => {
            const voteCount = req.requesters?.length || 0;
            const hasVoted = req.requesters?.includes(userId);
            
            const actionButtonHTML = hasVoted 
                ? `<button disabled class="bg-gray-500 text-white font-bold py-2 px-4 rounded-lg text-sm cursor-not-allowed">Já Votou</button>`
                : `<button onclick="voteForRequest('${req.id}')" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg text-sm transition">Votar</button>`;

            return `
                <div class="bg-gray-800/50 p-4 rounded-lg flex gap-4">
                    <img src="${req.posterUrl}" alt="${req.title}" class="w-24 h-36 object-cover rounded-md flex-shrink-0">
                    <div class="flex flex-col justify-between w-full">
                        <div>
                            <h4 class="font-bold text-lg">${req.title}</h4>
                            <p class="text-sm text-gray-400">${req.year}</p>
                        </div>
                        <div class="flex items-center justify-between mt-2">
                            <p class="text-sm font-semibold">${voteCount} ${voteCount === 1 ? 'voto' : 'votos'}</p>
                            ${actionButtonHTML}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    window.voteForRequest = async (requestId) => {
        try {
            const requestRef = window.doc(window.db, "pedidos", requestId);
            await window.updateDoc(requestRef, {
                requesters: window.arrayUnion(userId)
            });
            showToast("Voto computado!");
        } catch(error) {
            console.error("Erro ao votar:", error);
            showToast("Não foi possível registrar o seu voto.", true);
        }
    }


    // --- INICIALIZAÇÃO E EVENT LISTENERS ---
    function initEventListeners() {
        document.querySelectorAll('.nav-link, #logo-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const targetHash = e.currentTarget.getAttribute('href');
                if (location.hash !== targetHash) {
                    history.pushState(null, '', targetHash);
                    handleLocationChange();
                }
            });
        });

        document.getElementById('search-btn').addEventListener('click', () => toggleModal('modal-busca'));
        
        document.getElementById('notifications-btn').addEventListener('click', () => {
            renderNotifications();
            toggleModal('modal-notificacoes');

            // Mark notifications as read
            if (notifications.length > 0 && notifications[0].createdAt) {
                const latestTimestamp = notifications[0].createdAt.toMillis ? notifications[0].createdAt.toMillis() : new Date(notifications[0].createdAt).getTime();
                lastNotificationCheck = latestTimestamp;
                localStorage.setItem('starlight-lastNotificationCheck', latestTimestamp);
                updateNotificationBell(); // Hide dot immediately
            }
        });

        document.getElementById('profile-btn').addEventListener('click', () => toggleModal('modal-perfil'));
        
        document.getElementById('search-input').addEventListener('keyup', (e) => {
            const query = e.target.value.toLowerCase();
            const resultsContainer = document.getElementById('search-results-container');
            if(query.length < 2) { resultsContainer.innerHTML = ''; return; }
            const results = firestoreContent.filter(item => 
                item.title.toLowerCase().includes(query) || 
                (item.genres && item.genres.some(g => g.toLowerCase().includes(query)))
            );
            if(results.length > 0) {
                 resultsContainer.innerHTML = `<div class="grid grid-cols-2 md:grid-cols-3 gap-2">${results.map(createContentCard).join('')}</div>`;
            } else {
                 resultsContainer.innerHTML = '<p class="text-center text-stone-400">Nenhum resultado encontrado.</p>';
            }
        });

        window.addEventListener('click', (e) => { if (e.target.classList.contains('modal')) closeAllModals(); });
        window.addEventListener('keydown', (e) => { if (e.key === 'Escape') {
            if(!document.getElementById('modal-video').classList.contains('hidden')) stopVideo();
            else closeAllModals();
        }});
        
        document.getElementById('hero-watch-btn').addEventListener('click', () => { if(currentHeroItem) location.hash = `#details/${currentHeroItem.docId}`; });
        document.getElementById('hero-list-btn').addEventListener('click', () => { if(currentHeroItem) toggleMyListItem(currentHeroItem); });
        
        document.getElementById('hero-toggle-overview-btn')?.addEventListener('click', (e) => {
            const overviewEl = document.getElementById('hero-overview');
            overviewEl.classList.toggle('synopsis-truncated');
            e.target.textContent = overviewEl.classList.contains('synopsis-truncated') ? 'Ver mais' : 'Ver menos';
        });

        setupPlayerEventListeners();

        window.addEventListener('popstate', handleLocationChange);
        window.addEventListener('scroll', handleHeaderStyle, { passive: true });
    }
    
    async function initializeApp() {
        // Setup real-time listeners first
        listenToFirestoreContent(); 
        listenForRequests();
        listenForNotifications();
        
        // Initial load for featured items (which triggers initial screen render via listener)
        await fetchFeaturedItems(); 
        loadMyList();
        initEventListeners();
        handleLocationChange();
    }

    setTimeout(initializeApp, 500);
});

