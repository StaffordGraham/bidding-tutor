/**
 * scenarioLoader.js
 * Loads lesson data (lesson index, individual lessons, concepts) from JSON files.
 * Results are cached in memory. The service worker caches the files themselves for offline use.
 */

const cache = new Map();

/**
 * Fetch and parse a JSON file, with in-memory caching.
 * @param {string} path - Path relative to index.html.
 * @returns {Promise<any>}
 */
async function fetchJson(path) {
  if (cache.has(path)) return cache.get(path);

  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Could not load ${path} (${response.status}).`);
  }
  const data = await response.json();
  cache.set(path, data);
  return data;
}

/**
 * Load the list of levels and lessons.
 * @returns {Promise<{levels:Array}>}
 */
export function loadLessonIndex() {
  return fetchJson('lessons/index.json');
}

/**
 * Load one lesson file.
 * @param {string} path - Lesson path taken from the index.
 * @returns {Promise<Object>}
 */
export function loadLesson(path) {
  return fetchJson(path);
}

/**
 * Load concepts.json and return it as a map keyed by concept id.
 * @returns {Promise<Object<string, Object>>}
 */
export async function loadConcepts() {
  const data = await fetchJson('concepts.json');
  const map = {};
  for (const concept of data.concepts || []) map[concept.id] = concept;
  return map;
}

/**
 * Find a lesson entry (and its level) in the index.
 * @param {{levels:Array}} index
 * @param {string} lessonId
 * @returns {{level:Object, entry:Object}|null}
 */
export function findLesson(index, lessonId) {
  for (const level of index.levels) {
    const entry = level.lessons.find((lesson) => lesson.id === lessonId);
    if (entry) return { level, entry };
  }
  return null;
}

/**
 * Get the id of the lesson that follows the given one in the same level.
 * @param {{levels:Array}} index
 * @param {string} lessonId
 * @returns {string|null} Null when this is the last lesson of its level.
 */
export function nextLessonId(index, lessonId) {
  const found = findLesson(index, lessonId);
  if (!found) return null;
  const position = found.level.lessons.findIndex((lesson) => lesson.id === lessonId);
  return found.level.lessons[position + 1]?.id ?? null;
}
