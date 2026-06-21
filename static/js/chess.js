'use strict';

// ── Constants ──────────────────────────────────────────────────────────────
const PIECE_SYM       = { 1:'♟', 2:'♞', 3:'♝', 4:'♜', 5:'♛', 6:'♚' };
const PIECE_ALGEBRAIC = { 1:'',  2:'N', 3:'B', 4:'R', 5:'Q', 6:'K'  };
const CAP_SYM_WHITE   = { 1:'♙', 2:'♘', 3:'♗', 4:'♖', 5:'♕', 6:'♔' };
const CAP_SYM_BLACK   = { 1:'♟', 2:'♞', 3:'♝', 4:'♜', 5:'♛', 6:'♚' };
const SYM_TYPE_MAP    = {P:1,N:2,B:3,R:4,Q:5,K:6,p:1,n:2,b:3,r:4,q:5,k:6};
const FILES = 'abcdefgh';
const RANKS = '87654321';

// ── Config ─────────────────────────────────────────────────────────────────
let config = {
  mode: 'ai',
  playerColor: 'white',
  aiDepth: 4
};

// ── Game state ─────────────────────────────────────────────────────────────
let state = {
  gameId: null, pieces: {}, turn: 'white', status: 'idle',
  selected: null, legalMoves: [],
  capturedWhite: [], capturedBlack: [],
  movePairs: [],
  lastMove: null, fen: '',
  pendingPromotion: null,
  aiThinking: false,
  // FEN snapshot after each half-move (index 0 = start position)
  // fenHistory[0] = initial FEN, fenHistory[n] = after n-th half-move
  fenHistory: [],
  // replay mode
  replayIndex: null   // null = live; number = previewing that half-move index
};

// ── DOM ────────────────────────────────────────────────────────────────────
const boardEl         = document.getElementById('chess-board');
const turnDot         = document.getElementById('turn-dot');
const turnLabel       = document.getElementById('turn-label');
const aiThinkingEl    = document.getElementById('ai-thinking');
const capBlackEl      = document.getElementById('captured-black');
const capWhiteEl      = document.getElementById('captured-white');
const historyEl       = document.getElementById('move-history');
const gameoverOverlay = document.getElementById('gameover-overlay');
const gameoverTitle   = document.getElementById('gameover-title');
const gameoverMsg     = document.getElementById('gameover-msg');
const promoModal      = document.getElementById('promotion-modal');
const promoChoices    = document.getElementById('promo-choices');
const modeBadge       = null; // removed
const sfPanel         = document.getElementById('sf-panel');
const sfEval          = document.getElementById('sf-eval');
const sfStatus        = document.getElementById('sf-status');
const labelTop        = null; // removed
const labelBottom     = null; // removed
const dotTop          = null; // removed
const dotBottom       = null; // removed
const nameTop         = null; // removed
const nameBottom      = null; // removed
const aiSettings      = document.getElementById('ai-settings');
const replayBanner    = document.getElementById('replay-banner');
const replayStepLabel = document.getElementById('replay-step');

// ══════════════════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  buildBoard();
  buildPromoButtons();
  setupModeSwitcher();
  applyConfig();
  startNewGame();
  // replay banner has no buttons; clicking pieces exits replay automatically
  document.getElementById('btn-replay-prev').addEventListener('click', () => {
    const current = state.replayIndex !== null ? state.replayIndex : state.fenHistory.length - 1;
    enterReplay(current - getPlayerStepSize(current));
  });
  document.getElementById('btn-replay-next').addEventListener('click', () => {
    if (state.replayIndex === null) return;
    enterReplay(state.replayIndex + getPlayerStepSize(state.replayIndex));
  });
  matchPanelHeights();
  window.addEventListener('resize', matchPanelHeights);
});

function matchPanelHeights() {
  const boardCol   = document.querySelector('.board-col');
  const leftPanel  = document.querySelector('.left-panel');
  const rightPanel = document.querySelector('.right-panel');
  if (!boardCol || !leftPanel || !rightPanel) return;
  const h = boardCol.offsetHeight + 'px';
  leftPanel.style.height  = h;
  rightPanel.style.height = h;
}

