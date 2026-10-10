/**
 * app.js
 * Application entry point: hash router, the five screens (Home, Levels, Lesson,
 * Explanation, Progress) and service worker registration.
 * Each screen replaces the contents of #app. Lesson rules live in lessonEngine.js,
 * explanations in explanationScreen.js, storage in storageManager.js.
 */

import { el, clear, delay } from './dom.js';
import { loadLessonIndex, loadLesson, loadConcepts, findLesson, nextLessonId } from './scenarioLoader.js';
import { LessonEngine } from './lessonEngine.js';
import { renderHand } from './handDisplay.js';
import { buildAuctionTable, SEAT_NAMES } from './auctionDisplay.js';
import { createBiddingBox } from './biddingBox.js';
import { renderExplanation } from './explanationScreen.js';
import * as storage from './storageManager.js';

const root = document.getElementById('app');

/** Pause before each computer call, and before leaving a finished lesson (milliseconds). */
const COMPUTER_DELAY_MS = 800;
const FINISH_DELAY_MS = 1000;

/** Shared application state. */
const state = {
  index: null,       // lesson index (levels and lessons)
  concepts: null,    // concept library keyed by id
  result: null,      // { lesson, result } from the lesson that just ended
  lessonToken: 0,    // incremented on every navigation to cancel stale lesson timers
};

/* ==========================================================================
   Small shared helpers
   ========================================================================== */

/**
 * Replace the current screen.
 * @param {...(Node|null)} nodes
 */
function mount(...nodes) {
  root.replaceChildren(...nodes.filter(Boolean));
  window.scrollTo(0, 0);
}

/**
 * Standard screen header with an optional back link.
 * @param {string} title
 * @param {string|null} backHref
 * @param {string} [backLabel]
 * @returns {HTMLElement}
 */
function header(title, backHref, backLabel = 'Back') {
  return el(
    'header',
    { class: 'app-header' },
    backHref ? el('a', { class: 'back-link', href: backHref }, `‹ ${backLabel}`) : el('span'),
    el('div', { class: 'header-title' }, title),
    el('span')
  );
}

/** Load the lesson index and concept library once. */
async function ensureData() {
  if (!state.index || !state.concepts) {
    [state.index, state.concepts] = await Promise.all([loadLessonIndex(), loadConcepts()]);
  }
}

/**
 * Chip describing the student's history with one lesson.
 * @param {string} lessonId
 * @returns {HTMLElement}
 */
function statusChip(lessonId) {
  const record = storage.getLessonRecord(lessonId);
  if (record.passes > 0) return el('span', { class: 'chip done' }, 'Completed');
  if (record.lastOutcome === 'fail') return el('span', { class: 'chip failed' }, 'Failed');
  if (record.attempts > 0) return el('span', { class: 'chip' }, 'Attempted');
  return el('span', { class: 'chip' }, 'New');
}

