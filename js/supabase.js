/* ==========================================================================
   Supabase Service Module - Authentication & Cloud Database Synchronization
   Gerencia conexões com o PostgreSQL e Autenticação de Usuários
   ========================================================================== */

import { Config } from './config.js';

let supabaseClient = null;
let currentSession = null;
let currentUser = null;
let authListeners = [];

export const SupabaseService = {
  /**
   * Inicializa o cliente Supabase se as credenciais estiverem configuradas
   */
  async init() {
    const config = Config.getSupabaseConfig();
    if (!config.url || !config.anonKey) {
      supabaseClient = null;
      currentSession = null;
      currentUser = null;
      return false;
    }

    try {
      // Import dinâmico do SDK oficial do Supabase via ESM
      const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
      
      supabaseClient = createClient(config.url, config.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false
        }
      });

      // Obter sessão atual
      const { data, error } = await supabaseClient.auth.getSession();
      if (!error && data?.session) {
        currentSession = data.session;
        currentUser = data.session.user;
      } else {
        currentSession = null;
        currentUser = null;
      }

      // Escutar mudanças no estado de autenticação
      supabaseClient.auth.onAuthStateChange((event, session) => {
        currentSession = session;
        currentUser = session?.user || null;
        authListeners.forEach(cb => cb(event, session, currentUser));
      });

      return true;
    } catch (err) {
      console.warn('[SupabaseService] Erro ao carregar biblioteca do Supabase:', err);
      supabaseClient = null;
      return false;
    }
  },

  /**
   * Registra um callback para mudanças no estado de autenticação
   */
  onAuthStateChange(callback) {
    if (typeof callback === 'function') {
      authListeners.push(callback);
    }
  },

  isConfigured() {
    return Boolean(supabaseClient);
  },

  isAuthenticated() {
    return Boolean(supabaseClient && currentUser);
  },

  getCurrentUser() {
    return currentUser;
  },

  // ============================================================================
  // Autenticação (Login, Cadastro, Logout)
  // ============================================================================

  async signUp(email, password) {
    if (!supabaseClient) {
      return { data: null, error: { message: 'O Supabase ainda não foi configurado. Insira a URL e a Chave Anon.' } };
    }

    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password
    });

    if (data?.session) {
      currentSession = data.session;
      currentUser = data.session.user;
    }

    return { data, error };
  },

  async signIn(email, password) {
    if (!supabaseClient) {
      return { data: null, error: { message: 'O Supabase ainda não foi configurado. Insira a URL e a Chave Anon.' } };
    }

    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (data?.session) {
      currentSession = data.session;
      currentUser = data.session.user;
    }

    return { data, error };
  },

  async signOut() {
    if (!supabaseClient) return { error: null };
    const { error } = await supabaseClient.auth.signOut();
    currentSession = null;
    currentUser = null;
    return { error };
  },

  // ============================================================================
  // Banco de Dados (Sincronização Cloud de Animes)
  // ============================================================================

  /**
   * Converte o modelo frontend (camelCase) para o formato do banco (snake_case)
   */
  toDatabaseRecord(anime, userId) {
    return {
      id: String(anime.id),
      user_id: userId,
      title: anime.title || 'Sem título',
      japanese_title: anime.japaneseTitle || null,
      cover_image: anime.coverImage || null,
      banner_image: anime.bannerImage || null,
      format: anime.format || 'TV',
      status: anime.status || 'plan_to_watch',
      current_episode: Number(anime.currentEpisode) || 0,
      total_episodes: anime.totalEpisodes ? Number(anime.totalEpisodes) : null,
      score: anime.score !== undefined ? Number(anime.score) : 0,
      favorite: Boolean(anime.favorite),
      season: anime.season || null,
      year: anime.year ? Number(anime.year) : null,
      studio: anime.studio || null,
      genres: anime.genres || [],
      custom_tags: anime.customTags || [],
      synopsis: anime.synopsis || null,
      general_notes: anime.generalNotes || null,
      episodes: anime.episodesData || anime.episodes || {},
      links: anime.links || [],
      updated_at: anime.updatedAt ? new Date(anime.updatedAt).toISOString() : new Date().toISOString()
    };
  },

  /**
   * Converte registro do banco (snake_case) para o modelo frontend (camelCase)
   */
  fromDatabaseRecord(record) {
    return {
      id: record.id,
      title: record.title,
      japaneseTitle: record.japanese_title || '',
      originalTitle: record.japanese_title || '',
      coverImage: record.cover_image || '',
      bannerImage: record.banner_image || '',
      format: record.format || 'TV',
      status: record.status || 'plan_to_watch',
      currentEpisode: record.current_episode || 0,
      totalEpisodes: record.total_episodes || null,
      score: record.score !== null ? Number(record.score) : 0,
      favorite: Boolean(record.favorite),
      season: record.season || '',
      year: record.year || null,
      studio: record.studio || '',
      genres: record.genres || [],
      customTags: record.custom_tags || [],
      synopsis: record.synopsis || '',
      generalNotes: record.general_notes || '',
      episodesData: record.episodes || {},
      episodes: record.episodes || {},
      links: record.links || [],
      createdAt: record.created_at || new Date().toISOString(),
      updatedAt: record.updated_at || new Date().toISOString()
    };
  },

  /**
   * Busca todos os animes do usuário logado na nuvem
   */
  async fetchUserAnimes() {
    if (!this.isAuthenticated()) {
      return { data: null, error: { message: 'Usuário não autenticado.' } };
    }

    try {
      const { data, error } = await supabaseClient
        .from('animes')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;

      const formatted = (data || []).map(row => this.fromDatabaseRecord(row));
      return { data: formatted, error: null };
    } catch (err) {
      console.error('[SupabaseService] Erro ao buscar animes:', err);
      return { data: null, error: err };
    }
  },

  /**
   * Salva ou atualiza um anime individual na nuvem
   */
  async upsertAnime(anime) {
    if (!this.isAuthenticated()) return { data: null, error: null };

    try {
      const record = this.toDatabaseRecord(anime, currentUser.id);
      const { data, error } = await supabaseClient
        .from('animes')
        .upsert(record, { onConflict: 'id,user_id' });

      if (error) throw error;
      return { data, error: null };
    } catch (err) {
      console.warn('[SupabaseService] Erro no salvamento em nuvem:', err);
      return { data: null, error: err };
    }
  },

  /**
   * Remove um anime da nuvem
   */
  async deleteAnime(animeId) {
    if (!this.isAuthenticated()) return { data: null, error: null };

    try {
      const { data, error } = await supabaseClient
        .from('animes')
        .delete()
        .eq('id', String(animeId))
        .eq('user_id', currentUser.id);

      if (error) throw error;
      return { data, error: null };
    } catch (err) {
      console.warn('[SupabaseService] Erro ao excluir anime na nuvem:', err);
      return { data: null, error: err };
    }
  },

  /**
   * Sincroniza em lote todos os animes locais para a conta na nuvem
   */
  async syncLocalToCloud(localAnimes) {
    if (!this.isAuthenticated()) {
      return { data: null, error: { message: 'Faça login para sincronizar com a nuvem.' } };
    }

    if (!localAnimes || localAnimes.length === 0) {
      return { data: [], error: null };
    }

    try {
      const records = localAnimes.map(a => this.toDatabaseRecord(a, currentUser.id));
      const { data, error } = await supabaseClient
        .from('animes')
        .upsert(records, { onConflict: 'id,user_id' });

      if (error) throw error;
      return { data, error: null };
    } catch (err) {
      console.error('[SupabaseService] Erro na sincronização em lote:', err);
      return { data: null, error: err };
    }
  }
};
