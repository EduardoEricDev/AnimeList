/**
 * ==============================================================================
 * AnimeList API - Cloudflare Worker + D1 Database
 * Autenticação JWT e Sincronização de Animes na Edge
 * ==============================================================================
 */

// Helper: CORS Headers
function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env?.CORS_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(data, status = 200, env = null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(env),
    },
  });
}

function errorResponse(message, status = 400, env = null) {
  return jsonResponse({ error: message }, status, env);
}

// -----------------------------------------------------------------------------
// Web Crypto Helper Functions (PBKDF2 & JWT)
// -----------------------------------------------------------------------------

async function hashPassword(password, saltHex = null) {
  const enc = new TextEncoder();
  let saltBytes;
  if (saltHex) {
    saltBytes = new Uint8Array(saltHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
  } else {
    saltBytes = crypto.getRandomValues(new Uint8Array(16));
  }

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    256
  );

  const hash = Array.from(new Uint8Array(derivedBits))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  const salt = Array.from(saltBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return { hash, salt };
}

function base64UrlEncode(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  return atob(base64);
}

async function signJWT(payload, secret) {
  const enc = new TextEncoder();
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const data = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  const signatureB64 = base64UrlEncode(String.fromCharCode(...new Uint8Array(signature)));

  return `${data}.${signatureB64}`;
}

async function verifyJWT(token, secret) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    const enc = new TextEncoder();
    const data = `${parts[0]}.${parts[1]}`;
    const rawSig = base64UrlDecode(parts[2]);
    const sigBytes = new Uint8Array(rawSig.length);
    for (let i = 0; i < rawSig.length; i++) sigBytes[i] = rawSig.charCodeAt(i);

    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(data));
    if (!valid) return null;

    const payload = JSON.parse(base64UrlDecode(parts[1]));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null; // Token expirado
    }
    return payload;
  } catch (err) {
    return null;
  }
}

async function authenticateRequest(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  const secret = env.JWT_SECRET || 'animelist-fallback-secret-key-change-in-prod';
  return await verifyJWT(token, secret);
}

// -----------------------------------------------------------------------------
// Main Worker Handlers
// -----------------------------------------------------------------------------

