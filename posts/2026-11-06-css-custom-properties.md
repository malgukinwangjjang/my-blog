---
title: CSS 변수(사용자 지정 속성) 기초
date: 2026-11-06
tags: [웹 기초, CSS]
description: 색이나 여백 같은 값을 CSS 변수로 한곳에 모아 두고 재사용하는 방법과, 이 블로그의 다크 모드가 변수로 동작하는 원리를 정리했습니다.
---

> 한 줄 요약: `--이름: 값;`으로 정의하고 `var(--이름)`으로 꺼내 쓰는, CSS 안의 **이름 붙은 값**이다.

## CSS 변수란?

같은 파란색 `#1f5fd6`을 링크, 버튼, 테두리 열 곳에 썼다고 해 봅시다. 색을 바꾸려면 열 곳을 모두 찾아 고쳐야 합니다. CSS 변수를 쓰면 값을 **한 번만 정의**하고 이름으로 불러 쓸 수 있어서, 바꿀 때도 한 곳만 고치면 됩니다.

정식 이름은 **사용자 지정 속성**(custom properties)입니다. 규칙은 간단합니다.

- 이름은 반드시 `--`로 시작합니다. 예: `--accent`, `--gutter`
- 이름은 **대소문자를 구분**합니다. `--Accent`와 `--accent`는 서로 다른 변수입니다.
- 값을 꺼낼 때는 `var(--이름)`을 씁니다.
- 일반 속성처럼 **상속**됩니다. 부모 요소에 정의하면 그 안의 자식 요소 모두가 쓸 수 있습니다.

## 정의하고 사용하기

보통은 문서 전체에서 쓰도록 `:root`(= `html` 요소)에 정의합니다. 이 블로그의 `css/style.css` 맨 위도 이렇게 시작합니다.

```css
:root {
  --bg: #ffffff;
  --text: #1f2328;
  --accent: #1f5fd6;
  --gutter: 16px;
  --radius: 8px;
  --content-width: 42rem;
}

body {
  background: var(--bg);
  color: var(--text);
}

a {
  color: var(--accent);
}
```

숫자 값도 변수로 둘 수 있고, `calc()` 안에서 계산에 섞어 쓸 수도 있습니다. 실제로 이 블로그의 본문 컨테이너는 이렇게 폭을 정합니다.

```css
.container {
  max-width: calc(var(--content-width) + var(--gutter) * 2);
  padding: 0 var(--gutter);
}
```

본문 폭(`42rem`)에 양쪽 여백(`16px` × 2)을 더한 값입니다. 여백을 바꾸고 싶으면 `--gutter` 한 줄만 고치면 폭 계산까지 함께 따라옵니다.

## 변수로 다크 모드 만들기

CSS 변수의 진짜 힘은 **선택자에 따라 같은 이름의 값을 다르게 줄 수 있다**는 점입니다. 이 블로그의 다크 모드가 바로 이 방식입니다.

```css
:root {
  --bg: #ffffff;
  --text: #1f2328;
}

:root[data-theme="dark"] {
  --bg: #131416;
  --text: #e4e6ea;
}
```

`html` 요소에 `data-theme="dark"` 속성이 붙으면 두 번째 규칙이 더 구체적이라 이기고, `--bg`와 `--text` 값이 바뀝니다. `body`는 여전히 `var(--bg)`만 참조하므로 **컴포넌트 스타일은 한 줄도 고치지 않고** 전체 색이 바뀝니다. JavaScript는 `data-theme` 속성만 바꿔 주면 됩니다.

변수는 `:root`가 아닌 다른 요소에도 정의할 수 있습니다. 그러면 그 요소와 자식에서만 값이 달라집니다.

```css
.card {
  --radius: 4px; /* 카드 안에서만 모서리를 더 각지게 */
  border-radius: var(--radius);
}
```

## 기본값(fallback) 주기

`var()`의 두 번째 인자로 기본값을 줄 수 있습니다. 변수가 **정의되어 있지 않을 때** 대신 쓰입니다.

```css
.note {
  color: var(--note-color, var(--text-muted));
  padding: var(--note-padding, 1rem);
}
```

## 자주 하는 실수와 팁

- **`--` 빼먹기**: `var(accent)`는 동작하지 않습니다. 반드시 `var(--accent)`처럼 씁니다.
- **단위 붙이기**: `--gap: 16;`으로 정의하고 `var(--gap)px`처럼 뒤에 단위를 붙이면 `16px`이 되지 않습니다. 처음부터 `--gap: 16px;`로 정의하거나, `calc(var(--gap) * 1px)`처럼 계산합니다.
- **기본값이 언제 쓰이는지 착각**: 기본값은 변수가 *없을 때*만 쓰입니다. 변수는 있는데 값이 그 속성에 맞지 않으면(예: `color`에 `16px`) 기본값 대신 그 속성이 상속값이나 초깃값으로 되돌아갑니다.
- **미디어 쿼리 조건에는 못 쓴다**: `@media (min-width: var(--bp))`는 동작하지 않습니다. 브레이크포인트는 숫자로 직접 씁니다.
- **JavaScript에서 읽고 쓰기**: 변수도 속성이라 JS로 다룰 수 있습니다.

```js
const root = document.documentElement;

// 읽기 (앞뒤 공백이 붙을 수 있어 trim)
const accent = getComputedStyle(root).getPropertyValue('--accent').trim();

// 쓰기
root.style.setProperty('--gutter', '24px');
```

- **이름은 역할로 짓기**: `--blue`보다 `--accent`가 좋습니다. 다크 모드에서 값이 하늘색으로 바뀌어도 이름이 어색해지지 않습니다.

## 마치며

CSS 변수는 "값에 이름을 붙인다"는 단순한 기능이지만, 덕분에 테마 전환이나 여백 조정처럼 여러 곳에 걸친 변경을 **한 곳에서** 할 수 있습니다. 이 블로그의 규칙대로 색은 모두 `:root`에 변수로 모으고, 컴포넌트에서는 변수만 참조하는 습관부터 들여 보세요.