// ══════════════════════════════════════════════════════════════════════════
//  MODE SWITCHER
// ══════════════════════════════════════════════════════════════════════════
function setupModeSwitcher() {
  document.getElementById('toggle-ai').addEventListener('click', () => {
    config.mode = 'ai';
    document.getElementById('toggle-ai').classList.add('active');
    document.getElementById('toggle-pvp').classList.remove('active');
    aiSettings.style.display = 'block';
    applyConfigUI();
    if (!state.aiThinking && !['checkmate','stalemate','draw','idle'].includes(state.status)
        && state.replayIndex === null && state.turn !== config.playerColor) {
      triggerAiMove();
    }
  });
  document.getElementById('toggle-pvp').addEventListener('click', () => {
    config.mode = 'pvp';
    document.getElementById('toggle-pvp').classList.add('active');
    document.getElementById('toggle-ai').classList.remove('active');
    aiSettings.style.display = 'none';
    applyConfigUI();
  });

  ['color-white','color-black','color-random'].forEach(id => {
    document.getElementById(id).addEventListener('click', async () => {
      document.querySelectorAll('.color-toggle').forEach(b => b.classList.remove('active'));
      document.getElementById(id).classList.add('active');
      if (id === 'color-white')      config.playerColor = 'white';
      else if (id === 'color-black') config.playerColor = 'black';
      else config.playerColor = Math.random() < 0.5 ? 'white' : 'black';
      applyConfigUI();
      // 若在回放中，先回到最新局面
      if (state.replayIndex !== null) await exitReplay();
      // 判斷 AI 要不要下
      if (config.mode === 'ai' && !state.aiThinking
          && !['checkmate','stalemate','draw','idle'].includes(state.status)
          && state.turn !== config.playerColor) {
        triggerAiMove();
      }
    });
  });

  document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      config.aiDepth = parseInt(btn.dataset.depth);
      applyConfigUI();
    });
  });
}

function applyConfigUI() {
  if (sfPanel) sfPanel.style.display = config.mode === 'ai' ? 'block' : 'none';
}

function applyConfig() {
  document.getElementById('toggle-ai').classList.toggle('active', config.mode === 'ai');
  document.getElementById('toggle-pvp').classList.toggle('active', config.mode === 'pvp');
  aiSettings.style.display = config.mode === 'ai' ? 'block' : 'none';
  document.getElementById('color-white').classList.toggle('active', config.playerColor === 'white');
  document.getElementById('color-black').classList.toggle('active', config.playerColor === 'black');
  document.querySelectorAll('.diff-btn').forEach(b => {
    b.classList.toggle('active', parseInt(b.dataset.depth) === config.aiDepth);
  });
  applyConfigUI();
}

// ══════════════════════════════════════════════════════════════════════════
//  REPLAY
// ══════════════════════════════════════════════════════════════════════════

// Parse a FEN into the pieces dict used by renderBoardFromPieces()
function fenToPieces(fen) {
  const pieceMap = {p:1,n:2,b:3,r:4,q:5,k:6,P:1,N:2,B:3,R:4,Q:5,K:6};
  const pieces = {};
  const rows = fen.split(' ')[0].split('/');
  rows.forEach((rowStr, r) => {
    let c = 0;
    for (const ch of rowStr) {
      if (ch >= '1' && ch <= '8') { c += parseInt(ch); }
      else {
        const type  = pieceMap[ch];
        const color = ch === ch.toUpperCase() ? 'white' : 'black';
        pieces[`${r},${c}`] = { type, color };
        c++;
      }
    }
  });
  return pieces;
}

// Enter replay mode at a specific half-move index
async function enterReplay(halfMoveIndex) {
  const total = state.fenHistory.length - 1;
  halfMoveIndex = Math.max(0, Math.min(halfMoveIndex, total));

  // Reached live position → exit replay
  if (halfMoveIndex === total) {
    exitReplay();
    return;
  }

  state.replayIndex = halfMoveIndex;
  state.selected    = null;
  state.legalMoves  = [];
  const fen = state.fenHistory[halfMoveIndex];
  if (!fen) return;

  state.pieces   = fenToPieces(fen);
  state.turn     = fen.split(' ')[1] === 'w' ? 'white' : 'black';
  state.lastMove = getLastMoveFromHistory(halfMoveIndex);

  // 取得將軍狀態後才渲染
  try {
    const res = await fetch('/api/fen_status', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fen })
    });
    const d = await res.json();
    state.status = d.status;
  } catch(e) {
    state.status = 'playing';
  }

  renderBoard();
  updateReplayButtons();
  renderHistory();
}

async function exitReplay() {
  state.replayIndex = null;
  state.selected    = null;
  state.legalMoves  = [];
  const liveFen  = state.fenHistory[state.fenHistory.length - 1] || state.fen;
  state.pieces   = fenToPieces(liveFen);
  state.turn     = liveFen.split(' ')[1] === 'w' ? 'white' : 'black';
  state.lastMove = getLastMoveFromHistory(state.fenHistory.length - 1);
  if (liveFen) {
    try {
      const res = await fetch('/api/fen_status', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fen: liveFen })
      });
      const d = await res.json();
      state.status = d.status;
    } catch(e) {}
  }
  renderBoard();
  updateReplayButtons();
  renderHistory();
}

