/* ==========================================================================
   API Module - Kitsu API + AniList GraphQL Enrichment + Jikan Fallback
   ========================================================================== */

const KITSU_BASE_URL = 'https://kitsu.io/api/edge';
const ANILIST_URL = 'https://graphql.anilist.co';
const JIKAN_BASE_URL = 'https://api.jikan.moe/v4';
const KITSU_INCLUDES = 'categories,animeProductions.producer';

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

function normalizeTitle(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function stripHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\(Source:.*?\)/g, '')
    .trim();
}

function extractParenTitle(originalTitle) {
  const match = String(originalTitle || '').match(/\(([^)]+)\)/);
  return match ? match[1].trim() : '';
}

function buildIncludedMap(included) {
  const map = new Map();
  if (!Array.isArray(included)) return map;
  for (const entry of included) {
    if (entry && entry.type && entry.id) {
      map.set(`${entry.type}:${entry.id}`, entry);
    }
  }
  return map;
}

const ANILIST_SEARCH_QUERY = `
  query ($search: String, $perPage: Int) {
    Page(page: 1, perPage: $perPage) {
      media(search: $search, type: ANIME, isAdult: false, sort: [SEARCH_MATCH, POPULARITY_DESC]) {
        id
        idMal
        siteUrl
        title { romaji english native }
        episodes
        status
        nextAiringEpisode { episode }
        genres
        studios(isMain: true) { nodes { name } }
        season
        seasonYear
        startDate { year }
        averageScore
        format
        coverImage { extraLarge large }
        bannerImage
        description(asHtml: false)
        trailer { id site }
      }
    }
  }
`;

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
   * Queries AniList GraphQL API for anime metadata (accurate episode counts for ongoing series, genres, studios)
   */
  async searchAniList(query, limit = 6) {
    if (!query || query.trim().length < 2) return [];
    try {
      const response = await fetch(ANILIST_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          query: ANILIST_SEARCH_QUERY,
          variables: { search: query.trim(), perPage: limit }
        })
      });
      if (!response.ok) return [];
      const json = await response.json();
      const mediaList = json?.data?.Page?.media;
      if (!Array.isArray(mediaList)) return [];
      return mediaList.map(m => this.formatAniListData(m));
    } catch (err) {
      console.warn('AniList API falhou:', err);
      return [];
    }
  },

  /**
   * Finds the best matching anime from a candidate list by comparing title variants
   */
  findBestMatch(target, candidates) {
    if (!target || !Array.isArray(candidates) || candidates.length === 0) return null;
    const targetNames = [
      target.title,
      target.canonicalTitle,
      target.originalTitle
    ].map(normalizeTitle).filter(Boolean);

    // Strip parenthetical romaji from originalTitle like "ワンピース (One Piece)"
    const parenMatch = String(target.originalTitle || '').match(/\(([^)]+)\)/);
    if (parenMatch) {
      targetNames.push(normalizeTitle(parenMatch[1]));
    }

    for (const candidate of candidates) {
      const candNames = [
        candidate.title,
        candidate.canonicalTitle,
        candidate.originalTitle
      ].map(normalizeTitle).filter(Boolean);
      const candParen = String(candidate.originalTitle || '').match(/\(([^)]+)\)/);
      if (candParen) candNames.push(normalizeTitle(candParen[1]));

      if (targetNames.some(tn => candNames.some(cn => tn === cn))) {
        return candidate;
      }
    }

    // Partial/prefix match fallback when exact normalized match isn't found
    const primary = normalizeTitle(target.title);
    if (!primary) return null;
    return candidates.find(c => {
      const ct = normalizeTitle(c.title);
      return ct && (ct.includes(primary) || primary.includes(ct));
    }) || null;
  },

  /**
   * Merges missing or placeholder fields on an anime entry with richer metadata
   */
  mergeAnimeMetadata(base, source) {
    if (!source) return base;
    const merged = { ...base };

    const isPlaceholderStudio = !merged.studio ||
      merged.studio === 'Kitsu Anime' ||
      merged.studio === 'Desconhecido' ||
      merged.studio === 'Manual';

    if ((!merged.totalEpisodes || (source.totalEpisodes > merged.totalEpisodes && source.isOngoing)) && source.totalEpisodes > 0) {
      merged.totalEpisodes = source.totalEpisodes;
    }
    if (isPlaceholderStudio && source.studio && source.studio !== 'Desconhecido') {
      merged.studio = source.studio;
    }
    if ((!Array.isArray(merged.genres) || merged.genres.length === 0) && Array.isArray(source.genres) && source.genres.length > 0) {
      merged.genres = source.genres;
    }
    if (!merged.bannerImage && source.bannerImage) {
      merged.bannerImage = source.bannerImage;
    }
    if (!merged.synopsis && source.synopsis) {
      merged.synopsis = source.synopsis;
    }
    if (!merged.season && source.season) {
      merged.season = source.season;
    }
    if (!merged.year && source.year) {
      merged.year = source.year;
    }
    return merged;
  },

  /**
   * Enriches an existing or selected anime entry with Kitsu by ID (if applicable), AniList, and Kitsu episodes fallback
   */
  async enrichAnimeData(anime) {
    if (!anime || !anime.title) return anime;

    let enriched = { ...anime };
    const kitsuId = String(enriched.id || '').startsWith('kitsu-')
      ? String(enriched.id).replace(/^kitsu-/, '')
      : '';

    // 1. If this is a Kitsu entry missing canonicalTitle/studio/genres, fetch full Kitsu record by ID
    if (/^\d+$/.test(kitsuId) && (!enriched.canonicalTitle || enriched.studio === 'Kitsu Anime' || enriched.studio === 'Desconhecido' || !enriched.genres?.length)) {
      try {
        const res = await fetch(`${KITSU_BASE_URL}/anime/${kitsuId}?include=${KITSU_INCLUDES}`, {
          headers: { 'Accept': 'application/vnd.api+json' }
        });
        if (res.ok) {
          const json = await res.json();
          if (json?.data) {
            const includedMap = buildIncludedMap(json.included);
            const kitsuFull = this.formatKitsuData(json.data, null, null, includedMap);
            enriched = this.mergeAnimeMetadata(enriched, kitsuFull);
            if (!enriched.canonicalTitle && kitsuFull.canonicalTitle) {
              enriched.canonicalTitle = kitsuFull.canonicalTitle;
            }
            if (kitsuFull.isOngoing) {
              enriched.isOngoing = true;
            }
          }
        }
      } catch (err) {
        console.warn('Falha ao buscar detalhes do Kitsu por ID:', err);
      }
    }

    // 2. Query AniList using canonical/romaji title first (avoids localized PT-BR title misses), then primary title
    const searchCandidates = [
      enriched.canonicalTitle,
      extractParenTitle(enriched.originalTitle),
      enriched.title
    ].filter((v, idx, arr) => Boolean(v) && arr.indexOf(v) === idx);

    let match = null;
    for (const term of searchCandidates) {
      const anilistResults = await this.searchAniList(term, 5);
      match = this.findBestMatch(enriched, anilistResults);
      if (match) break;
    }

    enriched = this.mergeAnimeMetadata(enriched, match);

    // 3. Fallback: if still 0 episodes and this is a Kitsu entry, query Kitsu episodes meta.count
    if ((!enriched.totalEpisodes || enriched.totalEpisodes === 0) && /^\d+$/.test(kitsuId)) {
      try {
        const epRes = await fetch(`${KITSU_BASE_URL}/anime/${kitsuId}/episodes?page[limit]=1`, {
          headers: { 'Accept': 'application/vnd.api+json' }
        });
        if (epRes.ok) {
          const epJson = await epRes.json();
          const count = epJson?.meta?.count;
          if (typeof count === 'number' && count > 0) {
            enriched = { ...enriched, totalEpisodes: count };
          }
        }
      } catch (err) {
        console.warn('Falha ao buscar contagem de episódios no Kitsu:', err);
      }
    }

    return enriched;
  },

  /**
   * Searches for animes using Kitsu (with included genres/studios) + AniList enrichment, with Jikan fallback
   */
  async searchAnime(query) {
    if (!query || query.trim().length < 2) return [];
    const trimmed = query.trim();

    const kitsuPromise = fetch(
      `${KITSU_BASE_URL}/anime?filter[text]=${encodeURIComponent(trimmed)}&include=${KITSU_INCLUDES}&page[limit]=6`,
      { headers: { 'Accept': 'application/vnd.api+json' } }
    ).then(async (res) => {
      if (!res.ok) return [];
      const json = await res.json();
      if (!Array.isArray(json.data)) return [];
      const includedMap = buildIncludedMap(json.included);
      return json.data.map(item => this.formatKitsuData(item, null, null, includedMap));
    }).catch((err) => {
      console.warn('Kitsu API falhou:', err);
      return [];
    });

    const anilistPromise = this.searchAniList(trimmed, 6);

    const [kitsuItems, anilistItems] = await Promise.all([kitsuPromise, anilistPromise]);

    if (kitsuItems.length > 0) {
      return kitsuItems.map(item => {
        const match = this.findBestMatch(item, anilistItems);
        return match ? this.mergeAnimeMetadata(item, match) : item;
      });
    }

    if (anilistItems.length > 0) {
      return anilistItems;
    }

    // 3. Fallback to Jikan API (MyAnimeList)
    try {
      const url = `${JIKAN_BASE_URL}/anime?q=${encodeURIComponent(trimmed)}&limit=6&sfw=true`;
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
        const url = `${KITSU_BASE_URL}/anime?filter[status]=current&sort=-userCount&include=${KITSU_INCLUDES}&page[limit]=20`;
        const res = await fetch(url, { headers: { 'Accept': 'application/vnd.api+json' } });
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const json = await res.json();
        const includedMap = buildIncludedMap(json.included);
        let items = (json.data || []).map(item => this.formatKitsuData(item, null, null, includedMap));

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
        const url = `${KITSU_BASE_URL}/trending/anime?limit=20&include=${KITSU_INCLUDES}`;
        const res = await fetch(url, { headers: { 'Accept': 'application/vnd.api+json' } });
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const json = await res.json();
        const includedMap = buildIncludedMap(json.included);
        return (json.data || []).map(item => this.formatKitsuData(item, null, null, includedMap));
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
        const url = `${KITSU_BASE_URL}/anime?filter[seasonYear]=${yearNum}&filter[season]=${season}&sort=-userCount&include=${KITSU_INCLUDES}&page[limit]=20`;
        const res = await fetch(url, { headers: { 'Accept': 'application/vnd.api+json' } });
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const json = await res.json();
        const includedMap = buildIncludedMap(json.included);
        return (json.data || []).map(item => this.formatKitsuData(item, season, yearNum, includedMap));
      }

      // B. Past Seasons of this year
      if (season === 'past') {
        const pastList = seasonInfo.pastSeasons.length > 0
          ? seasonInfo.pastSeasons
          : ['winter'];

        const requests = pastList.map(s =>
          fetch(`${KITSU_BASE_URL}/anime?filter[seasonYear]=${yearNum}&filter[season]=${s}&sort=-userCount&include=${KITSU_INCLUDES}&page[limit]=15`, {
            headers: { 'Accept': 'application/vnd.api+json' }
          })
            .then(r => r.ok ? r.json() : { data: [] })
            .then(j => ({ season: s, data: j.data || [], includedMap: buildIncludedMap(j.included) }))
            .catch(() => ({ season: s, data: [], includedMap: new Map() }))
        );

        const results = await Promise.all(requests);
        const seenIds = new Set();
        const uniqueItems = [];

        for (const resItem of results) {
          for (const item of resItem.data) {
            if (!seenIds.has(item.id)) {
              seenIds.add(item.id);
              uniqueItems.push(this.formatKitsuData(item, resItem.season, yearNum, resItem.includedMap));
            }
          }
        }

        uniqueItems.sort((a, b) => (b.userCount || 0) - (a.userCount || 0));
        return uniqueItems;
      }

      // C. All Seasons of the year (winter, spring, summer, fall)
      const seasons = ['winter', 'spring', 'summer', 'fall'];
      const requests = seasons.map(s =>
        fetch(`${KITSU_BASE_URL}/anime?filter[seasonYear]=${yearNum}&filter[season]=${s}&sort=-userCount&include=${KITSU_INCLUDES}&page[limit]=15`, {
          headers: { 'Accept': 'application/vnd.api+json' }
        })
          .then(r => r.ok ? r.json() : { data: [] })
          .then(j => ({ season: s, data: j.data || [], includedMap: buildIncludedMap(j.included) }))
          .catch(() => ({ season: s, data: [], includedMap: new Map() }))
      );

      const results = await Promise.all(requests);
      const seenIds = new Set();
      const uniqueItems = [];

      for (const resItem of results) {
        for (const item of resItem.data) {
          if (!seenIds.has(item.id)) {
            seenIds.add(item.id);
            uniqueItems.push(this.formatKitsuData(item, resItem.season, yearNum, resItem.includedMap));
          }
        }
      }

      uniqueItems.sort((a, b) => (b.userCount || 0) - (a.userCount || 0));
      return uniqueItems;
    } catch (err) {
      console.warn('Erro ao carregar temporada no Kitsu:', err);
      return [];
    }
  },

  /**
   * Formats Kitsu API response (resolving included genres and studio when available)
   */
  formatKitsuData(item, querySeason = null, queryYear = null, includedMap = null) {
    const attr = item.attributes || {};
    const titles = attr.titles || {};
    const rels = item.relationships || {};

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

    if (queryYear && querySeason && querySeason !== 'all' && querySeason !== 'past') {
      const translated = SEASON_TRANSLATIONS[querySeason];
      if (translated) season = translated;
      year = queryYear;
    } else if (queryYear && !year) {
      year = queryYear;
    }

    const rawScore = attr.averageRating ? parseFloat(attr.averageRating) : 0;
    const score = rawScore > 0 ? Math.round(rawScore / 10) : 0;

    // Extract studio and genres from Kitsu JSON:API included relationships
    let studio = 'Desconhecido';
    const genres = [];

    if (includedMap instanceof Map && includedMap.size > 0) {
      const prodRefs = rels.animeProductions?.data || [];
      for (const ref of prodRefs) {
        const prodRel = includedMap.get(`${ref.type}:${ref.id}`);
        if (prodRel?.attributes?.role === 'studio') {
          const producerRef = prodRel.relationships?.producer?.data;
          const producer = producerRef ? includedMap.get(`${producerRef.type}:${producerRef.id}`) : null;
          if (producer?.attributes?.name) {
            studio = producer.attributes.name;
            break;
          }
        }
      }

      const catRefs = rels.categories?.data || [];
      for (const ref of catRefs) {
        const cat = includedMap.get(`${ref.type}:${ref.id}`);
        const catTitle = cat?.attributes?.title;
        if (catTitle && !genres.includes(catTitle)) {
          genres.push(catTitle);
          if (genres.length >= 6) break;
        }
      }
    }

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
      canonicalTitle: attr.canonicalTitle || '',
      originalTitle: japaneseTitle,
      coverImage: cover,
      bannerImage: banner,
      status: 'plan_to_watch',
      score: score,
      season: season,
      year: year,
      studio: studio,
      format: attr.subtype || attr.showType || 'TV',
      totalEpisodes: attr.episodeCount || 0,
      isOngoing: attr.status === 'current',
      currentEpisode: 0,
      favorite: false,
      genres: genres,
      synopsis: stripHtml(attr.synopsis),
      generalNotes: '',
      links: links,
      episodesData: {},
      userCount: attr.userCount || 0
    };
  },

  /**
   * Formats AniList GraphQL Media object
   */
  formatAniListData(media) {
    const titles = media.title || {};
    const mainTitle = titles.english || titles.romaji || titles.native || 'Sem título';
    const originalTitle = titles.native
      ? `${titles.native}${titles.romaji ? ` (${titles.romaji})` : ''}`
      : (titles.romaji || '');

    const rawSeason = media.season ? media.season.toLowerCase() : '';
    const translatedSeason = SEASON_TRANSLATIONS[rawSeason] || '';
    const year = media.seasonYear || media.startDate?.year || null;

    const studio = media.studios?.nodes?.[0]?.name || 'Desconhecido';
    const genres = Array.isArray(media.genres) ? media.genres : [];

    // For currently airing series (e.g. One Piece), episodes is null; nextAiringEpisode.episode - 1 gives released count
    const airedFromNext = media.nextAiringEpisode?.episode
      ? Math.max(0, media.nextAiringEpisode.episode - 1)
      : 0;
    const totalEpisodes = media.episodes || airedFromNext || 0;

    const cover = media.coverImage?.extraLarge || media.coverImage?.large || '';
    const banner = media.bannerImage || cover;

    const links = [];
    if (media.trailer?.site === 'youtube' && media.trailer?.id) {
      links.push({
        id: 'lnk-yt-' + Date.now(),
        title: 'Trailer Oficial',
        url: `https://www.youtube.com/watch?v=${media.trailer.id}`
      });
    }
    if (media.siteUrl) {
      links.push({
        id: 'lnk-anilist-' + Date.now(),
        title: 'AniList Info',
        url: media.siteUrl
      });
    }

    return {
      id: 'anilist-' + (media.id || Date.now()),
      title: mainTitle,
      canonicalTitle: titles.romaji || mainTitle,
      originalTitle: originalTitle,
      coverImage: cover,
      bannerImage: banner,
      status: 'plan_to_watch',
      score: media.averageScore ? Math.round(media.averageScore / 10) : 0,
      season: translatedSeason,
      year: year,
      studio: studio,
      format: media.format || 'TV',
      totalEpisodes: totalEpisodes,
      isOngoing: media.status === 'RELEASING',
      currentEpisode: 0,
      favorite: false,
      genres: genres,
      synopsis: stripHtml(media.description),
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
      isOngoing: Boolean(item.airing),
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
