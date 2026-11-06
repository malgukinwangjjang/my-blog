// 로컬 확인용 정적 파일 서버 (Node 내장 모듈만 사용, npm 설치 불필요)
// 사용법: node serve.js [포트]   → http://localhost:8000
// 글쓰기 화면의 저장 API(/api/*)도 제공한다. 이 컴퓨터(localhost)에서 온 요청만 받는다.
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const postsDir = path.join(root, 'posts');
const manifestPath = path.join(postsDir, 'index.json');
const port = Number(process.argv[2] || 8000);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

const SLUG_PATTERN = /^[a-z0-9-]+$/;
const POST_SLUG_PATTERN = /^(\d{4}-\d{2}-\d{2})-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_BODY_BYTES = 1024 * 1024;
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

// ------------------------------------------------------------
// 저장 API
// ------------------------------------------------------------

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(data));
}

// 다른 컴퓨터나 다른 사이트(CSRF, DNS 리바인딩)에서 온 요청을 막는다.
function isTrustedRequest(req) {
  if (!LOOPBACK.has(req.socket.remoteAddress)) return false;
  const host = req.headers.host || '';
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)) return false;
  const origin = req.headers.origin;
  if (origin && origin !== `http://${host}`) return false;
  return true;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('글이 너무 큽니다 (최대 1MB).'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function validatePayload(data) {
  if (!data || typeof data !== 'object') throw badRequest('요청 형식이 올바르지 않습니다.');
  const { slug, originalSlug, markdown, entry } = data;

  const slugMatch = POST_SLUG_PATTERN.exec(String(slug || ''));
  if (!slugMatch) throw badRequest('주소(slug) 형식이 올바르지 않습니다.');
  if (originalSlug != null && !SLUG_PATTERN.test(String(originalSlug))) {
    throw badRequest('원래 글 주소가 올바르지 않습니다.');
  }
  if (typeof markdown !== 'string') throw badRequest('본문이 없습니다.');
  if (!entry || typeof entry !== 'object') throw badRequest('글 정보가 없습니다.');
  if (typeof entry.title !== 'string' || !entry.title.trim()) throw badRequest('제목을 입력하세요.');
  if (!DATE_PATTERN.test(String(entry.date)) || entry.date !== slugMatch[1]) {
    throw badRequest('날짜가 올바르지 않습니다.');
  }
  if (!Array.isArray(entry.tags) || !entry.tags.every((tag) => typeof tag === 'string')) {
    throw badRequest('태그 형식이 올바르지 않습니다.');
  }
  if (typeof entry.description !== 'string') throw badRequest('요약 형식이 올바르지 않습니다.');

  return {
    slug,
    originalSlug: originalSlug || null,
    markdown: markdown.replace(/\r\n?/g, '\n'),
    entry: {
      slug,
      title: entry.title.trim(),
      date: entry.date,
      tags: entry.tags.map((tag) => tag.trim()).filter(Boolean),
      description: entry.description.trim(),
    },
  };
}

// 기존 index.json과 같은 모양(태그 배열은 한 줄)으로 출력한다.
function formatManifest(list) {
  if (!list.length) return '[]\n';
  const q = (value) => JSON.stringify(value);
  const entries = list.map((post) => [
    '  {',
    `    "slug": ${q(post.slug)},`,
    `    "title": ${q(post.title)},`,
    `    "date": ${q(post.date)},`,
    `    "tags": [${(post.tags || []).map(q).join(', ')}],`,
    `    "description": ${q(post.description || '')}`,
    '  }',
  ].join('\n'));
  return `[\n${entries.join(',\n')}\n]\n`;
}

async function readManifest() {
  try {
    const list = JSON.parse(await fs.promises.readFile(manifestPath, 'utf8'));
    return Array.isArray(list) ? list : [];
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function fileExists(file) {
  try {
    await fs.promises.access(file);
    return true;
  } catch (e) {
    return false;
  }
}

async function savePost(req, res) {
  if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) {
    sendJson(res, 415, { error: 'JSON 요청만 받습니다.' });
    return;
  }

  let payload;
  try {
    payload = validatePayload(JSON.parse(await readBody(req)));
  } catch (err) {
    sendJson(res, err.status || 400, { error: err instanceof SyntaxError ? '요청 형식이 올바르지 않습니다.' : err.message });
    return;
  }

  const { slug, originalSlug, markdown, entry } = payload;
  const target = path.join(postsDir, `${slug}.md`);
  const renamed = originalSlug && originalSlug !== slug;

  if ((!originalSlug || renamed) && await fileExists(target)) {
    sendJson(res, 409, { error: '같은 주소의 글이 이미 있습니다. 주소(slug)를 바꿔 주세요.' });
    return;
  }

  const manifest = await readManifest();
  const next = manifest
    .filter((post) => post && post.slug !== slug && post.slug !== originalSlug)
    .concat(entry)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.slug).localeCompare(String(a.slug)));

  await fs.promises.writeFile(target, markdown.endsWith('\n') ? markdown : `${markdown}\n`, 'utf8');
  await fs.promises.writeFile(manifestPath, formatManifest(next), 'utf8');
  if (renamed) {
    await fs.promises.rm(path.join(postsDir, `${originalSlug}.md`), { force: true });
  }

  console.log(`글 저장: posts/${slug}.md${renamed ? ` (이전: ${originalSlug}.md)` : ''}`);
  sendJson(res, 200, { ok: true, slug });
}

async function handleApi(req, res, urlPath) {
  if (!isTrustedRequest(req)) {
    sendJson(res, 403, { error: '이 컴퓨터에서만 글을 저장할 수 있습니다.' });
    return;
  }
  if (urlPath === '/api/status' && req.method === 'GET') {
    sendJson(res, 200, { writable: true });
    return;
  }
  if (urlPath === '/api/posts' && req.method === 'POST') {
    await savePost(req, res);
    return;
  }
  sendJson(res, 404, { error: '없는 API입니다.' });
}

// ------------------------------------------------------------
// 정적 파일
// ------------------------------------------------------------

function serveStatic(res, urlPath) {
  const file = path.join(root, urlPath === '/' ? 'index.html' : urlPath);
  // 프로젝트 폴더 밖의 파일은 내보내지 않는다.
  if (file !== root && !file.startsWith(root + path.sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(req.url.split('?')[0]);
  } catch (e) {
    res.writeHead(400);
    res.end('Bad request');
    return;
  }

  if (urlPath.startsWith('/api/')) {
    handleApi(req, res, urlPath).catch((err) => {
      console.error(err);
      if (!res.headersSent) sendJson(res, 500, { error: '서버에서 저장하지 못했습니다.' });
    });
    return;
  }

  serveStatic(res, urlPath);
}).listen(port, () => {
  console.log(`블로그 서버 실행 중: http://localhost:${port}`);
  console.log(`글쓰기: http://localhost:${port}/#/write`);
});