// 回傳這一步對應的跳躍步數
// AI 模式：跳 2（跳過 AI 那步），PvP：跳 1
// 從 idx 往前/往後找下一個「玩家走的那步」
function getPlayerStepSize(fromIdx) {
  if (config.mode === 'pvp') return 1;
  // AI 模式：玩家執白 → 奇數 half-move 是玩家；執黑 → 偶數 half-move 是玩家
  // 每 2 步跳一次（一白一黑 = 一整回合）
  return 2;
}

function updateReplayButtons() {
  const total   = state.fenHistory.length - 1;
  const idx     = state.replayIndex;          // null = live (latest)
  const current = idx !== null ? idx : total;
  const prevBtn = document.getElementById('btn-replay-prev');
  const nextBtn = document.getElementById('btn-replay-next');
  if (prevBtn) prevBtn.disabled = current <= 0;
  if (nextBtn) nextBtn.disabled = idx === null; // at live = no next
}

async function branchFromReplay() {
  const idx = state.replayIndex;
  if (idx === null) return;
  const fen = state.fenHistory[idx];
  if (!fen) { console.error('No FEN at index', idx); return; }

  const res = await fetch('/api/branch', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      game_id: state.gameId,
      fen,
      fen_history: state.fenHistory.slice(0, idx + 1)
    })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error('branch failed:', err);
    return;
  }
  const data = await res.json();

  // 裁切 fenHistory 到該步
  state.fenHistory = state.fenHistory.slice(0, idx + 1);

  // 裁切 movePairs
  const fullPairs  = Math.floor(idx / 2);
  const hasPartial = idx % 2 === 1;
  state.movePairs  = state.movePairs.slice(0, fullPairs + (hasPartial ? 1 : 0));
  if (hasPartial && state.movePairs.length > 0) {
    state.movePairs[state.movePairs.length - 1].black = '';
  }

  state.pieces      = data.pieces;
  state.turn        = data.turn;
  state.status      = data.status;
  state.fen         = fen;
  state.lastMove    = null;
  state.selected    = null;
  state.legalMoves  = [];
  state.replayIndex = null;

  renderBoard(); renderCaptured(); renderHistory();
  matchPanelHeights();

  if (config.mode === 'ai' && state.turn !== config.playerColor) await triggerAiMove();
}

// ══════════════════════════════════════════════════════════════════════════
//  BOARD RENDERING
// ══════════════════════════════════════════════════════════════════════════
function buildBoard() {
  boardEl.innerHTML = '';
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = document.createElement('div');
      sq.className = `square ${(r + c) % 2 === 0 ? 'light' : 'dark'}`;
      sq.dataset.row = r; sq.dataset.col = c;
      sq.addEventListener('click', () => onSquareClick(r, c));
      boardEl.appendChild(sq);
    }
  }
}
const getSquareEl = (r, c) => boardEl.querySelector(`[data-row="${r}"][data-col="${c}"]`);

// Full live board render
function renderBoard() {
  renderBoardFromPieces(state.pieces, state.turn, state.lastMove, state.selected, state.legalMoves);
  // Turn indicator always reflects live state
  turnDot.className = `turn-dot ${state.turn}`;
  turnLabel.textContent = state.turn === 'white' ? '白方回合' : '黑方回合';
}

// Generic render (used for both live and replay)
function renderBoardFromPieces(pieces, turn, lastMove, selected, legalMoves = []) {
  boardEl.querySelectorAll('.square').forEach(sq => {
    sq.classList.remove('selected','legal-move','legal-capture','last-from','last-to','in-check');
    sq.innerHTML = '';
  });
  if (lastMove) {
    getSquareEl(lastMove.fromRow, lastMove.fromCol)?.classList.add('last-from');
    getSquareEl(lastMove.toRow,   lastMove.toCol  )?.classList.add('last-to');
  }
  if (selected) getSquareEl(selected.row, selected.col)?.classList.add('selected');
  legalMoves.forEach(({row,col}) => {
    const sq = getSquareEl(row,col); if (!sq) return;
    sq.classList.add(pieces[`${row},${col}`] ? 'legal-capture' : 'legal-move');
  });
  Object.entries(pieces).forEach(([key,piece]) => {
    const [r,c] = key.split(',').map(Number);
    const sq = getSquareEl(r,c); if (!sq) return;
    const wrap = document.createElement('div');
    wrap.className = `piece-wrap ${piece.color}-piece`;
    const sym = document.createElement('span');
    sym.className = 'piece-sym'; sym.textContent = PIECE_SYM[piece.type];
    wrap.appendChild(sym); sq.appendChild(wrap);
  });
  if (state.status === 'check' || state.status === 'checkmate') {
    for (const [key,piece] of Object.entries(pieces)) {
      if (piece.type === 6 && piece.color === turn) {
        const [r,c] = key.split(',').map(Number);
        getSquareEl(r,c)?.classList.add('in-check');
      }
    }
  }
}

