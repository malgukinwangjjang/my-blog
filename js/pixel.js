// 픽셀 아트 에디터: 16×16 격자에 도트를 찍고 PNG로 저장한다.

const SIZE = 16;
const CELL_COUNT = SIZE * SIZE;
const CANVAS_PX = 512; // 화면용 캔버스 내부 해상도 (CSS로 크기 조절)
const CELL_PX = CANVAS_PX / SIZE;
const DRAFT_KEY = 'pixel:draft';
const UNDO_LIMIT = 50;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

const PALETTE = [
  ['#000000', '검정'],
  ['#ffffff', '흰색'],
  ['#7f7f7f', '회색'],
  ['#c3c3c3', '밝은 회색'],
  ['#e53935', '빨강'],
  ['#fb8c00', '주황'],
  ['#fdd835', '노랑'],
  ['#9ccc65', '연두'],
  ['#2e7d32', '초록'],
  ['#4fc3f7', '하늘'],
  ['#1e88e5', '파랑'],
  ['#283593', '남색'],
  ['#8e24aa', '보라'],
  ['#f48fb1', '분홍'],
  ['#795548', '갈색'],
  ['#ffcc80', '살구'],
];

const TOOLS = [
  ['pen', '펜'],
  ['eraser', '지우개'],
  ['fill', '채우기'],
];

function loadDraft() {
  try {
    const data = JSON.parse(localStorage.getItem(DRAFT_KEY));
    if (Array.isArray(data) && data.length === CELL_COUNT
      && data.every((v) => v === null || (typeof v === 'string' && COLOR_PATTERN.test(v)))) {
      return data;
    }
  } catch (e) {
    // 저장소 접근 불가 또는 잘못된 값이면 빈 그림으로 시작
  }
  return new Array(CELL_COUNT).fill(null);
}

function saveDraft(pixels) {
  try {
    if (pixels.every((v) => v === null)) {
      localStorage.removeItem(DRAFT_KEY);
    } else {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(pixels));
    }
  } catch (e) {
    // 임시 저장 실패는 무시한다
  }
}

// 같은 색으로 이어진 영역을 새 색으로 바꾼다 (4방향 BFS)
function floodFill(pixels, start, color) {
  const target = pixels[start];
  if (target === color) return false;
  const queue = [start];
  pixels[start] = color;
  while (queue.length) {
    const index = queue.shift();
    const x = index % SIZE;
    const y = Math.floor(index / SIZE);
    const neighbors = [];
    if (x > 0) neighbors.push(index - 1);
    if (x < SIZE - 1) neighbors.push(index + 1);
    if (y > 0) neighbors.push(index - SIZE);
    if (y < SIZE - 1) neighbors.push(index + SIZE);
    for (const next of neighbors) {
      if (pixels[next] === target) {
        pixels[next] = color;
        queue.push(next);
      }
    }
  }
  return true;
}

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function exportPng(pixels, scale) {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE * scale;
  canvas.height = SIZE * scale;
  const ctx = canvas.getContext('2d');
  pixels.forEach((color, i) => {
    if (!color) return; // 빈 칸은 투명하게 둔다
    ctx.fillStyle = color;
    ctx.fillRect((i % SIZE) * scale, Math.floor(i / SIZE) * scale, scale, scale);
  });
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG를 만들지 못했습니다.'))), 'image/png');
  });
}

