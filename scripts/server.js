/* ==========================================================================
   Servidor Estático Local Blindado em Node.js (Segurança e Zero Dependências)
   - Restrito a 127.0.0.1 (Loopback local, inacessível pela rede externa/LAN)
   - Headers de proteção (CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy)
   - Bloqueio rígido contra Directory Traversal e acesso a arquivos ocultos/.git/scripts
   - Whitelist estrita de extensões estáticas permitidas
   ========================================================================== */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const ROOT_DIR = path.resolve(__dirname, '..');

// Whitelist rigorosa de extensões públicas permitidas
const ALLOWED_MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

// Arquivos e pastas expressamente proibidos de serem servidos via web
const FORBIDDEN_PATTERNS = [
  /^\./,              // Arquivos/pastas ocultos (.git, .gitignore, .env, etc.)
  /\.(vbs|ps1|bat|sh|exe|cmd)$/i, // Scripts do sistema
  /node_modules/i
];

const server = http.createServer((req, res) => {
  // Apenas métodos seguros de leitura
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('405 Método Não Permitido');
    return;
  }

  // Headers de Segurança HTTP
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self'; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data: https:; " +
    "connect-src 'self' https://api.jikan.moe https://kitsu.io; " +
    "object-src 'none'; " +
    "base-uri 'self'; " +
    "frame-ancestors 'none';"
  );

  // Parse e normalização segura do caminho
  let reqPath;
  try {
    reqPath = decodeURI(req.url.split('?')[0]);
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('400 Requisição Inválida');
    return;
  }

  if (reqPath === '/' || reqPath === '') {
    reqPath = '/index.html';
  }

  // Proteção contra Directory Traversal
  const safeRelative = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
  const resolvedPath = path.resolve(ROOT_DIR, '.' + safeRelative);

  // Garantir que o caminho resolvido está estritamente dentro da raiz do projeto
  const relFromRoot = path.relative(ROOT_DIR, resolvedPath);
  if (relFromRoot.startsWith('..') || path.isAbsolute(relFromRoot)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Acesso Negado');
    return;
  }

  // Verificar se há segmentos proibidos no caminho
  const segments = relFromRoot.split(/[\\\/]/);
  for (const seg of segments) {
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(seg)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('403 Arquivo Restrito');
        return;
      }
    }
  }

  fs.stat(resolvedPath, (err, stats) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Não Encontrado');
      return;
    }

    if (stats.isDirectory()) {
      const indexFile = path.join(resolvedPath, 'index.html');
      if (fs.existsSync(indexFile)) {
        serveFile(indexFile, res);
      } else {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('403 Proibido');
      }
      return;
    }

    serveFile(resolvedPath, res);
  });
});

function serveFile(filePath, res) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = ALLOWED_MIME_TYPES[ext];

  // Se a extensão não está na whitelist permitida, rejeita
  if (!contentType) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Tipo de arquivo restrito');
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('500 Erro Interno');
      return;
    }

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache'
    });
    res.end(content);
  });
}

// Vincula apenas a 127.0.0.1 (segurança total contra conexões externas)
server.listen(PORT, '127.0.0.1', () => {
  console.log(`[AnimeList Seguro] Servidor local ativo em http://127.0.0.1:${PORT}`);
});
