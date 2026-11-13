/* ==========================================================================
   App Module - Main Entrypoint, Event Routing, Filtering & Sorting
   ========================================================================== */

import { Storage } from './storage.js';
import { Render } from './render.js';
import { Modal } from './modal.js';
import { Api } from './api.js';
import { Auth } from './auth.js';
import { Sync } from './sync.js';

class App {
  constructor() {
    this.currentFilter = 'all';
    this.lastPersonalFilter = 'all';
    this.currentView = 'gallery';
    this.searchQuery = '';
    this.sortBy = 'updated';
    const systemYear = new Date().getFullYear();
    this.recentCategory = 'seasonal'; // 'seasonal' | 'airing' | 'trending'
    this.recentYear = systemYear;
    this.recentSeason = 'all';        // 'all' | 'past' | 'winter' | 'spring' | 'summer' | 'fall'
    this.recentAnimesCache = {};
    this.isLoadingRecent = false;
    this.authMode = 'login';          // 'login' | 'register'
  }

  init() {
    // Initialize Modal interactions
    Modal.init((toastMsg) => {
      this.refreshUI(toastMsg);
      Sync.triggerDebouncedSync();
    });

    this.bindHeaderActions();
    this.bindAuthActions();
    this.bindFilterTabs();
    this.bindViewSwitcher();
    this.bindSearchAndSort();
    this.bindListInteractions();
    this.bindBackupActions();

    // Listen for cloud sync completion
    window.addEventListener('animelist:synced', () => {
      this.refreshUI();
    });

    // Check cloud session & initial sync
    if (Auth.isLoggedIn()) {
      Auth.checkSession().then((user) => {
        this.renderAuthHeader();
        if (user) {
          Sync.sync().then(res => {
            if (res.synced) {
              this.showToast('Nuvem sincronizada');
            }
          });
        }
      });
    }

    // Initial render
    this.renderAuthHeader();
    this.refreshUI();
  }

  bindHeaderActions() {
    const btnNewAnime = document.getElementById('btnOpenAddModal');
    const fabAddAnime = document.getElementById('fabAddAnime');

    btnNewAnime?.addEventListener('click', () => Modal.openAddModal());
    fabAddAnime?.addEventListener('click', () => Modal.openAddModal());

    // Show floating bottom-right button only after scrolling past the inline button
    let scrollRafPending = false;
    const updateFabVisibility = () => {
      scrollRafPending = false;
      if (!btnNewAnime || !fabAddAnime) return;
      const headerHeight = document.querySelector('.app-header')?.offsetHeight || 64;
      const rect = btnNewAnime.getBoundingClientRect();
      const isOutOfView = rect.bottom <= headerHeight + 8 || rect.top >= window.innerHeight;
      fabAddAnime.classList.toggle('visible', isOutOfView);
      fabAddAnime.setAttribute('aria-hidden', String(!isOutOfView));
      fabAddAnime.tabIndex = isOutOfView ? 0 : -1;
    };

    const scheduleFabCheck = () => {
      if (!scrollRafPending) {
        scrollRafPending = true;
        requestAnimationFrame(updateFabVisibility);
      }
    };

    window.addEventListener('scroll', scheduleFabCheck, { passive: true });
    window.addEventListener('resize', scheduleFabCheck, { passive: true });
    updateFabVisibility();

    // Dynamic delegate for empty state button
    document.addEventListener('click', (e) => {
      const target = e.target;
      if (target && (target.id === 'btnOpenAddModalEmpty' || target.closest('#btnOpenAddModalEmpty'))) {
        Modal.openAddModal();
      }
    });
  }

  renderAuthHeader() {
    const container = document.getElementById('authHeaderContainer');
    if (!container) return;

    if (Auth.isLoggedIn()) {
      const user = Auth.getUser() || {};
      const displayName = user.name || (user.email ? user.email.split('@')[0] : 'Usuário');

      container.innerHTML = `
        <div class="user-profile-menu">
          <button class="btn btn-user" id="btnUserMenu" title="Menu da Conta na Nuvem">
            <span class="user-cloud-status"></span>
            <span>${Render.escapeHTML(displayName)}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </button>
          <div class="user-dropdown-menu" id="userDropdown">
            <div class="user-dropdown-header">
              <span class="user-email-text" title="${Render.escapeHTML(user.email || '')}">${Render.escapeHTML(user.email || '')}</span>
              <span class="user-sync-text">✓ Cloudflare D1 Conectado</span>
            </div>
            <button class="user-dropdown-item" id="btnForceSync">
              🔄 Sincronizar Agora
            </button>
            <button class="user-dropdown-item danger" id="btnLogout">
              🚪 Sair da Conta
            </button>
          </div>
        </div>
      `;
    } else {
      container.innerHTML = `
        <button class="btn" id="btnOpenAuthModal" title="Conectar ou sincronizar com o banco de dados na nuvem">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
          <span>Nuvem • Entrar</span>
        </button>
      `;
    }
  }

