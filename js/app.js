/* ==========================================================================
   App Module - Main Entrypoint, Event Routing, Filtering & Sorting
   ========================================================================== */

import { Storage } from './storage.js';
import { Render } from './render.js';
import { Modal } from './modal.js';
import { Api } from './api.js';

class App {
  constructor() {
    this.currentFilter = 'all';
    this.currentView = 'gallery';
    this.searchQuery = '';
    this.sortBy = 'updated';
    this.recentCategory = 'seasonal'; // 'seasonal' | 'airing' | 'trending'
    this.recentYear = 2024;
    this.recentSeason = 'all';        // 'all' | 'winter' | 'spring' | 'summer' | 'fall'
    this.recentAnimesCache = {};
    this.isLoadingRecent = false;
  }

  init() {
    // Initialize Modal interactions
    Modal.init((toastMsg) => {
      this.refreshUI(toastMsg);
    });

    this.bindHeaderActions();
    this.bindFilterTabs();
    this.bindViewSwitcher();
    this.bindSearchAndSort();
    this.bindListInteractions();
    this.bindBackupActions();

    // Initial render
    this.refreshUI();
  }

  bindHeaderActions() {
    const btnNewAnime = document.getElementById('btnOpenAddModal');
    if (btnNewAnime) {
      btnNewAnime.addEventListener('click', () => Modal.openAddModal());
    }

    // Dynamic delegate for empty state button
    document.addEventListener('click', (e) => {
      const target = e.target;
      if (target && (target.id === 'btnOpenAddModalEmpty' || target.closest('#btnOpenAddModalEmpty'))) {
        Modal.openAddModal();
      }
    });
  }

  bindFilterTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        tabs.forEach(t => t.classList.remove('active'));
        const clicked = e.currentTarget;
        clicked.classList.add('active');
        this.currentFilter = clicked.getAttribute('data-filter') || 'all';

        // Toggle visibility of view switcher and sort dropdown if on recent releases tab
        const viewSwitcher = document.querySelector('.view-switcher');
        const sortSelect = document.getElementById('sortSelect');
        if (this.currentFilter === 'recent_releases') {
          if (viewSwitcher) viewSwitcher.style.display = 'none';
          if (sortSelect) sortSelect.style.display = 'none';
        } else {
          if (viewSwitcher) viewSwitcher.style.display = 'flex';
          if (sortSelect) sortSelect.style.display = 'block';
        }

        this.refreshUI();
      });
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
        this.recentYear = parseInt(target.value, 10) || 2024;
        this.loadAndRenderRecent();
      } else if (target.id === 'recentSeasonSelect') {
        this.recentSeason = target.value || 'all';
        this.loadAndRenderRecent();
      }
    });

    listContainer.addEventListener('click', (e) => {
      const target = e.target;

      // 1. Sub-filter buttons inside Recent Releases (Temporada, Airing, Trending)
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
          Storage.save({
            ...animeData,
            id: 'anime-' + Date.now(),
            status: 'plan_to_watch'
          });
          this.showToast(`"${animeData.title}" adicionado à sua lista!`);
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
