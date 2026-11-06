// 2048 퍼즐 게임: 방향키(또는 WASD, 스와이프)로 타일을 밀어 같은 숫자를 합친다.
// 게임 규칙은 DOM 없이 테스트할 수 있는 순수 함수로 두고, 화면 그리기는 renderGame이 맡는다.

export const SIZE = 4;
export const WIN_VALUE = 2048;

const BEST_KEY = 'game2048:best';
const STATE_KEY = 'game2048:state';
const DIRECTIONS = ['up', 'down', 'left', 'right'];
const KEY_TO_DIRECTION = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
};
const DIRECTION_LABEL = { up: '위', down: '아래', left: '왼쪽', right: '오른쪽' };
const SWIPE_MIN = 24; // 스와이프로 인정할 최소 이동 거리(px)

// ------------------------------------------------------------
// 게임 규칙 (순수 함수)
// ------------------------------------------------------------

export function createEmptyBoard() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
}

function cloneBoard(board) {
  return board.map((row) => row.slice());
}

export function emptyCells(board) {
  const cells = [];
  board.forEach((row, r) => row.forEach((value, c) => {
    if (!value) cells.push([r, c]);
  }));
  return cells;
}

// 빈 칸 하나에 2(90%) 또는 4(10%)를 놓는다. 놓은 위치를 함께 돌려준다.
export function addRandomTile(board, random = Math.random) {
  const cells = emptyCells(board);
  if (!cells.length) return { board, cell: null };
  const next = cloneBoard(board);
  const [r, c] = cells[Math.floor(random() * cells.length)];
  next[r][c] = random() < 0.9 ? 2 : 4;
  return { board: next, cell: [r, c] };
}

// 한 줄을 앞쪽(인덱스 0)으로 민다. 한 번 합쳐진 타일은 같은 이동에서 다시 합치지 않는다.
export function slideLine(line) {
  const values = line.filter(Boolean);
  const result = [];
  const merged = [];
  let gained = 0;

  for (let i = 0; i < values.length; i += 1) {
    if (values[i] === values[i + 1]) {
      const sum = values[i] * 2;
      merged.push(result.length);
      result.push(sum);
      gained += sum;
      i += 1;
    } else {
      result.push(values[i]);
    }
  }
  while (result.length < line.length) result.push(0);
  return { line: result, gained, merged };
}

// 방향별로 각 줄을 이루는 칸 좌표 목록. 첫 칸이 타일이 밀려가는 쪽이다.
function linesFor(direction) {
  const lines = [];
  for (let i = 0; i < SIZE; i += 1) {
    const line = [];
    for (let j = 0; j < SIZE; j += 1) {
      if (direction === 'left') line.push([i, j]);
      else if (direction === 'right') line.push([i, SIZE - 1 - j]);
      else if (direction === 'up') line.push([j, i]);
      else line.push([SIZE - 1 - j, i]);
    }
    lines.push(line);
  }
  return lines;
}

// 보드를 한 방향으로 민다. 원본은 바꾸지 않는다.
export function move(board, direction) {
  const next = createEmptyBoard();
  const mergedCells = [];
  let gained = 0;
  let moved = false;

  linesFor(direction).forEach((coords) => {
    const original = coords.map(([r, c]) => board[r][c]);
    const result = slideLine(original);
    gained += result.gained;
    coords.forEach(([r, c], k) => {
      next[r][c] = result.line[k];
      if (result.line[k] !== original[k]) moved = true;
    });
    result.merged.forEach((k) => mergedCells.push(coords[k]));
  });

  return { board: next, gained, moved, mergedCells };
}

export function canMove(board) {
  return DIRECTIONS.some((direction) => move(board, direction).moved);
}

export function maxTile(board) {
  return Math.max(...board.flat());
}

export function newGameBoard(random = Math.random) {
  const first = addRandomTile(createEmptyBoard(), random);
  return addRandomTile(first.board, random).board;
}

// ------------------------------------------------------------
// 저장
// ------------------------------------------------------------

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function writeValue(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    // 저장할 수 없는 환경에서는 이번 방문 동안만 유지한다.
  }
}

