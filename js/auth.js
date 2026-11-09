/* ==============================================================================
   Auth Module - Client-side Authentication & Session Management
   Gerencia tokens JWT, login, cadastro e comunicação com o Cloudflare Worker
   ============================================================================== */

const STORAGE_KEYS = {
  TOKEN: 'animelist_auth_token',
  USER: 'animelist_auth_user',
  API_URL: 'animelist_api_base_url'
};

// URL da API Cloudflare Workers em produção
const CLOUD_API_URL = 'https://animelist-api.edudev2022.workers.dev';

export const Auth = {
  /**
   * Obtém a URL base da API
   */
  getApiUrl() {
    return localStorage.getItem(STORAGE_KEYS.API_URL) || CLOUD_API_URL;
  },

  /**
   * Define uma URL customizada da API (ex: https://animelist-api.seu-worker.workers.dev)
   */
  setApiUrl(url) {
    if (url) {
      localStorage.setItem(STORAGE_KEYS.API_URL, url.replace(/\/+$/, ''));
    } else {
      localStorage.removeItem(STORAGE_KEYS.API_URL);
    }
  },

  /**
   * Retorna o token JWT atual
   */
  getToken() {
    return localStorage.getItem(STORAGE_KEYS.TOKEN) || null;
  },

  /**
   * Retorna os dados do usuário conectado
   */
  getUser() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.USER);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  },

  /**
   * Verifica se o usuário está logado
   */
  isLoggedIn() {
    return Boolean(this.getToken() && this.getUser());
  },

  /**
   * Salva a sessão localmente
   */
  setSession(token, user) {
    if (token) localStorage.setItem(STORAGE_KEYS.TOKEN, token);
    if (user) localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
  },

  /**
   * Remove a sessão (Logout)
   */
  clearSession() {
    localStorage.removeItem(STORAGE_KEYS.TOKEN);
    localStorage.removeItem(STORAGE_KEYS.USER);
  },

  /**
   * Realiza login na API
   */
  async login(email, password) {
    const baseUrl = this.getApiUrl();
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || 'Falha ao autenticar.');
    }

    this.setSession(data.token, data.user);
    return data;
  },

  /**
   * Cria nova conta na API
   */
  async register(email, password, name) {
    const baseUrl = this.getApiUrl();
    const response = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || 'Falha ao criar conta.');
    }

    this.setSession(data.token, data.user);
    return data;
  },

  /**
   * Valida o token atual com o servidor
   */
  async checkSession() {
    const token = this.getToken();
    if (!token) return null;

    try {
      const baseUrl = this.getApiUrl();
      const response = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.user) {
          localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(data.user));
          return data.user;
        }
      } else if (response.status === 401) {
        // Token expirado ou inválido
        this.clearSession();
      }
    } catch (err) {
      // Se estiver offline, mantém a sessão local para funcionamento offline
      console.warn('Não foi possível verificar sessão na nuvem (offline ou erro de conexão):', err);
      return this.getUser();
    }

    return null;
  }
};

