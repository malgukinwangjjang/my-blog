// 라우팅, 데이터 불러오기, 화면 렌더링
import { parseMarkdown, escapeHtml } from './markdown.js';
import { initThemeToggle } from './theme.js';
import { renderEditor, checkWriteApi } from './editor.js';
import { renderPixelEditor } from './pixel.js';

const SITE_TITLE = 'My Blog';
const SITE_DESCRIPTION = '마크다운으로 쓰는 기록';
const SLUG_PATTERN = /^[a-z0-9-]+$/;

const app = document.getElementById('app');
let postsPromise = null;
let renderToken = 0;
let leaveCurrent = null; // 현재 화면을 떠날 때 실행할 정리 함수 (글쓰기 화면)

// ------------------------------------------------------------
// 데이터
// ------------------------------------------------------------

function loadPosts() {
  if (!postsPromise) {
    postsPromise = fetch('posts/index.json', { cache: 'no-cache' })
      .then((res) => {
        if (!res.ok) throw new Error(`글 목록을 불러오지 못했습니다 (${res.status})`);
        return res.json();
      })
      .then((posts) => posts
        .filter((post) => post && SLUG_PATTERN.test(post.slug))
        .sort((a, b) => String(b.date).localeCompare(String(a.date))))
      .catch((err) => {
        postsPromise = null; // 다음 시도에서 다시 불러오도록
        throw err;
      });
  }
  return postsPromise;
}

async function loadPostSource(slug) {
  const res = await fetch(`posts/${slug}.md`, { cache: 'no-cache' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`글을 불러오지 못했습니다 (${res.status})`);
  return res.text();
}

// ------------------------------------------------------------
// 도우미
// ------------------------------------------------------------

function formatDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  if (!match) return escapeHtml(value || '');
  return `${match[1]}년 ${Number(match[2])}월 ${Number(match[3])}일`;
}

function readingMinutes(html) {
  const text = html.replace(/<[^>]+>/g, '').replace(/\s+/g, '');
  return Math.max(1, Math.round(text.length / 500)); // 한국어 기준 분당 약 500자
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function tagHref(tag) {
  return `#/tag/${encodeURIComponent(tag)}`;
}

function renderTags(tags) {
  const list = toArray(tags);
  if (!list.length) return '';
  const items = list
    .map((tag) => `<li><a class="tag" href="${tagHref(tag)}">#${escapeHtml(tag)}</a></li>`)
    .join('');
  return `<ul class="tag-list" aria-label="태그">${items}</ul>`;
}

function renderMeta(date, extra = '') {
  const time = date ? `<time datetime="${escapeHtml(date)}">${formatDate(date)}</time>` : '';
  return `<div class="post-meta">${time}${extra}</div>`;
}

function setTitle(title) {
  document.title = title ? `${title} | ${SITE_TITLE}` : SITE_TITLE;
}

function showError(err) {
  app.innerHTML = `
    <div class="error" role="alert">
      <p>${escapeHtml(err.message || '알 수 없는 오류가 발생했습니다.')}</p>
      <p>로컬에서 열었다면 <code>node serve.js</code>로 서버를 실행했는지 확인하세요.</p>
    </div>`;
}

// ------------------------------------------------------------
// 화면
// ------------------------------------------------------------

function renderPostList(posts, heading, description) {
  const items = posts.map((post) => `
    <li class="post-item">
      <article>
        <h2 class="post-item-title"><a href="#/post/${post.slug}">${escapeHtml(post.title || post.slug)}</a></h2>
        ${renderMeta(post.date)}
        ${post.description ? `<p class="post-item-desc">${escapeHtml(post.description)}</p>` : ''}
        ${renderTags(post.tags)}
      </article>
    </li>`).join('');

  return `
    <section class="page-intro">
      <h1>${heading}</h1>
      ${description ? `<p>${description}</p>` : ''}
    </section>
    ${posts.length ? `<ul class="post-list">${items}</ul>` : '<p class="status">아직 글이 없습니다.</p>'}`;
}

async function showHome(token) {
  const posts = await loadPosts();
  if (token !== renderToken) return;
  setTitle('');
  app.innerHTML = renderPostList(posts, escapeHtml(SITE_TITLE), escapeHtml(SITE_DESCRIPTION));
}

async function showTag(tag, token) {
  const posts = await loadPosts();
  if (token !== renderToken) return;
  const filtered = posts.filter((post) => toArray(post.tags).includes(tag));
  setTitle(`#${tag}`);
  app.innerHTML = `
    ${renderPostList(filtered, `#${escapeHtml(tag)}`, `글 ${filtered.length}개`)}
    <p class="post-footer"><a class="back-link" href="#/">← 전체 글 보기</a></p>`;
}

function showNotFound() {
  setTitle('찾을 수 없음');
  app.innerHTML = `
    <section class="page-intro">
      <h1>글을 찾을 수 없습니다</h1>
      <p>주소가 바뀌었거나 삭제된 글일 수 있어요.</p>
    </section>
    <a class="back-link" href="#/">← 목록으로 돌아가기</a>`;
}

async function showPost(slug, token) {
  if (!SLUG_PATTERN.test(slug)) {
    showNotFound();
    return;
  }

  const [posts, source, canWrite] = await Promise.all([loadPosts(), loadPostSource(slug), checkWriteApi()]);
  if (token !== renderToken) return;
  if (source === null) {
    showNotFound();
    return;
  }

  const { meta, html } = parseMarkdown(source);
  const index = posts.findIndex((post) => post.slug === slug);
  const entry = posts[index] || {};
  const title = meta.title || entry.title || slug;
  const date = meta.date || entry.date;
  const tags = meta.tags || entry.tags;

  // 목록은 최신순이므로 index+1이 이전(더 오래된) 글, index-1이 다음(더 최근) 글
  const older = index >= 0 ? posts[index + 1] : null;
  const newer = index > 0 ? posts[index - 1] : null;
  const navLink = (post, label, cls) => (post
    ? `<a class="${cls}" href="#/post/${post.slug}"><span class="post-nav-label">${label}</span>${escapeHtml(post.title || post.slug)}</a>`
    : '');

  setTitle(title);
  app.innerHTML = `
    <article class="post">
      <header class="post-header">
        <h1 class="post-title">${escapeHtml(title)}</h1>
        ${renderMeta(date, `<span>${readingMinutes(html)}분 분량</span>`)}
        ${renderTags(tags)}
      </header>
      <div class="post-content">${html}</div>
    </article>
    ${older || newer ? `<nav class="post-nav" aria-label="이전·다음 글">
      ${navLink(older, '← 이전 글', 'post-nav-prev')}
      ${navLink(newer, '다음 글 →', 'post-nav-next')}
    </nav>` : ''}
    <p class="post-footer">
      <a class="back-link" href="#/">← 목록으로 돌아가기</a>
      ${canWrite ? `<a class="back-link" href="#/write/${slug}">글 수정</a>` : ''}
    </p>`;
}

async function showWrite(slug, token) {
  if (slug !== null && !SLUG_PATTERN.test(slug)) {
    showNotFound();
    return;
  }

  const [apiAvailable, source] = await Promise.all([
    checkWriteApi(),
    slug ? loadPostSource(slug) : Promise.resolve(null),
  ]);
  if (token !== renderToken) return;
  if (slug && source === null) {
    showNotFound();
    return;
  }

  setTitle(slug ? '글 수정' : '새 글 쓰기');
  leaveCurrent = renderEditor({
    app,
    slug,
    source,
    apiAvailable,
    onSaved(savedSlug) {
      postsPromise = null; // 목록을 다시 불러오도록
      location.hash = `#/post/${savedSlug}`;
    },
  });
}

