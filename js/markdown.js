// 마크다운 → HTML 변환기 (외부 라이브러리 없음)
// 원문은 항상 HTML 이스케이프한 뒤 마크다운 문법만 태그로 바꾼다.
// DOM을 쓰지 않는 순수 함수라서 브라우저 밖에서도 테스트할 수 있다.

const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

// ------------------------------------------------------------
// Front matter
// ------------------------------------------------------------

function parseValue(raw) {
  const value = raw.trim();
  const list = /^\[(.*)\]$/.exec(value);
  if (list) {
    return list[1]
      .split(',')
      .map((item) => stripQuotes(item.trim()))
      .filter(Boolean);
  }
  return stripQuotes(value);
}

function stripQuotes(value) {
  const quoted = /^(["'])(.*)\1$/.exec(value);
  return quoted ? quoted[2] : value;
}

export function parseFrontMatter(text) {
  const source = normalize(text);
  const match = /^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(source);
  if (!match) {
    return { meta: {}, body: source };
  }

  const meta = {};
  for (const line of match[1].split('\n')) {
    const pair = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (pair) {
      meta[pair[1]] = parseValue(pair[2]);
    }
  }
  return { meta, body: source.slice(match[0].length) };
}

function normalize(text) {
  return String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
}

// ------------------------------------------------------------
// 인라인 문법
// ------------------------------------------------------------

const ALLOWED_SCHEMES = ['http', 'https', 'mailto'];

// 이스케이프된 URL을 받아 허용된 형태면 그대로, 아니면 '#'을 돌려준다.
function safeUrl(escapedUrl) {
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(escapedUrl.trim());
  if (scheme && !ALLOWED_SCHEMES.includes(scheme[1].toLowerCase())) {
    return '#';
  }
  return escapedUrl;
}

function isExternal(url) {
  return /^https?:\/\//i.test(url);
}

function applyEmphasis(text) {
  return text
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^A-Za-z0-9_])__(?=\S)([\s\S]*?\S)__(?![A-Za-z0-9_])/g, '$1<strong>$2</strong>')
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>')
    .replace(/\*(?=\S)([\s\S]*?\S)\*/g, '<em>$1</em>')
    .replace(/(^|[^A-Za-z0-9_])_(?=\S)([\s\S]*?\S)_(?![A-Za-z0-9_])/g, '$1<em>$2</em>');
}

const LINE_BREAK = '\u0001';