// ── History with clickable steps ───────────────────────────────────────────
function renderHistory() {
  historyEl.innerHTML = '';
  state.movePairs.forEach((pair, i) => {
    const row = document.createElement('div');
    row.className = 'history-row';

    const num = document.createElement('span');
    num.className = 'move-num'; num.textContent = `${i+1}.`;

    const mw = document.createElement('span');
    mw.className = 'move-white move-clickable';
    mw.textContent = pair.white || '';
    const whiteHalfIdx = i * 2 + 1; // half-move index in fenHistory
    if (pair.white && state.fenHistory[whiteHalfIdx]) {
      mw.classList.add('has-replay');
      if (state.replayIndex === whiteHalfIdx) mw.classList.add('replay-active');
      mw.addEventListener('click', () => enterReplay(whiteHalfIdx));
    }

    const mb = document.createElement('span');
    mb.className = 'move-black move-clickable';
    mb.textContent = pair.black || '';
    const blackHalfIdx = i * 2 + 2;
    if (pair.black && state.fenHistory[blackHalfIdx]) {
      mb.classList.add('has-replay');
      if (state.replayIndex === blackHalfIdx) mb.classList.add('replay-active');
      mb.addEventListener('click', () => enterReplay(blackHalfIdx));
    }

    row.appendChild(num); row.appendChild(mw); row.appendChild(mb);
    historyEl.appendChild(row);
  });
  historyEl.scrollTop = historyEl.scrollHeight;
}

function renderCaptured() {
  const order = [5, 4, 3, 2, 1]; // 后>車>象>馬>兵
  const sort  = arr => [...arr].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  capBlackEl.innerHTML = sort(state.capturedBlack).map(t=>`<span class="cap-piece black-cap">${CAP_SYM_BLACK[t]||'?'}</span>`).join('');
  capWhiteEl.innerHTML = sort(state.capturedWhite).map(t=>`<span class="cap-piece white-cap">${CAP_SYM_WHITE[t]||'?'}</span>`).join('');
}

function recordMove(notation, beforeTurn) {
  if (beforeTurn === 'white') {
    state.movePairs.push({ white: notation, black: '' });
  } else {
    if (!state.movePairs.length) state.movePairs.push({ white:'...', black: notation });
    else state.movePairs[state.movePairs.length-1].black = notation;
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  INTERACTION
// ══════════════════════════════════════════════════════════════════════════
async function onSquareClick(row, col) {
  // ── 回放模式 ──────────────────────────────────────────────
  if (state.replayIndex !== null) {
    const replayTurn = state.turn;

    // AI 模式下只有玩家顏色可操作
    if (config.mode === 'ai' && replayTurn !== config.playerColor) return;

    const piece = state.pieces[`${row},${col}`];

    // 已選棋子 → 嘗試走棋
    if (state.selected) {
      if (state.legalMoves.some(m => m.row === row && m.col === col)) {
        // 真正走了新棋才 branch 並覆蓋
        const mp = state.pieces[`${state.selected.row},${state.selected.col}`];
        if (mp && mp.type === 1 && ((mp.color === 'white' && row === 0) || (mp.color === 'black' && row === 7))) {
          state.pendingPromotion = {fromRow: state.selected.row, fromCol: state.selected.col, toRow: row, toCol: col};
          showPromoModal(mp.color); return;
        }
        const fromRow = state.selected.row;
        const fromCol = state.selected.col;
        await branchFromReplay();
        await submitMove(fromRow, fromCol, row, col);
        return;
      }
      // 點了其他格子 → 取消選擇或換選棋子
      if (piece && piece.color === replayTurn) {
        state.selected   = {row, col};
        state.legalMoves = await fetchReplayLegalMoves(row, col);
        renderReplayBoard();
        return;
      }
      // 點空格 → 取消選擇
      state.selected   = null;
      state.legalMoves = [];
      renderReplayBoard();
      return;
    }

    // 尚未選棋子 → 選自己的棋子並顯示可走位置
    if (piece && piece.color === replayTurn) {
      state.selected   = {row, col};
      state.legalMoves = await fetchReplayLegalMoves(row, col);
      renderReplayBoard();
    }
    return;
  }

  // ── 一般模式 ──────────────────────────────────────────────
  if (['checkmate','stalemate','draw','idle'].includes(state.status)) return;
  if (state.aiThinking) return;
  if (config.mode === 'ai' && state.turn !== config.playerColor) return;

  const piece = state.pieces[`${row},${col}`];
  if (state.selected) {
    if (state.legalMoves.some(m => m.row===row && m.col===col)) {
      const mp = state.pieces[`${state.selected.row},${state.selected.col}`];
      if (mp && mp.type===1 && ((mp.color==='white'&&row===0)||(mp.color==='black'&&row===7))) {
        state.pendingPromotion = {fromRow:state.selected.row,fromCol:state.selected.col,toRow:row,toCol:col};
        showPromoModal(mp.color); return;
      }
      await submitMove(state.selected.row, state.selected.col, row, col);
      return;
    }
  }
  if (piece && piece.color === state.turn) {
    state.selected = {row,col};
    state.legalMoves = await fetchLegalMoves(row,col);
    renderBoard(); return;
  }
  state.selected = null; state.legalMoves = [];
  renderBoard();
}

async function fetchReplayLegalMoves(row, col) {
  // 用回放局面的 game_id（branch 前先建立暫時棋盤）
  // 簡化做法：直接用當前 game_id 查詢，但棋盤已是回放 FEN 的 pieces
  // 因為 /api/get_moves 是查後端 board，需要先 branch 才能查
  // 所以這裡改呼叫 /api/replay_moves
  const res = await fetch('/api/replay_moves', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ fen: state.fenHistory[state.replayIndex], row, col })
  });
  const data = await res.json();
  return data.moves || [];
}

