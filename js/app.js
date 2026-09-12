/* ==========================================================================
   App Module - Main Entrypoint, Event Routing, Filtering & Sorting
   ========================================================================== */

import { Storage } from './storage.js';
import { Render } from './render.js';
import { Modal } from './modal.js';
import { Api } from './api.js';
import { Config } from './config.js';
import { SupabaseService } from './supabase.js';

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
    this.currentAuthTab = 'login';
  }

  async init() {
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
    this.bindAuthModal();

    // Initial render
    this.refreshUI();

    // Inicializar conexão com Supabase e verificar sessão
    await this.initSupabaseAndAuth();
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

  async initSupabaseAndAuth() {
    const isConfigured = await SupabaseService.init();

    // Listener de mudança de autenticação
    SupabaseService.onAuthStateChange(async (event, session, user) => {
      this.updateAuthUI(user);

      if (event === 'SIGNED_IN' && user) {
        this.setSyncStatus('syncing', 'Sincronizando...');
        const syncResult = await Storage.syncWithCloud();
        this.setSyncStatus('online', 'Nuvem Ativa');

        let msg = 'Conectado à sua conta!';
        if (syncResult?.status === 'pulled') {
          msg = `Sincronizado! ${syncResult.count} animes carregados da nuvem.`;
        } else if (syncResult?.status === 'pushed') {
          msg = `Sincronizado! ${syncResult.count} animes locais enviados para a nuvem.`;
        }
        this.refreshUI(msg);
      } else if (event === 'SIGNED_OUT') {
        this.setSyncStatus('offline', 'Modo Local');
        this.refreshUI('Sessão encerrada. Operando em modo local.');
      }
    });

    const user = SupabaseService.getCurrentUser();
    this.updateAuthUI(user);

    if (user) {
      this.setSyncStatus('syncing', 'Sincronizando...');
      const syncResult = await Storage.syncWithCloud();
      this.setSyncStatus('online', 'Nuvem Ativa');
      this.refreshUI();
    } else {
      this.setSyncStatus('offline', 'Modo Local');
    }
  }

  setSyncStatus(status, label) {
    const dot = document.getElementById('syncStatusDot');
    const text = document.getElementById('syncStatusText');
    if (!dot || !text) return;

    dot.className = `sync-dot status-${status}`;
    text.textContent = label;
  }

  updateAuthUI(user) {
    const userPill = document.getElementById('userPill');
    const userEmailText = document.getElementById('userEmailText');
    const btnOpenAuth = document.getElementById('btnOpenAuthModal');

    if (user && user.email) {
      if (userPill) userPill.style.display = 'inline-flex';
      if (userEmailText) userEmailText.textContent = user.email;
      if (btnOpenAuth) btnOpenAuth.style.display = 'none';
      this.setSyncStatus('online', 'Nuvem Ativa');
    } else {
      if (userPill) userPill.style.display = 'none';
      if (btnOpenAuth) btnOpenAuth.style.display = 'inline-flex';
      this.setSyncStatus('offline', 'Modo Local');
    }
  }

  bindAuthModal() {
    const modal = document.getElementById('authModal');
    const btnOpen = document.getElementById('btnOpenAuthModal');
    const btnStatus = document.getElementById('btnAuthStatus');
    const btnLogout = document.getElementById('btnLogout');
    const form = document.getElementById('authForm');
    const feedback = document.getElementById('authFeedback');

    const openModal = (tab = 'login') => {
      this.switchAuthTab(tab);
      if (modal) modal.style.display = 'flex';
    };

    const closeModal = () => {
      if (modal) modal.style.display = 'none';
      if (feedback) {
        feedback.style.display = 'none';
        feedback.textContent = '';
      }
    };

    if (btnOpen) btnOpen.addEventListener('click', () => openModal('login'));

    if (btnStatus) {
      btnStatus.addEventListener('click', async () => {
        if (SupabaseService.isAuthenticated()) {
          this.setSyncStatus('syncing', 'Sincronizando...');
          await Storage.syncWithCloud();
          this.setSyncStatus('online', 'Nuvem Ativa');
          this.refreshUI('Dados sincronizados com a nuvem!');
        } else {
          openModal('login');
        }
      });
    }

    if (btnLogout) {
      btnLogout.addEventListener('click', async () => {
        if (confirm('Deseja realmente encerrar a sessão na nuvem?')) {
          await SupabaseService.signOut();
        }
      });
    }

    // Modal tabs
    const tabs = modal?.querySelectorAll('.auth-tab');
    tabs?.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = e.currentTarget.getAttribute('data-tab');
        this.switchAuthTab(tab);
      });
    });

    // Close buttons
    modal?.querySelectorAll('[data-action="close-modal"]').forEach(btn => {
      btn.addEventListener('click', closeModal);
    });

    // Fechar ao clicar no fundo
    modal?.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    // Submissão do formulário de Login / Signup
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleAuthSubmit();
      });
    }

    // Configuração do Supabase
    const btnSaveConfig = document.getElementById('btnSaveConfig');
    const btnClearConfig = document.getElementById('btnClearConfig');
    const inputUrl = document.getElementById('configSupabaseUrl');
    const inputKey = document.getElementById('configSupabaseKey');

    if (btnSaveConfig) {
      btnSaveConfig.addEventListener('click', async () => {
        const url = inputUrl?.value?.trim() || '';
        const key = inputKey?.value?.trim() || '';

        if (!url || !key) {
          this.showAuthFeedback('Por favor, preencha a URL e a Chave Pública (anon key).', 'error');
          return;
        }

        Config.saveSupabaseConfig(url, key);
        this.showAuthFeedback('Conectando ao Supabase...', 'success');

        const success = await SupabaseService.init();
        if (success) {
          this.showAuthFeedback('Credenciais salvas e cliente conectado com sucesso!', 'success');
          setTimeout(() => {
            this.switchAuthTab('login');
          }, 800);
        } else {
          this.showAuthFeedback('Credenciais salvas, mas verifique se a URL é válida e começa com https://', 'error');
        }
      });
    }

    if (btnClearConfig) {
      btnClearConfig.addEventListener('click', () => {
        if (confirm('Deseja limpar as credenciais salvas do Supabase?')) {
          Config.clearSupabaseConfig();
          if (inputUrl) inputUrl.value = '';
          if (inputKey) inputKey.value = '';
          this.showAuthFeedback('Credenciais removidas.', 'error');
          this.setSyncStatus('offline', 'Modo Local');
        }
      });
    }
  }

  switchAuthTab(tabName) {
    this.currentAuthTab = tabName;
    const modal = document.getElementById('authModal');
    if (!modal) return;

    modal.querySelectorAll('.auth-tab').forEach(t => {
      t.classList.toggle('active', t.getAttribute('data-tab') === tabName);
    });

    const form = document.getElementById('authForm');
    const configPanel = document.getElementById('authConfigPanel');
    const heading = document.getElementById('authModalHeading');
    const confirmGroup = document.getElementById('groupConfirmPassword');
    const confirmInput = document.getElementById('authConfirmPassword');
    const submitText = document.getElementById('authSubmitText');
    const feedback = document.getElementById('authFeedback');

    if (feedback) {
      feedback.style.display = 'none';
      feedback.textContent = '';
    }

    if (tabName === 'config') {
      if (form) form.style.display = 'none';
      if (configPanel) configPanel.style.display = 'block';
      if (heading) heading.textContent = 'Configurar Supabase';

      const cfg = Config.getSupabaseConfig();
      const inputUrl = document.getElementById('configSupabaseUrl');
      const inputKey = document.getElementById('configSupabaseKey');
      if (inputUrl) inputUrl.value = cfg.url;
      if (inputKey) inputKey.value = cfg.anonKey;
    } else {
      if (configPanel) configPanel.style.display = 'none';
      if (form) form.style.display = 'block';

      if (tabName === 'signup') {
        if (heading) heading.textContent = 'Criar Nova Conta';
        if (confirmGroup) confirmGroup.style.display = 'block';
        if (confirmInput) confirmInput.required = true;
        if (submitText) submitText.textContent = 'Cadastrar e Sincronizar';
      } else {
        if (heading) heading.textContent = 'Entrar na sua Conta';
        if (confirmGroup) confirmGroup.style.display = 'none';
        if (confirmInput) confirmInput.required = false;
        if (submitText) submitText.textContent = 'Entrar na Conta';
      }
    }
  }

  showAuthFeedback(message, type = 'error') {
    const feedback = document.getElementById('authFeedback');
    if (!feedback) return;
    feedback.className = `auth-feedback ${type}`;
    feedback.textContent = message;
    feedback.style.display = 'block';
  }

  async handleAuthSubmit() {
    const emailInput = document.getElementById('authEmail');
    const passwordInput = document.getElementById('authPassword');
    const confirmInput = document.getElementById('authConfirmPassword');
    const submitBtn = document.getElementById('btnAuthSubmit');
    const submitText = document.getElementById('authSubmitText');

    const email = emailInput?.value?.trim() || '';
    const password = passwordInput?.value || '';
    const confirmPassword = confirmInput?.value || '';

    if (!Config.isConfigured()) {
      this.showAuthFeedback('Configure primeiro a URL e a chave do Supabase na aba "Configurar Supabase".', 'error');
      this.switchAuthTab('config');
      return;
    }

    if (!email || !password) {
      this.showAuthFeedback('Preencha todos os campos obrigatórios.', 'error');
      return;
    }

    if (this.currentAuthTab === 'signup') {
      if (password.length < 6) {
        this.showAuthFeedback('A senha deve conter no mínimo 6 caracteres.', 'error');
        return;
      }
      if (password !== confirmPassword) {
        this.showAuthFeedback('As senhas digitadas não conferem.', 'error');
        return;
      }
    }

    const originalText = submitText.textContent;
    submitBtn.disabled = true;
    submitText.textContent = 'Aguarde...';

    try {
      if (this.currentAuthTab === 'signup') {
        const { data, error } = await SupabaseService.signUp(email, password);
        if (error) {
          this.showAuthFeedback(error.message || 'Erro ao criar conta.', 'error');
        } else {
          this.showAuthFeedback('Conta criada com sucesso! Se a confirmação de email estiver desativada no seu Supabase, você já pode entrar.', 'success');
          if (data?.session) {
            setTimeout(() => {
              document.getElementById('authModal').style.display = 'none';
            }, 1000);
          }
        }
      } else {
        const { data, error } = await SupabaseService.signIn(email, password);
        if (error) {
          this.showAuthFeedback(error.message || 'Email ou senha inválidos.', 'error');
        } else {
          this.showAuthFeedback('Login realizado com sucesso!', 'success');
          setTimeout(() => {
            document.getElementById('authModal').style.display = 'none';
          }, 800);
        }
      }
    } catch (err) {
      this.showAuthFeedback(err.message || 'Erro inesperado de conexão.', 'error');
    } finally {
      submitBtn.disabled = false;
      submitText.textContent = originalText;
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