export function parseInline(text) {
  const stash = [];
  const keep = (html) => `\u0000${stash.push(html) - 1}\u0000`;

  let s = text;

  // 1) 인라인 코드: 안쪽은 다른 문법(백슬래시 포함)을 적용하지 않는다
  s = s.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (_, ticks, code) => keep(`<code>${escapeHtml(code.trim())}</code>`));

  // 2) 백슬래시 이스케이프: \* 처럼 쓰면 문자 그대로 출력
  s = s.replace(/\\([\\`*_{}[\]()#+\-.!|~>])/g, (_, ch) => keep(escapeHtml(ch)));

  // 3) 나머지 전체 이스케이프
  s = escapeHtml(s);

  // 4) 이미지 ![alt](src "title")
  s = s.replace(/!\[([^\]]*)\]\(((?:[^()\s]|\([^()\s]*\))+)(?:\s+&quot;(.*?)&quot;)?\)/g, (_, alt, src, title) => {
    const titleAttr = title ? ` title="${title}"` : '';
    return keep(`<img src="${safeUrl(src)}" alt="${alt}"${titleAttr} loading="lazy" decoding="async">`);
  });

  // 5) 링크 [text](url "title")
  s = s.replace(/\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)(?:\s+&quot;(.*?)&quot;)?\)/g, (_, label, href, title) => {
    const url = safeUrl(href);
    const titleAttr = title ? ` title="${title}"` : '';
    const target = isExternal(url) ? ' target="_blank" rel="noopener noreferrer"' : '';
    return keep(`<a href="${url}"${titleAttr}${target}>${applyEmphasis(label)}</a>`);
  });

  // 6) 자동 링크 <https://example.com>
  s = s.replace(/&lt;(https?:\/\/[^\s&]+(?:&amp;[^\s&]+)*)&gt;/g, (_, url) =>
    keep(`<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`),
  );

  // 7) 강조
  s = applyEmphasis(s);

  // 8) 보관해 둔 조각 복원 (링크 안에 코드가 있는 경우처럼 중첩될 수 있음)
  for (let guard = 0; guard < 5 && s.includes('\u0000'); guard += 1) {
    s = s.replace(/\u0000(\d+)\u0000/g, (_, n) => stash[Number(n)]);
  }

  return s.split(LINE_BREAK).join('<br>');
}

// ------------------------------------------------------------
// 블록 문법
// ------------------------------------------------------------

const RE = {
  blank: /^\s*$/,
  fence: /^ {0,3}(`{3,}|~{3,})\s*([\w+#.-]*)\s*$/,
  heading: /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/,
  hr: /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/,
  quote: /^ {0,3}>/,
  listItem: /^( *)([-*+]|\d{1,9}[.)])\s+(.*)$/,
  tableSep: /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/,
};

function indentOf(line) {
  return line.length - line.trimStart().length;
}

function isTableStart(lines, i) {
  return lines[i].includes('|') && i + 1 < lines.length && RE.tableSep.test(lines[i + 1]) && lines[i + 1].includes('-');
}

function startsBlock(lines, i) {
  const line = lines[i];
  return (
    RE.fence.test(line) ||
    RE.heading.test(line) ||
    RE.hr.test(line) ||
    RE.quote.test(line) ||
    (RE.listItem.test(line) && indentOf(line) < 4) ||
    isTableStart(lines, i)
  );
}

function slugify(text) {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z0-9#]+;/gi, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
}

function splitRow(line) {
  let row = line.trim();
  if (row.startsWith('|')) row = row.slice(1);
  if (row.endsWith('|') && !row.endsWith('\\|')) row = row.slice(0, -1);
  return row.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, '|'));
}

function cellAlign(spec) {
  const left = spec.startsWith(':');
  const right = spec.endsWith(':');
  if (left && right) return 'center';
  if (right) return 'right';
  if (left) return 'left';
  return '';
}

function parseList(lines, start, ctx) {
  const first = RE.listItem.exec(lines[start]);
  const baseIndent = first[1].length;
  const ordered = /\d/.test(first[2]);
  const items = [];
  let i = start;
  let current = null;
  let prevBlank = false;

  while (i < lines.length) {
    const line = lines[i];
    const marker = RE.listItem.exec(line);

    if (RE.blank.test(line)) {
      prevBlank = true;
      if (current) current.children.push('');
      i += 1;
      continue;
    }

    const indent = indentOf(line);

    if (marker && indent <= baseIndent + 1 && /\d/.test(marker[2]) === ordered) {
      // 같은 단계의 새 항목
      current = { text: [marker[3]], children: [] };
      items.push(current);
    } else if (current && indent >= baseIndent + 2) {
      // 들여쓴 줄: 하위 블록(중첩 목록, 코드 등)
      current.children.push(line);
    } else if (current && !prevBlank && !startsBlock(lines, i)) {
      // 들여쓰지 않은 이어지는 줄
      if (current.children.every((c) => c === '')) {
        current.text.push(line.trim());
      } else {
        current.children.push(line);
      }
    } else {
      break;
    }

    prevBlank = false;
    i += 1;
  }

  const hasTasks = items.some((item) => /^\[[ xX]\]\s/.test(item.text[0]));
  const tag = ordered ? 'ol' : 'ul';
  const startNum = ordered ? parseInt(first[2], 10) : 1;
  const attrs = [
    hasTasks ? ' class="task-list"' : '',
    ordered && startNum !== 1 ? ` start="${startNum}"` : '',
  ].join('');

  const html = items.map((item) => {
    let text = item.text.join('\n');
    let checkbox = '';
    const task = /^\[([ xX])\]\s+/.exec(text);
    if (task) {
      checkbox = `<input type="checkbox" disabled${task[1] === ' ' ? '' : ' checked'}> `;
      text = text.slice(task[0].length);
    }

    while (item.children.length && item.children[item.children.length - 1] === '') {
      item.children.pop();
    }
    let childHtml = '';
    if (item.children.length) {
      const minIndent = Math.min(...item.children.filter((c) => c !== '').map(indentOf));
      const dedented = item.children.map((c) => c.slice(minIndent));
      childHtml = parseBlocks(dedented, ctx);
    }
    return `<li>${checkbox}${parseInline(text)}${childHtml}</li>`;
  });

  return { html: `<${tag}${attrs}>${html.join('')}</${tag}>`, next: i };
}

