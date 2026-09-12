/* ==========================================================================
   Storage Module - LocalStorage Management & Backup JSON (Export/Import)
   ========================================================================== */

const STORAGE_KEY = 'animetracker_data_v1';

// Initial sample data to give a clean Notion feel on first launch
const SAMPLE_ANIMES = [
  {
    id: 'sample-1',
    title: 'Sousou no Frieren',
    originalTitle: '葬送のフリーレン (Frieren: Beyond Journey\'s End)',
    coverImage: 'https://cdn.myanimelist.net/images/anime/1015/138006l.jpg',
    bannerImage: 'https://cdn.myanimelist.net/images/anime/1015/138006l.jpg',
    status: 'completed',
    score: 10,
    season: 'Outono',
    year: 2023,
    studio: 'Madhouse',
    format: 'TV',
    totalEpisodes: 28,
    currentEpisode: 28,
    favorite: true,
    genres: ['Aventura', 'Fantasia', 'Drama'],
    synopsis: 'Após a derrota do Rei Demônio pelo grupo do herói, a maga elfa Frieren segue sua longa jornada através das décadas, refletindo sobre os laços humanos.',
    generalNotes: 'Uma das obras mais emocionantes e poéticas já feitas. A trilha sonora do Evan Call é espetacular.',
    links: [
      { id: 'lnk-1', title: 'Crunchyroll', url: 'https://www.crunchyroll.com/series/GG5H5XMQ5/frieren-beyond-journeys-end' },
      { id: 'lnk-2', title: 'MyAnimeList', url: 'https://myanimelist.net/anime/52991/Sousou_no_Frieren' }
    ],
    episodesData: {
      1: { watched: true, note: 'Início calmo e melancólico. O funeral do Himmel...' },
      2: { watched: true, note: 'Fern crescendo sob os cuidados de Heiter.' },
      3: { watched: true, note: 'Reencontro de Frieren e Fern partindo na jornada.' },
      26: { watched: true, note: 'Teste de mago de 1ª classe contra o clone da Frieren! Animação absurda.' },
      28: { watched: true, note: 'Despedida emocionante. Já ansioso pela 2ª temporada!' }
    },
    updatedAt: new Date().toISOString()
  },
  {
    id: 'sample-2',
    title: 'Solo Leveling',
    originalTitle: '俺だけレベルアップな件 (Ore dake Level Up na Ken)',
    coverImage: 'https://cdn.myanimelist.net/images/anime/1484/141018l.jpg',
    bannerImage: 'https://cdn.myanimelist.net/images/anime/1484/141018l.jpg',
    status: 'watching',
    score: 9,
    season: 'Inverno',
    year: 2024,
    studio: 'A-1 Pictures',
    format: 'TV',
    totalEpisodes: 12,
    currentEpisode: 8,
    favorite: true,
    genres: ['Ação', 'Fantasia'],
    synopsis: 'Sung Jin-woo, o caçador mais fraco da humanidade, acorda em um hospital após uma dungeon dupla mortal com uma misteriosa interface flutuante diante de seus olhos.',
    generalNotes: 'Adaptação muito fiel ao Manhwa. As lutas estão com animação de altíssimo nível.',
    links: [
      { id: 'lnk-3', title: 'Crunchyroll', url: 'https://www.crunchyroll.com/series/GDKH4EX4W/solo-leveling' }
    ],
    episodesData: {
      1: { watched: true, note: 'O terror da dungeon dupla e a estátua rindo!' },
      4: { watched: true, note: 'Jinwoo no metrô de Kasaka derrotando o primeiro grande boss.' },
      6: { watched: true, note: 'Traição na dungeon de insetos.' }
    },
    updatedAt: new Date().toISOString()
  }
];

