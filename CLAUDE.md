# CLAUDE.md

이 파일은 Claude Code가 이 저장소에서 작업할 때 따르는 지침이다.

## 프로젝트 개요

마크다운(`.md`) 파일로 쓴 글을 읽어 블로그 웹사이트로 보여주는 정적 사이트.

- **프레임워크·빌드 도구 없이** 순수 HTML, CSS, JavaScript(ES 모듈)만 사용한다.
- React, Vue, Tailwind, Bootstrap, jQuery, 번들러(Vite, Webpack 등), npm 의존성을 추가하지 않는다.
- 마크다운 파서도 외부 라이브러리 없이 직접 구현한다(`js/markdown.js`).
- 디자인 목표: **깔끔하고 읽기 좋게**, **다크 모드 지원**, **모바일 우선 반응형**.

## 디렉터리 구조

```
My_Blog/
├── index.html          # 단일 진입점 (글 목록 + 글 본문을 해시 라우팅으로 렌더링)
├── serve.js            # 로컬 정적 서버 + 글 저장 API(/api/*, localhost 요청만 허용). Node 내장 모듈만 사용
├── css/
│   └── style.css       # 전체 스타일 (CSS 변수 기반 테마)
├── js/
│   ├── app.js          # 라우팅, 데이터 로딩, 화면 렌더링
│   ├── editor.js       # 글쓰기 화면 (폼, 미리보기, 임시 저장, 저장/내려받기)
│   ├── markdown.js     # 마크다운 → HTML 변환기 (front matter 파싱 포함)
│   └── theme.js        # 다크/라이트 모드 전환
├── posts/
│   ├── index.json      # 글 목록 매니페스트 (브라우저는 폴더 목록을 읽을 수 없으므로 필요)
│   └── *.md            # 블로그 글
└── images/             # 글에 쓰는 이미지
```

## 실행 방법

`fetch()`는 `file://`에서 동작하지 않으므로 반드시 로컬 서버로 연다.

```bash
node serve.js
```

브라우저에서 `http://localhost:8000` 접속. `serve.js`는 Node 내장 모듈만 쓰는 확인용 서버로, npm 설치가 필요 없다(이 PC에는 Python이 없다). Python이 있는 환경에서는 `python -m http.server 8000`도 된다. 배포 시에는 `serve.js` 없이 정적 파일만 올리면 된다.

## 글 작성 규칙

### 파일 이름
`posts/YYYY-MM-DD-slug.md` 형식. slug는 영문 소문자와 하이픈만 사용한다 (예: `2026-11-06-hello-world.md`).

### Front matter
모든 글은 맨 위에 YAML 형식 front matter를 둔다.

```markdown
---
title: 첫 번째 글
date: 2026-11-06
tags: [일상, 개발]
description: 목록과 메타 태그에 쓰이는 한두 문장 요약
---

본문은 여기부터...
```

### 매니페스트 갱신
글을 추가·삭제·수정하면 **반드시 `posts/index.json`도 함께 갱신**한다. 날짜 내림차순으로 정렬한다.

```json
[
  {
    "slug": "2026-11-06-hello-world",
    "title": "첫 번째 글",
    "date": "2026-11-06",
    "tags": ["일상", "개발"],
    "description": "목록과 메타 태그에 쓰이는 한두 문장 요약"
  }
]
```

## 라우팅

해시 기반 단일 페이지 방식을 사용한다 (서버 설정 없이 GitHub Pages 등 어디서나 동작).

| 해시 | 화면 |
|------|------|
| `#/` 또는 빈 해시 | 글 목록 |
| `#/post/<slug>` | 글 본문 |
| `#/tag/<태그>` | 태그별 글 목록 |
| `#/write` | 새 글 쓰기 |
| `#/write/<slug>` | 글 수정 |

### 글쓰기 화면
- `node serve.js`로 열면 `/api/status`가 응답하므로 헤더의 "글쓰기" 링크와 글의 "글 수정" 링크가 보이고, 저장 시 `POST /api/posts`가 `.md` 파일과 `posts/index.json`을 함께 갱신한다(날짜를 바꿔 slug가 달라지면 이전 파일을 지운다).
- 저장 API가 없는 배포 환경에서는 링크를 숨기고, `#/write`로 직접 들어오면 `.md` 내려받기와 매니페스트 항목 안내로 대체한다.
- 입력 중인 내용은 `localStorage`의 `draft:new` / `draft:<slug>` 키에 임시 저장한다.
- 저장 API는 localhost에서 온 요청, 같은 Origin, `Content-Type: application/json`만 받는다.

존재하지 않는 글이면 "글을 찾을 수 없습니다" 화면과 목록으로 돌아가는 링크를 보여준다. 페이지 전환 시 `document.title`을 갱신하고 스크롤을 맨 위로 올린다.

## 마크다운 파서 (`js/markdown.js`)

지원 범위 (이 범위를 넘는 기능은 필요할 때만 추가):