// ------------------------------------------------------------
// 라우터
// ------------------------------------------------------------

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch (e) {
    return value;
  }
}

async function route() {
  const hash = location.hash;

  // '#/'로 시작하지 않는 해시는 페이지 안의 앵커(제목 링크, 본문 건너뛰기)로 취급한다.
  if (hash && !hash.startsWith('#/')) {
    const target = document.getElementById(safeDecode(hash.slice(1)));
    if (target) {
      if (!app.dataset.rendered) {
        // 앵커만 있는 주소로 처음 들어온 경우 목록부터 그린다.
        await renderRoute('#/');
      }
      target.scrollIntoView();
      if (target === app) app.focus({ preventScroll: true });
      return;
    }
  }

  await renderRoute(hash);
  window.scrollTo(0, 0);
}

async function renderRoute(hash) {
  const token = ++renderToken;
  const path = hash.replace(/^#\/?/, '');
  const [section, ...rest] = path.split('/');
  const param = safeDecode(rest.join('/'));

  if (leaveCurrent) {
    leaveCurrent();
    leaveCurrent = null;
  }

  try {
    if (section === '' && !param) {
      await showHome(token);
    } else if (section === 'post' && param) {
      await showPost(param, token);
    } else if (section === 'tag' && param) {
      await showTag(param, token);
    } else if (section === 'write') {
      await showWrite(param || null, token);
    } else if (section === 'pixel' && !param) {
      setTitle('픽셀 아트');
      leaveCurrent = renderPixelEditor({ app });
    } else {
      showNotFound();
    }
  } catch (err) {
    if (token === renderToken) {
      setTitle('오류');
      showError(err);
    }
  }
  app.dataset.rendered = 'true';
}

initThemeToggle();

// 저장 서버(node serve.js)로 열었을 때만 헤더에 글쓰기 링크를 보여준다.
checkWriteApi().then((available) => {
  const link = document.querySelector('.write-link');
  if (link) link.hidden = !available;
});

window.addEventListener('hashchange', route);
route();