  bindAuthActions() {
    const modalAuth = document.getElementById('modalAuth');
    const formAuth = document.getElementById('formAuth');
    const tabLogin = document.getElementById('tabAuthLogin');
    const tabRegister = document.getElementById('tabAuthRegister');
    const groupName = document.getElementById('groupAuthName');
    const submitText = document.getElementById('btnSubmitAuthText');
    const spinner = document.getElementById('authSpinner');
    const alertBox = document.getElementById('authAlert');

    // Switch between Login and Register tabs
    const setAuthMode = (mode) => {
      this.authMode = mode;
      if (alertBox) alertBox.style.display = 'none';

      if (mode === 'login') {
        tabLogin?.classList.add('active');
        tabRegister?.classList.remove('active');
        if (groupName) groupName.style.display = 'none';
        if (submitText) submitText.textContent = 'Entrar';
        const modalTitle = document.getElementById('modalAuthTitle');
        if (modalTitle) modalTitle.textContent = 'Entrar na Nuvem';
      } else {
        tabRegister?.classList.add('active');
        tabLogin?.classList.remove('active');
        if (groupName) groupName.style.display = 'block';
        if (submitText) submitText.textContent = 'Criar Conta';
        const modalTitle = document.getElementById('modalAuthTitle');
        if (modalTitle) modalTitle.textContent = 'Criar Conta na Nuvem';
      }
    };

    tabLogin?.addEventListener('click', () => setAuthMode('login'));
    tabRegister?.addEventListener('click', () => setAuthMode('register'));

    // Delegate clicks for open modal, dropdown menu, sync & logout
    document.addEventListener('click', (e) => {
      const target = e.target;

      // 1. Open Auth Modal
      if (target && (target.id === 'btnOpenAuthModal' || target.closest('#btnOpenAuthModal'))) {
        setAuthMode('login');
        if (formAuth) formAuth.reset();
        if (alertBox) alertBox.style.display = 'none';
        modalAuth?.classList.add('open');
        document.body.style.overflow = 'hidden';
        setTimeout(() => document.getElementById('inputAuthEmail')?.focus(), 80);
        return;
      }

      // 2. Toggle user dropdown
      const btnUserMenu = target.closest('#btnUserMenu');
      const userDropdown = document.getElementById('userDropdown');
      if (btnUserMenu) {
        e.stopPropagation();
        userDropdown?.classList.toggle('open');
        return;
      }

      // Close dropdown when clicking outside
      if (userDropdown && userDropdown.classList.contains('open') && !target.closest('.user-profile-menu')) {
        userDropdown.classList.remove('open');
      }

      // 3. Force Sync Action
      if (target && (target.id === 'btnForceSync' || target.closest('#btnForceSync'))) {
        userDropdown?.classList.remove('open');
        this.showToast('Sincronizando com Cloudflare D1...');
        Sync.sync().then(res => {
          if (res.synced) {
            this.showToast(`Sincronizado! ${res.count} animes na nuvem.`);
            this.refreshUI();
          } else {
            this.showToast(res.message || 'Erro ao sincronizar.');
          }
        });
        return;
      }

      // 4. Logout Action
      if (target && (target.id === 'btnLogout' || target.closest('#btnLogout'))) {
        userDropdown?.classList.remove('open');
        Auth.clearSession();
        this.renderAuthHeader();
        this.showToast('Você saiu da sua conta.');
        return;
      }
    });

    // Handle Form Submit
    formAuth?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('inputAuthEmail')?.value.trim();
      const password = document.getElementById('inputAuthPassword')?.value;
      const name = document.getElementById('inputAuthName')?.value.trim();
      const syncLocal = document.getElementById('checkSyncLocalData')?.checked;

      if (!email || !password) return;

      if (spinner) spinner.style.display = 'block';
      if (submitText) submitText.style.display = 'none';
      if (alertBox) alertBox.style.display = 'none';

      try {
        let result;
        if (this.authMode === 'login') {
          result = await Auth.login(email, password);
        } else {
          result = await Auth.register(email, password, name);
        }

        this.renderAuthHeader();

        // Sincroniza dados locais se o usuário marcou
        if (syncLocal) {
          await Sync.sync();
        }

        Modal.closeAll();
        formAuth.reset();
        this.showToast(result.message || 'Conectado com sucesso à nuvem!');
        this.refreshUI();
      } catch (err) {
        console.error('Erro de autenticação:', err);
        if (alertBox) {
          alertBox.className = 'auth-alert error';
          let msg = err.message || 'Erro ao comunicar com o servidor.';
          if (msg === 'Failed to fetch') {
            msg = 'Não foi possível conectar ao servidor Cloudflare. Verifique a conexão ou tente novamente em instantes.';
          }
          alertBox.textContent = msg;
          alertBox.style.display = 'block';
        }
      } finally {
        if (spinner) spinner.style.display = 'none';
        if (submitText) submitText.style.display = 'inline';
      }
    });
  }

  bindFilterTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    const filterTabsNav = document.querySelector('.filter-tabs');
    const btnBrowseAnimes = document.getElementById('btnBrowseAnimes');
    const btnHomeBrand = document.getElementById('btnHomeBrand');
    const searchInput = document.getElementById('filterSearchInput');
    const viewSwitcher = document.querySelector('.view-switcher');
    const sortSelect = document.getElementById('sortSelect');

    const syncControlsVisibility = (isBrowseMode) => {
      if (isBrowseMode) {
        if (viewSwitcher) viewSwitcher.style.display = 'none';
        if (sortSelect) sortSelect.style.display = 'none';
      } else {
        if (viewSwitcher) viewSwitcher.style.display = 'flex';
        if (sortSelect) sortSelect.style.display = 'block';
      }
    };

    const activatePersonalFilter = (filterKey) => {
      this.currentFilter = filterKey;
      this.lastPersonalFilter = filterKey;
      btnBrowseAnimes?.classList.remove('active');
      tabs.forEach(t => {
        t.classList.toggle('active', (t.getAttribute('data-filter') || 'all') === filterKey);
      });
      syncControlsVisibility(false);
      this.refreshUI();
    };

    btnHomeBrand?.addEventListener('click', () => {
      if (searchInput && searchInput.value) {
        searchInput.value = '';
        this.searchQuery = '';
      }
      activatePersonalFilter('all');
      if (filterTabsNav) {
        filterTabsNav.scrollLeft = 0;
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    tabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        const filterKey = e.currentTarget.getAttribute('data-filter') || 'all';
        activatePersonalFilter(filterKey);
      });
    });

    btnBrowseAnimes?.addEventListener('click', () => {
      if (this.currentFilter === 'recent_releases') {
        activatePersonalFilter(this.lastPersonalFilter || 'all');
        return;
      }

      this.lastPersonalFilter = this.currentFilter !== 'recent_releases' ? this.currentFilter : 'all';
      this.currentFilter = 'recent_releases';
      tabs.forEach(t => t.classList.remove('active'));
      btnBrowseAnimes.classList.add('active');
      syncControlsVisibility(true);
      this.refreshUI();
    });
  }

  bindViewSwitcher() {
    const btnGallery = document.getElementById('btnViewGallery');
    const btnTable = document.getElementById('btnViewTable');

    btnGallery?.addEventListener('click', () => {
      this.currentView = 'gallery';
      btnGallery.classList.add('active');
      btnTable?.classList.remove('active');
      this.refreshUI();
    });

    btnTable?.addEventListener('click', () => {
      this.currentView = 'table';
      btnTable.classList.add('active');
      btnGallery?.classList.remove('active');
      this.refreshUI();
    });
  }

  bindSearchAndSort() {
    const searchInput = document.getElementById('filterSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.trim().toLowerCase();
        this.refreshUI();
      });
    }

    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        this.sortBy = e.target.value;
        this.refreshUI();
      });
    }
  }

  bindListInteractions() {
    const listContainer = document.getElementById('animesViewContainer');
    if (!listContainer) return;

    // Handle select dropdowns inside Recent Releases (Ano e Temporada)
    listContainer.addEventListener('change', (e) => {
      const target = e.target;
      if (target.id === 'recentYearSelect') {
        this.recentYear = parseInt(target.value, 10) || new Date().getFullYear();
        this.loadAndRenderRecent();
      } else if (target.id === 'recentSeasonSelect') {
        this.recentSeason = target.value || 'all';
        this.loadAndRenderRecent();
      }
    });

    listContainer.addEventListener('click', async (e) => {
      const target = e.target;

      // 1. Sub-filter buttons inside Recent Releases (Por Temporada, Airing, Trending)
      const recentFilterBtn = target.closest('.recent-filter-btn');
      if (recentFilterBtn) {
        this.recentCategory = recentFilterBtn.getAttribute('data-category') || 'seasonal';
        this.loadAndRenderRecent();
        return;
      }

      // 2. Quick add from Recent Releases
      const addRecentBtn = target.closest('[data-action="add-recent"]');
      if (addRecentBtn) {
        e.stopPropagation();
        const animeId = addRecentBtn.getAttribute('data-id');
        const cacheKey = `${this.recentCategory}_${this.recentYear}_${this.recentSeason}`;
        const currentList = this.recentAnimesCache[cacheKey] || [];
        const animeData = currentList.find(a => a.id === animeId);
        if (animeData) {
          addRecentBtn.disabled = true;
          const needsEnrich = !animeData.totalEpisodes || !animeData.genres?.length || animeData.studio === 'Desconhecido';
          const resolvedData = needsEnrich ? await Api.enrichAnimeData(animeData) : animeData;
          Storage.save({
            ...resolvedData,
            id: resolvedData.id || 'anime-' + Date.now(),
            status: 'plan_to_watch'
          });
          this.showToast(`"${resolvedData.title}" adicionado à sua lista!`);
          this.refreshUI();
        }
        return;
      }

      // 3. Click on Recent Anime card to preview/add or view
      const recentCard = target.closest('.recent-anime-card');
      if (recentCard && this.currentFilter === 'recent_releases') {
        const animeId = recentCard.getAttribute('data-id');
        const allAnimes = Storage.getAll();
        const localMatch = allAnimes.find(a => a.id === animeId);
        if (localMatch) {
          Modal.openDetailModal(localMatch.id);
        } else {
          const cacheKey = `${this.recentCategory}_${this.recentYear}_${this.recentSeason}`;
          const currentList = this.recentAnimesCache[cacheKey] || [];
          const animeData = currentList.find(a => a.id === animeId);
          if (animeData) {
            Modal.openAddModal();
            Modal.selectApiSuggestion(animeData);
            if (!animeData.totalEpisodes || !animeData.genres?.length || animeData.studio === 'Desconhecido') {
              Api.enrichAnimeData(animeData).then(enriched => {
                if (Modal.pendingAnimeData?.id === animeData.id) {
                  Modal.selectApiSuggestion(enriched);
                }
              });
            }
          }
        }
        return;
      }

      // 4. Quick favorite toggle (Personal list)
      const favBtn = target.closest('[data-action="toggle-fav"]');
      if (favBtn) {
        e.stopPropagation();
        const animeId = favBtn.getAttribute('data-id');
        if (animeId) {
          const isFav = Storage.toggleFavorite(animeId);
          this.refreshUI(isFav ? 'Adicionado aos favoritos' : 'Removido dos favoritos');
        }
        return;
      }

      // 5. Quick +1 episode
      const incBtn = target.closest('[data-action="increment-ep"]');
      if (incBtn) {
        e.stopPropagation();
        const animeId = incBtn.getAttribute('data-id');
        if (animeId) {
          const anime = Storage.getById(animeId);
          if (anime) {
            Storage.updateCurrentEpisode(animeId, (anime.currentEpisode || 0) + 1);
            this.refreshUI(`Episódio ${(anime.currentEpisode || 0) + 1} assistido!`);
          }
        }
        return;
      }

      // 6. Quick -1 episode (in Table view)
      const decBtn = target.closest('[data-action="decrement-ep"]');
      if (decBtn) {
        e.stopPropagation();
        const animeId = decBtn.getAttribute('data-id');
        if (animeId) {
          const anime = Storage.getById(animeId);
          if (anime) {
            Storage.updateCurrentEpisode(animeId, Math.max(0, (anime.currentEpisode || 0) - 1));
            this.refreshUI();
          }
        }
        return;
      }

      // 7. Open Anime Detail Drawer
      const animeCard = target.closest('.anime-card, .anime-table tbody tr');
      if (animeCard) {
        const animeId = animeCard.getAttribute('data-id');
        if (animeId) {
          Modal.openDetailModal(animeId);
        }
      }
    });
  }

  bindBackupActions() {
    const btnExport = document.getElementById('btnExportBackup');
    const btnImport = document.getElementById('btnImportBackup');
    const fileInput = document.getElementById('backupFileInput');

    btnExport?.addEventListener('click', () => {
      Storage.exportToJson();
      this.showToast('Backup exportado com sucesso!');
    });

    btnImport?.addEventListener('click', () => {
      fileInput?.click();
    });

    fileInput?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result;
        const res = Storage.importFromJson(content);
        if (res.success) {
          this.refreshUI(res.message);
        } else {
          alert(res.message);
        }
        // Reset file input
        fileInput.value = '';
      };
      reader.readAsText(file);
    });
  }

  filterAndSortAnimes(animes) {
    let list = [...animes];

    // Status / Category Filter
    if (this.currentFilter === 'favorites') {
      list = list.filter(a => a.favorite);
    } else if (this.currentFilter !== 'all' && this.currentFilter !== 'recent_releases') {
      list = list.filter(a => a.status === this.currentFilter);
    }

    // Search Query Filter
    if (this.searchQuery) {
      list = list.filter(a => {
        const t = (a.title || '').toLowerCase();
        const ot = (a.originalTitle || '').toLowerCase();
        const g = (a.genres || []).join(' ').toLowerCase();
        return t.includes(this.searchQuery) || ot.includes(this.searchQuery) || g.includes(this.searchQuery);
      });
    }

    // Sorter
    list.sort((a, b) => {
      if (this.sortBy === 'score') {
        return (b.score || 0) - (a.score || 0);
      }
      if (this.sortBy === 'title') {
        return (a.title || '').localeCompare(b.title || '');
      }
      if (this.sortBy === 'episodes') {
        return (b.currentEpisode || 0) - (a.currentEpisode || 0);
      }
      // default: updated (most recent first)
      const dateA = new Date(a.updatedAt || 0).getTime();
      const dateB = new Date(b.updatedAt || 0).getTime();
      return dateB - dateA;
    });

    return list;
  }

  async loadAndRenderRecent() {
    const container = document.getElementById('animesViewContainer');
    const allAnimes = Storage.getAll();
    if (!container) return;

    const cacheKey = `${this.recentCategory}_${this.recentYear}_${this.recentSeason}`;

    if (!this.recentAnimesCache[cacheKey] || this.recentAnimesCache[cacheKey].length === 0) {
      this.isLoadingRecent = true;
      Render.renderRecentReleases([], allAnimes, container, {
        category: this.recentCategory,
        year: this.recentYear,
        season: this.recentSeason
      }, true);

      const data = await Api.getSeasonalReleases({
        year: this.recentYear,
        season: this.recentSeason,
        category: this.recentCategory
      });

      if (data && data.length > 0) {
        this.recentAnimesCache[cacheKey] = data;
      }
      this.isLoadingRecent = false;
    }

    const cached = this.recentAnimesCache[cacheKey] || [];
    let list = cached;

    if (this.searchQuery) {
      list = list.filter(a => {
        const t = (a.title || '').toLowerCase();
        const ot = (a.originalTitle || '').toLowerCase();
        return t.includes(this.searchQuery) || ot.includes(this.searchQuery);
      });
    }

    Render.renderRecentReleases(list, allAnimes, container, {
      category: this.recentCategory,
      year: this.recentYear,
      season: this.recentSeason
    }, false);
  }

  refreshUI(toastMessage) {
    const allAnimes = Storage.getAll();

    if (this.currentFilter === 'recent_releases') {
      this.loadAndRenderRecent();
    } else {
      const filteredAnimes = this.filterAndSortAnimes(allAnimes);
      const container = document.getElementById('animesViewContainer');

      if (container) {
        if (this.currentView === 'gallery') {
          Render.renderGallery(filteredAnimes, container);
        } else {
          Render.renderTable(filteredAnimes, container);
        }
      }
    }

    Render.updateTabCounters(allAnimes);

    if (toastMessage) {
      this.showToast(toastMessage);
    }
  }

  showToast(message) {
    let toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.className = 'toast-container';
      document.body.appendChild(toastContainer);
    }

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4dab9a" stroke-width="2.5"><path d="M20 6L9 17l-5-5"></path></svg>
      <span>${message}</span>
    `;

    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px) scale(0.95)';
      toast.style.transition = 'all 0.2s ease';
      setTimeout(() => toast.remove(), 200);
    }, 2800);
  }
}

// Instantiate on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
});