function renderReplayBoard() {
  renderBoard();
}


function buildPromoButtons() {
  promoChoices.innerHTML = '';
  [{sym:'♛',key:'q'},{sym:'♜',key:'r'},{sym:'♝',key:'b'},{sym:'♞',key:'n'}].forEach(({sym,key}) => {
    const btn = document.createElement('button');
    btn.className = 'promo-btn'; btn.textContent = sym;
    btn.addEventListener('click', async () => {
      promoModal.classList.remove('active');
      if (state.pendingPromotion) {
        const {fromRow,fromCol,toRow,toCol} = state.pendingPromotion;
        state.pendingPromotion = null;
        await submitMove(fromRow,fromCol,toRow,toCol,key);
      }
    });
    promoChoices.appendChild(btn);
  });
}
function showPromoModal(color) {
  promoChoices.querySelectorAll('.promo-btn').forEach(btn => {
    btn.style.background = color==='white'
      ? 'radial-gradient(circle at 36% 34%,#fff,#d0d0d0)'
      : 'radial-gradient(circle at 36% 34%,#3c3c3c,#0f0f0f)';
    btn.style.color = color==='white' ? '#111' : '#f0f0f0';
    btn.style.borderColor = color==='white' ? '#999' : '#555';
  });
  promoModal.classList.add('active');
}

// ══════════════════════════════════════════════════════════════════════════
//  API
// ══════════════════════════════════════════════════════════════════════════
async function startNewGame() {
  exitReplay();
  const data = await (await fetch('/api/new_game',{method:'POST'})).json();
  Object.assign(state, {
    gameId:data.game_id, pieces:data.pieces, turn:data.turn,
    status:data.status, selected:null, legalMoves:[],
    capturedWhite:[], capturedBlack:[], movePairs:[],
    lastMove:null, fen:data.fen||'', pendingPromotion:null, aiThinking:false,
    fenHistory: [data.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'],
    replayIndex: null
  });
  if (sfEval)   sfEval.textContent   = '—';
  if (sfStatus) sfStatus.textContent = '';
  if (aiThinkingEl) aiThinkingEl.style.display = 'none';
  gameoverOverlay.classList.remove('active');
  renderBoard(); renderCaptured(); renderHistory();
  matchPanelHeights();
  if (config.mode==='ai' && config.playerColor==='black') await triggerAiMove();
}

async function fetchLegalMoves(row,col) {
  const data = await (await fetch('/api/get_moves',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({game_id:state.gameId,row,col})
  })).json();
  return data.moves||[];
}

async function submitMove(fromRow,fromCol,toRow,toCol,promotion='q') {
  const beforeTurn = state.turn;
  const fromPiece  = state.pieces[`${fromRow},${fromCol}`];
  const res = await fetch('/api/move',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({game_id:state.gameId,from_row:fromRow,from_col:fromCol,to_row:toRow,to_col:toCol,promotion})
  });
  if (!res.ok) { state.selected=null; state.legalMoves=[]; renderBoard(); return; }
  const data = await res.json();

  if (data.captured) {
    const t = SYM_TYPE_MAP[data.captured]||1;
    if (data.captured===data.captured.toUpperCase()) state.capturedWhite.push(t);
    else state.capturedBlack.push(t);
  }
  const pn  = fromPiece ? PIECE_ALGEBRAIC[fromPiece.type] : '';
  const cap = data.captured ? 'x' : '';
  const sfx = data.status==='checkmate' ? '#' : data.in_check ? '+' : '';
  recordMove(`${pn}${cap}${FILES[toCol]}${RANKS[toRow]}${sfx}`, beforeTurn);

  // Snapshot FEN after this move
  state.fenHistory.push(data.fen);

  state.pieces=data.pieces; state.turn=data.turn;
  state.status=data.status; state.fen=data.fen||'';
  state.lastMove={fromRow,fromCol,toRow,toCol};
  state.selected=null; state.legalMoves=[];

  renderBoard(); renderCaptured(); renderHistory();
  updateReplayButtons();
  if (['checkmate','stalemate','draw'].includes(data.status)) { showGameOver(data); return; }
  if (config.mode==='ai' && state.turn !== config.playerColor) await triggerAiMove();
}

