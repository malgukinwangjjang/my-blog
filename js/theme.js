// 다크/라이트 모드 전환
// 초기 테마는 index.html <head>의 인라인 스크립트가 이미 적용해 둔다.

const STORAGE_KEY = 'theme';

function readStoredTheme() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch (e) {
    return null;
  }
}

function storeTheme(theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch (e) {
    // 저장할 수 없는 환경(사생활 보호 모드 등)에서는 이번 방문 동안만 유지한다.
  }
}

function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

function applyTheme(theme, button) {
  document.documentElement.setAttribute('data-theme', theme);
  if (button) {
    const isDark = theme === 'dark';
    button.setAttribute('aria-pressed', String(isDark));
    button.setAttribute('aria-label', isDark ? '라이트 모드로 전환' : '다크 모드로 전환');
    button.title = isDark ? '라이트 모드로 전환' : '다크 모드로 전환';
  }
}

export function initThemeToggle() {
  const button = document.querySelector('.theme-toggle');
  applyTheme(currentTheme(), button);

  if (button) {
    button.addEventListener('click', () => {
      const next = currentTheme() === 'dark' ? 'light' : 'dark';
      applyTheme(next, button);
      storeTheme(next);
    });
  }

  // 사용자가 직접 고른 적이 없으면 OS 설정 변경을 따라간다.
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener('change', (event) => {
    if (!readStoredTheme()) {
      applyTheme(event.matches ? 'dark' : 'light', button);
    }
  });
}