- 제목 `#`~`######` (본문 내 `h2`·`h3`에는 앵커용 `id` 부여)
- 문단, 줄바꿈, 수평선 `---`
- **굵게**, *기울임*, ~~취소선~~, `인라인 코드`
- 링크 `[text](url)`, 이미지 `![alt](src)` (이미지는 `loading="lazy"`)
- 순서 있는/없는 목록 (한 단계 중첩), 체크리스트 `- [ ]`
- 인용문 `>`
- 펜스 코드 블록 ```` ```lang ```` (언어명을 `class="language-xxx"`로 출력)
- 표 (GFM 파이프 테이블)

**보안 규칙**: 원문 텍스트는 항상 HTML 이스케이프한 뒤 마크다운 문법만 태그로 변환한다. 링크 URL은 `http:`, `https:`, `mailto:`, 상대 경로만 허용하고 `javascript:` 등은 제거한다. 사용자 콘텐츠를 이스케이프 없이 `innerHTML`에 넣지 않는다.

파서는 순수 함수(`parseMarkdown(text) → { meta, html }`)로 유지해 DOM 없이도 테스트할 수 있게 한다.

## 디자인 가이드

### 가독성
- 본문 최대 너비 `42rem`(한글 한 줄 약 40자), 가운데 정렬. `ch` 단위는 요소별 글자 크기에 따라 폭이 달라지므로 레이아웃 폭에 쓰지 않는다.
- 본문 글자 크기 `1.0625rem`(17px) 이상, `line-height: 1.75`.
- 한글 줄바꿈: `word-break: keep-all; overflow-wrap: break-word;`
- 폰트 스택: `-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif` / 코드: `ui-monospace, "SF Mono", Consolas, monospace`
- 웹폰트를 쓸 경우 Google Fonts 한 종류까지만, `font-display: swap`.
- 장식보다 여백과 타이포그래피로 위계를 만든다. 그림자·그라데이션·애니메이션은 최소화.

### 색상과 테마
- 모든 색은 `:root`의 CSS 변수로 정의하고 컴포넌트에서는 변수만 참조한다 (하드코딩 금지).
- 필수 변수 예: `--bg`, `--surface`, `--text`, `--text-muted`, `--border`, `--accent`, `--code-bg`.
- 라이트·다크 모두 본문 대비 WCAG AA(4.5:1) 이상.

### 다크 모드
- 기본값은 OS 설정(`prefers-color-scheme`)을 따른다.
- 헤더의 토글 버튼으로 수동 전환하며, 선택값은 `localStorage`(`theme` 키)에 저장한다. `localStorage` 접근은 `try/catch`로 감싼다.
- 테마는 `<html data-theme="light|dark">`로 적용한다.
- **깜빡임 방지**: 테마를 결정하는 작은 인라인 스크립트를 `<head>`에서 CSS보다 먼저 실행한다.
- 토글 버튼에는 `aria-label`과 현재 상태(`aria-pressed`)를 둔다.

### 반응형 (모바일 우선)
- 기본 스타일을 모바일 기준으로 작성하고 `min-width` 미디어 쿼리로 확장한다. 브레이크포인트: `640px`, `1024px`.
- 좌우 여백 최소 `16px`, 가로 스크롤이 생기지 않아야 한다.
- 코드 블록과 표는 자체 가로 스크롤(`overflow-x: auto`)로 처리하고 페이지 전체가 밀리지 않게 한다.
- 이미지: `max-width: 100%; height: auto;`
- 터치 대상(버튼, 링크 영역)은 최소 `44×44px`.
- `<meta name="viewport" content="width=device-width, initial-scale=1">` 필수.

### 접근성
- 시맨틱 태그 사용: `header`, `nav`, `main`, `article`, `footer`, `time datetime="..."`.
- 키보드 포커스 표시(`:focus-visible`)를 지우지 않는다.
- `prefers-reduced-motion`이면 전환 효과를 끈다.

## 코드 스타일

- JavaScript: ES2020+, `<script type="module">`, `const`/`let`만 사용, 세미콜론 사용, 들여쓰기 2칸.
- 전역 변수를 만들지 않는다. 모듈별로 필요한 함수만 `export`.
- 비동기는 `async/await`, `fetch` 실패 시 사용자에게 오류 메시지를 보여준다.
- CSS: 클래스 이름은 소문자-하이픈(`post-list`, `post-meta`), `!important` 사용 금지.
- HTML/CSS/JS 파일은 UTF-8, 줄 끝 LF.
- 주석과 UI 문구는 한국어로 작성한다.

## 작업 시 확인 사항

변경 후에는 로컬 서버로 열어 다음을 확인한다.

1. 글 목록과 글 본문이 정상 렌더링되는가
2. 라이트/다크 모드 전환과 새로고침 후 유지, 새로고침 시 깜빡임이 없는가
3. 모바일 폭(375px)에서 가로 스크롤 없이 읽기 좋은가
4. 브라우저 콘솔에 오류가 없는가
