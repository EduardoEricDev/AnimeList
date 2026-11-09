-- ==============================================================================
-- AnimeList Database Schema (Cloudflare D1 / SQLite)
-- ==============================================================================

-- 1. Tabela de Usuários
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL COLLATE NOCASE,
    name TEXT,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabela de Sessões (Tokens JWT ou Tokens de Acesso)
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 3. Tabela de Animes do Catálogo do Usuário
CREATE TABLE IF NOT EXISTS animes (
    id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    original_title TEXT,
    cover_image TEXT,
    banner_image TEXT,
    status TEXT DEFAULT 'plan_to_watch',
    score INTEGER DEFAULT 0,
    current_episode INTEGER DEFAULT 0,
    total_episodes INTEGER DEFAULT 0,
    season TEXT,
    year INTEGER,
    favorite INTEGER DEFAULT 0,
    genres TEXT,               -- Array JSON: ["Ação", "Fantasia"]
    synopsis TEXT,
    general_notes TEXT,
    links_json TEXT,           -- Array JSON: [{"id": "...", "title": "...", "url": "..."}]
    episodes_data_json TEXT,   -- Objeto JSON: {"1": {"watched": true, "note": "..."}}
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id, user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Índices otimizados para consultas na borda (Edge)
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_animes_user_status ON animes(user_id, status);
CREATE INDEX IF NOT EXISTS idx_animes_user_favorite ON animes(user_id, favorite);
CREATE INDEX IF NOT EXISTS idx_animes_user_updated ON animes(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