/** @returns {boolean} True on iPhone/iPad. */
function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** @returns {boolean} True when running as an installed home-screen app. */
function isStandalone() {
  return window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

/* ==========================================================================
   Home screen
   ========================================================================== */

/** Title, Start button and Progress button (plus an install hint on iPhone Safari). */
function showHome() {
  let hint = null;
  if (isIos() && !isStandalone() && !storage.isInstallHintDismissed()) {
    hint = el(
      'div',
      { class: 'card hint' },
      el('strong', {}, 'Install Bidding Tutor'),
      el('p', {}, 'Tap the Share button, then choose Add to Home Screen. The app then works offline.'),
      el('button', { type: 'button', onclick: () => { storage.dismissInstallHint(); hint.remove(); } }, 'Dismiss')
    );
  }

  mount(
    el(
      'main',
      { class: 'home' },
      el(
        'div',
        { class: 'home-suits', 'aria-hidden': 'true' },
        el('span', { class: 'suit-S' }, '♠'),
        el('span', { class: 'suit-H' }, '♥'),
        el('span', { class: 'suit-D' }, '♦'),
        el('span', { class: 'suit-C' }, '♣')
      ),
      el('h1', {}, 'Bidding Tutor'),
      el('p', { class: 'tagline' }, 'Standard American with a strong 1NT'),
      el(
        'div',
        { class: 'btn-stack' },
        el('a', { class: 'btn', href: '#/levels' }, 'Start'),
        el('a', { class: 'btn secondary', href: '#/progress' }, 'Progress')
      ),
      hint
    )
  );
}

/* ==========================================================================
   Level screen
   ========================================================================== */

/**
 * Levels overview, or the lesson list for one level.
 * @param {string} [levelArg] - Level number from the URL.
 */
function showLevels(levelArg) {
  const selected = state.index.levels.find((level) => String(level.level) === levelArg);
  if (selected) return showLessonList(selected);

  const cards = state.index.levels.map((level) => {
    const done = level.lessons.filter((l) => storage.getLessonRecord(l.id).passes > 0).length;
    return el(
      'a',
      { class: 'card level-card', href: `#/levels/${level.level}` },
      el('div', { class: 'level-num' }, `Level ${level.level}`),
      el('div', { class: 'level-name' }, level.title),
      el('div', { class: 'level-desc' }, level.description),
      el('div', { class: 'level-progress' }, `${done} of ${level.lessons.length} completed`)
    );
  });

  mount(header('Levels', '#/home', 'Home'), el('h1', { class: 'page-title' }, 'Choose a level'), ...cards);
}

/**
 * Lessons within one level.
 * @param {Object} level
 */
function showLessonList(level) {
  const rows = level.lessons.map((lesson) =>
    el(
      'a',
      { class: 'card lesson-link', href: `#/lesson/${lesson.id}` },
      el('span', { class: 'lesson-name' }, lesson.title),
      statusChip(lesson.id)
    )
  );

  mount(
    header(`Level ${level.level}`, '#/levels', 'Levels'),
    el('h1', { class: 'page-title' }, level.title),
    ...rows
  );
}

/* ==========================================================================
   Lesson screen
   ========================================================================== */

/**
 * Run a lesson: show the student's hand, play North's scripted calls, and check South's bids.
 * @param {string} lessonId
 */
async function showLesson(lessonId) {
  const token = state.lessonToken;
  const found = findLesson(state.index, lessonId);
  if (!found) throw new Error('That lesson does not exist.');

  const lesson = await loadLesson(found.entry.path);
  if (token !== state.lessonToken) return; // the user navigated away while loading

  const engine = new LessonEngine(lesson);

  // --- Build the screen ---
  const auctionHolder = el('div', { class: 'auction-holder' });
  const turnLine = el('div', { class: 'turn-line' });
  const bidBox = createBiddingBox({ onConfirm: handleBid });

  const statusCard = el(
    'section',
    { class: 'card' },
    el('h1', { class: 'lesson-title' }, lesson.title),
    el('p', { class: 'objective' }, el('strong', {}, 'Objective: '), lesson.objective),
    el('p', { class: 'meta' }, `You are South. Dealer: ${SEAT_NAMES[lesson.dealer]}.`)
  );

  const handCard = el(
    'section',
    { class: 'card' },
    el('h2', { class: 'card-title' }, 'Your hand'),
    renderHand(lesson.hands[engine.student].cards)
  );

  const auctionCard = el('section', { class: 'card' }, el('h2', { class: 'card-title' }, 'Auction'), auctionHolder, turnLine);

  mount(header(`Level ${found.level.level}`, `#/levels/${found.level.level}`, 'Quit'), statusCard, handCard, auctionCard, bidBox.element);
  refreshAuction();
  playComputerTurns();

  // --- Behaviour ---

  /** Redraw the auction table from the engine's calls. */
  function refreshAuction() {
    clear(auctionHolder);
    auctionHolder.append(
      buildAuctionTable(lesson.dealer, engine.calls, { awaitingSeat: engine.isStudentTurn() ? engine.student : null })
    );
  }

  /** Play every computer call up to the student's next turn, or finish the lesson. */
  async function playComputerTurns() {
    bidBox.setEnabled(false);

    while (engine.isComputerTurn()) {
      turnLine.textContent = `${SEAT_NAMES[engine.currentStep.seat]} is bidding…`;
      await delay(COMPUTER_DELAY_MS);
      if (token !== state.lessonToken) return;
      engine.playComputerStep();
      refreshAuction();
    }

    if (engine.status === 'completed') {
      turnLine.textContent = 'Auction complete.';
      await delay(FINISH_DELAY_MS);
      if (token !== state.lessonToken) return;
      finish();
      return;
    }

    turnLine.textContent = 'Your turn.';
    refreshAuction();
    bidBox.setEnabled(true);
  }

  /**
   * Handle the student's confirmed call: continue if correct, end the lesson if not.
   * @param {string} call
   */
  function handleBid(call) {
    bidBox.setEnabled(false);
    const outcome = engine.submitStudentCall(call);
    refreshAuction();
    if (outcome.correct) {
      playComputerTurns();
    } else {
      finish();
    }
  }

  /** Save the result and open the explanation screen. */
  function finish() {
    const result = engine.getResult();
    storage.recordResult(lesson.id, result.outcome === 'pass');
    state.result = { lesson, result };
    location.hash = '#/explain';
  }
}

/* ==========================================================================
   Explanation screen
   ========================================================================== */

/** Show the explanation for the lesson that just ended. */
function showExplanation() {
  if (!state.result) {
    location.hash = '#/levels';
    return;
  }

  const { lesson, result } = state.result;
  const found = findLesson(state.index, lesson.id);
  const next = nextLessonId(state.index, lesson.id);
  const container = el('div');

  renderExplanation(container, {
    lesson,
    concepts: state.concepts,
    result,
    links: {
      retry: `#/lesson/${lesson.id}`,
      next: next ? `#/lesson/${next}` : null,
      levels: `#/levels/${found.level.level}`,
    },
  });

  mount(header('Explanation', null), container);
}

/* ==========================================================================
   Progress screen
   ========================================================================== */

/** Totals plus a status line for every lesson, with a reset button. */
function showProgress() {
  const totals = storage.getTotals();

  const stat = (num, label) => el('div', { class: 'stat' }, el('div', { class: 'num' }, String(num)), el('div', { class: 'lbl' }, label));

  const levelCards = state.index.levels.map((level) =>
    el(
      'section',
      { class: 'card' },
      el('h2', { class: 'card-title' }, `Level ${level.level}: ${level.title}`),
      level.lessons.map((lesson) => {
        const record = storage.getLessonRecord(lesson.id);
        return el(
          'div',
          { class: 'progress-row' },
          el(
            'div',
            {},
            el('div', {}, lesson.title),
            el('div', { class: 'detail' }, `${record.attempts} attempts, ${record.passes} passed, ${record.fails} failed`)
          ),
          statusChip(lesson.id)
        );
      })
    )
  );

  const resetButton = el(
    'button',
    {
      type: 'button',
      class: 'btn danger',
      onclick: () => {
        if (window.confirm('Delete all saved progress? This cannot be undone.')) {
          storage.resetProgress();
          showProgress();
        }
      },
    },
    'Reset progress'
  );

  mount(
    header('Progress', '#/home', 'Home'),
    el('div', { class: 'stats' }, stat(totals.attempted, 'Attempted'), stat(totals.completed, 'Completed'), stat(totals.failed, 'Failed')),
    ...levelCards,
    el('div', { class: 'btn-stack' }, resetButton)
  );
}

/* ==========================================================================
   Errors, router and start-up
   ========================================================================== */

/**
 * Friendly error screen.
 * @param {Error} error
 */
function showError(error) {
  console.error(error);
  mount(
    el(
      'div',
      { class: 'error-box' },
      el('h1', { class: 'page-title' }, 'Something went wrong'),
      el('p', {}, error.message || 'The lesson data could not be loaded. Check your connection and try again.'),
      el('a', { class: 'btn', href: '#/home' }, 'Back to home')
    )
  );
}

/** Read the URL hash and show the matching screen. */
async function route() {
  const token = (state.lessonToken += 1); // cancels any running lesson timers
  const [name, arg] = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);

  try {
    if (!name || name === 'home') return showHome();

    await ensureData();
    if (token !== state.lessonToken) return; // the user navigated again while data was loading
    switch (name) {
      case 'levels': return showLevels(arg);
      case 'lesson': return await showLesson(arg);
      case 'explain': return showExplanation();
      case 'progress': return showProgress();
      default: return showHome();
    }
  } catch (error) {
    showError(error);
  }
}

/**
 * Show a small toast with an action button.
 * @param {string} message
 * @param {string} actionLabel
 * @param {()=>void} onAction
 */
function showToast(message, actionLabel, onAction) {
  const area = document.getElementById('toast-area');
  area.replaceChildren(el('div', { class: 'toast' }, message, el('button', { type: 'button', onclick: onAction }, actionLabel)));
}

/** Register the service worker (offline support) and offer updates when a new version is ready. */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;

  // Reload once when a new version takes over (but not on the very first install)
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    window.location.reload();
  });

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('service-worker.js');
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            showToast('A new version is ready.', 'Reload', () => worker.postMessage({ type: 'SKIP_WAITING' }));
          }
        });
      });
    } catch (error) {
      console.warn('Service worker registration failed:', error);
    }
  });
}

window.addEventListener('hashchange', route);
registerServiceWorker();
route();
