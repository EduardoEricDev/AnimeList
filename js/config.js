/* ==========================================================================
   Config Module - Supabase Project Credentials & Storage
   Permite configurar a URL e a Chave Pública do Supabase tanto via código
   quanto através do painel de configurações na interface da aplicação.
   ========================================================================== */

const STORAGE_KEYS = {
  URL: 'animelist_supabase_url',
  ANON_KEY: 'animelist_supabase_anon_key'
};

// Configurações padrão (podem ser preenchidas diretamente aqui ou pelo formulário no app)
const DEFAULT_CONFIG = {
  url: '',
  anonKey: ''
};

export const Config = {
  /**
   * Obtém a URL e Anon Key do Supabase atuais
   */
  getSupabaseConfig() {
    const storedUrl = localStorage.getItem(STORAGE_KEYS.URL);
    const storedKey = localStorage.getItem(STORAGE_KEYS.ANON_KEY);

    return {
      url: (storedUrl || DEFAULT_CONFIG.url || '').trim(),
      anonKey: (storedKey || DEFAULT_CONFIG.anonKey || '').trim()
    };
  },

  /**
   * Salva novas credenciais no localStorage
   */
  saveSupabaseConfig(url, anonKey) {
    const cleanUrl = (url || '').trim().replace(/\/+$/, '');
    const cleanKey = (anonKey || '').trim();

    if (cleanUrl) {
      localStorage.setItem(STORAGE_KEYS.URL, cleanUrl);
    } else {
      localStorage.removeItem(STORAGE_KEYS.URL);
    }

    if (cleanKey) {
      localStorage.setItem(STORAGE_KEYS.ANON_KEY, cleanKey);
    } else {
      localStorage.removeItem(STORAGE_KEYS.ANON_KEY);
    }

    return this.isConfigured();
  },

  /**
   * Verifica se as credenciais do Supabase estão configuradas
   */
  isConfigured() {
    const { url, anonKey } = this.getSupabaseConfig();
    return Boolean(url && anonKey && url.startsWith('https://'));
  },

  /**
   * Limpa as credenciais salvas
   */
  clearSupabaseConfig() {
    localStorage.removeItem(STORAGE_KEYS.URL);
    localStorage.removeItem(STORAGE_KEYS.ANON_KEY);
  }
};
