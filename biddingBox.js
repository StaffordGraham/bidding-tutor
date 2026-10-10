/**
 * biddingBox.js
 * Bridge-style bidding box: Pass / Double / Redouble, then 1♣ through 7NT.
 * The student taps a call to select it, then taps "Bid" to confirm. This guards against
 * mis-taps, because a wrong call ends the lesson.
 * The box does not know which calls are legal; the lesson engine decides what is correct.
 */

import { el, clear } from './dom.js';
import { callElement } from './auctionDisplay.js';

/** Denominations in bidding-box order (lowest to highest). */
const DENOMINATIONS = ['C', 'D', 'H', 'S', 'NT'];

/** Levels 1 to 7. */
const LEVELS = [1, 2, 3, 4, 5, 6, 7];

/**
 * Create the bidding box.
 * @param {{onConfirm:(call:string)=>void}} handlers - Called with the call code when confirmed.
 * @returns {{element:HTMLElement, setEnabled:(on:boolean)=>void, reset:()=>void}}
 */
export function createBiddingBox({ onConfirm }) {
  let selected = null;
  let enabled = false;
  const buttons = new Map();

  const readout = el('div', { class: 'bid-readout', 'aria-live': 'polite' });
  const confirmButton = el('button', { type: 'button', class: 'btn', onclick: confirm }, 'Bid');

  /** Build one call button and remember it so selection can be highlighted. */
  function makeButton(code, content, extraClass = '') {
    const button = el(
      'button',
      { type: 'button', class: `bid-btn ${extraClass}`.trim(), 'data-call': code, onclick: () => select(code) },
      content
    );
    buttons.set(code, button);
    return button;
  }

  const specialRow = el(
    'div',
    { class: 'bid-special' },
    makeButton('P', 'Pass', 'special'),
    makeButton('X', 'Double', 'special'),
    makeButton('XX', 'Redouble', 'special')
  );

  const grid = el(
    'div',
    { class: 'bid-grid' },
    LEVELS.flatMap((level) =>
      DENOMINATIONS.map((denom) => {
        const code = `${level}${denom}`;
        return makeButton(code, callElement(code));
      })
    )
  );

  const element = el(
    'div',
    { class: 'bidding-box disabled', role: 'group', 'aria-label': 'Bidding box' },
    specialRow,
    grid,
    el('div', { class: 'bid-confirm' }, readout, confirmButton)
  );

  /** Mark a call as selected and update the readout. */
  function select(code) {
    if (!enabled) return;
    selected = code;
    for (const [key, button] of buttons) button.classList.toggle('selected', key === code);
    clear(readout);
    readout.append('Your call: ', callElement(code, { long: true }));
    confirmButton.disabled = false;
  }

  /** Send the selected call to the lesson. */
  function confirm() {
    if (!enabled || !selected) return;
    const call = selected;
    reset();
    onConfirm(call);
  }

  /** Clear the current selection. */
  function reset() {
    selected = null;
    for (const button of buttons.values()) button.classList.remove('selected');
    clear(readout);
    readout.append('Choose your call');
    confirmButton.disabled = true;
  }

  /**
   * Enable or disable the whole box (disabled while the computer is bidding).
   * @param {boolean} on
   */
  function setEnabled(on) {
    enabled = on;
    element.classList.toggle('disabled', !on);
    for (const button of buttons.values()) button.disabled = !on;
    if (!on) reset();
    confirmButton.disabled = !on || !selected;
  }

  reset();
  setEnabled(false);

  return { element, setEnabled, reset };
}