export default {
  async fetch(request, env) {
    // 1. Handle CORS Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(env) });
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      // Health Check
      if (path === '/' || path === '/api/health') {
        return jsonResponse({ status: 'ok', service: 'AnimeList API', version: '2.0' }, 200, env);
      }

      // =======================================================================
      // AUTH ROUTES
      // =======================================================================

      // POST /api/auth/register
      if (path === '/api/auth/register' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const { email, password, name } = body;

        if (!email || !password || password.length < 6) {
          return errorResponse('Email válido e senha de no mínimo 6 caracteres são obrigatórios.', 400, env);
        }

        const normalizedEmail = email.trim().toLowerCase();

        // Verificar se usuário já existe
        const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?')
          .bind(normalizedEmail)
          .first();

        if (existing) {
          return errorResponse('Este email já está cadastrado.', 409, env);
        }

        const userId = 'usr_' + crypto.randomUUID();
        const { hash, salt } = await hashPassword(password);
        const displayName = name ? name.trim() : normalizedEmail.split('@')[0];

        await env.DB.prepare(
          'INSERT INTO users (id, email, name, password_hash, salt) VALUES (?, ?, ?, ?, ?)'
        ).bind(userId, normalizedEmail, displayName, hash, salt).run();

        const jwtSecret = env.JWT_SECRET || 'animelist-fallback-secret-key-change-in-prod';
        const token = await signJWT(
          { userId, email: normalizedEmail, name: displayName, exp: Math.floor(Date.now() / 1000) + (30 * 86400) }, // 30 dias
          jwtSecret
        );

        return jsonResponse({
          message: 'Conta criada com sucesso!',
          user: { id: userId, email: normalizedEmail, name: displayName },
          token,
        }, 201, env);
      }

      // POST /api/auth/login
      if (path === '/api/auth/login' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const { email, password } = body;

        if (!email || !password) {
          return errorResponse('Email e senha são obrigatórios.', 400, env);
        }

        const normalizedEmail = email.trim().toLowerCase();
        const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?')
          .bind(normalizedEmail)
          .first();

        if (!user) {
          return errorResponse('Email ou senha incorretos.', 401, env);
        }

        const { hash } = await hashPassword(password, user.salt);
        if (hash !== user.password_hash) {
          return errorResponse('Email ou senha incorretos.', 401, env);
        }

        const jwtSecret = env.JWT_SECRET || 'animelist-fallback-secret-key-change-in-prod';
        const token = await signJWT(
          { userId: user.id, email: user.email, name: user.name, exp: Math.floor(Date.now() / 1000) + (30 * 86400) },
          jwtSecret
        );

        return jsonResponse({
          message: 'Login realizado com sucesso!',
          user: { id: user.id, email: user.email, name: user.name },
          token,
        }, 200, env);
      }

      // GET /api/auth/me
      if (path === '/api/auth/me' && method === 'GET') {
        const session = await authenticateRequest(request, env);
        if (!session) {
          return errorResponse('Não autorizado ou sessão expirada.', 401, env);
        }

        const user = await env.DB.prepare('SELECT id, email, name, created_at FROM users WHERE id = ?')
          .bind(session.userId)
          .first();

        if (!user) return errorResponse('Usuário não encontrado.', 404, env);

        return jsonResponse({ user }, 200, env);
      }

      // =======================================================================
      // ANIMES CRUD & SYNC ROUTES
      // =======================================================================

      // Require auth for all animes routes
      if (path.startsWith('/api/animes')) {
        const session = await authenticateRequest(request, env);
        if (!session) {
          return errorResponse('Acesso restrito. Faça login para sincronizar.', 401, env);
        }

        const userId = session.userId;

        // GET /api/animes — List all animes
        if (path === '/api/animes' && method === 'GET') {
          const { results } = await env.DB.prepare(
            'SELECT * FROM animes WHERE user_id = ? ORDER BY updated_at DESC'
          ).bind(userId).all();

          const formatted = (results || []).map(row => ({
            id: row.id,
            title: row.title,
            originalTitle: row.original_title || '',
            coverImage: row.cover_image || '',
            bannerImage: row.banner_image || '',
            status: row.status || 'plan_to_watch',
            score: Number(row.score) || 0,
            currentEpisode: Number(row.current_episode) || 0,
            totalEpisodes: Number(row.total_episodes) || 0,
            season: row.season || '',
            year: row.year ? Number(row.year) : null,
            favorite: Boolean(row.favorite),
            genres: row.genres ? JSON.parse(row.genres) : [],
            synopsis: row.synopsis || '',
            generalNotes: row.general_notes || '',
            links: row.links_json ? JSON.parse(row.links_json) : [],
            episodesData: row.episodes_data_json ? JSON.parse(row.episodes_data_json) : {},
            updatedAt: row.updated_at,
          }));

          return jsonResponse({ animes: formatted, count: formatted.length }, 200, env);
        }

        // POST /api/animes/sync — Batch Sync
        if (path === '/api/animes/sync' && method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const clientAnimes = Array.isArray(body.animes) ? body.animes : [];

          if (clientAnimes.length > 0) {
            const now = new Date().toISOString();
            const statements = clientAnimes.map(a => {
              return env.DB.prepare(`
                INSERT INTO animes (
                  id, user_id, title, original_title, cover_image, banner_image,
                  status, score, current_episode, total_episodes, season, year,
                  favorite, genres, synopsis, general_notes, links_json, episodes_data_json, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id, user_id) DO UPDATE SET
                  title = excluded.title,
                  original_title = excluded.original_title,
                  cover_image = excluded.cover_image,
                  banner_image = excluded.banner_image,
                  status = excluded.status,
                  score = excluded.score,
                  current_episode = excluded.current_episode,
                  total_episodes = excluded.total_episodes,
                  season = excluded.season,
                  year = excluded.year,
                  favorite = excluded.favorite,
                  genres = excluded.genres,
                  synopsis = excluded.synopsis,
                  general_notes = excluded.general_notes,
                  links_json = excluded.links_json,
                  episodes_data_json = excluded.episodes_data_json,
                  updated_at = excluded.updated_at
              `).bind(
                a.id,
                userId,
                a.title || 'Sem título',
                a.originalTitle || '',
                a.coverImage || '',
                a.bannerImage || '',
                a.status || 'plan_to_watch',
                Number(a.score) || 0,
                Number(a.currentEpisode) || 0,
                Number(a.totalEpisodes) || 0,
                a.season || '',
                a.year ? Number(a.year) : null,
                a.favorite ? 1 : 0,
                JSON.stringify(a.genres || []),
                a.synopsis || '',
                a.generalNotes || '',
                JSON.stringify(a.links || []),
                JSON.stringify(a.episodesData || {}),
                a.updatedAt || now
              );
            });

            // Execute batch in D1
            await env.DB.batch(statements);
          }

          // Return merged latest state from D1
          const { results } = await env.DB.prepare(
            'SELECT * FROM animes WHERE user_id = ? ORDER BY updated_at DESC'
          ).bind(userId).all();

          const merged = (results || []).map(row => ({
            id: row.id,
            title: row.title,
            originalTitle: row.original_title || '',
            coverImage: row.cover_image || '',
            bannerImage: row.banner_image || '',
            status: row.status || 'plan_to_watch',
            score: Number(row.score) || 0,
            currentEpisode: Number(row.current_episode) || 0,
            totalEpisodes: Number(row.total_episodes) || 0,
            season: row.season || '',
            year: row.year ? Number(row.year) : null,
            favorite: Boolean(row.favorite),
            genres: row.genres ? JSON.parse(row.genres) : [],
            synopsis: row.synopsis || '',
            generalNotes: row.general_notes || '',
            links: row.links_json ? JSON.parse(row.links_json) : [],
            episodesData: row.episodes_data_json ? JSON.parse(row.episodes_data_json) : {},
            updatedAt: row.updated_at,
          }));

          return jsonResponse({
            message: 'Sincronização concluída com sucesso!',
            animes: merged,
            count: merged.length,
          }, 200, env);
        }

        // DELETE /api/animes/:id
        const animeIdMatch = path.match(/^\/api\/animes\/([^/]+)$/);
        if (animeIdMatch && method === 'DELETE') {
          const animeId = decodeURIComponent(animeIdMatch[1]);
          await env.DB.prepare('DELETE FROM animes WHERE id = ? AND user_id = ?')
            .bind(animeId, userId)
            .run();
          return jsonResponse({ message: 'Anime removido da nuvem.' }, 200, env);
        }
      }

      return errorResponse('Rota não encontrada.', 404, env);
    } catch (err) {
      console.error('API Error:', err);
      return errorResponse(`Erro interno no servidor: ${err.message}`, 500, env);
    }
  },
};