function isValidBoard(board) {
  return Array.isArray(board) && board.length === SIZE && board.every((row) => (
    Array.isArray(row) && row.length === SIZE
    && row.every((v) => Number.isInteger(v) && v >= 0 && (v === 0 || (v & (v - 1)) === 0))
  ));
}

function loadState() {
  const saved = readJson(STATE_KEY);
  if (!saved || !isValidBoard(saved.board) || !Number.isInteger(saved.score) || saved.score < 0) {
    return null;
  }
  return { board: saved.board, score: saved.score, keepPlaying: Boolean(saved.keepPlaying) };
}

// ------------------------------------------------------------
// 화면
// ------------------------------------------------------------

function tileClass(value) {
  return value > WIN_VALUE ? 'tile tile-super' : `tile tile-${value}`;
}

// 게임 화면을 그리고, 화면을 떠날 때 실행할 정리 함수를 돌려준다.
export function renderGame({ app }) {
  const restored = loadState();
  const state = {
    board: restored ? restored.board : newGameBoard(),
    score: restored ? restored.score : 0,
    best: Math.max(Number(readJson(BEST_KEY)) || 0, restored ? restored.score : 0),
    keepPlaying: restored ? restored.keepPlaying : false,
    status: 'playing', // playing | won | over
  };

  app.innerHTML = `
    <section class="game" aria-labelledby="game-title">
      <div class="game-head">
        <div>
          <h1 id="game-title" class="game-title">2048</h1>
          <p class="game-help">방향키나 WASD, 스와이프로 타일을 밀어 같은 숫자를 합치세요. <strong>2048</strong> 타일을 만들면 승리!</p>
        </div>
        <div class="game-scores">
          <div class="score-box">
            <span class="score-label">점수</span>
            <span class="score-value" data-score>0</span>
            <span class="score-gain" data-gain aria-hidden="true"></span>
          </div>
          <div class="score-box">
            <span class="score-label">최고 점수</span>
            <span class="score-value" data-best>0</span>
          </div>
        </div>
      </div>
      <div class="game-toolbar">
        <button class="game-button" type="button" data-new>새 게임</button>
      </div>
      <div class="game-board-wrap">
        <div class="game-board" role="grid" aria-label="2048 게임판" tabindex="0" data-board></div>
        <div class="game-overlay" data-overlay hidden>
          <p class="game-overlay-title" data-overlay-title></p>
          <div class="game-overlay-actions">
            <button class="game-button" type="button" data-continue hidden>계속하기</button>
            <button class="game-button" type="button" data-retry>다시 하기</button>
          </div>
        </div>
      </div>
      <p class="visually-hidden" aria-live="polite" data-announce></p>
    </section>`;

  const boardEl = app.querySelector('[data-board]');
  const scoreEl = app.querySelector('[data-score]');
  const bestEl = app.querySelector('[data-best]');
  const gainEl = app.querySelector('[data-gain]');
  const overlayEl = app.querySelector('[data-overlay]');
  const overlayTitleEl = app.querySelector('[data-overlay-title]');
  const continueBtn = app.querySelector('[data-continue]');
  const announceEl = app.querySelector('[data-announce]');

  // 셀 16개를 한 번만 만들고 이후에는 값과 클래스만 바꾼다.
  const cells = [];
  for (let r = 0; r < SIZE; r += 1) {
    const rowEl = document.createElement('div');
    rowEl.className = 'game-row';
    rowEl.setAttribute('role', 'row');
    cells.push([]);
    for (let c = 0; c < SIZE; c += 1) {
      const cell = document.createElement('div');
      cell.className = 'game-cell';
      cell.setAttribute('role', 'gridcell');
      rowEl.appendChild(cell);
      cells[r].push(cell);
    }
    boardEl.appendChild(rowEl);
  }

  function draw({ added = null, merged = [] } = {}) {
    const mergedKeys = new Set(merged.map(([r, c]) => `${r},${c}`));
    state.board.forEach((row, r) => row.forEach((value, c) => {
      const cell = cells[r][c];
      cell.textContent = '';
      cell.setAttribute('aria-label', value ? String(value) : '빈 칸');
      if (!value) return;
      const tile = document.createElement('span');
      tile.className = tileClass(value);
      if (value >= 1024) tile.classList.add('tile-small-text');
      if (added && added[0] === r && added[1] === c) tile.classList.add('tile-new');
      if (mergedKeys.has(`${r},${c}`)) tile.classList.add('tile-merged');
      tile.textContent = value;
      cell.appendChild(tile);
    }));

    scoreEl.textContent = state.score.toLocaleString('ko-KR');
    bestEl.textContent = state.best.toLocaleString('ko-KR');

    if (state.status === 'playing') {
      overlayEl.hidden = true;
    } else {
      overlayEl.hidden = false;
      overlayEl.dataset.status = state.status;
      overlayTitleEl.textContent = state.status === 'won' ? '2048 달성! 🎉' : '게임 오버';
      continueBtn.hidden = state.status !== 'won';
    }
  }

  function showGain(amount) {
    gainEl.textContent = '';
    if (!amount) return;
    // 같은 요소를 다시 쓰면서 애니메이션을 다시 시작하려고 강제로 리플로를 일으킨다.
    void gainEl.offsetWidth;
    gainEl.textContent = `+${amount}`;
  }

  function save() {
    writeValue(STATE_KEY, state.status === 'over'
      ? null
      : { board: state.board, score: state.score, keepPlaying: state.keepPlaying });
    writeValue(BEST_KEY, state.best);
  }

  function updateStatus() {
    if (!state.keepPlaying && maxTile(state.board) >= WIN_VALUE) state.status = 'won';
    else if (!canMove(state.board)) state.status = 'over';
    else state.status = 'playing';
  }

  function play(direction) {
    if (state.status !== 'playing') return;
    const result = move(state.board, direction);
    if (!result.moved) return;

    const spawned = addRandomTile(result.board);
    state.board = spawned.board;
    state.score += result.gained;
    state.best = Math.max(state.best, state.score);
    updateStatus();
    save();
    draw({ added: spawned.cell, merged: result.mergedCells });
    showGain(result.gained);

    if (state.status === 'won') announceEl.textContent = `2048을 만들었습니다! 점수 ${state.score}점.`;
    else if (state.status === 'over') announceEl.textContent = `더 움직일 수 없습니다. 최종 점수 ${state.score}점.`;
    else announceEl.textContent = `${DIRECTION_LABEL[direction]}으로 이동, 점수 ${state.score}점.`;
  }

  function newGame() {
    state.board = newGameBoard();
    state.score = 0;
    state.keepPlaying = false;
    state.status = 'playing';
    save();
    draw();
    showGain(0);
    announceEl.textContent = '새 게임을 시작했습니다.';
    boardEl.focus({ preventScroll: true });
  }

  // 키보드: 입력창에 포커스가 있거나 보조 키를 누른 경우에는 가로채지 않는다.
  function onKeyDown(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target;
    if (target && target.closest && target.closest('input, textarea, select, [contenteditable="true"]')) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const direction = KEY_TO_DIRECTION[key];
    if (!direction) return;
    event.preventDefault();
    play(direction);
  }

  // 터치 스와이프
  let touchStart = null;
  function onTouchStart(event) {
    if (event.touches.length !== 1) {
      touchStart = null;
      return;
    }
    touchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }
  function onTouchEnd(event) {
    if (!touchStart) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStart.x;
    const dy = touch.clientY - touchStart.y;
    touchStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) return;
    if (Math.abs(dx) > Math.abs(dy)) play(dx > 0 ? 'right' : 'left');
    else play(dy > 0 ? 'down' : 'up');
  }

  app.querySelector('[data-new]').addEventListener('click', newGame);
  app.querySelector('[data-retry]').addEventListener('click', newGame);
  continueBtn.addEventListener('click', () => {
    state.keepPlaying = true;
    updateStatus();
    save();
    draw();
    boardEl.focus({ preventScroll: true });
  });
  boardEl.addEventListener('touchstart', onTouchStart, { passive: true });
  boardEl.addEventListener('touchend', onTouchEnd);
  document.addEventListener('keydown', onKeyDown);

  updateStatus();
  draw();

  return () => {
    document.removeEventListener('keydown', onKeyDown);
  };
}
