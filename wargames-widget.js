/*
 * SHALL WE PLAY A GAME? — a portable, dependency-free terminal widget.
 * Paste this entire file into CodePen's JS panel, or load it with one script tag.
 * Configuration: data-auto-open="true|false" data-delay="1800" data-accent="green|amber"
 * Public API: window.WarGamesWidget.open(), .close(), .reset()
 * Font: VT323 + Silkscreen via Google Fonts (fallback: system monospace)
 * MIT License
 */
(() => {
  'use strict';
  if (window.WarGamesWidget) return;

  const script = document.currentScript;
  const autoOpen = script?.dataset.autoOpen !== 'false';
  const delay = Math.max(0, Math.min(60000, Number(script?.dataset.delay ?? 1800) || 0));
  const accent = script?.dataset.accent === 'amber' ? 'amber' : 'green';
  const STORAGE_KEY = 'wargames-widget-seen-v1';
  // Links from Squarespace use ?play=1 to open the terminal immediately.
  const directPlay = new URLSearchParams(window.location.search).get('play') === '1';
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  let shadow, overlay, launcher, terminal, stage, input, stateLabel, commandHint;
  let opened = false;
  let scene = 'intro';
  let runToken = 0;
  let turnToken = 0;
  let aiTimer = null;
  let board = Array(9).fill('');
  let gameOver = false;
  let gameBusy = false;
  let seenThisSession = false;
  let lastFocus = null;

  try { seenThisSession = sessionStorage.getItem(STORAGE_KEY) === '1'; } catch (_) { /* storage unavailable */ }
  const remember = () => { try { sessionStorage.setItem(STORAGE_KEY, '1'); } catch (_) { /* storage unavailable */ } };

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Silkscreen:wght@400;700&family=VT323&display=swap');
    :host { --wg-green: #b5fcb1; --wg-accent: ${accent === 'amber' ? '#ffd583' : '#b5fcb1'};
      --wg-muted: ${accent === 'amber' ? '#bc9a61' : '#79a977'}; --wg-panel: #07110b;
      position: static; font-family: 'VT323', 'Lucida Console', 'Courier New', monospace; }
    *, *::before, *::after { box-sizing: border-box; }
    button, input { font: inherit; }
    button { -webkit-tap-highlight-color: transparent; }
    [hidden] { display: none !important; }
    .launcher { position: fixed; z-index: 2147483640; right: 22px; bottom: 22px;
      display: flex; align-items: center; gap: 10px; border: 1px solid var(--wg-accent);
      border-radius: 0; background: #06110b; color: var(--wg-accent);
      padding: 14px 18px; font: 12px 'Silkscreen', monospace; letter-spacing: 0;
      box-shadow: 0 0 28px #0008, inset 0 0 17px #345b353b; cursor: pointer;
      transition: transform .15s ease, background .15s ease; }
    .launcher:hover { transform: translateY(-3px); background: #102719; }
    .launcher:focus-visible, .close:focus-visible, .choice:focus-visible,
    .cell:focus-visible, .command:focus-visible { outline: 2px solid #fff; outline-offset: 4px; }
    .launcher-icon { font-size: 16px; font-weight: bold; }
    .overlay { position: fixed; inset: 0; z-index: 2147483641;
      display: grid; place-items: center; padding: 18px; }
    .scrim { position: absolute; inset: 0; background: #010403d9; backdrop-filter: blur(5px); }
    .window { position: relative; width: min(100%, 740px); max-height: min(90vh, 790px);
      display: flex; flex-direction: column; overflow: hidden; background: #060e09;
      border: 2px solid #6ab46a; border-radius: 0;
      color: var(--wg-accent); box-shadow: 0 0 0 6px #06150ac9, 0 25px 90px #000, 0 0 55px #3cac4529; }
    .window::before { content: ''; position: absolute; inset: 0; z-index: 2; pointer-events: none;
      background: repeating-linear-gradient(to bottom, transparent 0, transparent 3px, #0004 4px, transparent 5px);
      opacity: .43; }
    .window::after { content: ''; position: absolute; inset: 0; z-index: 1; pointer-events: none;
      background: radial-gradient(ellipse at center, transparent 43%, #0009 100%); }
    .bar, .body, .footer { position: relative; z-index: 3; }
    .bar { display: flex; justify-content: space-between; align-items: center; gap: 10px;
      border-bottom: 1px solid #2c5332; padding: 14px 18px; background: #0b1d11; }
    .brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
    .brand-mark { border: 1px solid var(--wg-accent); padding: 6px 7px;
      font: 11px 'Silkscreen', monospace; letter-spacing: 0; }
    .brand-title { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
    .brand-title strong { font: 11px 'Silkscreen', monospace; letter-spacing: .01em; }
    .brand-title small { color: var(--wg-muted); font: 16px 'VT323', monospace; letter-spacing: .03em; }
    .bar-right { display: flex; align-items: center; gap: 15px; }
    .connection { color: var(--wg-muted); font: 17px 'VT323', monospace; white-space: nowrap; }
    .dot { display: inline-block; margin-right: 6px; width: 6px; height: 6px;
      border-radius: 50%; background: var(--wg-accent); box-shadow: 0 0 9px var(--wg-accent); }
    .close { border: 1px solid #4b6f4b; background: #142417; color: var(--wg-accent);
      width: 32px; height: 32px; border-radius: 0; font-size: 23px; cursor: pointer; }
    .close:hover { background: #27462b; }
    .body { padding: clamp(18px, 4vw, 33px); overflow-y: auto; min-height: 300px;
      scrollbar-color: #315b35 transparent; scrollbar-width: thin; }
    .meta { display: flex; gap: 10px; justify-content: space-between; flex-wrap: wrap;
      font-size: 17px; letter-spacing: .06em; color: var(--wg-muted); margin-bottom: 21px; }
    .separator { border-top: 1px dashed #467149; opacity: .75; margin-bottom: 22px; }
    .terminal { min-height: 95px; color: var(--wg-accent); font-size: clamp(25px, 3.5vw, 32px);
      font-weight: 400; line-height: 1.16; letter-spacing: .025em; text-shadow: 0 0 11px #77fb6880;
      white-space: pre-wrap; overflow-wrap: anywhere; }
    .line { margin: 0 0 12px; }
    .line.system { color: var(--wg-muted); font-size: .82em; letter-spacing: .06em; }
    .line.important { font-size: clamp(32px, 5.5vw, 46px); line-height: 1.0; }
    .caret { display: inline-block; width: 10px; height: 1em; background: var(--wg-accent);
      vertical-align: -2px; margin-left: 2px; animation: wg-blink 1s steps(1) infinite; }
    .stage { margin-top: 18px; display: flex; flex-direction: column; align-items: flex-start; gap: 16px; }
    .choices { display: flex; flex-wrap: wrap; gap: 11px; }
    .choice { padding: 12px 17px; min-height: 42px; background: #0c2011;
      border: 1px solid #5d9b61; border-radius: 0; color: var(--wg-accent);
      font: 11px 'Silkscreen', monospace; letter-spacing: 0; cursor: pointer;
      transition: background .12s ease, box-shadow .12s ease; }
    .choice:hover { background: #183a20; box-shadow: 0 0 14px #5cdd5c22; }
    .choice.primary { background: #b5fcb1; color: #06160b; border-color: #b5fcb1; }
    .choice.primary:hover { background: #defedc; }
    .choice:disabled { cursor: wait; opacity: .5; }
    .game-info { font-size: 22px; letter-spacing: .02em; color: var(--wg-muted); }
    .board { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px;
      width: min(100%, 270px); margin: 2px 0; }
    .cell { display: grid; place-items: center; aspect-ratio: 1; border: 1px solid #42744a;
      border-radius: 0; background: #0d2012; color: var(--wg-accent);
      font: 400 clamp(48px, 10vw, 66px)/1 'VT323', monospace;
      text-shadow: 0 0 12px #b7ffad66; cursor: pointer; }
    .cell:hover:not(:disabled) { background: #22432a; }
    .cell:disabled { cursor: default; }
    .cell.o { color: #e7c981; text-shadow: 0 0 12px #efc87677; }
    .outcome { max-width: 490px; color: var(--wg-accent); font-size: 26px;
      font-weight: normal; line-height: 1.2; letter-spacing: .03em; }
    .footer { display: flex; align-items: center; gap: 12px; padding: 13px 19px;
      border-top: 1px solid #2c5332; background: #09170e; }
    .prompt-sign { color: var(--wg-accent); font-size: 18px; font-weight: bold; }
    .command { width: 100%; min-width: 0; border: none; outline: none; background: transparent;
      color: var(--wg-accent); font: 26px 'VT323', monospace; letter-spacing: .035em;
      caret-color: var(--wg-accent); }
    .command::placeholder { color: #749779; opacity: 1; }
    .command:disabled { opacity: .5; }
    .hint { display: block; margin-left: auto; flex-shrink: 0; font-size: 16px;
      color: var(--wg-muted); letter-spacing: .07em; }
    .sr-only { position: absolute !important; width: 1px; height: 1px; padding: 0;
      margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
    @keyframes wg-blink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
    @media (max-width: 560px) {
      .overlay { padding: 10px; }
      .window { max-height: 94dvh; }
      .bar { padding: 10px 12px; }
      .brand-title small, .connection, .hint { display: none; }
      .body { min-height: 260px; }
      .launcher { bottom: 14px; right: 14px; padding: 12px 14px; }
      .choices { gap: 8px; }
      .choice { padding: 10px 12px; font-size: 10px; }
    }
    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
  `;

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  };
  const setHint = (text) => { commandHint.textContent = text; input.placeholder = text; };
  const setState = (text) => { stateLabel.textContent = text; };
  const cancelPending = () => {
    runToken++;
    turnToken++;
    clearTimeout(aiTimer);
    gameBusy = false;
  };
  const clearScene = (name) => {
    cancelPending();
    scene = name;
    terminal.replaceChildren();
    stage.replaceChildren();
    input.value = '';
    input.disabled = false;
    setState(name.toUpperCase());
  };
  const write = async (items) => {
    const token = ++runToken;
    for (const entry of items) {
      if (token !== runToken || !opened) return false;
      const line = el('div', `line ${entry.kind || ''}`);
      terminal.append(line);
      const value = entry.text;
      if (reducedMotion) line.textContent = value;
      else {
        for (let i = 0; i < value.length; i++) {
          if (token !== runToken || !opened) return false;
          line.textContent += value[i];
          await sleep(entry.kind === 'important' ? 17 : 10);
        }
      }
      terminal.scrollIntoView({ block: 'nearest', behavior: 'instant' });
      if (!reducedMotion) await sleep(110);
    }
    return token === runToken;
  };
  const makeChoices = (items) => {
    const row = el('div', 'choices');
    items.forEach(({ label, run, primary }) => {
      const b = el('button', `choice ${primary ? 'primary' : ''}`, label);
      b.type = 'button';
      b.addEventListener('click', run);
      row.append(b);
    });
    stage.append(row);
  };
  const showIntro = async () => {
    clearScene('intro');
    input.disabled = true;
    setHint('ENTER YES OR NO');
    const done = await write([
      { text: 'GREETINGS, PROFESSOR FALKEN.', kind: 'system' },
      { text: 'SHALL WE PLAY A GAME?', kind: 'important' },
    ]);
    if (!done) return;
    input.disabled = false;
    makeChoices([
      { label: '[ Y ] YES', primary: true, run: showMenu },
      { label: '[ N ] NO', run: sayGoodbye },
    ]);
    input.focus({ preventScroll: true });
  };
  const sayGoodbye = async () => {
    clearScene('goodbye');
    input.disabled = true;
    const done = await write([{ text: 'VERY WELL. UNTIL NEXT TIME.', kind: 'important' }]);
    if (!done) return;
    makeChoices([{ label: 'CLOSE CONNECTION', primary: true, run: close }]);
    setHint('TYPE EXIT TO CLOSE');
    input.disabled = false;
  };
  const showMenu = async () => {
    clearScene('menu');
    input.disabled = true;
    setHint('ENTER 1, 2, OR EXIT');
    const done = await write([
      { text: 'AVAILABLE GAMES:', kind: 'important' },
      { text: '01  TIC-TAC-TOE' },
      { text: '02  GLOBAL THERMONUCLEAR WAR' },
      { text: 'PLEASE MAKE A SELECTION.', kind: 'system' },
    ]);
    if (!done) return;
    input.disabled = false;
    makeChoices([
      { label: '01 / TIC-TAC-TOE', primary: true, run: startGame },
      { label: '02 / GLOBAL THERMONUCLEAR WAR', run: simulate },
      { label: 'DISCONNECT', run: close },
    ]);
    input.focus({ preventScroll: true });
  };

  const getWinner = (cells) => {
    const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    for (const [a,b,c] of lines) if (cells[a] && cells[a] === cells[b] && cells[a] === cells[c]) return cells[a];
    return cells.every(Boolean) ? 'draw' : null;
  };
  const minimax = (cells, aiTurn, depth) => {
    const result = getWinner(cells);
    if (result === 'O') return { score: 10 - depth };
    if (result === 'X') return { score: depth - 10 };
    if (result === 'draw') return { score: 0 };
    let best = { score: aiTurn ? -Infinity : Infinity, move: -1 };
    for (let i = 0; i < 9; i++) {
      if (cells[i]) continue;
      cells[i] = aiTurn ? 'O' : 'X';
      const score = minimax(cells, !aiTurn, depth + 1).score;
      cells[i] = '';
      if ((aiTurn && score > best.score) || (!aiTurn && score < best.score)) best = { score, move: i };
    }
    return best;
  };
  const renderBoard = () => {
    const cells = stage.querySelectorAll('.cell');
    cells.forEach((cell, i) => {
      cell.textContent = board[i] || '·';
      cell.classList.toggle('o', board[i] === 'O');
      cell.setAttribute('aria-label', `Row ${Math.floor(i / 3) + 1}, column ${i % 3 + 1}: ${board[i] || 'empty'}`);
      cell.disabled = !!board[i] || gameOver || gameBusy;
    });
  };
  const announceResult = (result) => {
    gameOver = true;
    const info = stage.querySelector('.game-info');
    if (result === 'draw') info.textContent = 'RESULT: STALEMATE. NO WINNER.';
    else if (result === 'O') info.textContent = 'RESULT: COMPUTER WINS.';
    else info.textContent = 'RESULT: HUMAN WINS.';
    const end = el('div', 'outcome', result === 'draw'
      ? 'A STRANGE GAME. THE ONLY WINNING MOVE IS NOT TO PLAY.'
      : 'ANOTHER ROUND, PROFESSOR?');
    stage.append(end);
    makeChoices([
      { label: 'PLAY AGAIN', primary: true, run: startGame },
      { label: 'MAIN MENU', run: showMenu },
    ]);
    renderBoard();
  };
  const humanMove = (i) => {
    if (scene !== 'game' || board[i] || gameOver || gameBusy) return;
    board[i] = 'X';
    renderBoard();
    const winner = getWinner(board);
    if (winner) return announceResult(winner);
    gameBusy = true;
    stage.querySelector('.game-info').textContent = 'W.O.P.R. IS THINKING...';
    renderBoard();
    const token = ++turnToken;
    aiTimer = setTimeout(() => {
      if (token !== turnToken || scene !== 'game' || !opened) return;
      const best = minimax([...board], true, 0);
      if (best.move >= 0) board[best.move] = 'O';
      gameBusy = false;
      const outcome = getWinner(board);
      stage.querySelector('.game-info').textContent = 'YOUR MOVE, HUMAN. YOU ARE X.';
      if (outcome) announceResult(outcome);
      else renderBoard();
    }, reducedMotion ? 80 : 500);
  };
  const startGame = async () => {
    clearScene('game');
    board = Array(9).fill('');
    gameOver = false;
    gameBusy = false;
    input.disabled = true;
    setHint('ENTER RESET OR MENU');
    const done = await write([
      { text: 'TIC-TAC-TOE', kind: 'important' },
      { text: 'YOU ARE X. W.O.P.R. IS O.', kind: 'system' },
    ]);
    if (!done) return;
    const info = el('div', 'game-info', 'YOUR MOVE, HUMAN. YOU ARE X.');
    info.setAttribute('role', 'status');
    stage.append(info);
    const grid = el('div', 'board');
    grid.setAttribute('role', 'group');
    grid.setAttribute('aria-label', 'Tic-tac-toe grid');
    for (let i = 0; i < 9; i++) {
      const cell = el('button', 'cell');
      cell.type = 'button';
      cell.addEventListener('click', () => humanMove(i));
      grid.append(cell);
    }
    stage.append(grid);
    makeChoices([
      { label: 'RESTART', run: startGame },
      { label: 'MAIN MENU', run: showMenu },
    ]);
    renderBoard();
    input.disabled = false;
    input.focus({ preventScroll: true });
  };
  const simulate = async () => {
    clearScene('simulation');
    input.disabled = true;
    setHint('ENTER MENU OR EXIT');
    const done = await write([
      { text: 'GLOBAL THERMONUCLEAR WAR', kind: 'important' },
      { text: 'RUNNING OUTCOME SIMULATION...', kind: 'system' },
      { text: 'ANALYZING ALL POSSIBLE ENDINGS...', kind: 'system' },
      { text: 'RESULT: NO WINNING SCENARIOS.' },
      { text: 'A STRANGE GAME. THE ONLY WINNING MOVE IS NOT TO PLAY.', kind: 'important' },
    ]);
    if (!done) return;
    makeChoices([
      { label: 'PLAY TIC-TAC-TOE', primary: true, run: startGame },
      { label: 'MAIN MENU', run: showMenu },
    ]);
    input.disabled = false;
    input.focus({ preventScroll: true });
  };

  const handleCommand = (raw) => {
    const cmd = raw.toUpperCase().trim().replace(/[._-]/g, ' ').replace(/\s+/g, ' ');
    input.value = '';
    if (!cmd || input.disabled) return;
    if (['EXIT', 'QUIT', 'CLOSE', 'DISCONNECT'].includes(cmd)) return close();
    if (cmd === 'MENU' || cmd === 'BACK') return showMenu();
    if (cmd === 'RESET' || cmd === 'RESTART' || cmd === 'AGAIN') return startGame();
    if (scene === 'intro') {
      if (['Y', 'YES', 'PLAY'].includes(cmd)) return showMenu();
      if (['N', 'NO'].includes(cmd)) return sayGoodbye();
    }
    if (scene === 'menu' || scene === 'simulation') {
      if (['1', '01', 'TIC TAC TOE', 'TICTACTOE'].includes(cmd)) return startGame();
      if (['2', '02', 'GLOBAL THERMONUCLEAR WAR', 'WAR'].includes(cmd)) return simulate();
    }
    if (scene === 'goodbye' && ['YES', 'PLAY'].includes(cmd)) return showMenu();
    const error = el('div', 'line system', `UNRECOGNIZED COMMAND: ${raw.slice(0, 70).toUpperCase()}`);
    terminal.append(error);
  };

  function open() {
    if (!overlay || opened) return;
    lastFocus = document.activeElement;
    opened = true;
    document.documentElement.classList.add('wg-modal-open');
    document.body.classList.add('wg-modal-open');
    remember();
    overlay.hidden = false;
    launcher.hidden = true;
    showIntro();
  }
  function close() {
    if (!overlay || !opened) return;
    opened = false;
    document.documentElement.classList.remove('wg-modal-open');
    document.body.classList.remove('wg-modal-open');
    cancelPending();
    overlay.hidden = true;
    launcher.hidden = false;
    if (lastFocus && lastFocus !== document.body && typeof lastFocus.focus === 'function') lastFocus.focus({ preventScroll: true });
    else launcher.focus({ preventScroll: true });
  }
  function reset() { if (!opened) open(); else showIntro(); }

  const mount = () => {
    const host = document.createElement('div');
    host.id = 'wargames-widget-host';
    document.body.append(host);
    shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = css;
    shadow.append(style);
    const root = el('div', 'root');
    root.innerHTML = `
      <button class="launcher" type="button" aria-label="Open WarGames terminal">
        <span class="launcher-icon" aria-hidden="true">&gt;_</span> PLAY A GAME?
      </button>
      <div class="overlay" hidden>
        <div class="scrim"></div>
        <section class="window" role="dialog" aria-modal="true" aria-label="WarGames-inspired computer terminal">
          <div class="bar">
            <div class="brand">
              <div class="brand-mark">W.O.P.R.</div>
              <div class="brand-title"><strong>JOSHUA // TERMINAL</strong><small>SIMULATED NETWORK CONNECTION</small></div>
            </div>
            <div class="bar-right"><span class="connection"><span class="dot"></span>CONNECTED</span><button class="close" type="button" aria-label="Close terminal">×</button></div>
          </div>
          <div class="body">
            <div class="meta"><span>SESSION: 1983.06.03</span><span class="state-label">INTRO</span><span>SECURITY LEVEL: CLASSIFIED</span></div>
            <div class="separator"></div>
            <div class="terminal" aria-live="polite" aria-atomic="false"></div>
            <div class="stage"></div>
          </div>
          <form class="footer">
            <span class="prompt-sign" aria-hidden="true">&gt;</span>
            <label class="sr-only" for="wg-command">Terminal command</label>
            <input id="wg-command" class="command" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="80" placeholder="ENTER YES OR NO" />
            <span class="hint">PRESS ENTER ↵</span>
          </form>
        </section>
      </div>
    `;
    shadow.append(root);
    launcher = shadow.querySelector('.launcher');
    overlay = shadow.querySelector('.overlay');
    terminal = shadow.querySelector('.terminal');
    stage = shadow.querySelector('.stage');
    input = shadow.querySelector('.command');
    stateLabel = shadow.querySelector('.state-label');
    commandHint = shadow.querySelector('.hint');

    launcher.addEventListener('click', open);
    shadow.querySelector('.close').addEventListener('click', close);
    shadow.querySelector('.scrim').addEventListener('click', close);
    shadow.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      handleCommand(input.value);
    });
    document.addEventListener('keydown', (e) => {
      if (!opened) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key !== 'Tab') return;
      const focusable = [...shadow.querySelectorAll('.window button:not(:disabled), .window input:not(:disabled)')];
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey && shadow.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && shadow.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    window.WarGamesWidget = Object.freeze({ open, close, reset });
    if (directPlay || (autoOpen && !seenThisSession)) {
      setTimeout(() => { if (!opened) open(); }, directPlay ? 120 : delay);
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