async function undoMove() {
  if (!state.movePairs.length || state.aiThinking) return;
  if (state.replayIndex !== null) exitReplay();
  const undoCount = config.mode==='ai' ? 2 : 1;
  for (let i=0; i<undoCount; i++) {
    if (!state.movePairs.length) break;
    const res = await fetch('/api/undo',{method:'POST'});
    if (!res.ok) break;
    const data = await res.json();
    const lp = state.movePairs[state.movePairs.length-1];
    if (lp?.black) lp.black = '';
    else state.movePairs.pop();
    // Pop fenHistory too
    if (state.fenHistory.length > 1) state.fenHistory.pop();
    state.pieces=data.pieces; state.turn=data.turn;
    state.status=data.status; state.fen=data.fen||'';
    state.selected=null; state.legalMoves=[];
    state.lastMove = data.last_move
      ? {fromRow:data.last_move.fromRow,fromCol:data.last_move.fromCol,toRow:data.last_move.toRow,toCol:data.last_move.toCol}
      : null;
  }
  if (sfEval)   sfEval.textContent   = '—';
  if (sfStatus) sfStatus.textContent = '';
  gameoverOverlay.classList.remove('active');
  renderBoard(); renderCaptured(); renderHistory();
}

// ── AI move ────────────────────────────────────────────────────────────────
async function triggerAiMove() {
  if (state.replayIndex !== null) return; // 回放中不觸發 AI
  if (['checkmate','stalemate','draw'].includes(state.status)) return;
  state.aiThinking = true;
  if (aiThinkingEl) aiThinkingEl.style.display = 'flex';
  if (sfStatus) sfStatus.textContent = 'AI 思考中...';
  await new Promise(r => setTimeout(r,300));
  try {
    const res = await fetch('/api/stockfish',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({game_id:state.gameId,depth:config.aiDepth})
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (sfStatus) sfStatus.textContent = `❌ ${err.error || 'Stockfish 無法執行'}`;
      return;
    }
    const data = await res.json();
    if (data.captured) {
      const t = SYM_TYPE_MAP[data.captured]||1;
      if (data.captured===data.captured.toUpperCase()) state.capturedWhite.push(t);
      else state.capturedBlack.push(t);
    }
    const beforeTurn  = state.turn;
    const movingPiece = state.pieces[`${data.from_row},${data.from_col}`];
    const pn  = movingPiece ? PIECE_ALGEBRAIC[movingPiece.type] : '';
    const cap = data.captured ? 'x' : '';
    const sfx = data.status==='checkmate' ? '#' : data.in_check ? '+' : '';
    recordMove(`${pn}${cap}${FILES[data.to_col]}${RANKS[data.to_row]}${sfx}`, beforeTurn);

    state.fenHistory.push(data.fen);

    state.pieces=data.pieces; state.turn=data.turn;
    state.status=data.status; state.fen=data.fen||'';
    state.lastMove={fromRow:data.from_row,fromCol:data.from_col,toRow:data.to_row,toCol:data.to_col};
    state.selected=null; state.legalMoves=[];

    if (sfEval)   sfEval.textContent   = data.evaluation||'—';
    if (sfStatus) sfStatus.textContent = `AI 走: ${data.move_san||''}  評: ${data.evaluation||'?'}`;

    renderBoard(); renderCaptured(); renderHistory();
    updateReplayButtons();
    if (['checkmate','stalemate','draw'].includes(data.status)) showGameOver(data);
  } finally {
    state.aiThinking = false;
    if (aiThinkingEl) aiThinkingEl.style.display = 'none';
  }
}

function showGameOver(data) {
  if (data.status==='checkmate') {
    gameoverTitle.textContent = config.mode==='ai'
      ? (data.winner===config.playerColor ? '你獲勝！🎉' : 'AI 獲勝！')
      : (data.winner==='white' ? '白方獲勝！' : '黑方獲勝！');
    gameoverMsg.textContent = '將死。';
  } else if (data.status==='stalemate') {
    gameoverTitle.textContent='僵局'; gameoverMsg.textContent='無法移動，平局。';
  } else {
    gameoverTitle.textContent='平局'; gameoverMsg.textContent='子力不足，無法將死。';
  }
  setTimeout(()=>gameoverOverlay.classList.add('active'),800);
}

