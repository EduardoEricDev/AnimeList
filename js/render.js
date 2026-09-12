/* ==========================================================================
   Render Module - Gallery Cards, Notion Table, Status Pills & Badges
   ========================================================================== */

const STATUS_LABELS = {
  watching: 'Assistindo',
  completed: 'Completo',
  plan_to_watch: 'Planejo Ver',
  paused: 'Pausado',
  dropped: 'Dropado'
};

export const Render = {
  /**
   * Helper to format status tag
   */
  renderStatusPill(status) {
    const label = STATUS_LABELS[status] || status;
    return `<span class="status-pill status-${status}">${label}</span>`;
  },

  /**
   * Renders the gallery grid view
   */
  renderGallery(animes, container) {
    if (animes.length === 0) {
      container.innerHTML = this.getEmptyStateHTML();
      return;
    }

    const html = `
      <div class="anime-gallery-grid">
        ${animes.map(anime => this.createGalleryCardHTML(anime)).join('')}
      </div>
    `;

    container.innerHTML = html;
  },

  /**
   * Creates a single anime card HTML for Gallery
   */
  createGalleryCardHTML(anime) {
    const total = anime.totalEpisodes || '?';
    const current = anime.currentEpisode || 0;
    const percent = anime.totalEpisodes ? Math.min(100, Math.round((current / anime.totalEpisodes) * 100)) : 0;
    const isCompleted = anime.status === 'completed' || (anime.totalEpisodes && current >= anime.totalEpisodes);

    const seasonText = [anime.season, anime.year].filter(Boolean).join(' ');

    return `
      <div class="anime-card" data-id="${anime.id}">
        <div class="anime-card-cover-wrap">
          <img 
            src="${anime.coverImage || 'https://via.placeholder.com/300x450?text=Sem+Capa'}" 
            alt="${this.escapeHTML(anime.title)}" 
            class="anime-card-cover" 
            loading="lazy"
            onerror="this.src='https://images.unsplash.com/photo-1578632767115-351597cf2477?w=400&q=80'"
          />
          <div class="anime-card-overlay">
            <div class="anime-card-overlay-top">
              ${this.renderStatusPill(anime.status)}
              <button 
                class="favorite-star-btn ${anime.favorite ? 'active' : ''}" 
                title="${anime.favorite ? 'Remover dos favoritos' : 'Favoritar'}"
                data-action="toggle-fav"
                data-id="${anime.id}"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="${anime.favorite ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                </svg>
              </button>
            </div>
            
            <div class="anime-card-overlay-bottom">
              ${anime.score > 0 ? `
                <div class="score-pill">
                  <svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                  <span>${anime.score}/10</span>
                </div>
              ` : '<span></span>'}

              ${seasonText ? `<span class="season-badge" style="color:#eee; font-weight:600; text-shadow:0 1px 3px rgba(0,0,0,0.8);">${seasonText}</span>` : ''}
            </div>
          </div>
        </div>

        <div class="anime-card-content">
          <h3 class="anime-card-title" title="${this.escapeHTML(anime.title)}">${this.escapeHTML(anime.title)}</h3>
          
          <div class="anime-card-progress">
            <div class="progress-header">
              <span>Ep. <strong>${current}</strong> / ${total}</span>
              <button class="quick-ep-btn" data-action="increment-ep" data-id="${anime.id}" title="Avançar 1 episódio">+1 Ep</button>
            </div>
            <div class="progress-track">
              <div class="progress-bar-fill ${isCompleted ? 'completed' : ''}" style="width: ${percent}%"></div>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  /**
   * Renders the Notion Table view
   */
  renderTable(animes, container) {
    if (animes.length === 0) {
      container.innerHTML = this.getEmptyStateHTML();
      return;
    }

    const html = `
      <div class="anime-table-container">
        <table class="anime-table">
          <thead>
            <tr>
              <th style="width: 40px; text-align: center;">★</th>
              <th>Anime / Título</th>
              <th style="width: 130px;">Status</th>
              <th style="width: 150px;">Progresso</th>
              <th style="width: 80px;">Nota</th>
              <th style="width: 130px;">Temporada</th>
              <th>Gêneros</th>
              <th style="width: 90px; text-align: center;">Links</th>
            </tr>
          </thead>
          <tbody>
            ${animes.map(anime => this.createTableRowHTML(anime)).join('')}
          </tbody>
        </table>
      </div>
    `;

    container.innerHTML = html;
  },

  /**
   * Creates a single row HTML for Table view
   */
  createTableRowHTML(anime) {
    const total = anime.totalEpisodes || '?';
    const current = anime.currentEpisode || 0;
    const seasonText = [anime.season, anime.year].filter(Boolean).join(' ') || '—';
    const linksCount = anime.links?.length || 0;

    const genresHTML = anime.genres && anime.genres.length > 0
      ? anime.genres.slice(0, 3).map(g => `<span class="genre-tag">${this.escapeHTML(g)}</span>`).join(' ')
      : '<span style="color:var(--text-muted); font-size:0.75rem;">—</span>';

    return `
      <tr data-id="${anime.id}">
        <td style="text-align: center;" onclick="event.stopPropagation();">
          <button 
            class="favorite-star-btn ${anime.favorite ? 'active' : ''}" 
            data-action="toggle-fav" 
            data-id="${anime.id}"
            style="width: 24px; height: 24px;"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="${anime.favorite ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
            </svg>
          </button>
        </td>
        <td>
          <div class="table-anime-col">
            <img 
              src="${anime.coverImage || 'https://via.placeholder.com/38x52?text=Capa'}" 
              alt="${this.escapeHTML(anime.title)}" 
              class="table-thumb" 
              loading="lazy"
            />
            <div class="table-anime-info">
              <span class="table-anime-title">${this.escapeHTML(anime.title)}</span>
              ${anime.originalTitle ? `<span class="table-anime-subtitle">${this.escapeHTML(anime.originalTitle)}</span>` : ''}
            </div>
          </div>
        </td>
        <td>${this.renderStatusPill(anime.status)}</td>
        <td onclick="event.stopPropagation();">
          <div class="table-ep-stepper">
            <button class="stepper-btn" data-action="decrement-ep" data-id="${anime.id}" title="Diminuir 1 ep">-</button>
            <span style="font-weight: 600; min-width: 54px; text-align: center;">${current} / ${total}</span>
            <button class="stepper-btn" data-action="increment-ep" data-id="${anime.id}" title="Aumentar 1 ep">+</button>
          </div>
        </td>
        <td>
          ${anime.score > 0 ? `
            <div class="score-pill">
              <svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              <span>${anime.score}</span>
            </div>
          ` : '<span style="color:var(--text-muted); font-size:0.8rem;">—</span>'}
        </td>
        <td><span style="font-size:0.82rem; color:var(--text-secondary);">${seasonText}</span></td>
        <td>${genresHTML}</td>
        <td style="text-align: center;">
          <span style="font-size: 0.78rem; color: var(--text-muted); background: var(--bg-surface); padding: 2px 7px; border-radius: 4px; border: 1px solid var(--border-subtle);">
            🔗 ${linksCount}
          </span>
        </td>
      </tr>
    `;
  },

  /**
   * Updates tab counter badges
   */
  updateTabCounters(allAnimes) {
    const counts = {
      all: allAnimes.length,
      watching: allAnimes.filter(a => a.status === 'watching').length,
      plan_to_watch: allAnimes.filter(a => a.status === 'plan_to_watch').length,
      completed: allAnimes.filter(a => a.status === 'completed').length,
      paused: allAnimes.filter(a => a.status === 'paused').length,
      dropped: allAnimes.filter(a => a.status === 'dropped').length,
      favorites: allAnimes.filter(a => a.favorite).length
    };

    Object.keys(counts).forEach(key => {
      const el = document.querySelector(`.tab-count[data-filter="${key}"]`);
      if (el) el.textContent = counts[key];
    });

    const totalHeroCount = document.getElementById('totalAnimeCount');
    if (totalHeroCount) {
      totalHeroCount.textContent = `${allAnimes.length} ${allAnimes.length === 1 ? 'anime' : 'animes'}`;
    }
  },

  /**
   * Empty state HTML
   */
  getEmptyStateHTML() {
    return `
      <div class="empty-state">
        <div class="empty-icon">📂</div>
        <h3 class="empty-title">Nenhum anime encontrado</h3>
        <p class="empty-desc">Adicione um novo anime pelo botão acima ou altere os filtros de busca para encontrar seus animes.</p>
        <button class="btn btn-primary" id="btnOpenAddModalEmpty">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          Adicionar Anime
        </button>
      </div>
    `;
  },

  /**
   * Renders the Recent Releases explorer view
   */
  renderRecentReleases(recentAnimes, localAnimes, container, { category = 'seasonal', year = 2024, season = 'all' } = {}, isLoading = false) {
    const yearsList = [2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015];
    const currentYearNum = Number(year) || 2024;

    const headerHtml = `
      <div class="recent-releases-header">
        <div class="recent-controls-left">
          <!-- Category Buttons -->
          <div class="recent-sub-filters">
            <button class="recent-filter-btn ${category === 'seasonal' ? 'active' : ''}" data-category="seasonal">
              🗓️ Por Temporada
            </button>
            <button class="recent-filter-btn ${category === 'airing' ? 'active' : ''}" data-category="airing">
              📺 Em Exibição Agora
            </button>
            <button class="recent-filter-btn ${category === 'trending' ? 'active' : ''}" data-category="trending">
              ⚡ Em Alta
            </button>
          </div>

          <!-- Selectors for Year & Season (when category === 'seasonal') -->
          ${category === 'seasonal' ? `
            <div class="recent-selectors-group">
              <!-- Ano -->
              <div class="recent-select-wrap">
                <span class="recent-select-label">Ano:</span>
                <select id="recentYearSelect" class="select-input" style="padding: 0.35rem 0.65rem; font-weight: 600;">
                  ${yearsList.map(y => `
                    <option value="${y}" ${currentYearNum === y ? 'selected' : ''}>${y}</option>
                  `).join('')}
                </select>
              </div>

              <!-- Temporada -->
              <div class="recent-select-wrap">
                <span class="recent-select-label">Temporada:</span>
                <select id="recentSeasonSelect" class="select-input" style="padding: 0.35rem 0.65rem; font-weight: 600;">
                  <option value="all" ${season === 'all' ? 'selected' : ''}>Todas as Temporadas (~60 animes)</option>
                  <option value="winter" ${season === 'winter' ? 'selected' : ''}>❄️ Inverno (Jan - Mar)</option>
                  <option value="spring" ${season === 'spring' ? 'selected' : ''}>🌸 Primavera (Abr - Jun)</option>
                  <option value="summer" ${season === 'summer' ? 'selected' : ''}>☀️ Verão (Jul - Set)</option>
                  <option value="fall" ${season === 'fall' ? 'selected' : ''}>🍂 Outono (Out - Dez)</option>
                </select>
              </div>
            </div>
          ` : ''}
        </div>

        <div class="recent-info-badge">
          ${isLoading ? 'Carregando...' : `${recentAnimes.length} animes encontrados`}
        </div>
      </div>
    `;

    let contentHtml = '';
    if (isLoading) {
      contentHtml = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 4.5rem 1rem; gap: 1rem; color: var(--text-secondary);">
          <div class="search-spinner" style="display: block; width: 34px; height: 34px; border-width: 3px; position: static; transform: none;"></div>
          <p style="font-size: 0.95rem; font-weight: 500;">Buscando animes da temporada na API...</p>
        </div>
      `;
    } else if (!recentAnimes || recentAnimes.length === 0) {
      contentHtml = `
        <div class="empty-state">
          <div class="empty-icon">🌐</div>
          <h3 class="empty-title">Nenhum anime encontrado para este filtro</h3>
          <p class="empty-desc">Tente selecionar outro ano ou temporada nos controles acima.</p>
        </div>
      `;
    } else {
      contentHtml = `
        <div class="anime-gallery-grid">
          ${recentAnimes.map(anime => this.createRecentCardHTML(anime, localAnimes)).join('')}
        </div>
      `;
    }

    container.innerHTML = `
      <div class="recent-releases-wrapper">
        ${headerHtml}
        ${contentHtml}
      </div>
    `;
  },

  /**
   * Creates a card for recent releases
   */
  createRecentCardHTML(anime, localAnimes) {
    const localMatch = localAnimes.find(l => 
      l.id === anime.id || 
      (l.title && anime.title && l.title.toLowerCase() === anime.title.toLowerCase()) ||
      (l.originalTitle && anime.originalTitle && l.originalTitle.toLowerCase() === anime.originalTitle.toLowerCase())
    );

    const isAdded = Boolean(localMatch);
    const seasonText = [anime.season, anime.year].filter(Boolean).join(' ') || 'Recente';
    const totalEps = anime.totalEpisodes ? `${anime.totalEpisodes} eps` : 'Em exibição';

    return `
      <div class="anime-card recent-anime-card" data-id="${isAdded ? localMatch.id : anime.id}" data-is-recent="true">
        <div class="anime-card-cover-wrap">
          <img 
            src="${anime.coverImage || 'https://via.placeholder.com/300x450?text=Sem+Capa'}" 
            alt="${this.escapeHTML(anime.title)}" 
            class="anime-card-cover" 
            loading="lazy"
            onerror="this.src='https://images.unsplash.com/photo-1578632767115-351597cf2477?w=400&q=80'"
          />
          <div class="anime-card-overlay">
            <div class="anime-card-overlay-top">
              <span class="season-badge" style="background: rgba(0,0,0,0.65); backdrop-filter: blur(4px); padding: 2px 7px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.15); color: #fff; font-size: 0.72rem; font-weight: 600;">
                ${seasonText}
              </span>

              ${anime.score > 0 ? `
                <div class="score-pill">
                  <svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                  <span>${anime.score}/10</span>
                </div>
              ` : '<span></span>'}
            </div>
            
            <div class="anime-card-overlay-bottom">
              <span style="font-size: 0.72rem; color: #eee; background: rgba(0,0,0,0.6); padding: 2px 6px; border-radius: 4px;">
                ${anime.format} • ${totalEps}
              </span>
            </div>
          </div>
        </div>

        <div class="anime-card-content">
          <h3 class="anime-card-title" title="${this.escapeHTML(anime.title)}">${this.escapeHTML(anime.title)}</h3>
          
          <div style="margin-top: auto; padding-top: 0.4rem;">
            ${isAdded ? `
              <div style="display: flex; align-items: center; justify-content: space-between;">
                ${this.renderStatusPill(localMatch.status)}
                <span style="font-size: 0.74rem; color: #4dab9a; font-weight: 600;">✓ Na Lista</span>
              </div>
            ` : `
              <button 
                type="button" 
                class="btn btn-primary" 
                data-action="add-recent" 
                data-id="${anime.id}"
                style="width: 100%; font-size: 0.8rem; padding: 0.4rem 0.6rem;"
              >
                + Adicionar à Lista
              </button>
            `}
          </div>
        </div>
      </div>
    `;
  },

  escapeHTML(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
};