export const Storage = {
  /**
   * Retrieves all animes from LocalStorage
   */
  getAll() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) {
        // Initialize with sample data if first time
        this.saveAll(SAMPLE_ANIMES);
        return SAMPLE_ANIMES;
      }
      return JSON.parse(data);
    } catch (e) {
      console.error('Erro ao ler do LocalStorage:', e);
      return [];
    }
  },

  /**
   * Persists the entire anime array
   */
  saveAll(animes) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(animes));
    } catch (e) {
      console.error('Erro ao gravar no LocalStorage:', e);
    }
  },

  /**
   * Finds an anime by ID
   */
  getById(id) {
    const list = this.getAll();
    return list.find(item => item.id === id) || null;
  },

  /**
   * Adds or updates an anime entry
   */
  save(anime) {
    const list = this.getAll();
    const existingIndex = list.findIndex(item => item.id === anime.id);

    const record = {
      ...anime,
      updatedAt: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      list[existingIndex] = { ...list[existingIndex], ...record };
    } else {
      list.unshift(record);
    }

    this.saveAll(list);
    return record;
  },

  /**
   * Removes an anime by ID
   */
  delete(id) {
    const list = this.getAll().filter(item => item.id !== id);
    this.saveAll(list);
  },

  /**
   * Updates watched episode count
   */
  updateCurrentEpisode(id, currentEpisode) {
    const anime = this.getById(id);
    if (!anime) return null;

    const total = anime.totalEpisodes || 9999;
    const validatedEp = Math.max(0, Math.min(currentEpisode, total));

    anime.currentEpisode = validatedEp;

    // Auto update status if watched all
    if (anime.totalEpisodes && validatedEp >= anime.totalEpisodes) {
      anime.status = 'completed';
    } else if (anime.status === 'completed' && validatedEp < (anime.totalEpisodes || 0)) {
      anime.status = 'watching';
    }

    // Ensure episodesData object exists and mark up to current ep as watched
    if (!anime.episodesData) anime.episodesData = {};
    for (let i = 1; i <= validatedEp; i++) {
      if (!anime.episodesData[i]) {
        anime.episodesData[i] = { watched: true, note: '' };
      } else {
        anime.episodesData[i].watched = true;
      }
    }

    return this.save(anime);
  },

  /**
   * Toggles a single episode's watched status
   */
  setEpisodeWatched(id, epNumber, watched) {
    const anime = this.getById(id);
    if (!anime) return null;

    if (!anime.episodesData) anime.episodesData = {};
    if (!anime.episodesData[epNumber]) {
      anime.episodesData[epNumber] = { watched, note: '' };
    } else {
      anime.episodesData[epNumber].watched = watched;
    }

    // Recalculate highest watched episode
    let maxWatched = 0;
    Object.keys(anime.episodesData).forEach(epKey => {
      const num = parseInt(epKey, 10);
      if (anime.episodesData[epKey].watched && num > maxWatched) {
        maxWatched = num;
      }
    });

    if (maxWatched > anime.currentEpisode) {
      anime.currentEpisode = maxWatched;
    }

    if (anime.totalEpisodes && maxWatched >= anime.totalEpisodes) {
      anime.status = 'completed';
    }

    return this.save(anime);
  },

  /**
   * Marks all episodes as watched or unwatched
   */
  markAllEpisodes(id, watched) {
    const anime = this.getById(id);
    if (!anime) return null;

    const total = anime.totalEpisodes || Math.max(anime.currentEpisode || 0, 12);
    if (!anime.episodesData) anime.episodesData = {};

    for (let i = 1; i <= total; i++) {
      if (!anime.episodesData[i]) {
        anime.episodesData[i] = { watched, note: '' };
      } else {
        anime.episodesData[i].watched = watched;
      }
    }

    anime.currentEpisode = watched ? total : 0;
    if (watched) {
      anime.status = 'completed';
    } else if (anime.status === 'completed') {
      anime.status = 'watching';
    }

    return this.save(anime);
  },

  /**
   * Marks all episodes from 1 up to epNumber as watched
   */
  markEpisodesUpTo(id, epNumber) {
    const anime = this.getById(id);
    if (!anime) return null;

    const total = anime.totalEpisodes || Math.max(anime.currentEpisode || 0, epNumber);
    if (!anime.episodesData) anime.episodesData = {};

    for (let i = 1; i <= total; i++) {
      const isWatched = i <= epNumber;
      if (!anime.episodesData[i]) {
        anime.episodesData[i] = { watched: isWatched, note: '' };
      } else {
        anime.episodesData[i].watched = isWatched;
      }
    }

    anime.currentEpisode = epNumber;
    if (anime.totalEpisodes && epNumber >= anime.totalEpisodes) {
      anime.status = 'completed';
    } else if (anime.status === 'completed' && epNumber < (anime.totalEpisodes || 0)) {
      anime.status = 'watching';
    }

    return this.save(anime);
  },

  /**
   * Saves comments/notes for a specific episode
   */
  setEpisodeNote(id, epNumber, note) {
    const anime = this.getById(id);
    if (!anime) return null;

    if (!anime.episodesData) anime.episodesData = {};
    if (!anime.episodesData[epNumber]) {
      anime.episodesData[epNumber] = { watched: false, note };
    } else {
      anime.episodesData[epNumber].note = note;
    }

    return this.save(anime);
  },

  /**
   * Adds a custom link
   */
  addLink(id, title, url) {
    const anime = this.getById(id);
    if (!anime) return null;

    if (!anime.links) anime.links = [];
    const newLink = {
      id: 'lnk-' + Date.now(),
      title: title.trim(),
      url: url.trim()
    };
    anime.links.push(newLink);

    return this.save(anime);
  },

  /**
   * Removes a custom link
   */
  removeLink(id, linkId) {
    const anime = this.getById(id);
    if (!anime || !anime.links) return null;

    anime.links = anime.links.filter(l => l.id !== linkId);
    return this.save(anime);
  },

  /**
   * Toggles favorite status
   */
  toggleFavorite(id) {
    const anime = this.getById(id);
    if (!anime) return false;

    anime.favorite = !anime.favorite;
    this.save(anime);
    return anime.favorite;
  },

  /**
   * Exports data to downloadable JSON file
   */
  exportToJson() {
    const animes = this.getAll();
    const jsonString = JSON.stringify(animes, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const a = document.createElement('a');
    a.href = url;
    a.download = `animes_backup_${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  /**
   * Imports data from JSON file string
   */
  importFromJson(fileContent) {
    try {
      const parsed = JSON.parse(fileContent);
      if (!Array.isArray(parsed)) {
        return { success: false, count: 0, message: 'O arquivo JSON deve conter uma lista de animes.' };
      }

      this.saveAll(parsed);
      return { success: true, count: parsed.length, message: `${parsed.length} animes importados com sucesso!` };
    } catch (err) {
      console.error(err);
      return { success: false, count: 0, message: 'Arquivo JSON inválido ou corrompido.' };
    }
  }
};
