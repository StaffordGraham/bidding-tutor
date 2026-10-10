/**
 * handDisplay.js
 * Renders a bridge hand as text, one suit per line:
 *   ♠ AKJ73
 *   ♥ Q82
 *   ♦ AJ4
 *   ♣ K85
 * Suit order is Spades, Hearts, Diamonds, Clubs. Cards run highest (left) to lowest (right).
 * This module only formats and sorts cards for display; it does not evaluate hands.
 */

import { el } from './dom.js';

/** Suits in display order. */
export const SUITS = [
  { key: 'S', symbol: '♠', name: 'Spades' },
  { key: 'H', symbol: '♥', name: 'Hearts' },
  { key: 'D', symbol: '♦', name: 'Diamonds' },
  { key: 'C', symbol: '♣', name: 'Clubs' },
];

/** Rank order from highest to lowest; "T" stands for the ten. */
const RANK_ORDER = 'AKQJT98765432';

/**
 * Look up the printable symbol for a suit key.
 * @param {string} key - "S", "H", "D" or "C".
 * @returns {string}
 */
export function suitSymbol(key) {
  return SUITS.find((s) => s.key === key)?.symbol ?? '';
}

/**
 * Sort the cards of one suit highest to lowest and convert "T" to "10".
 * @param {string} cards - e.g. "QT64".
 * @returns {string} e.g. "Q1064".
 */
export function formatSuitCards(cards = '') {
  return [...String(cards).toUpperCase()]
    .sort((a, b) => RANK_ORDER.indexOf(a) - RANK_ORDER.indexOf(b))
    .map((rank) => (rank === 'T' ? '10' : rank))
    .join('');
}

/**
 * Build the hand element.
 * @param {{S?:string,H?:string,D?:string,C?:string}} cards - Cards per suit.
 * @param {{label?:string}} [options]
 * @returns {HTMLElement}
 */
export function renderHand(cards, options = {}) {
  const rows = SUITS.map((suit) => {
    const text = formatSuitCards(cards?.[suit.key]);
    return el(
      'div',
      { class: `hand-row suit-${suit.key}`, 'aria-label': `${suit.name}: ${text || 'void'}` },
      el('span', { class: 'hand-symbol', 'aria-hidden': 'true' }, suit.symbol),
      el('span', { class: 'hand-cards' }, text || '—')
    );
  });

  return el(
    'div',
    { class: 'hand' },
    options.label ? el('div', { class: 'hand-label' }, options.label) : null,
    rows
  );
}
