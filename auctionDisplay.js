/**
 * auctionDisplay.js
 * Call formatting helpers and the auction table.
 * Calls are stored as codes: "P", "X", "XX", or level + denomination such as "1NT", "2C", "4S".
 * Nothing here judges whether a call is legal or sensible; it only formats.
 */

import { el } from './dom.js';
import { suitSymbol } from './handDisplay.js';

/** Table column order: West, North, East, South (clockwise from the left). */
export const SEAT_ORDER = ['W', 'N', 'E', 'S'];

/** Full seat names. */
export const SEAT_NAMES = { N: 'North', E: 'East', S: 'South', W: 'West' };

const BID_PATTERN = /^([1-7])(C|D|H|S|NT)$/;

/**
 * Split a call code into its parts.
 * @param {string} code
 * @returns {{type:'pass'|'double'|'redouble'|'bid'|'unknown', level?:number, denom?:string}}
 */
export function parseCall(code) {
  if (code === 'P') return { type: 'pass' };
  if (code === 'X') return { type: 'double' };
  if (code === 'XX') return { type: 'redouble' };
  const match = BID_PATTERN.exec(code || '');
  if (match) return { type: 'bid', level: Number(match[1]), denom: match[2] };
  return { type: 'unknown' };
}

/**
 * Plain-text version of a call, used in explanations. Example: "2♠", "Pass".
 * @param {string} code
 * @param {{long?:boolean}} [options] - long: spell out Double/Redouble (default true).
 * @returns {string}
 */
export function callText(code, { long = true } = {}) {
  const call = parseCall(code);
  switch (call.type) {
    case 'pass': return 'Pass';
    case 'double': return long ? 'Double' : 'X';
    case 'redouble': return long ? 'Redouble' : 'XX';
    case 'bid': return `${call.level}${call.denom === 'NT' ? 'NT' : suitSymbol(call.denom)}`;
    default: return String(code ?? '');
  }
}

/**
 * Coloured element for a call. The suit symbol takes its suit colour.
 * @param {string} code
 * @param {{long?:boolean}} [options] - long: spell out Double/Redouble (default false).
 * @returns {HTMLElement}
 */
export function callElement(code, { long = false } = {}) {
  const call = parseCall(code);
  if (call.type === 'bid' && call.denom !== 'NT') {
    return el(
      'span',
      { class: 'call', 'aria-label': callText(code) },
      String(call.level),
      el('span', { class: `suit-${call.denom}` }, suitSymbol(call.denom))
    );
  }
  return el('span', { class: 'call' }, callText(code, { long }));
}

/**
 * Build the auction table.
 * @param {string} dealer - Seat that made the first call.
 * @param {{seat:string, call:string}[]} calls - Calls in order.
 * @param {Object} [options]
 * @param {string|null} [options.awaitingSeat] - If set, shows "?" in the next cell.
 * @param {number|null} [options.markIndex] - Index in `calls` to highlight (the failed step).
 * @returns {HTMLElement}
 */
export function buildAuctionTable(dealer, calls, options = {}) {
  const { awaitingSeat = null, markIndex = null } = options;
  const cells = [];

  // Empty cells before the dealer's first call
  const offset = Math.max(0, SEAT_ORDER.indexOf(dealer));
  for (let i = 0; i < offset; i += 1) cells.push({ kind: 'blank' });

  calls.forEach((entry, index) => {
    cells.push({ kind: 'call', call: entry.call, mark: index === markIndex });
  });

  if (awaitingSeat) cells.push({ kind: 'waiting' });

  // Split into rows of four
  const rows = [];
  for (let i = 0; i < cells.length; i += 4) rows.push(cells.slice(i, i + 4));

  const headers = SEAT_ORDER.map((seat) => el('th', { scope: 'col' }, seat === 'S' ? 'South (you)' : SEAT_NAMES[seat]));

  const body = rows.map((row) =>
    el(
      'tr',
      {},
      row.map((cell) => {
        if (cell.kind === 'call') return el('td', { class: cell.mark ? 'mark' : '' }, callElement(cell.call));
        if (cell.kind === 'waiting') return el('td', { class: 'waiting' }, '?');
        return el('td', {}, '');
      })
    )
  );

  return el(
    'table',
    { class: 'auction', 'aria-label': 'Auction' },
    el('thead', {}, el('tr', {}, headers)),
    el('tbody', {}, body)
  );
}
