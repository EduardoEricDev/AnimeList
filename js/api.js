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
   * Fetches seasonal, airing, or trending animes with Year and Season filters
   */
  async getSeasonalReleases({ year = 2024, season = 'all', category = 'seasonal' } = {}) {
    // 1. Airing category
    if (category === 'airing') {
      try {
        const url = `${KITSU_BASE_URL}/anime?filter[status]=current&sort=-userCount&page[limit]=20`;
        const res = await fetch(url, { headers: { 'Accept': 'application/vnd.api+json' } });
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const json = await res.json();
        return (json.data || []).map(item => this.formatKitsuData(item));
      } catch (err) {
        console.warn('Erro ao carregar airing no Kitsu:', err);
        return [];
      }
    }

    // 2. Trending category
    if (category === 'trending') {
      try {
        const url = `${KITSU_BASE_URL}/trending/anime?limit=15`;
        const res = await fetch(url, { headers: { 'Accept': 'application/vnd.api+json' } });
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const json = await res.json();
        return (json.data || []).map(item => this.formatKitsuData(item));
      } catch (err) {
        console.warn('Erro ao carregar trending no Kitsu:', err);
        return [];
      }
    }

    // 3. Seasonal category with Year & Season
    try {
      if (season && season !== 'all') {
        const url = `${KITSU_BASE_URL}/anime?filter[seasonYear]=${year}&filter[season]=${season}&sort=-userCount&page[limit]=20`;
        const res = await fetch(url, { headers: { 'Accept': 'application/vnd.api+json' } });
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const json = await res.json();
        return (json.data || []).map(item => this.formatKitsuData(item));
      } else {
        // Fetch all 4 seasons for this year in parallel (15 each = 60 animes!)
        const seasons = ['winter', 'spring', 'summer', 'fall'];
        const requests = seasons.map(s => 
          fetch(`${KITSU_BASE_URL}/anime?filter[seasonYear]=${year}&filter[season]=${s}&sort=-userCount&page[limit]=15`, {
            headers: { 'Accept': 'application/vnd.api+json' }
          }).then(r => r.ok ? r.json() : { data: [] }).catch(() => ({ data: [] }))
        );

        const results = await Promise.all(requests);
        const rawItems = results.flatMap(r => r.data || []);
        
        // Deduplicate by ID
        const seenIds = new Set();
        const uniqueItems = [];
        for (const item of rawItems) {
          if (!seenIds.has(item.id)) {
            seenIds.add(item.id);
            uniqueItems.push(this.formatKitsuData(item));
          }
        }
        return uniqueItems;
      }
    } catch (err) {
      console.warn('Erro ao carregar temporada no Kitsu:', err);
      return [];
    }
  },

  /**
   * Formats Kitsu API response
   */
  formatKitsuData(item) {
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

    const year = attr.startDate ? new Date(attr.startDate).getFullYear() : null;
    const season = getSeasonFromDate(attr.startDate);

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
      episodesData: {}
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