export function renderPixelEditor({ app }) {
  let pixels = loadDraft();
  let color = PALETTE[0][0];
  let tool = 'pen';
  let cursor = 0; // 키보드 커서 위치
  let showCursor = false;
  const undoStack = [];

  const swatches = PALETTE.map(([value, name]) => `
    <button type="button" class="swatch" data-color="${value}" style="background-color: ${value}"
      aria-label="${name}" aria-pressed="false" title="${name}"></button>`).join('');
  const toolButtons = TOOLS.map(([value, label]) => `
    <button type="button" class="tab-button" data-tool="${value}" aria-pressed="false">${label}</button>`).join('');

  app.innerHTML = `
    <section class="page-intro">
      <h1>픽셀 아트</h1>
      <p>16×16 격자에 도트를 찍어 그리고 PNG로 저장하세요. 그리던 그림은 이 브라우저에 자동으로 임시 저장됩니다.</p>
    </section>
    <div class="pixel-editor">
      <div class="pixel-stage">
        <canvas class="pixel-canvas" width="${CANVAS_PX}" height="${CANVAS_PX}" tabindex="0" role="img"
          aria-label="16×16 그림판. 화살표 키로 이동하고 스페이스나 엔터로 칠합니다."></canvas>
        <p class="field-hint">오른쪽 클릭은 지우개, Ctrl+Z는 실행 취소입니다.</p>
      </div>
      <div class="pixel-panel">
        <div class="pixel-group" role="group" aria-label="도구">${toolButtons}</div>
        <div class="pixel-group">
          <span class="pixel-current" aria-hidden="true"></span>
          <label class="pixel-custom">사용자 지정 색
            <input type="color" class="pixel-color-input" value="${color}">
          </label>
        </div>
        <div class="pixel-palette" role="group" aria-label="색상 팔레트">${swatches}</div>
        <div class="pixel-group">
          <button type="button" class="button" data-action="undo">실행 취소</button>
          <button type="button" class="button" data-action="clear">전체 지우기</button>
        </div>
        <div class="pixel-group">
          <label class="pixel-scale">크기
            <select class="input pixel-scale-select">
              <option value="1">16×16px</option>
              <option value="16" selected>256×256px</option>
              <option value="32">512×512px</option>
            </select>
          </label>
          <button type="button" class="button button-primary" data-action="download">PNG 저장</button>
        </div>
        <p class="form-message" role="alert"></p>
      </div>
    </div>`;

  const canvas = app.querySelector('.pixel-canvas');
  const ctx = canvas.getContext('2d');
  const colorInput = app.querySelector('.pixel-color-input');
  const currentSwatch = app.querySelector('.pixel-current');
  const undoButton = app.querySelector('[data-action="undo"]');
  const message = app.querySelector('.form-message');

  // ---------- 그리기 ----------

  function draw() {
    const style = getComputedStyle(document.documentElement);
    const checkA = style.getPropertyValue('--bg').trim();
    const checkB = style.getPropertyValue('--code-bg').trim();
    const gridColor = style.getPropertyValue('--border').trim();
    const accent = style.getPropertyValue('--accent').trim();
    const half = CELL_PX / 2;

    for (let i = 0; i < CELL_COUNT; i += 1) {
      const x = (i % SIZE) * CELL_PX;
      const y = Math.floor(i / SIZE) * CELL_PX;
      if (pixels[i]) {
        ctx.fillStyle = pixels[i];
        ctx.fillRect(x, y, CELL_PX, CELL_PX);
      } else {
        // 투명 칸은 체커보드로 표시
        ctx.fillStyle = checkA;
        ctx.fillRect(x, y, CELL_PX, CELL_PX);
        ctx.fillStyle = checkB;
        ctx.fillRect(x, y, half, half);
        ctx.fillRect(x + half, y + half, half, half);
      }
    }

    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let n = 0; n <= SIZE; n += 1) {
      const p = Math.min(n * CELL_PX + 0.5, CANVAS_PX - 0.5);
      ctx.moveTo(p, 0);
      ctx.lineTo(p, CANVAS_PX);
      ctx.moveTo(0, p);
      ctx.lineTo(CANVAS_PX, p);
    }
    ctx.stroke();

    if (showCursor) {
      ctx.strokeStyle = accent;
      ctx.lineWidth = 3;
      ctx.strokeRect((cursor % SIZE) * CELL_PX + 1.5, Math.floor(cursor / SIZE) * CELL_PX + 1.5, CELL_PX - 3, CELL_PX - 3);
    }
  }

  function updateControls() {
    app.querySelectorAll('[data-tool]').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.dataset.tool === tool));
    });
    app.querySelectorAll('.swatch').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.dataset.color === color));
    });
    currentSwatch.style.backgroundColor = color;
    colorInput.value = color;
    undoButton.disabled = undoStack.length === 0;
  }

  function pushUndo() {
    undoStack.push(pixels.slice());
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    undoButton.disabled = false;
  }

  function commit() {
    saveDraft(pixels);
    draw();
  }

  // 한 칸에 현재 도구를 적용한다. 바뀐 것이 있으면 true
  function applyAt(index, erase) {
    if (!erase && tool === 'fill') return floodFill(pixels, index, color);
    const value = erase || tool === 'eraser' ? null : color;
    if (pixels[index] === value) return false;
    pixels[index] = value;
    return true;
  }

  // ---------- 포인터 입력 ----------

  let stroke = null; // { erase, last, changed, snapshot }

  function indexFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * SIZE);
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * SIZE);
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return -1;
    return y * SIZE + x;
  }

  function onPointerDown(event) {
    if (event.button !== 0 && event.button !== 2) return;
    const index = indexFromEvent(event);
    if (index < 0) return;
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    showCursor = false;
    stroke = { erase: event.button === 2, last: index, snapshot: pixels.slice(), changed: false };
    stroke.changed = applyAt(index, stroke.erase);
    draw();
  }

  function onPointerMove(event) {
    if (!stroke || (!stroke.erase && tool === 'fill')) return;
    const index = indexFromEvent(event);
    if (index < 0 || index === stroke.last) return;
    stroke.last = index;
    if (applyAt(index, stroke.erase)) {
      stroke.changed = true;
      draw();
    }
  }

  function onPointerUp() {
    if (!stroke) return;
    if (stroke.changed) {
      undoStack.push(stroke.snapshot);
      if (undoStack.length > UNDO_LIMIT) undoStack.shift();
      undoButton.disabled = false;
      saveDraft(pixels);
    }
    stroke = null;
  }

  // ---------- 키보드 입력 ----------

  function onCanvasKey(event) {
    const x = cursor % SIZE;
    const y = Math.floor(cursor / SIZE);
    const moves = {
      ArrowLeft: [Math.max(0, x - 1), y],
      ArrowRight: [Math.min(SIZE - 1, x + 1), y],
      ArrowUp: [x, Math.max(0, y - 1)],
      ArrowDown: [x, Math.min(SIZE - 1, y + 1)],
    };
    if (moves[event.key]) {
      event.preventDefault();
      const [nx, ny] = moves[event.key];
      cursor = ny * SIZE + nx;
      showCursor = true;
      draw();
    } else if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      showCursor = true;
      const snapshot = pixels.slice();
      if (applyAt(cursor, false)) {
        undoStack.push(snapshot);
        if (undoStack.length > UNDO_LIMIT) undoStack.shift();
        undoButton.disabled = false;
        commit();
      }
    }
  }

  function undo() {
    if (!undoStack.length) return;
    pixels = undoStack.pop();
    undoButton.disabled = undoStack.length === 0;
    commit();
  }

  function onDocumentKey(event) {
    // 입력창에서의 Ctrl+Z는 브라우저 기본 동작에 맡긴다
    if (event.target.closest('input, textarea, select')) return;
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      undo();
    }
  }

  // ---------- 버튼 ----------

  async function download() {
    message.textContent = '';
    try {
      const scale = Number(app.querySelector('.pixel-scale-select').value) || 16;
      const blob = await exportPng(pixels, scale);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `pixel-art-${timestamp()}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      message.textContent = err.message || 'PNG를 저장하지 못했습니다.';
    }
  }

  function onClick(event) {
    const toolBtn = event.target.closest('[data-tool]');
    if (toolBtn) {
      tool = toolBtn.dataset.tool;
      updateControls();
      return;
    }
    const swatch = event.target.closest('.swatch');
    if (swatch) {
      color = swatch.dataset.color;
      if (tool === 'eraser') tool = 'pen';
      updateControls();
      return;
    }
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'undo') {
      undo();
    } else if (action === 'clear') {
      if (pixels.some((v) => v !== null) && window.confirm('그림을 모두 지울까요?')) {
        pushUndo();
        pixels = new Array(CELL_COUNT).fill(null);
        commit();
      }
    } else if (action === 'download') {
      download();
    }
  }

  function onColorInput() {
    if (!COLOR_PATTERN.test(colorInput.value)) return;
    color = colorInput.value.toLowerCase();
    if (tool === 'eraser') tool = 'pen';
    updateControls();
  }

  const onContextMenu = (event) => event.preventDefault();
  const onFocus = () => { showCursor = canvas.matches(':focus-visible'); draw(); };
  const onBlur = () => { showCursor = false; draw(); };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('contextmenu', onContextMenu);
  canvas.addEventListener('keydown', onCanvasKey);
  canvas.addEventListener('focus', onFocus);
  canvas.addEventListener('blur', onBlur);
  app.addEventListener('click', onClick);
  colorInput.addEventListener('input', onColorInput);
  document.addEventListener('keydown', onDocumentKey);

  // 테마가 바뀌면 격자선·체커보드 색을 다시 그린다
  const observer = new MutationObserver(draw);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  updateControls();
  draw();

  // 화면을 떠날 때 정리
  return () => {
    observer.disconnect();
    document.removeEventListener('keydown', onDocumentKey);
    app.removeEventListener('click', onClick);
  };
}
