// 글쓰기 화면: 입력 폼, 미리보기, 임시 저장, 저장(로컬 API) 또는 파일 내려받기
import { parseMarkdown, parseFrontMatter, escapeHtml } from './markdown.js';

const SLUG_PART_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const POST_SLUG_PATTERN = /^(\d{4}-\d{2}-\d{2})-([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DRAFT_PREFIX = 'draft:';
const FIELDS = ['title', 'date', 'slug', 'tags', 'description', 'body'];

// ------------------------------------------------------------
// 로컬 저장 API 확인 (node serve.js로 열었을 때만 있음)
// ------------------------------------------------------------

let apiStatusPromise = null;

export function checkWriteApi() {
  if (!apiStatusPromise) {
    apiStatusPromise = fetch('api/status', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => Boolean(data && data.writable))
      .catch(() => false);
  }
  return apiStatusPromise;
}

// ------------------------------------------------------------
// 순수 함수 (DOM 없이 테스트 가능)
// ------------------------------------------------------------

export function parseTags(text) {
  const tags = String(text || '')
    .split(/[,，]/)
    .map((tag) => tag.trim().replace(/^#+/, '').replace(/[[\]]/g, '').trim())
    .filter(Boolean);
  return [...new Set(tags)];
}

// front matter 값은 한 줄로 만들고, 따옴표·대괄호로 시작하면 따옴표로 감싼다.
function frontMatterValue(value) {
  const line = String(value || '').replace(/\s*[\r\n]+\s*/g, ' ').trim();
  return /^["'[]/.test(line) || /["']$/.test(line) ? `"${line}"` : line;
}

export function buildPostSource({ title, date, tags, description, body }) {
  const lines = [
    '---',
    `title: ${frontMatterValue(title)}`,
    `date: ${date}`,
    `tags: [${tags.join(', ')}]`,
  ];
  if (description.trim()) lines.push(`description: ${frontMatterValue(description)}`);
  lines.push('---', '', String(body || '').replace(/\r\n?/g, '\n').replace(/^\n+/, '').trimEnd(), '');
  return lines.join('\n');
}

export function suggestSlug(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
}

function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fieldsFromSource(slug, source) {
  const { meta, body } = parseFrontMatter(source);
  const match = POST_SLUG_PATTERN.exec(slug) || [];
  const tags = Array.isArray(meta.tags) ? meta.tags : (meta.tags ? [meta.tags] : []);
  return {
    title: meta.title || '',
    date: DATE_PATTERN.test(meta.date || '') ? meta.date : (match[1] || today()),
    slug: match[2] || slug,
    tags: tags.join(', '),
    description: meta.description || '',
    body: body.replace(/^\n+/, ''),
  };
}

function sameFields(a, b) {
  return FIELDS.every((key) => (a[key] || '') === (b[key] || ''));
}

// ------------------------------------------------------------
// 임시 저장 (localStorage)
// ------------------------------------------------------------

function readDraft(key) {
  try {
    const raw = localStorage.getItem(key);
    const data = raw ? JSON.parse(raw) : null;
    return data && typeof data === 'object' ? data : null;
  } catch (e) {
    return null;
  }
}

function writeDraft(key, fields) {
  try {
    localStorage.setItem(key, JSON.stringify(fields));
    return true;
  } catch (e) {
    return false;
  }
}

function removeDraft(key) {
  try {
    localStorage.removeItem(key);
  } catch (e) {
    // 저장소를 쓸 수 없는 환경이면 무시한다.
  }
}

// ------------------------------------------------------------
// 화면
// ------------------------------------------------------------

function template({ editing, slug, apiAvailable }) {
  const cancelHref = editing ? `#/post/${slug}` : '#/';
  return `
    <section class="page-intro">
      <h1>${editing ? '글 수정' : '새 글 쓰기'}</h1>
      <p>${apiAvailable
        ? '저장하면 <code>posts/</code> 폴더와 <code>index.json</code>에 바로 반영됩니다.'
        : '저장 서버가 없어 <code>.md</code> 파일로 내려받습니다. <code>node serve.js</code>로 열면 바로 저장할 수 있어요.'}</p>
    </section>

    <div class="notice" data-ref="draft-notice" hidden>
      <span>임시 저장된 내용을 불러왔어요.</span>
      <button type="button" class="link-button" data-action="discard">임시 저장 버리기</button>
    </div>

    <form class="editor" novalidate>
      <div class="field">
        <label for="f-title">제목</label>
        <input id="f-title" name="title" type="text" class="input" required autocomplete="off">
      </div>

      <div class="field-row">
        <div class="field">
          <label for="f-date">날짜</label>
          <input id="f-date" name="date" type="date" class="input" required>
        </div>
        <div class="field">
          <label for="f-slug">주소 (slug)</label>
          <input id="f-slug" name="slug" type="text" class="input" required
            placeholder="my-first-post" autocomplete="off" autocapitalize="off" spellcheck="false"
            aria-describedby="f-slug-hint">
          <p class="field-hint" id="f-slug-hint">영문 소문자, 숫자, 하이픈만 · <code data-ref="filename"></code></p>
        </div>
      </div>

      <div class="field">
        <label for="f-tags">태그</label>
        <input id="f-tags" name="tags" type="text" class="input" placeholder="일상, 개발"
          autocomplete="off" aria-describedby="f-tags-hint">
        <p class="field-hint" id="f-tags-hint">쉼표로 구분합니다.</p>
      </div>

      <div class="field">
        <label for="f-description">요약</label>
        <textarea id="f-description" name="description" class="input" rows="2"
          aria-describedby="f-description-hint"></textarea>
        <p class="field-hint" id="f-description-hint">글 목록과 검색 결과에 보이는 한두 문장입니다.</p>
      </div>

      <div class="field">
        <div class="editor-body-head">
          <label for="f-body">본문 (마크다운)</label>
          <div class="editor-tabs" role="group" aria-label="보기 전환">
            <button type="button" class="tab-button" data-view="write" aria-pressed="true">작성</button>
            <button type="button" class="tab-button" data-view="preview" aria-pressed="false">미리보기</button>
          </div>
        </div>
        <textarea id="f-body" name="body" class="input editor-body" rows="18"></textarea>
        <div class="editor-preview" data-ref="preview" hidden></div>
      </div>

      <p class="form-message" data-ref="message" role="alert"></p>

      <div class="editor-actions">
        <button type="submit" class="button button-primary">${apiAvailable ? '저장' : '.md 내려받기'}</button>
        <a class="button" href="${cancelHref}">취소</a>
        <span class="save-state" data-ref="state" aria-live="polite"></span>
      </div>

      <div class="export-panel" data-ref="export" hidden>
        <p>내려받은 파일을 <code>posts/</code> 폴더에 넣고, <code>posts/index.json</code>에 아래 항목을 추가하세요 (날짜 내림차순).</p>
        <pre><code data-ref="entry"></code></pre>
        <button type="button" class="button" data-action="copy">항목 복사</button>
      </div>
    </form>`;
}

/**
 * 글쓰기 화면을 그린다. 화면을 떠날 때 호출할 정리 함수를 돌려준다.
 * @param {object} options
 * @param {HTMLElement} options.app      그릴 영역
 * @param {string|null} options.slug     수정할 글의 slug (새 글이면 null)
 * @param {string|null} options.source   수정할 글의 원문
 * @param {boolean} options.apiAvailable 로컬 저장 API 사용 가능 여부
 * @param {(slug: string) => void} options.onSaved 저장 성공 시 호출
 */
export function renderEditor({ app, slug, source, apiAvailable, onSaved }) {
  const editing = Boolean(slug);
  const draftKey = DRAFT_PREFIX + (slug || 'new');
  const initial = editing
    ? fieldsFromSource(slug, source)
    : { title: '', date: today(), slug: '', tags: '', description: '', body: '' };

  app.innerHTML = template({ editing, slug, apiAvailable });

  const form = app.querySelector('form');
  const ref = (name) => app.querySelector(`[data-ref="${name}"]`);
  const inputs = Object.fromEntries(FIELDS.map((key) => [key, form.elements[key]]));
  const preview = ref('preview');
  const message = ref('message');
  const state = ref('state');
  const draftNotice = ref('draft-notice');
  const submitButton = form.querySelector('[type="submit"]');

  let dirty = false;
  let saving = false;
  let draftTimer = 0;
  let slugTouched = editing;

  const readFields = () => Object.fromEntries(FIELDS.map((key) => [key, inputs[key].value]));
  const fillFields = (fields) => {
    FIELDS.forEach((key) => { inputs[key].value = fields[key] || ''; });
    updateFilename();
  };

  function fullSlug() {
    return `${inputs.date.value}-${inputs.slug.value.trim()}`;
  }

  function updateFilename() {
    const part = inputs.slug.value.trim() || 'slug';
    ref('filename').textContent = `posts/${inputs.date.value || 'YYYY-MM-DD'}-${part}.md`;
  }

  function renderPreview() {
    const { html } = parseMarkdown(inputs.body.value);
    const title = inputs.title.value.trim() || '(제목 없음)';
    preview.innerHTML = `
      <h1 class="post-title">${escapeHtml(title)}</h1>
      <div class="post-content">${html || '<p class="status">본문이 비어 있습니다.</p>'}</div>`;
  }

  function setView(view) {
    const showPreview = view === 'preview';
    if (showPreview) renderPreview();
    preview.hidden = !showPreview;
    inputs.body.hidden = showPreview;
    form.querySelectorAll('[data-view]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.view === view));
    });
  }

  function flushDraft() {
    clearTimeout(draftTimer);
    draftTimer = 0;
    if (!dirty) return;
    const fields = readFields();
    if (sameFields(fields, initial)) {
      removeDraft(draftKey);
      state.textContent = '';
    } else if (writeDraft(draftKey, fields)) {
      state.textContent = '임시 저장됨';
    }
  }

  function markDirty() {
    dirty = true;
    state.textContent = '';
    clearTimeout(draftTimer);
    draftTimer = setTimeout(flushDraft, 600);
  }

  function clearErrors() {
    message.textContent = '';
    FIELDS.forEach((key) => inputs[key].removeAttribute('aria-invalid'));
  }

  function validate() {
    const errors = [];
    if (!inputs.title.value.trim()) errors.push(['title', '제목을 입력하세요.']);
    if (!DATE_PATTERN.test(inputs.date.value)) errors.push(['date', '날짜를 입력하세요.']);
    if (!SLUG_PART_PATTERN.test(inputs.slug.value.trim())) {
      errors.push(['slug', '주소는 영문 소문자, 숫자, 하이픈(-)으로만 쓰고 하이픈으로 시작·끝나지 않아야 합니다.']);
    }
    if (!inputs.body.value.trim()) errors.push(['body', '본문을 입력하세요.']);
    return errors;
  }

  function showErrors(errors) {
    errors.forEach(([key]) => inputs[key].setAttribute('aria-invalid', 'true'));
    message.textContent = errors.map(([, text]) => text).join(' ');
    const first = inputs[errors[0][0]];
    if (first === inputs.body) setView('write');
    first.focus();
  }

  function collect() {
    const tags = parseTags(inputs.tags.value);
    const fields = {
      title: inputs.title.value.trim(),
      date: inputs.date.value,
      tags,
      description: inputs.description.value.replace(/\s*[\r\n]+\s*/g, ' ').trim(),
      body: inputs.body.value,
    };
    const newSlug = fullSlug();
    return {
      slug: newSlug,
      markdown: buildPostSource(fields),
      entry: { slug: newSlug, title: fields.title, date: fields.date, tags, description: fields.description },
    };
  }

  function finishSaved() {
    dirty = false;
    clearTimeout(draftTimer);
    removeDraft(draftKey);
  }

  async function saveToServer(post) {
    const res = await fetch('api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...post, originalSlug: slug }),
    });
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      // 응답이 JSON이 아니면 아래에서 일반 오류로 처리한다.
    }
    if (!res.ok) throw new Error((data && data.error) || `저장하지 못했습니다 (${res.status})`);
    finishSaved();
    onSaved(post.slug);
  }

  function downloadFile(post) {
    const blob = new Blob([post.markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${post.slug}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    ref('entry').textContent = JSON.stringify(post.entry, null, 2);
    ref('export').hidden = false;
    state.textContent = `${post.slug}.md 파일을 내려받았어요.`;
    finishSaved();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (saving) return;
    clearErrors();
    const errors = validate();
    if (errors.length) {
      showErrors(errors);
      return;
    }

    const post = collect();
    if (!apiAvailable) {
      downloadFile(post);
      return;
    }

    saving = true;
    submitButton.disabled = true;
    state.textContent = '저장 중…';
    try {
      await saveToServer(post);
    } catch (err) {
      state.textContent = '';
      message.textContent = err.message || '저장하지 못했습니다.';
      if (/주소/.test(message.textContent)) {
        inputs.slug.setAttribute('aria-invalid', 'true');
        inputs.slug.focus();
      }
    } finally {
      saving = false;
      submitButton.disabled = false;
    }
  }

  // ---- 이벤트 ----

  form.addEventListener('submit', handleSubmit);

  form.addEventListener('input', (event) => {
    const { target } = event;
    if (target === inputs.slug) slugTouched = true;
    if (target === inputs.title && !slugTouched) {
      inputs.slug.value = suggestSlug(inputs.title.value);
    }
    if (target.hasAttribute('aria-invalid')) target.removeAttribute('aria-invalid');
    if (target === inputs.slug || target === inputs.date || target === inputs.title) updateFilename();
    markDirty();
  });

  form.addEventListener('keydown', (event) => {
    // Ctrl+S / Cmd+S로 저장
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  form.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.view) setView(button.dataset.view);
    if (button.dataset.action === 'copy') {
      const text = ref('entry').textContent;
      navigator.clipboard?.writeText(text)
        .then(() => { state.textContent = '항목을 복사했어요.'; })
        .catch(() => { state.textContent = '복사하지 못했어요. 직접 선택해 복사하세요.'; });
    }
  });

  draftNotice.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="discard"]')) {
      removeDraft(draftKey);
      fillFields(initial);
      slugTouched = editing;
      dirty = false;
      state.textContent = '';
      draftNotice.hidden = true;
      if (!preview.hidden) renderPreview();
      inputs.title.focus();
    }
  });

  const onBeforeUnload = (event) => {
    if (!dirty) return;
    flushDraft();
    event.preventDefault();
    event.returnValue = '';
  };
  window.addEventListener('beforeunload', onBeforeUnload);

  // ---- 초기값 (임시 저장본이 있으면 우선) ----

  const draft = readDraft(draftKey);
  if (draft && !sameFields(draft, initial)) {
    fillFields({ ...initial, ...draft });
    slugTouched = true;
    draftNotice.hidden = false;
  } else {
    fillFields(initial);
  }
  inputs.title.focus({ preventScroll: true });

  // 다른 화면으로 이동할 때 호출된다. 입력 중인 내용은 임시 저장해 둔다.
  return function leave() {
    flushDraft();
    window.removeEventListener('beforeunload', onBeforeUnload);
  };
}
