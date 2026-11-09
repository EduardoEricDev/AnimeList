/* ==========================================================================
   API Module - Kitsu API (Primary, Ultra-fast & Stable) + Jikan API (Fallback)
   ========================================================================== */

const KITSU_BASE_URL = 'https://kitsu.io/api/edge';
const JIKAN_BASE_URL = 'https://api.jikan.moe/v4';

const SEASON_TRANSLATIONS = {
  winter: 'Inverno',
  spring: 'Primavera',
  summer: 'Verão',
  fall: 'Outono'
};

function getSeasonFromDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const month = date.getMonth() + 1; // 1-12

  if (month === 12 || month === 1 || month === 2) return 'Inverno';
  if (month >= 3 && month <= 5) return 'Primavera';
  if (month >= 6 && month <= 8) return 'Verão';
  return 'Outono';
}

export const Api = {
  /**
   * Calculates season status (past, current, upcoming) for a given year
   */
  getSeasonInfo(targetYear = new Date().getFullYear()) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const month = now.getMonth() + 1; // 1-12

    let currentSeasonName = 'winter';
    if (month === 12 || month === 1 || month === 2) currentSeasonName = 'winter';
    else if (month >= 3 && month <= 5) currentSeasonName = 'spring';
    else if (month >= 6 && month <= 8) currentSeasonName = 'summer';
    else currentSeasonName = 'fall';

    const seasonOrder = ['winter', 'spring', 'summer', 'fall'];
    const curIdx = seasonOrder.indexOf(currentSeasonName);

    const pastSeasons = [];
    const seasonStatuses = {};

    seasonOrder.forEach((s, idx) => {
      if (targetYear < currentYear) {
        seasonStatuses[s] = 'past';
        pastSeasons.push(s);
      } else if (targetYear > currentYear) {
        seasonStatuses[s] = 'upcoming';
      } else {
        if (idx < curIdx) {
          seasonStatuses[s] = 'past';
          pastSeasons.push(s);
        } else if (idx === curIdx) {
          seasonStatuses[s] = 'current';
        } else {
          seasonStatuses[s] = 'upcoming';
        }
      }
    });

    return {
      currentSeason: currentSeasonName,
      seasonStatuses,
      pastSeasons
    };
  },

  /**
   * Searches for animes with Kitsu as primary and Jikan as fallback
   */
  async searchAnime(query) {
    if (!query || query.trim().length < 2) return [];

    // 1. Try Kitsu API first
    try {
      const url = `${KITSU_BASE_URL}/anime?filter[text]=${encodeURIComponent(query.trim())}&page[limit]=6`;
      const response = await fetch(url, { headers: { 'Accept': 'application/vnd.api+json' } });

      if (response.ok) {
        const json = await response.json();
        if (json.data && Array.isArray(json.data) && json.data.length > 0) {
          return json.data.map(item => this.formatKitsuData(item));
        }
      }
    } catch (err) {
      console.warn('Kitsu API falhou, tentando fallback Jikan:', err);
    }

    // 2. Fallback to Jikan API (MyAnimeList)
    try {
      const url = `${JIKAN_BASE_URL}/anime?q=${encodeURIComponent(query.trim())}&limit=6&sfw=true`;
      const response = await fetch(url);

      if (response.ok) {
        const json = await response.json();
        if (json.data && Array.isArray(json.data)) {
          return json.data.map(item => this.formatJikanData(item));
        }
      }
    } catch (err) {
      console.warn('Jikan API falhou:', err);
    }

    return [];
  },

  /**
   * Fetches seasonal, airing, trending, or current year animes
   */
  async getSeasonalReleases({ year = new Date().getFullYear(), season = 'all', category = 'current_year', airingFilter = 'all' } = {}) {
    const yearNum = Number(year) || new Date().getFullYear();

    // 1. Airing category
    if (category === 'airing') {
      try {
        const url = `${KITSU_BASE_URL}/anime?filter[status]=current&sort=-userCount&page[limit]=20`;
        const res = await fetch(url, { headers: { 'Accept': 'application/vnd.api+json' } });
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const json = await res.json();
        let items = (json.data || []).map(item => this.formatKitsuData(item));

        if (airingFilter === 'year') {
          items = items.filter(item => {
            if (item.year && item.year === yearNum) return true;
            if (item.startDate && item.startDate.startsWith(String(yearNum))) return true;
            return false;
          });
        }
        return items;
      } catch (err) {
        console.warn('Erro ao carregar airing no Kitsu:', err);
        return [];
      }
    }

    // 2. Trending category
    if (category === 'trending') {
      try {
        const url = `${KITSU_BASE_URL}/trending/anime?limit=20`;
        const res = await fetch(url, { headers: { 'Accept': 'application/vnd.api+json' } });
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const json = await res.json();
        return (json.data || []).map(item => this.formatKitsuData(item));
      } catch (err) {
        console.warn('Erro ao carregar trending no Kitsu:', err);
        return [];
      }
    }

    // 3. Current Year or Seasonal Category
    try {
      const seasonInfo = this.getSeasonInfo(yearNum);

      // A. Specific Season (winter, spring, summer, fall)
      if (season && season !== 'all' && season !== 'past') {
        const url = `${KITSU_BASE_URL}/anime?filter[seasonYear]=${yearNum}&filter[season]=${season}&sort=-userCount&page[limit]=20`;
        const res = await fetch(url, { headers: { 'Accept': 'application/vnd.api+json' } });
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const json = await res.json();
        return (json.data || []).map(item => this.formatKitsuData(item, season, yearNum));
      }

      // B. Past Seasons of this year
      if (season === 'past') {
        const pastList = seasonInfo.pastSeasons.length > 0 
          ? seasonInfo.pastSeasons 
          : ['winter']; // Se o ano acabou de começar, carrega a temporada inaugural

        const requests = pastList.map(s => 
          fetch(`${KITSU_BASE_URL}/anime?filter[seasonYear]=${yearNum}&filter[season]=${s}&sort=-userCount&page[limit]=15`, {
            headers: { 'Accept': 'application/vnd.api+json' }
          }).then(r => r.ok ? r.json() : { data: [] }).then(j => ({ season: s, data: j.data || [] })).catch(() => ({ season: s, data: [] }))
        );

        const results = await Promise.all(requests);
        const seenIds = new Set();
        const uniqueItems = [];

        for (const resItem of results) {
          for (const item of resItem.data) {
            if (!seenIds.has(item.id)) {
              seenIds.add(item.id);
              uniqueItems.push(this.formatKitsuData(item, resItem.season, yearNum));
            }
          }
        }

        // Ordena por popularidade geral das temporadas passadas
        uniqueItems.sort((a, b) => (b.userCount || 0) - (a.userCount || 0));
        return uniqueItems;
      }

      // C. All Seasons of the year (winter, spring, summer, fall)
      const seasons = ['winter', 'spring', 'summer', 'fall'];
      const requests = seasons.map(s => 
        fetch(`${KITSU_BASE_URL}/anime?filter[seasonYear]=${yearNum}&filter[season]=${s}&sort=-userCount&page[limit]=15`, {
          headers: { 'Accept': 'application/vnd.api+json' }
        }).then(r => r.ok ? r.json() : { data: [] }).then(j => ({ season: s, data: j.data || [] })).catch(() => ({ season: s, data: [] }))
      );

      const results = await Promise.all(requests);
      const seenIds = new Set();
      const uniqueItems = [];

      for (const resItem of results) {
        for (const item of resItem.data) {
          if (!seenIds.has(item.id)) {
            seenIds.add(item.id);
            uniqueItems.push(this.formatKitsuData(item, resItem.season, yearNum));
          }
        }
      }

      // Ordena pelo anime mais popular do ano todo primeiro (misturando as melhores de cada temporada)
      uniqueItems.sort((a, b) => (b.userCount || 0) - (a.userCount || 0));
      return uniqueItems;
    } catch (err) {
      console.warn('Erro ao carregar temporada no Kitsu:', err);
      return [];
    }
  },

  /**
   * Formats Kitsu API response
   */
  formatKitsuData(item, querySeason = null, queryYear = null) {
    const attr = item.attributes || {};
    const titles = attr.titles || {};

    const mainTitle = titles.pt_br || titles.en || attr.canonicalTitle || 'Sem título';
    const japaneseTitle = titles.ja_jp ? `${titles.ja_jp} (${attr.canonicalTitle || ''})` : (attr.canonicalTitle || '');

    const cover = attr.posterImage?.large || 
                  attr.posterImage?.medium || 
                  attr.posterImage?.original || '';

    const banner = attr.coverImage?.large || 
                   attr.coverImage?.original || 
                   cover;

    let year = attr.startDate ? new Date(attr.startDate).getFullYear() : null;
    let season = getSeasonFromDate(attr.startDate);

    // Ajuste fino se veio de consulta específica por temporada/ano
    if (queryYear && querySeason && querySeason !== 'all' && querySeason !== 'past') {
      const translated = SEASON_TRANSLATIONS[querySeason];
      if (translated) season = translated;
      year = queryYear;
    } else if (queryYear && !year) {
      year = queryYear;
    }

    // Kitsu ratings are 0-100, convert to 0-10
    const rawScore = attr.averageRating ? parseFloat(attr.averageRating) : 0;
    const score = rawScore > 0 ? Math.round(rawScore / 10) : 0;

    const links = [];
    if (attr.youtubeVideoId) {
      links.push({
        id: 'lnk-yt-' + Date.now(),
        title: 'Trailer Oficial',
        url: `https://www.youtube.com/watch?v=${attr.youtubeVideoId}`
      });
    }
    if (attr.slug) {
      links.push({
        id: 'lnk-kitsu-' + Date.now(),
        title: 'Kitsu Info',
        url: `https://kitsu.io/anime/${attr.slug}`
      });
    }

    return {
      id: 'kitsu-' + (item.id || Date.now()),
      title: mainTitle,
      originalTitle: japaneseTitle,
      coverImage: cover,
      bannerImage: banner,
      status: 'plan_to_watch',
      score: score,
      season: season,
      year: year,
      studio: 'Kitsu Anime',
      format: attr.subtype || attr.showType || 'TV',
      totalEpisodes: attr.episodeCount || 0,
      currentEpisode: 0,
      favorite: false,
      genres: [],
      synopsis: attr.synopsis ? attr.synopsis.replace(/\(Source:.*?\)/g, '').trim() : '',
      generalNotes: '',
      links: links,
      episodesData: {},
      userCount: attr.userCount || 0
    };
  },

  /**
   * Formats Jikan API response
   */
  formatJikanData(item) {
    const rawSeason = item.season ? item.season.toLowerCase() : '';
    const translatedSeason = SEASON_TRANSLATIONS[rawSeason] || (item.season ? item.season.toUpperCase() : '');

    const genres = Array.isArray(item.genres) 
      ? item.genres.map(g => g.name) 
      : [];

    const studio = item.studios && item.studios.length > 0 
      ? item.studios[0].name 
      : (item.producers && item.producers.length > 0 ? item.producers[0].name : 'Desconhecido');

    const cover = item.images?.webp?.large_image_url || 
                  item.images?.jpg?.large_image_url || 
                  item.images?.jpg?.image_url || '';

    const banner = item.trailer?.images?.maximum_image_url || 
                   item.trailer?.images?.large_image_url || 
                   cover;

    return {
      id: 'jikan-' + (item.mal_id || Date.now()),
      title: item.title_english || item.title || 'Sem título',
      originalTitle: item.title_japanese 
        ? `${item.title_japanese} (${item.title || ''})` 
        : (item.title || ''),
      coverImage: cover,
      bannerImage: banner,
      status: 'plan_to_watch',
      score: item.score ? Math.round(item.score) : 0,
      season: translatedSeason,
      year: item.year || (item.aired?.from ? new Date(item.aired.from).getFullYear() : null),
      studio: studio,
      format: item.type || 'TV',
      totalEpisodes: item.episodes || 0,
      currentEpisode: 0,
      favorite: false,
      genres: genres,
      synopsis: item.synopsis ? item.synopsis.replace(/\[Written by MAL Rewrite\]/g, '').trim() : '',
      generalNotes: '',
      links: item.url ? [
        { id: 'lnk-mal', title: 'MyAnimeList', url: item.url }
      ] : [],
      episodesData: {}
    };
  }
};
