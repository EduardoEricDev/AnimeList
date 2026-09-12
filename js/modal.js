/* ==========================================================================
   Modal Module - Add Anime (API Search + Manual) & Notion Detail Drawer
   ========================================================================== */

import { Storage } from './storage.js';
import { Api } from './api.js';

export const Modal = {
  activeAnimeId: null,
  searchDebounceTimer: null,
  pendingAnimeData: null,
  onDataChangedCallback: null,
  episodeViewMode: 'grid', // 'grid' (Notion compact grid) or 'list' (detailed expandable)
  selectedGridEp: null,    // Ep number whose note is currently open in grid mode

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
        if (!this.activeAnimeId) return;
        const anime = Storage.getById(this.activeAnimeId);
        if (anime) {
          anime.status = e.target.value;
          Storage.save(anime);
          this.triggerDataChange();
        }
      });
    }

    const detailScoreSelect = document.getElementById('detailScoreSelect');
    if (detailScoreSelect) {
      detailScoreSelect.addEventListener('change', (e) => {
        if (!this.activeAnimeId) return;
        const anime = Storage.getById(this.activeAnimeId);
        if (anime) {
          anime.score = parseInt(e.target.value, 10) || 0;
          Storage.save(anime);
          this.triggerDataChange();
        }
      });
    }

    // General Notes autosave
    const generalNotesInput = document.getElementById('detailGeneralNotes');
    if (generalNotesInput) {
      generalNotesInput.addEventListener('input', (e) => {
        if (!this.activeAnimeId) return;
        const anime = Storage.getById(this.activeAnimeId);
        if (anime) {
          anime.generalNotes = e.target.value;
          Storage.save(anime);
        }
      });
    }

    // Add Custom Link form
    const btnAddLink = document.getElementById('btnAddCustomLink');
    if (btnAddLink) {
      btnAddLink.addEventListener('click', () => this.handleAddCustomLink());
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
      if (this.activeAnimeId) {
        const anime = Storage.getById(this.activeAnimeId);
        if (anime) this.renderEpisodesTab(anime);
      }
    });

    btnEpViewList?.addEventListener('click', () => {
      this.episodeViewMode = 'list';
      if (this.activeAnimeId) {
        const anime = Storage.getById(this.activeAnimeId);
        if (anime) this.renderEpisodesTab(anime);
      }
    });

    // Episode Batch Buttons (+1, -1, Marcar Todos, Limpar, + Extra)
    const btnEpIncrement = document.getElementById('btnEpIncrement');
    if (btnEpIncrement) {
      btnEpIncrement.addEventListener('click', () => {
        if (!this.activeAnimeId) return;
        const anime = Storage.getById(this.activeAnimeId);
        if (anime) {
          const next = (anime.currentEpisode || 0) + 1;
          const updated = Storage.updateCurrentEpisode(this.activeAnimeId, next);
          if (updated) {
            this.renderEpisodesTab(updated);
            this.triggerDataChange(`Episódio ${next} assistido!`);
          }
        }
      });
    }

    const btnEpDecrement = document.getElementById('btnEpDecrement');
    if (btnEpDecrement) {
      btnEpDecrement.addEventListener('click', () => {
        if (!this.activeAnimeId) return;
        const anime = Storage.getById(this.activeAnimeId);
        if (anime) {
          const prev = Math.max(0, (anime.currentEpisode || 0) - 1);
          const updated = Storage.updateCurrentEpisode(this.activeAnimeId, prev);
          if (updated) {
            this.renderEpisodesTab(updated);
            this.triggerDataChange();
          }
        }
      });
    }

    const btnMarkAllEpisodes = document.getElementById('btnMarkAllEpisodes');
    if (btnMarkAllEpisodes) {
      btnMarkAllEpisodes.addEventListener('click', () => {
        if (!this.activeAnimeId) return;
        const updated = Storage.markAllEpisodes(this.activeAnimeId, true);
        if (updated) {
          this.renderEpisodesTab(updated);
          this.triggerDataChange('Todos os episódios marcados como assistidos!');
        }
      });
    }

    const btnUnmarkAllEpisodes = document.getElementById('btnUnmarkAllEpisodes');
    if (btnUnmarkAllEpisodes) {
      btnUnmarkAllEpisodes.addEventListener('click', () => {
        if (!this.activeAnimeId) return;
        const updated = Storage.markAllEpisodes(this.activeAnimeId, false);
        if (updated) {
          this.renderEpisodesTab(updated);
          this.triggerDataChange('Progresso resetado!');
        }
      });
    }

    const btnAddExtraEpisode = document.getElementById('btnAddExtraEpisode');
    if (btnAddExtraEpisode) {
      btnAddExtraEpisode.addEventListener('click', () => {
        if (!this.activeAnimeId) return;
        const anime = Storage.getById(this.activeAnimeId);
        if (anime) {
          anime.totalEpisodes = (anime.totalEpisodes || 0) + 1;
          Storage.save(anime);
          this.renderEpisodesTab(anime);
          this.triggerDataChange('Novo episódio adicionado à contagem!');
        }
      });
    }
  },

  triggerDataChange(toastMsg) {
    if (typeof this.onDataChangedCallback === 'function') {
      this.onDataChangedCallback(toastMsg);
    }
  },

  closeAll() {
    document.querySelectorAll('.modal-backdrop').forEach(b => b.classList.remove('open'));
    this.activeAnimeId = null;
    this.selectedGridEp = null;
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
    this.selectedGridEp = null;
    const modal = document.getElementById('modalAnimeDetail');
    if (!modal) return;

    // Set banner and poster
    const bannerImg = document.getElementById('detailBannerImg');
    const posterImg = document.getElementById('detailPosterImg');
    if (bannerImg) bannerImg.src = anime.bannerImage || anime.coverImage || '';
    if (posterImg) posterImg.src = anime.coverImage || '';

    // Title & subtitle
    const titleEl = document.getElementById('detailTitle');
    const subtitleEl = document.getElementById('detailSubtitle');
    if (titleEl) titleEl.textContent = anime.title;
    if (subtitleEl) subtitleEl.textContent = anime.originalTitle || [anime.season, anime.year, anime.studio].filter(Boolean).join(' • ');

    // Notion Properties Pane
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
        ? anime.genres.map((g) => `<span class="genre-tag">${g}</span>`).join(' ')
        : '—';
    }

    // Render Sub-tabs
    this.renderEpisodesTab(anime);
    this.renderLinksTab(anime);
    this.renderNotesTab(anime);

    // Switch to first tab by default
    this.switchDetailTab('episodes');

    modal.classList.add('open');
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

  renderEpisodesGrid(anime, wrapper, total) {
    let buttonsHtml = '';
    for (let i = 1; i <= total; i++) {
      const epData = anime.episodesData?.[i] || { watched: i <= (anime.currentEpisode || 0), note: '' };
      const isWatched = Boolean(epData.watched);
      const hasNote = Boolean(epData.note && epData.note.trim().length > 0);
      const isSelected = this.selectedGridEp === i;

      buttonsHtml += `
        <button 
          type="button"
          class="ep-grid-btn ${isWatched ? 'watched' : ''} ${hasNote ? 'has-note' : ''} ${isSelected ? 'active-note-target' : ''}" 
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
          >${epData.note || ''}</textarea>
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
        <div class="episodes-grid">${buttonsHtml}</div>
        ${noteEditorHtml}
      </div>
    `;

    // Events in Grid buttons
    wrapper.querySelectorAll('.ep-grid-btn').forEach(btn => {
      const ep = parseInt(btn.getAttribute('data-ep') || '1', 10);

      // Single click: toggle watched
      btn.addEventListener('click', (e) => {
        const isWatched = btn.classList.contains('watched');
        const updated = Storage.setEpisodeWatched(this.activeAnimeId, ep, !isWatched);
        if (updated) {
          this.renderEpisodesTab(updated);
          this.triggerDataChange();
        }
      });

      // Double click or context menu: open note editor
      btn.addEventListener('dblclick', (e) => {
        e.preventDefault();
        this.selectedGridEp = ep;
        const currentAnime = Storage.getById(this.activeAnimeId);
        if (currentAnime) this.renderEpisodesTab(currentAnime);
      });

      btn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.selectedGridEp = ep;
        const currentAnime = Storage.getById(this.activeAnimeId);
        if (currentAnime) this.renderEpisodesTab(currentAnime);
      });
    });

    // Mark up to this episode
    wrapper.querySelector('[data-action="mark-up-to"]')?.addEventListener('click', (e) => {
      const epNum = parseInt(e.currentTarget.getAttribute('data-ep') || '1', 10);
      const updated = Storage.markEpisodesUpTo(this.activeAnimeId, epNum);
      if (updated) {
        this.renderEpisodesTab(updated);
        this.triggerDataChange(`Marcados episódios 1 até ${epNum}!`);
      }
    });

    // Close note editor
    wrapper.querySelector('[data-action="close-grid-note"]')?.addEventListener('click', () => {
      this.selectedGridEp = null;
      const currentAnime = Storage.getById(this.activeAnimeId);
      if (currentAnime) this.renderEpisodesTab(currentAnime);
    });

    // Auto-save grid note
    const textarea = wrapper.querySelector('#gridNoteTextarea');
    if (textarea && this.selectedGridEp) {
      textarea.addEventListener('input', (e) => {
        const note = e.target.value;
        Storage.setEpisodeNote(this.activeAnimeId, this.selectedGridEp, note);
      });
    }
  },

  renderEpisodesList(anime, wrapper, total) {
    let html = '<div class="episodes-list">';
    for (let i = 1; i <= total; i++) {
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
            >${epData.note || ''}</textarea>
          </div>
        </div>
      `;
    }
    html += '</div>';
    wrapper.innerHTML = html;

    // Checkbox toggle
    wrapper.querySelectorAll('[data-action="toggle-watched"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const epNum = parseInt(e.currentTarget.getAttribute('data-ep') || '1', 10);
        const isChecked = e.currentTarget.classList.contains('checked');
        const updated = Storage.setEpisodeWatched(this.activeAnimeId, epNum, !isChecked);
        if (updated) {
          this.renderEpisodesTab(updated);
          this.triggerDataChange();
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
        Storage.setEpisodeNote(this.activeAnimeId, epNum, note);
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
        <a href="${link.url}" target="_blank" rel="noopener noreferrer" class="link-info" title="${link.url}">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
          <div>
            <div class="link-title">${link.title}</div>
            <div class="link-url-text">${link.url}</div>
          </div>
        </a>
        <button 
          class="btn-icon-only" 
          data-action="delete-link" 
          data-id="${link.id}" 
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
        if (linkId) {
          const updated = Storage.removeLink(this.activeAnimeId, linkId);
          if (updated) {
            this.renderLinksTab(updated);
            this.triggerDataChange();
          }
        }
      });
    });
  },

  handleAddCustomLink() {
    if (!this.activeAnimeId) return;

    const titleInput = document.getElementById('inputNewLinkTitle');
    const urlInput = document.getElementById('inputNewLinkUrl');

    if (!titleInput || !urlInput) return;

    const title = titleInput.value.trim();
    let url = urlInput.value.trim();

    if (!title || !url) {
      alert('Preencha o nome e o link da URL.');
      return;
    }

    if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('file://')) {
      url = 'https://' + url;
    }

    const updated = Storage.addLink(this.activeAnimeId, title, url);
    if (updated) {
      titleInput.value = '';
      urlInput.value = '';
      this.renderLinksTab(updated);
      this.triggerDataChange('Link adicionado!');
    }
  },

  renderNotesTab(anime) {
    const notesInput = document.getElementById('detailGeneralNotes');
    const synopsisBox = document.getElementById('detailSynopsisText');

    if (notesInput) notesInput.value = anime.generalNotes || '';
    if (synopsisBox) synopsisBox.textContent = anime.synopsis || 'Sem sinopse cadastrada.';
  }
};