function parseBlocks(lines, ctx) {
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (RE.blank.test(line)) {
      i += 1;
      continue;
    }

    // 펜스 코드 블록
    const fence = RE.fence.exec(line);
    if (fence) {
      const closer = fence[1];
      const code = [];
      i += 1;
      while (i < lines.length && !(lines[i].trim().startsWith(closer[0].repeat(closer.length)) && lines[i].trim().replace(/[`~]/g, '') === '')) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1; // 닫는 펜스 건너뛰기
      const lang = fence[2] ? ` class="language-${escapeHtml(fence[2])}"` : '';
      out.push(`<pre><code${lang}>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }

    // 제목
    const heading = RE.heading.exec(line);
    if (heading) {
      const level = heading[1].length;
      const content = parseInline(heading[2]);
      let idAttr = '';
      if (level === 2 || level === 3) {
        const base = slugify(content) || 'section';
        const count = ctx.ids.get(base) || 0;
        ctx.ids.set(base, count + 1);
        idAttr = ` id="${count ? `${base}-${count}` : base}"`;
      }
      out.push(`<h${level}${idAttr}>${content}</h${level}>`);
      i += 1;
      continue;
    }

    // 수평선
    if (RE.hr.test(line)) {
      out.push('<hr>');
      i += 1;
      continue;
    }

    // 인용문
    if (RE.quote.test(line)) {
      const inner = [];
      while (i < lines.length && RE.quote.test(lines[i])) {
        inner.push(lines[i].replace(/^ {0,3}> ?/, ''));
        i += 1;
      }
      out.push(`<blockquote>${parseBlocks(inner, ctx)}</blockquote>`);
      continue;
    }

    // 목록
    if (RE.listItem.test(line) && indentOf(line) < 4) {
      const list = parseList(lines, i, ctx);
      out.push(list.html);
      i = list.next;
      continue;
    }

    // 표
    if (isTableStart(lines, i)) {
      const header = splitRow(lines[i]);
      const aligns = splitRow(lines[i + 1]).map(cellAlign);
      const alignAttr = (col) => (aligns[col] ? ` style="text-align:${aligns[col]}"` : '');
      i += 2;
      const rows = [];
      while (i < lines.length && !RE.blank.test(lines[i]) && lines[i].includes('|')) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      const thead = header.map((cell, col) => `<th${alignAttr(col)}>${parseInline(cell)}</th>`).join('');
      const tbody = rows
        .map((row) => `<tr>${header.map((_, col) => `<td${alignAttr(col)}>${parseInline(row[col] || '')}</td>`).join('')}</tr>`)
        .join('');
      out.push(`<div class="table-wrap"><table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table></div>`);
      continue;
    }

    // 문단
    const para = [];
    while (i < lines.length && !RE.blank.test(lines[i]) && (para.length === 0 || !startsBlock(lines, i))) {
      para.push(lines[i]);
      i += 1;
    }
    const text = para
      .map((l, idx) => {
        const isLast = idx === para.length - 1;
        if (!isLast && / {2,}$/.test(l)) return l.trimEnd() + LINE_BREAK;
        if (!isLast && /\\$/.test(l)) return l.slice(0, -1) + LINE_BREAK;
        return l.trim();
      })
      .join('\n');
    out.push(`<p>${parseInline(text)}</p>`);
  }

  return out.join('\n');
}

// ------------------------------------------------------------
// 공개 API
// ------------------------------------------------------------

export function parseMarkdown(text) {
  const { meta, body } = parseFrontMatter(text);
  const ctx = { ids: new Map() };
  const html = parseBlocks(body.split('\n'), ctx);
  return { meta, html };
}
