/* ==============================================================================
   Sync Module - Cloudflare D1 Cloud Sync Engine (Local-First + Edge)
   Sincroniza os animes locais com o Cloudflare D1 quando conectado
   ============================================================================== */

import { Auth } from './auth.js';
import { Storage } from './storage.js';

let syncTimeout = null;

export const Sync = {
  /**
   * Sincroniza todos os animes locais com a nuvem (Cloudflare D1)
   */
  async sync() {
    if (!Auth.isLoggedIn()) {
      return { synced: false, message: 'Usuário não conectado à nuvem.' };
    }

    const token = Auth.getToken();
    const baseUrl = Auth.getApiUrl();
    const localAnimes = Storage.getAll();

    try {
      const response = await fetch(`${baseUrl}/api/animes/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ animes: localAnimes })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro na sincronização com a nuvem.');
      }

      if (Array.isArray(data.animes)) {
        // Atualiza os dados locais com o resultado mesclado da nuvem
        Storage.saveAll(data.animes);
        
        // Notifica a aplicação para atualizar a visualização
        window.dispatchEvent(new CustomEvent('animelist:synced', {
          detail: { animes: data.animes, count: data.count }
        }));
      }

      return {
        synced: true,
        count: data.count || 0,
        message: data.message || 'Sincronizado com sucesso!'
      };
    } catch (err) {
      console.warn('Falha na sincronização com a nuvem:', err.message);
      return {
        synced: false,
        error: err.message,
        message: 'Não foi possível sincronizar com a nuvem no momento.'
      };
    }
  },

  /**
   * Remove um anime da nuvem em segundo plano
   */
  async deleteFromCloud(animeId) {
    if (!Auth.isLoggedIn() || !animeId) return;

    const token = Auth.getToken();
    const baseUrl = Auth.getApiUrl();

    try {
      await fetch(`${baseUrl}/api/animes/${encodeURIComponent(animeId)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    } catch (err) {
      console.warn('Erro ao deletar da nuvem:', err);
    }
  },

  /**
   * Dispara sincronização com debounce após alterações locais (assistir ep, editar notas)
   */
  triggerDebouncedSync(delayMs = 1800) {
    if (!Auth.isLoggedIn()) return;

    if (syncTimeout) clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => {
      this.sync().catch(console.warn);
    }, delayMs);
  }
};

// Listener automático para alterações locais no catálogo
if (typeof window !== 'undefined') {
  window.addEventListener('animelist:datachanged', (e) => {
    const detail = e.detail || {};
    if (detail.type === 'delete' && detail.id) {
      Sync.deleteFromCloud(detail.id);
    } else {
      Sync.triggerDebouncedSync();
    }
  });
}
