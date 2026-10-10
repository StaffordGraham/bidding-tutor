/**
 * storageManager.js
 * Progress tracking in LocalStorage.
 *
 * Stored under one key as JSON:
 *   {
 *     version: 1,
 *     lessons: {
 *       "<lessonId>": { attempts, passes, fails, lastOutcome, lastAttemptAt }
 *     },
 *     installHintDismissed: false
 *   }
 *
 * Every storage call is wrapped in try/catch. If LocalStorage is unavailable or full
 * (for example in some private modes), data is kept in memory for the session instead.
 */

const KEY = 'bt.v1.data';
const DATA_VERSION = 1;

/** Fallback used when LocalStorage cannot be used. */
let memoryCopy = null;

/** @returns {{version:number, lessons:Object, installHintDismissed:boolean}} */
function emptyData() {
  return { version: DATA_VERSION, lessons: {}, installHintDismissed: false };
}

/**
 * Read all stored data, repairing it if it is missing or damaged.
 * @returns {{version:number, lessons:Object, installHintDismissed:boolean}}
 */
function load() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.lessons) return parsed;
    }
  } catch (error) {
    // Fall through to the in-memory copy
  }
  if (!memoryCopy) memoryCopy = emptyData();
  return memoryCopy;
}

/**
 * Write all data back to LocalStorage.
 * @param {Object} data
 */
function save(data) {
  memoryCopy = data;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
  } catch (error) {
    // Storage full or blocked: the in-memory copy keeps the app working
  }
}

/**
 * Get the stored record for one lesson.
 * @param {string} lessonId
 * @returns {{attempts:number, passes:number, fails:number, lastOutcome:string|null, lastAttemptAt:string|null}}
 */
export function getLessonRecord(lessonId) {
  const record = load().lessons[lessonId];
  return record || { attempts: 0, passes: 0, fails: 0, lastOutcome: null, lastAttemptAt: null };
}

/**
 * Record the end of an attempt.
 * @param {string} lessonId
 * @param {boolean} passed - True if the lesson was completed, false if the student bid wrongly.
 */
export function recordResult(lessonId, passed) {
  const data = load();
  const record = getLessonRecord(lessonId);

  data.lessons[lessonId] = {
    attempts: record.attempts + 1,
    passes: record.passes + (passed ? 1 : 0),
    fails: record.fails + (passed ? 0 : 1),
    lastOutcome: passed ? 'pass' : 'fail',
    lastAttemptAt: new Date().toISOString(),
  };
  save(data);
}

/**
 * Totals shown on the progress screen.
 * attempted = lessons tried at least once
 * completed = lessons passed at least once
 * failed    = lessons whose most recent attempt was a fail
 * @returns {{attempted:number, completed:number, failed:number}}
 */
export function getTotals() {
  const records = Object.values(load().lessons);
  return {
    attempted: records.filter((r) => r.attempts > 0).length,
    completed: records.filter((r) => r.passes > 0).length,
    failed: records.filter((r) => r.lastOutcome === 'fail').length,
  };
}

/** Delete all progress (the install hint setting is kept). */
export function resetProgress() {
  const data = load();
  data.lessons = {};
  save(data);
}

/** @returns {boolean} True if the user has dismissed the "Add to Home Screen" hint. */
export function isInstallHintDismissed() {
  return Boolean(load().installHintDismissed);
}

/** Remember that the user dismissed the "Add to Home Screen" hint. */
export function dismissInstallHint() {
  const data = load();
  data.installHintDismissed = true;
  save(data);
}
