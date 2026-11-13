/* ==========================================================================
   Modal Module - Add Anime (API Search + Manual) & Notion Detail Drawer
   ========================================================================== */

import { Storage } from './storage.js';
import { Api } from './api.js';

const EP_CHUNK_SIZE = 100;

export const Modal = {
  activeAnimeId: null,
  draftAnime: null,        // Holds unsaved anime when previewing/categorizing before adding
  activeTab: 'episodes',
  currentEditingAnime: null,
  searchDebounceTimer: null,
  pendingAnimeData: null,
  onDataChangedCallback: null,
  episodeViewMode: 'grid', // 'grid' (Notion compact grid) or 'list' (detailed expandable)
  selectedGridEp: null,    // Ep number whose note is currently open in grid mode
  activeEpChunkStart: null, // 1-based start episode of active 100-ep range when total > 100

  escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  sanitizeUrl(url) {
    if (!url || typeof url !== 'string') return '#';
    const trimmed = url.trim();
    if (/^(https?:\/\/|\/|\.\/)/i.test(trimmed)) {
      return encodeURI(trimmed);
    }
    return '#';
  },

  init(onDataChanged) {
    this.onDataChangedCallback = onDataChanged;
    this.bindGlobalEvents();
  },

  bindGlobalEvents() {
    // Close modal on backdrop click
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) {
          this.closeAll();
        }
      });
    });

    // Close buttons inside modals
    document.querySelectorAll('[data-action="close-modal"]').forEach(btn => {
      btn.addEventListener('click', () => this.closeAll());
    });

    // ESC key closes modals
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeAll();
      }
    });

    // Setup Add Anime Search API input
    const searchApiInput = document.getElementById('searchApiInput');
    if (searchApiInput) {
      searchApiInput.addEventListener('input', (e) => {
        const query = e.target.value;
        this.handleApiSearch(query);
      });
    }

    // Add Anime Form submit
    const formAddAnime = document.getElementById('formAddAnime');
    if (formAddAnime) {
      formAddAnime.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleSaveNewAnime();
      });
    }

    // Detail Modal Tabs switching (Episodes / Links / Notes)
    document.querySelectorAll('.detail-tab-btn').forEach(tabBtn => {
      tabBtn.addEventListener('click', (e) => {
        const target = e.currentTarget.getAttribute('data-tab');
        this.switchDetailTab(target);
      });
    });

    // Detail Modal Property changes (status, score)
    const detailStatusSelect = document.getElementById('detailStatusSelect');
    if (detailStatusSelect) {
      detailStatusSelect.addEventListener('change', (e) => {
        const anime = this.getWorkingAnime();
        if (!anime) return;
        const newStatus = e.target.value;
        anime.status = newStatus;
        if (newStatus === 'completed' && anime.totalEpisodes > 0 && (anime.currentEpisode || 0) < anime.totalEpisodes) {
          Storage.applyMarkAllEpisodes(anime, true);
        }
        const updated = this.commitWorkingAnime(anime);
        if (updated) this.renderEpisodesTab(updated);
      });
    }

    const detailScoreSelect = document.getElementById('detailScoreSelect');
    if (detailScoreSelect) {
      detailScoreSelect.addEventListener('change', (e) => {
        const anime = this.getWorkingAnime();
        if (!anime) return;
        anime.score = parseInt(e.target.value, 10) || 0;
        this.commitWorkingAnime(anime);
      });
    }

    // General Notes autosave
    const generalNotesInput = document.getElementById('detailGeneralNotes');
    if (generalNotesInput) {
      generalNotesInput.addEventListener('input', (e) => {
        const anime = this.getWorkingAnime();
        if (!anime) return;
        anime.generalNotes = e.target.value;
        if (!this.draftAnime) {
          Storage.save(anime);
        }
      });
    }

    // Add Custom Link form
    const btnAddLink = document.getElementById('btnAddCustomLink');
    if (btnAddLink) {
      btnAddLink.addEventListener('click', () => this.handleAddCustomLink());
    }

    // Confirm Add Anime (from draft preview mode)
    const btnConfirmAddAnime = document.getElementById('btnConfirmAddAnime');
    if (btnConfirmAddAnime) {
      btnConfirmAddAnime.addEventListener('click', () => {
        if (!this.draftAnime) return;
        const toSave = {
          ...this.draftAnime,
          id: this.draftAnime.id || 'anime-' + Date.now()
        };
        const saved = Storage.save(toSave);
        this.closeAll();
        this.triggerDataChange(`"${saved.title}" adicionado à sua lista!`);
      });
    }

    // Delete Anime button
    const btnDeleteAnime = document.getElementById('btnDeleteAnime');
    if (btnDeleteAnime) {
      btnDeleteAnime.addEventListener('click', () => {
        if (!this.activeAnimeId) return;
        const anime = Storage.getById(this.activeAnimeId);
        if (confirm(`Tem certeza que deseja remover "${anime?.title}" da sua lista?`)) {
          Storage.delete(this.activeAnimeId);
          this.closeAll();
          this.triggerDataChange('Anime removido com sucesso!');
        }
      });
    }

    // Episodes View Switcher: Grade vs Lista
    const btnEpViewGrid = document.getElementById('btnEpViewGrid');
    const btnEpViewList = document.getElementById('btnEpViewList');

    btnEpViewGrid?.addEventListener('click', () => {
      this.episodeViewMode = 'grid';
      this.selectedGridEp = null;
      const anime = this.getWorkingAnime();
      if (anime) this.renderEpisodesTab(anime);
    });

    btnEpViewList?.addEventListener('click', () => {
      this.episodeViewMode = 'list';
      const anime = this.getWorkingAnime();
      if (anime) this.renderEpisodesTab(anime);
    });

    // Episode Batch Buttons (+1, -1, Marcar Todos, Limpar, + Extra)
    const btnEpIncrement = document.getElementById('btnEpIncrement');
    if (btnEpIncrement) {
      btnEpIncrement.addEventListener('click', () => {
        const anime = this.getWorkingAnime();
        if (!anime) return;
        const next = (anime.currentEpisode || 0) + 1;
        Storage.applyCurrentEpisode(anime, next);
        const updated = this.commitWorkingAnime(anime, `Episódio ${next} assistido!`);
        if (updated) {
          this.syncDetailStatusSelect(updated);
          this.renderEpisodesTab(updated);
        }
      });
    }

    const btnEpDecrement = document.getElementById('btnEpDecrement');
    if (btnEpDecrement) {
      btnEpDecrement.addEventListener('click', () => {
        const anime = this.getWorkingAnime();
        if (!anime) return;
        const prev = Math.max(0, (anime.currentEpisode || 0) - 1);
        Storage.applyCurrentEpisode(anime, prev);
        const updated = this.commitWorkingAnime(anime);
        if (updated) {
          this.syncDetailStatusSelect(updated);
          this.renderEpisodesTab(updated);
        }
      });
    }

    const btnMarkAllEpisodes = document.getElementById('btnMarkAllEpisodes');
    if (btnMarkAllEpisodes) {
      btnMarkAllEpisodes.addEventListener('click', () => {
        const anime = this.getWorkingAnime();
        if (!anime) return;
        Storage.applyMarkAllEpisodes(anime, true);
        const updated = this.commitWorkingAnime(anime, 'Todos os episódios marcados como assistidos!');
        if (updated) {
          this.syncDetailStatusSelect(updated);
          this.renderEpisodesTab(updated);
        }
      });
    }

    const btnUnmarkAllEpisodes = document.getElementById('btnUnmarkAllEpisodes');
    if (btnUnmarkAllEpisodes) {
      btnUnmarkAllEpisodes.addEventListener('click', () => {
        const anime = this.getWorkingAnime();
        if (!anime) return;
        Storage.applyMarkAllEpisodes(anime, false);
        const updated = this.commitWorkingAnime(anime, 'Progresso resetado!');
        if (updated) {
          this.syncDetailStatusSelect(updated);
          this.renderEpisodesTab(updated);
        }
      });
    }

    const btnAddExtraEpisode = document.getElementById('btnAddExtraEpisode');
    if (btnAddExtraEpisode) {
      btnAddExtraEpisode.addEventListener('click', () => {
        const anime = this.getWorkingAnime();
        if (!anime) return;
        anime.totalEpisodes = (anime.totalEpisodes || 0) + 1;
        const updated = this.commitWorkingAnime(anime, 'Novo episódio adicionado à contagem!');
        if (updated) this.renderEpisodesTab(updated);
      });
    }

    const btnRefreshAnimeApi = document.getElementById('btnRefreshAnimeApi');
    if (btnRefreshAnimeApi) {
      btnRefreshAnimeApi.addEventListener('click', () => {
        if (!this.activeAnimeId && !this.draftAnime) return;
        this.refreshAnimeFromApi(this.activeAnimeId, true);
      });
    }
  },

  getWorkingAnime() {
    if (this.draftAnime) return this.draftAnime;
    if (this.activeAnimeId) return Storage.getById(this.activeAnimeId);
    return null;
  },

  commitWorkingAnime(anime, toastMsg) {
    if (!anime) return null;
    if (this.draftAnime) {
      this.draftAnime = anime;
      return anime;
    }
    const saved = Storage.save(anime);
    this.triggerDataChange(toastMsg);
    return saved;
  },

  syncDetailStatusSelect(anime) {
    const statusSelect = document.getElementById('detailStatusSelect');
    if (statusSelect && anime?.status) {
      statusSelect.value = anime.status;
    }
  },

  syncDetailFooterMode(isAddPreview) {
    const btnDelete = document.getElementById('btnDeleteAnime');
    const btnClose = document.getElementById('btnDetailClose');
    const btnConfirmAdd = document.getElementById('btnConfirmAddAnime');

    if (btnDelete) btnDelete.style.display = isAddPreview ? 'none' : 'inline-flex';
    if (btnConfirmAdd) btnConfirmAdd.style.display = isAddPreview ? 'inline-flex' : 'none';
    if (btnClose) btnClose.textContent = isAddPreview ? 'Cancelar' : 'Fechar';
  },

  triggerDataChange(toastMsg) {
    if (typeof this.onDataChangedCallback === 'function') {
      this.onDataChangedCallback(toastMsg);
    }
  },

  closeAll() {
    document.querySelectorAll('.modal-backdrop').forEach(b => b.classList.remove('open'));
    document.body.style.overflow = '';
    this.activeAnimeId = null;
    this.draftAnime = null;
    this.selectedGridEp = null;
    this.activeEpChunkStart = null;
  },

  /* ==========================================================================
     Add Anime Modal Logic
     ========================================================================== */

  openAddModal() {
    const modal = document.getElementById('modalAddAnime');
    const form = document.getElementById('formAddAnime');
    const searchInput = document.getElementById('searchApiInput');
    const suggestions = document.getElementById('apiSuggestionsList');

    if (form) form.reset();
    if (searchInput) searchInput.value = '';
    if (suggestions) {
      suggestions.innerHTML = '';
      suggestions.style.display = 'none';
    }

    this.pendingAnimeData = null;
    modal?.classList.add('open');
    if (modal) document.body.style.overflow = 'hidden';
    searchInput?.focus();
  },

  handleApiSearch(query) {
    clearTimeout(this.searchDebounceTimer);
    const spinner = document.getElementById('searchSpinner');
    const suggestionsList = document.getElementById('apiSuggestionsList');

    if (!query || query.trim().length < 2) {
      if (suggestionsList) {
        suggestionsList.innerHTML = '';
        suggestionsList.style.display = 'none';
      }
      if (spinner) spinner.style.display = 'none';
      return;
    }

    if (spinner) spinner.style.display = 'block';

    this.searchDebounceTimer = setTimeout(async () => {
      const results = await Api.searchAnime(query);
      if (spinner) spinner.style.display = 'none';

      if (!suggestionsList) return;

      if (results.length === 0) {
        suggestionsList.innerHTML = `
          <div style="padding: 0.75rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">
            Nenhum anime encontrado. Você pode preencher os campos abaixo manualmente.
          </div>
        `;
        suggestionsList.style.display = 'block';
        return;
      }

      suggestionsList.innerHTML = results.map((item, idx) => `
        <div class="suggestion-item" data-idx="${idx}">
          <img src="${item.coverImage}" class="suggestion-thumb" alt="" />
          <div class="suggestion-details">
            <span class="suggestion-title">${item.title}</span>
            <div class="suggestion-meta">
              <span>${[item.season, item.year].filter(Boolean).join(' ') || item.format}</span>
              <span>•</span>
              <span>${item.totalEpisodes ? `${item.totalEpisodes} eps` : 'Em exibição'}</span>
              ${item.score > 0 ? `<span>• ★ ${item.score}</span>` : ''}
            </div>
          </div>
        </div>
      `).join('');

      suggestionsList.style.display = 'block';

      // Click to select
      suggestionsList.querySelectorAll('.suggestion-item').forEach(el => {
        el.addEventListener('click', () => {
          const idx = parseInt(el.getAttribute('data-idx') || '0', 10);
          this.selectApiSuggestion(results[idx]);
        });
      });
    }, 380);
  },

  selectApiSuggestion(animeData) {
    this.pendingAnimeData = animeData;
    const suggestionsList = document.getElementById('apiSuggestionsList');
    if (suggestionsList) suggestionsList.style.display = 'none';

    // Populate form fields
    const titleInput = document.getElementById('inputAnimeTitle');
    const origTitleInput = document.getElementById('inputAnimeOriginalTitle');
    const seasonInput = document.getElementById('inputAnimeSeason');
    const yearInput = document.getElementById('inputAnimeYear');
    const episodesInput = document.getElementById('inputAnimeEpisodes');
    const coverInput = document.getElementById('inputAnimeCover');
    const genresInput = document.getElementById('inputAnimeGenres');
    const synopsisInput = document.getElementById('inputAnimeSynopsis');

    if (titleInput) titleInput.value = animeData.title || '';
    if (origTitleInput) origTitleInput.value = animeData.originalTitle || '';
    if (seasonInput) seasonInput.value = animeData.season || '';
    if (yearInput) yearInput.value = animeData.year ? String(animeData.year) : '';
    if (episodesInput) episodesInput.value = animeData.totalEpisodes ? String(animeData.totalEpisodes) : '0';
    if (coverInput) coverInput.value = animeData.coverImage || '';
    if (genresInput) genresInput.value = animeData.genres ? animeData.genres.join(', ') : '';
    if (synopsisInput) synopsisInput.value = animeData.synopsis || '';
  },

  handleSaveNewAnime() {
    const titleInput = document.getElementById('inputAnimeTitle');
    const origTitleInput = document.getElementById('inputAnimeOriginalTitle');
    const seasonInput = document.getElementById('inputAnimeSeason');
    const yearInput = document.getElementById('inputAnimeYear');
    const episodesInput = document.getElementById('inputAnimeEpisodes');
    const coverInput = document.getElementById('inputAnimeCover');
    const statusSelect = document.getElementById('inputAnimeStatus');
    const scoreSelect = document.getElementById('inputAnimeScore');
    const genresInput = document.getElementById('inputAnimeGenres');
    const synopsisInput = document.getElementById('inputAnimeSynopsis');

    if (!titleInput || !titleInput.value.trim()) {
      alert('Por favor, informe o título do anime.');
      return;
    }

    const totalEps = parseInt(episodesInput.value, 10) || 0;
    const year = parseInt(yearInput.value, 10) || null;
    const score = parseInt(scoreSelect.value, 10) || 0;
    const genres = genresInput.value ? genresInput.value.split(',').map(s => s.trim()).filter(Boolean) : [];

    const newAnime = {
      id: this.pendingAnimeData?.id || 'anime-' + Date.now(),
      title: titleInput.value.trim(),
      originalTitle: origTitleInput.value.trim(),
      coverImage: coverInput.value.trim() || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=400&q=80',
      bannerImage: this.pendingAnimeData?.bannerImage || coverInput.value.trim(),
      status: statusSelect.value || 'plan_to_watch',
      score: score,
      season: seasonInput.value.trim(),
      year: year,
      studio: this.pendingAnimeData?.studio || 'Manual',
      format: this.pendingAnimeData?.format || 'TV',
      totalEpisodes: totalEps,
      currentEpisode: statusSelect.value === 'completed' ? totalEps : 0,
      favorite: false,
      genres: genres,
      synopsis: synopsisInput.value.trim(),
      generalNotes: '',
      links: this.pendingAnimeData?.links || [],
      episodesData: {}
    };

    Storage.save(newAnime);
    this.closeAll();
    this.triggerDataChange(`"${newAnime.title}" adicionado à sua lista!`);
  },

  /* ==========================================================================
     Anime Detail Notion Drawer Logic
     ========================================================================== */

  openDetailModal(id) {
    const anime = Storage.getById(id);
    if (!anime) return;

    this.activeAnimeId = id;
    this.draftAnime = null;
    this.selectedGridEp = null;
    this.activeEpChunkStart = null;
    const modal = document.getElementById('modalAnimeDetail');
    if (!modal) return;

    this.syncDetailFooterMode(false);
    this.populateDetailFields(anime);

    // Render Sub-tabs
    this.renderEpisodesTab(anime);
    this.renderLinksTab(anime);
    this.renderNotesTab(anime);

    // Switch to first tab by default
    this.switchDetailTab('episodes');

    modal.classList.add('open');
    document.body.style.overflow = 'hidden';

    // Auto-enrich entries with missing episodes/genres or legacy 'Kitsu Anime' placeholder
    const hasMissingData =
      anime.studio === 'Kitsu Anime' ||
      !anime.totalEpisodes ||
      !Array.isArray(anime.genres) ||
      anime.genres.length === 0;
    if (hasMissingData && anime.studio !== 'Manual') {
      this.refreshAnimeFromApi(id, false);
    }
  },

  /**
   * Opens the Notion Detail Drawer in add-preview mode so users can categorize status/score/episodes before saving
   */
  openAddPreviewModal(animeData) {
    if (!animeData) return;

    this.activeAnimeId = null;
    this.selectedGridEp = null;
    this.activeEpChunkStart = null;
    this.draftAnime = {
      ...animeData,
      status: animeData.status || 'plan_to_watch',
      score: animeData.score || 0,
      currentEpisode: animeData.currentEpisode || 0,
      favorite: Boolean(animeData.favorite),
      genres: Array.isArray(animeData.genres) ? [...animeData.genres] : [],
      links: Array.isArray(animeData.links) ? animeData.links.map(l => ({ ...l })) : [],
      episodesData: animeData.episodesData ? { ...animeData.episodesData } : {}
    };

    const modal = document.getElementById('modalAnimeDetail');
    if (!modal) return;

    this.syncDetailFooterMode(true);
    this.populateDetailFields(this.draftAnime);
    this.renderEpisodesTab(this.draftAnime);
    this.renderLinksTab(this.draftAnime);
    this.renderNotesTab(this.draftAnime);
    this.switchDetailTab('episodes');

    modal.classList.add('open');
    document.body.style.overflow = 'hidden';

    const hasMissingData =
      !this.draftAnime.totalEpisodes ||
      this.draftAnime.studio === 'Desconhecido' ||
      this.draftAnime.studio === 'Kitsu Anime' ||
      this.draftAnime.genres.length === 0;
    if (hasMissingData) {
      this.refreshAnimeFromApi(null, false);
    }
  },

  populateDetailFields(anime) {
    const bannerImg = document.getElementById('detailBannerImg');
    const posterImg = document.getElementById('detailPosterImg');
    if (bannerImg) bannerImg.src = anime.bannerImage || anime.coverImage || '';
    if (posterImg) posterImg.src = anime.coverImage || '';

    const titleEl = document.getElementById('detailTitle');
    const subtitleEl = document.getElementById('detailSubtitle');
    if (titleEl) titleEl.textContent = anime.title;
    if (subtitleEl) subtitleEl.textContent = anime.originalTitle || [anime.season, anime.year, anime.studio].filter(Boolean).join(' • ');

    const statusSelect = document.getElementById('detailStatusSelect');
    if (statusSelect) statusSelect.value = anime.status || 'plan_to_watch';

    const scoreSelect = document.getElementById('detailScoreSelect');
    if (scoreSelect) scoreSelect.value = String(anime.score || 0);

    const propSeason = document.getElementById('propDetailSeason');
    if (propSeason) propSeason.textContent = [anime.season, anime.year].filter(Boolean).join(' ') || 'Não especificado';

    const propStudio = document.getElementById('propDetailStudio');
    if (propStudio) propStudio.textContent = anime.studio || 'Desconhecido';

    const propGenres = document.getElementById('propDetailGenres');
    if (propGenres) {
      propGenres.innerHTML = anime.genres && anime.genres.length > 0
        ? anime.genres.map((g) => `<span class="genre-tag">${this.escapeHTML(g)}</span>`).join(' ')
        : '—';
    }
  },

  async refreshAnimeFromApi(animeId, showFeedback = false) {
    const isDraft = !animeId && Boolean(this.draftAnime);
    const anime = isDraft ? this.draftAnime : Storage.getById(animeId);
    if (!anime) return;

    const btn = document.getElementById('btnRefreshAnimeApi');
    if (btn && showFeedback) {
      btn.disabled = true;
      btn.textContent = '↻ ...';
    }

    try {
      const enriched = await Api.enrichAnimeData(anime);
      const changed =
        enriched.totalEpisodes !== anime.totalEpisodes ||
        enriched.studio !== anime.studio ||
        JSON.stringify(enriched.genres || []) !== JSON.stringify(anime.genres || []) ||
        enriched.bannerImage !== anime.bannerImage ||
        enriched.synopsis !== anime.synopsis;

      if (changed) {
        if (isDraft) {
          if (!this.draftAnime || this.draftAnime.id !== anime.id) return;
          this.draftAnime = enriched;
          if (this.draftAnime.status === 'completed' && this.draftAnime.totalEpisodes > 0) {
            Storage.applyMarkAllEpisodes(this.draftAnime, true);
          }
          this.populateDetailFields(this.draftAnime);
          this.renderEpisodesTab(this.draftAnime);
          this.renderNotesTab(this.draftAnime);
          if (showFeedback) {
            this.triggerDataChange('Dados sincronizados com a API!');
          }
        } else {
          const saved = Storage.save(enriched);
          if (this.activeAnimeId === animeId) {
            this.populateDetailFields(saved);
            this.renderEpisodesTab(saved);
            this.renderNotesTab(saved);
          }
          this.triggerDataChange(showFeedback ? 'Dados sincronizados com a API!' : undefined);
        }
      } else if (showFeedback) {
        this.triggerDataChange('Os dados já estão atualizados!');
      }
    } catch (err) {
      console.warn('Falha ao atualizar anime pela API:', err);
      if (showFeedback) {
        this.triggerDataChange('Não foi possível consultar a API agora.');
      }
    } finally {
      if (btn && showFeedback) {
        btn.disabled = false;
        btn.textContent = '↻ API';
      }
    }
  },

  switchDetailTab(tabKey) {
    document.querySelectorAll('.detail-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabKey);
    });

    document.querySelectorAll('.detail-tab-panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === `tabPanel_${tabKey}`);
    });
  },

  renderEpisodesTab(anime) {
    const wrapper = document.getElementById('episodesContentWrapper');
    const counterEl = document.getElementById('episodesWatchedCounter');
    const progressFill = document.getElementById('episodesProgressFill');
    if (!wrapper) return;

    const total = anime.totalEpisodes || Math.max(anime.currentEpisode || 0, 12);
    
    // Calculate total watched count
    let watchedCount = 0;
    for (let i = 1; i <= total; i++) {
      const isWatched = anime.episodesData?.[i] 
        ? Boolean(anime.episodesData[i].watched) 
        : i <= (anime.currentEpisode || 0);
      if (isWatched) watchedCount++;
    }

    const percent = total > 0 ? Math.min(100, Math.round((watchedCount / total) * 100)) : 0;

    if (counterEl) {
      counterEl.textContent = `${watchedCount} de ${total} assistidos (${percent}%)`;
    }
    if (progressFill) {
      progressFill.style.width = `${percent}%`;
    }

    // Sync active state on view mode toggle buttons
    const btnEpViewGrid = document.getElementById('btnEpViewGrid');
    const btnEpViewList = document.getElementById('btnEpViewList');
    if (btnEpViewGrid && btnEpViewList) {
      btnEpViewGrid.classList.toggle('active', this.episodeViewMode === 'grid');
      btnEpViewList.classList.toggle('active', this.episodeViewMode === 'list');
    }

    if (this.episodeViewMode === 'grid') {
      this.renderEpisodesGrid(anime, wrapper, total);
    } else {
      this.renderEpisodesList(anime, wrapper, total);
    }
  },

  getEpisodeChunkRange(anime, total) {
    if (total <= EP_CHUNK_SIZE) {
      return { start: 1, end: total, hasChunks: false };
    }

    if (!this.activeEpChunkStart || this.activeEpChunkStart > total) {
      const targetEp = this.selectedGridEp || Math.min(total, Math.max(1, (anime.currentEpisode || 0) + 1));
      this.activeEpChunkStart = Math.floor((targetEp - 1) / EP_CHUNK_SIZE) * EP_CHUNK_SIZE + 1;
    }

    const start = this.activeEpChunkStart;
    const end = Math.min(total, start + EP_CHUNK_SIZE - 1);
    return { start, end, hasChunks: true };
  },

  renderEpisodeRangeTabsHtml(total, activeStart) {
    if (total <= EP_CHUNK_SIZE) return '';
    let tabs = '';
    for (let s = 1; s <= total; s += EP_CHUNK_SIZE) {
      const e = Math.min(total, s + EP_CHUNK_SIZE - 1);
      tabs += `
        <button type="button" class="ep-range-btn ${s === activeStart ? 'active' : ''}" data-ep-range-start="${s}">
          ${s}–${e}
        </button>
      `;
    }
    return `<div class="ep-range-tabs" role="tablist" aria-label="Intervalos de episódios">${tabs}</div>`;
  },

  bindEpisodeRangeTabs(wrapper) {
    wrapper.querySelectorAll('[data-ep-range-start]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeEpChunkStart = parseInt(btn.getAttribute('data-ep-range-start') || '1', 10);
        const currentAnime = this.getWorkingAnime();
        if (currentAnime) this.renderEpisodesTab(currentAnime);
      });
    });
  },

  renderEpisodesGrid(anime, wrapper, total) {
    const { start, end } = this.getEpisodeChunkRange(anime, total);
    const rangeTabsHtml = this.renderEpisodeRangeTabsHtml(total, start);

    let buttonsHtml = '';
    for (let i = start; i <= end; i++) {
      const epData = anime.episodesData?.[i] || { watched: i <= (anime.currentEpisode || 0), note: '' };
      const isWatched = Boolean(epData.watched);
      const hasNote = Boolean(epData.note && epData.note.trim().length > 0);
      const isSelected = this.selectedGridEp === i;

      buttonsHtml += `
        <button 
          type="button"
          class="ep-grid-btn ${i >= 1000 ? 'ep-4digit' : ''} ${isWatched ? 'watched' : ''} ${hasNote ? 'has-note' : ''} ${isSelected ? 'active-note-target' : ''}" 
          data-ep="${i}"
          title="Episódio ${i} • ${isWatched ? 'Assistido' : 'Não assistido'}${hasNote ? ' (Possui anotação)' : ''}"
        >
          <span>${i}</span>
        </button>
      `;
    }

    let noteEditorHtml = '';
    if (this.selectedGridEp) {
      const epNum = this.selectedGridEp;
      const epData = anime.episodesData?.[epNum] || { watched: epNum <= (anime.currentEpisode || 0), note: '' };
      noteEditorHtml = `
        <div class="ep-grid-note-card">
          <div class="ep-grid-note-header">
            <div class="ep-grid-note-title">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#529cca" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
              <span>Anotações do Episódio ${epNum}</span>
              <span class="status-pill ${epData.watched ? 'status-completed' : 'status-plan_to_watch'}" style="font-size: 0.72rem; padding: 1px 6px;">
                ${epData.watched ? 'Assistido ✓' : 'Não visto'}
              </span>
            </div>
            <div class="ep-grid-note-actions">
              <button class="btn" data-action="mark-up-to" data-ep="${epNum}" style="font-size: 0.78rem; padding: 0.3rem 0.6rem;">
                Marcar até o Ep ${epNum}
              </button>
              <button class="btn btn-icon-only" data-action="close-grid-note" title="Fechar anotação" style="padding: 0.25rem;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
          </div>
          <textarea 
            class="ep-note-textarea" 
            id="gridNoteTextarea" 
            placeholder="Escreva seus comentários, impressões ou minuto marcante do episódio ${epNum} (salva automaticamente)..."
          >${this.escapeHTML(epData.note || '')}</textarea>
        </div>
      `;
    } else {
      noteEditorHtml = `
        <div style="font-size: 0.8rem; color: var(--text-muted); display: flex; align-items: center; justify-content: space-between; padding: 0.45rem 0.65rem; background: rgba(255,255,255,0.02); border-radius: var(--border-radius-sm); border: 1px dashed var(--border-subtle);">
          <span>💡 <strong>Dica:</strong> Clique no número para marcar como assistido. Dê <strong>dois cliques</strong> para abrir o bloco de anotações daquele episódio.</span>
        </div>
      `;
    }

    wrapper.innerHTML = `
      <div class="episodes-grid-wrapper">
        ${rangeTabsHtml}
        <div class="episodes-grid">${buttonsHtml}</div>
        ${noteEditorHtml}
      </div>
    `;

    this.bindEpisodeRangeTabs(wrapper);

    // Events in Grid buttons
    wrapper.querySelectorAll('.ep-grid-btn').forEach(btn => {
      const ep = parseInt(btn.getAttribute('data-ep') || '1', 10);

      // Single click: toggle watched
      btn.addEventListener('click', () => {
        const current = this.getWorkingAnime();
        if (!current) return;
        const isWatched = btn.classList.contains('watched');
        Storage.applyEpisodeWatched(current, ep, !isWatched);
        const updated = this.commitWorkingAnime(current);
        if (updated) {
          this.syncDetailStatusSelect(updated);
          this.renderEpisodesTab(updated);
        }
      });

      // Double click or context menu: open note editor
      btn.addEventListener('dblclick', (e) => {
        e.preventDefault();
        this.selectedGridEp = ep;
        const currentAnime = this.getWorkingAnime();
        if (currentAnime) this.renderEpisodesTab(currentAnime);
      });

      btn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.selectedGridEp = ep;
        const currentAnime = this.getWorkingAnime();
        if (currentAnime) this.renderEpisodesTab(currentAnime);
      });
    });

    // Mark up to this episode
    wrapper.querySelector('[data-action="mark-up-to"]')?.addEventListener('click', (e) => {
      const epNum = parseInt(e.currentTarget.getAttribute('data-ep') || '1', 10);
      const current = this.getWorkingAnime();
      if (!current) return;
      Storage.applyMarkEpisodesUpTo(current, epNum);
      const updated = this.commitWorkingAnime(current, `Marcados episódios 1 até ${epNum}!`);
      if (updated) {
        this.syncDetailStatusSelect(updated);
        this.renderEpisodesTab(updated);
      }
    });

    // Close note editor
    wrapper.querySelector('[data-action="close-grid-note"]')?.addEventListener('click', () => {
      this.selectedGridEp = null;
      const currentAnime = this.getWorkingAnime();
      if (currentAnime) this.renderEpisodesTab(currentAnime);
    });

    // Auto-save grid note
    const textarea = wrapper.querySelector('#gridNoteTextarea');
    if (textarea && this.selectedGridEp) {
      textarea.addEventListener('input', (e) => {
        const note = e.target.value;
        if (this.draftAnime) {
          if (!this.draftAnime.episodesData) this.draftAnime.episodesData = {};
          if (!this.draftAnime.episodesData[this.selectedGridEp]) {
            this.draftAnime.episodesData[this.selectedGridEp] = { watched: false, note };
          } else {
            this.draftAnime.episodesData[this.selectedGridEp].note = note;
          }
        } else if (this.activeAnimeId) {
          Storage.setEpisodeNote(this.activeAnimeId, this.selectedGridEp, note);
        }
      });
    }
  },

  renderEpisodesList(anime, wrapper, total) {
    const { start, end } = this.getEpisodeChunkRange(anime, total);
    const rangeTabsHtml = this.renderEpisodeRangeTabsHtml(total, start);

    let html = `${rangeTabsHtml}<div class="episodes-list">`;
    for (let i = start; i <= end; i++) {
      const epData = anime.episodesData?.[i] || { watched: i <= (anime.currentEpisode || 0), note: '' };
      const isWatched = Boolean(epData.watched);
      const hasNote = Boolean(epData.note && epData.note.trim().length > 0);

      html += `
        <div class="episode-item ${isWatched ? 'watched' : ''}" data-ep="${i}">
          <div class="episode-item-header" data-action="toggle-note" data-ep="${i}">
            <div class="episode-left">
              <button 
                type="button"
                class="ep-checkbox ${isWatched ? 'checked' : ''}" 
                data-action="toggle-watched" 
                data-ep="${i}"
                title="${isWatched ? 'Marcar como não visto' : 'Marcar como visto'}"
              >
                ${isWatched ? '✓' : ''}
              </button>
              <span class="ep-number">Episódio ${i}</span>
              ${hasNote ? `
                <span class="ep-note-indicator">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                  Comentário
                </span>
              ` : ''}
            </div>

            <div style="font-size: 0.78rem; color: var(--text-muted);">
              ${hasNote ? 'Editar nota ▾' : '+ Adicionar nota ▾'}
            </div>
          </div>

          <div class="episode-note-content ${hasNote ? 'open' : ''}" id="epNoteContent_${i}">
            <textarea 
              class="ep-note-textarea" 
              placeholder="Escreva seus comentários, impressões ou minuto marcante deste episódio..."
              data-ep="${i}"
            >${this.escapeHTML(epData.note || '')}</textarea>
          </div>
        </div>
      `;
    }
    html += '</div>';
    wrapper.innerHTML = html;

    this.bindEpisodeRangeTabs(wrapper);

    // Checkbox toggle
    wrapper.querySelectorAll('[data-action="toggle-watched"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const epNum = parseInt(e.currentTarget.getAttribute('data-ep') || '1', 10);
        const isChecked = e.currentTarget.classList.contains('checked');
        const current = this.getWorkingAnime();
        if (!current) return;
        Storage.applyEpisodeWatched(current, epNum, !isChecked);
        const updated = this.commitWorkingAnime(current);
        if (updated) {
          this.syncDetailStatusSelect(updated);
          this.renderEpisodesTab(updated);
        }
      });
    });

    // Expand / collapse note
    wrapper.querySelectorAll('[data-action="toggle-note"]').forEach(header => {
      header.addEventListener('click', (e) => {
        const epNum = e.currentTarget.getAttribute('data-ep');
        const content = document.getElementById(`epNoteContent_${epNum}`);
        if (content) {
          content.classList.toggle('open');
          if (content.classList.contains('open')) {
            content.querySelector('textarea')?.focus();
          }
        }
      });
    });

    // Auto-save comments
    wrapper.querySelectorAll('.ep-note-textarea').forEach(textarea => {
      textarea.addEventListener('input', (e) => {
        const epNum = parseInt(e.currentTarget.getAttribute('data-ep') || '1', 10);
        const note = e.target.value;
        if (this.draftAnime) {
          if (!this.draftAnime.episodesData) this.draftAnime.episodesData = {};
          if (!this.draftAnime.episodesData[epNum]) {
            this.draftAnime.episodesData[epNum] = { watched: false, note };
          } else {
            this.draftAnime.episodesData[epNum].note = note;
          }
        } else if (this.activeAnimeId) {
          Storage.setEpisodeNote(this.activeAnimeId, epNum, note);
        }
      });
    });
  },

  renderLinksTab(anime) {
    const listContainer = document.getElementById('customLinksList');
    if (!listContainer) return;

    const links = anime.links || [];
    if (links.length === 0) {
      listContainer.innerHTML = `
        <div style="color: var(--text-muted); font-size: 0.88rem; padding: 1rem 0;">
          Nenhum link adicionado ainda. Adicione links de streaming (Crunchyroll, Netflix), pastas locais ou wikis abaixo.
        </div>
      `;
      return;
    }

    listContainer.innerHTML = links.map(link => `
      <div class="link-item">
        <a href="${this.sanitizeUrl(link.url)}" target="_blank" rel="noopener noreferrer" class="link-info" title="${this.escapeHTML(link.url)}">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
          <div>
            <div class="link-title">${this.escapeHTML(link.title)}</div>
            <div class="link-url-text">${this.escapeHTML(link.url)}</div>
          </div>
        </a>
        <button 
          class="btn-icon-only" 
          data-action="delete-link" 
          data-id="${this.escapeHTML(link.id)}" 
          title="Remover link"
          style="background: transparent; border: none; cursor: pointer;"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      </div>
    `).join('');

    // Bind link deletion
    listContainer.querySelectorAll('[data-action="delete-link"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const linkId = e.currentTarget.getAttribute('data-id');
        if (confirm('Deseja excluir este link?')) {
          if (this.draftAnime) {
            this.draftAnime.links = (this.draftAnime.links || []).filter(l => l.id !== linkId);
            this.renderLinksTab(this.draftAnime);
          } else {
            const updated = Storage.removeLink(this.activeAnimeId, linkId);
            if (updated) {
              this.renderLinksTab(updated);
              this.triggerDataChange();
            }
          }
        }
      });
    });
  },

  handleAddCustomLink() {
    if (!this.activeAnimeId && !this.draftAnime) return;

    const titleInput = document.getElementById('inputNewLinkTitle');
    const urlInput = document.getElementById('inputNewLinkUrl');

    if (!titleInput || !urlInput) return;

    const title = titleInput.value.trim();
    let url = urlInput.value.trim();

    if (!title || !url) {
      alert('Preencha o nome e o link da URL.');
      return;
    }

    // Validação rígida contra protocolos inseguros (javascript:, data:, vbscript:)
    if (!/^https?:\/\//i.test(url)) {
      if (/^[a-z0-9+.-]+:/i.test(url)) {
        alert('Protocolo de link não permitido por segurança. Utilize endereços http:// ou https://');
        return;
      }
      url = 'https://' + url;
    }

    if (this.draftAnime) {
      if (!this.draftAnime.links) this.draftAnime.links = [];
      this.draftAnime.links.push({ id: 'lnk-' + Date.now(), title, url });
      titleInput.value = '';
      urlInput.value = '';
      this.renderLinksTab(this.draftAnime);
    } else {
      const updated = Storage.addLink(this.activeAnimeId, title, url);
      if (updated) {
        titleInput.value = '';
        urlInput.value = '';
        this.renderLinksTab(updated);
        this.triggerDataChange('Link adicionado!');
      }
    }
  },

  renderNotesTab(anime) {
    const notesInput = document.getElementById('detailGeneralNotes');
    const synopsisBox = document.getElementById('detailSynopsisText');

    if (notesInput) notesInput.value = anime.generalNotes || '';
    if (synopsisBox) synopsisBox.textContent = anime.synopsis || 'Sem sinopse cadastrada.';
  }
};