// ── Buttons ────────────────────────────────────────────────────────────────
document.getElementById('btn-new').addEventListener('click', startNewGame);
document.getElementById('btn-undo').addEventListener('click', undoMove);
document.getElementById('btn-resign').addEventListener('click', () => {
  if (state.replayIndex !== null) return;
  gameoverTitle.textContent = config.mode==='ai' ? 'AI 獲勝！' : `${state.turn==='white'?'白':'黑'}方投降`;
  gameoverMsg.textContent   = '投降。';
  state.status = 'checkmate';
  gameoverOverlay.classList.add('active');
});
document.getElementById('btn-play-again').addEventListener('click', startNewGame);
document.getElementById('btn-close-result').addEventListener('click', () => {
  gameoverOverlay.classList.remove('active');
});



// ══════════════════════════════════════════════════════════════════════════
//  SAVE / LOAD
// ══════════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-save').addEventListener('click', saveGame);
  document.getElementById('btn-refresh-list').addEventListener('click', loadGameList);
  loadGameList();
});

async function saveGame() {
  const name = document.getElementById('save-name').value.trim();
  const msg  = document.getElementById('save-msg');
  msg.className = 'save-msg'; msg.textContent = '儲存中...';
  try {
    const res = await fetch('/api/save_game', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ game_id: state.gameId, name, mode: config.mode })
    });
    if (!res.ok) {
      const text = await res.text();
      msg.className = 'save-msg err';
      msg.textContent = '儲存失敗（' + res.status + '）';
      console.error('save_game error:', text);
      return;
    }
    const data = await res.json();
    msg.className='save-msg'; msg.textContent=`已儲存「${data.name}」`;
    document.getElementById('save-name').value='';
    setTimeout(()=>{ msg.textContent=''; },3000);
    loadGameList();
  } catch(e) {
    msg.className = 'save-msg err';
    msg.textContent = '儲存失敗，請稍後再試';
    console.error(e);
  }
}

async function loadGameList() {
  const listEl = document.getElementById('saved-list');
  listEl.innerHTML = '<p class="no-saves">載入中...</p>';
  const res  = await fetch('/api/list_games');
  const rows = await res.json();
  if (!rows.length) { listEl.innerHTML='<p class="no-saves">尚無儲存棋局</p>'; return; }
  listEl.innerHTML = '';
  rows.forEach(row => {
    const entry = document.createElement('div');
    entry.className = 'save-entry';
    const resultLabels = {
      white:    ['result-white', '1-0'],
      black:    ['result-black', '0-1'],
      stalemate:['result-draw',  '½-½'],
      draw:     ['result-draw',  '½-½']
    };
    const [rClass, rLabel] = resultLabels[row.result] || ['', ''];
    const modeLabel = row.mode==='ai' ? '🤖 AI' : '👥 雙人';
    entry.innerHTML = `
      <div class="save-entry-top">
        <span class="save-entry-name" title="${row.name}">${row.name}</span>
        <button class="save-entry-del" data-id="${row.id}" title="刪除">✕</button>
      </div>
      <div class="save-entry-meta">${modeLabel} · ${row.move_count} 步 · ${row.saved_at.slice(0,16)}</div>
      <div class="save-entry-result ${rClass}">${rLabel}</div>`;
    entry.addEventListener('click', (e) => {
      if (e.target.classList.contains('save-entry-del')) return;
      loadSavedGame(row.id, row.mode);
    });
    entry.querySelector('.save-entry-del').addEventListener('click', async (e) => {
      e.stopPropagation();
      await fetch(`/api/delete_game/${row.id}`,{method:'DELETE'});
      loadGameList();
    });
    listEl.appendChild(entry);
  });
}

function getLastMoveFromHistory(idx) {
  if (idx <= 0) return null;
  // idx 對應的是第 idx 個 half-move，直接從 fenHistory 前後比較格子差異
  // 用最簡單的方式：找前一局面有但現在沒有的格子(from)，現在有但前一局面沒有的格子(to)
  const prev = fenToPieces(state.fenHistory[idx - 1]);
  const curr = fenToPieces(state.fenHistory[idx]);
  let from = null, to = null;
  for (const key of Object.keys(prev)) {
    if (!curr[key]) { from = key; }
  }
  for (const key of Object.keys(curr)) {
    if (!prev[key]) { to = key; }
  }
  // 若找不到 to（王車易位、吃過路兵等邊緣情況），fallback
  if (!from || !to) return null;
  const [fr, fc] = from.split(',').map(Number);
  const [tr, tc] = to.split(',').map(Number);
  return { fromRow: fr, fromCol: fc, toRow: tr, toCol: tc };
}


function countPieces(fen) {
  const pieceMap = {p:1,n:2,b:3,r:4,q:5,k:6,P:1,N:2,B:3,R:4,Q:5,K:6};
  const count = {};
  for (const ch of fen.split(' ')[0]) {
    if (!pieceMap[ch]) continue;
    const color = ch === ch.toUpperCase() ? 'white' : 'black';
    const key   = `${color}_${pieceMap[ch]}`;
    count[key]  = (count[key] || 0) + 1;
  }
  return count;
}

async function loadSavedGame(id, mode) {
  const res  = await fetch(`/api/load_game/${id}`,{method:'POST'});
  if (!res.ok) return;
  const data = await res.json();
  exitReplay();

  const pairs = [];
  const tokens = (data.pgn||'').split(' ').filter(t=>t.trim());
  let i=0;
  while (i<tokens.length) {
    if (tokens[i].includes('.')){ i++; continue; }
    const w=tokens[i++]||'';
    const b=(i<tokens.length&&!tokens[i].includes('.')) ? tokens[i++] : '';
    if (w) pairs.push({white:w,black:b});
  }

  // Fetch full fenHistory from server
  let fenHist = [data.fen];
  try {
    const fhRes = await fetch(`/api/fen_history/${id}`);
    if (fhRes.ok) {
      const fhData = await fhRes.json();
      fenHist = fhData.history;
    }
  } catch(e) { console.error('fen_history fetch failed', e); }

  // 從 fenHistory 推算被吃棋子
  const capturedW = [], capturedB = [];
  if (fenHist.length > 1) {
    // 計算最終局面比初始局面少了哪些棋子
    const initCount = countPieces(fenHist[0]);
    const lastCount = countPieces(fenHist[fenHist.length - 1]);
    for (const [key, cnt] of Object.entries(initCount)) {
      const diff = cnt - (lastCount[key] || 0);
      const [color, type] = key.split('_');
      for (let i = 0; i < diff; i++) {
        if (color === 'white') capturedW.push(Number(type));
        else capturedB.push(Number(type));
      }
    }
  }

  Object.assign(state, {
    gameId:data.game_id, pieces:data.pieces, turn:data.turn,
    status:data.status, selected:null, legalMoves:[],
    capturedWhite: capturedW, capturedBlack: capturedB,
    movePairs:pairs,
    lastMove: data.last_move ? {fromRow:data.last_move.fromRow,fromCol:data.last_move.fromCol,toRow:data.last_move.toRow,toCol:data.last_move.toCol} : null,
    fen:data.fen, pendingPromotion:null, aiThinking:false,
    fenHistory: fenHist,
    replayIndex: null
  });

  config.mode = data.mode||mode||'pvp';
  document.getElementById('toggle-ai').classList.toggle('active', config.mode==='ai');
  document.getElementById('toggle-pvp').classList.toggle('active', config.mode==='pvp');
  document.getElementById('ai-settings').style.display = config.mode==='ai' ? 'block' : 'none';
  applyConfigUI();
  if (sfEval) sfEval.textContent='—';
  if (sfStatus) sfStatus.textContent='';
  if (aiThinkingEl) aiThinkingEl.style.display='none';
  gameoverOverlay.classList.remove('active');
  renderBoard(); renderCaptured(); renderHistory();
  updateReplayButtons();
  if (['checkmate','stalemate','draw'].includes(data.status)) showGameOver(data);
}

function rebuildFenHistory(pgn) {
  // Rebuilt server-side via /api/fen_history; this is just a placeholder
  const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  return [startFen];
}

// ══════════════════════════════════════════════════════════════════════════
//  AI 棋評助手
// ══════════════════════════════════════════════════════════════════════════
const chatMessages = document.getElementById('chat-messages');
const chatInput    = document.getElementById('chat-input');
const chatSend     = document.getElementById('chat-send');

document.addEventListener('DOMContentLoaded', () => {
  chatSend.addEventListener('click', sendChat);
  chatInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
  });
});

function addChatMsg(role, text, isTyping = false) {
  const div    = document.createElement('div');
  div.className = `chat-msg ${role}${isTyping ? ' typing' : ''}`;
  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble';
  bubble.textContent = text;
  div.appendChild(bubble);
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return div;
}

async function sendChat() {
  const text = chatInput.value.trim();
  if (!text) return;
  chatInput.value = '';
  chatSend.disabled = true;

  addChatMsg('user', text);
  const typingEl = addChatMsg('ai', '思考中...', true);

  // 組 PGN 字串
  const pgn = state.movePairs
    .map((p, i) => `${i+1}.${p.white} ${p.black}`.trim())
    .join(' ');

  // 回放模式用回放局面的 FEN，否則用 live FEN
  const activeFen = state.replayIndex !== null
    ? (state.fenHistory[state.replayIndex] || state.fen)
    : state.fen;

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        fen:     activeFen,
        pgn:     pgn,
        mode:    config.mode
      })
    });
    const data = await res.json();
    typingEl.remove();
    if (!res.ok) {
      addChatMsg('ai', `錯誤：${data.error || '無法取得回應'}`);
    } else {
      addChatMsg('ai', data.reply);
    }
  } catch (e) {
    typingEl.remove();
    addChatMsg('ai', '連線失敗，請稍後再試。');
  }

  chatSend.disabled = false;
  chatInput.focus();
}