/**
 * explanationScreen.js
 * Builds and renders the explanation screen shown after every lesson.
 *
 * Explanations are generated from reusable concept descriptions in concepts.json.
 * Each auction step in a lesson lists concept ids; each concept has text templates with
 * placeholders such as {call}, {hcp}, {shape}, {longest}, {hand}, {suit}.
 * Placeholder values come from the step's `params`, the bidder's hand `facts`, and the step itself.
 */

import { el } from './dom.js';
import { renderHand } from './handDisplay.js';
import { buildAuctionTable, callElement, callText, SEAT_NAMES } from './auctionDisplay.js';

/**
 * Replace {name} placeholders in a template. Unknown placeholders become empty text.
 * @param {string} template
 * @param {Object} vars
 * @returns {string}
 */
export function fillTemplate(template = '', vars = {}) {
  return template.replace(/\{(\w+)\}/g, (match, name) => (vars[name] !== undefined ? String(vars[name]) : ''));
}

/**
 * Gather the placeholder values for one auction step.
 * @param {Object} lesson
 * @param {Object} step - Auction step.
 * @param {Object} [extra] - Extra values, e.g. { wrongCall }.
 * @returns {Object}
 */
function stepVariables(lesson, step, extra = {}) {
  const facts = lesson.hands?.[step.seat]?.facts || {};
  const isStudent = step.seat === (lesson.student || 'S');
  return {
    call: callText(step.call),
    seat: SEAT_NAMES[step.seat],
    hand: isStudent ? 'Your hand' : `${SEAT_NAMES[step.seat]}'s hand`,
    hcp: facts.hcp,
    shape: facts.shape,
    longest: facts.longest,
    ...(step.params || {}),
    ...extra,
  };
}

/**
 * Turn a step's concept ids into readable explanation pieces.
 * @param {Object} lesson
 * @param {Object<string,Object>} concepts - Concept library keyed by id.
 * @param {Object} step
 * @returns {{title:string, meaning:string, reason:string}[]}
 */
function explainStep(lesson, concepts, step) {
  const vars = stepVariables(lesson, step);
  return (step.concepts || [])
    .map((id) => concepts[id])
    .filter(Boolean)
    .map((concept) => ({
      title: concept.title,
      meaning: fillTemplate(concept.meaning, vars),
      reason: fillTemplate(concept.reason, vars),
    }));
}

/**
 * Build the explanation content for a finished lesson.
 * @param {Object} lesson
 * @param {Object<string,Object>} concepts
 * @param {{outcome:string, stepIndex:number|null, studentCall:string|null, expectedCall:string|null}} result
 * @returns {Object} { mode, failed? , steps? }
 */
export function buildExplanation(lesson, concepts, result) {
  if (result.outcome === 'fail') {
    const step = lesson.auction[result.stepIndex];

    // Targeted feedback if the lesson names this wrong call, otherwise the generic message
    const targeted = (step.commonErrors || []).find((e) => e.call === result.studentCall);
    const mistakeConcept = concepts[targeted?.concept];
    const mistakeTemplate = mistakeConcept?.mistake || concepts.INCORRECT_GENERIC?.mistake || '';
    const mistake = fillTemplate(
      mistakeTemplate,
      stepVariables(lesson, step, { wrongCall: callText(result.studentCall) })
    );

    return { mode: 'fail', failed: { step, pieces: explainStep(lesson, concepts, step), mistake } };
  }

  // Pass: explain every step that has concepts (student and computer calls)
  const steps = lesson.auction
    .map((step) => ({ step, pieces: explainStep(lesson, concepts, step) }))
    .filter((item) => item.pieces.length > 0);

  return { mode: 'pass', steps };
}

/** Heading line for one explained call, e.g. "South 2♠" with a coloured suit symbol. */
function callHeading(step) {
  return el('div', { class: 'why-head' }, `${SEAT_NAMES[step.seat]} `, callElement(step.call, { long: true }));
}

/** Render the "why" block for the failed step or for every step in a pass. */
function renderWhy(explanation) {
  if (explanation.mode === 'fail') {
    const { step, pieces, mistake } = explanation.failed;
    return el(
      'div',
      { class: 'why-item' },
      callHeading(step),
      pieces.map((piece) =>
        el('div', { class: 'why-body' }, el('strong', {}, `${piece.title}. `), `${piece.meaning} ${piece.reason}`)
      ),
      el('div', { class: 'why-mistake' }, mistake)
    );
  }

  return explanation.steps.map(({ step, pieces }) =>
    el(
      'div',
      { class: 'why-item' },
      callHeading(step),
      pieces.map((piece) =>
        el('div', { class: 'why-body' }, el('strong', {}, `${piece.title}. `), `${piece.meaning} ${piece.reason}`)
      )
    )
  );
}

/**
 * Render the whole explanation screen into a container.
 * @param {HTMLElement} container
 * @param {Object} context
 * @param {Object} context.lesson
 * @param {Object<string,Object>} context.concepts
 * @param {Object} context.result - From LessonEngine.getResult().
 * @param {{retry:string, next:string|null, levels:string}} context.links - Hash links for the buttons.
 */
export function renderExplanation(container, { lesson, concepts, result, links }) {
  const passed = result.outcome === 'pass';
  const explanation = buildExplanation(lesson, concepts, result);

  // The correct auction is the scripted auction plus the optional epilogue
  const fullAuction = [...lesson.auction, ...(lesson.epilogue || [])].map((s) => ({ seat: s.seat, call: s.call }));

  const banner = el(
    'div',
    { class: `banner ${passed ? 'pass' : 'fail'}` },
    el('h1', {}, passed ? 'Well done' : 'Not quite'),
    el('p', {}, passed ? lesson.title : 'The lesson stopped at your first incorrect call.')
  );

  // Student bid vs correct bid (only meaningful on a fail; on a pass, show the final call)
  const compare = passed
    ? null
    : el(
        'div',
        { class: 'compare' },
        el('div', { class: 'card' }, el('div', { class: 'card-title' }, 'Your bid'), el('div', { class: 'big-call' }, callElement(result.studentCall, { long: true }))),
        el('div', { class: 'card' }, el('div', { class: 'card-title' }, 'Correct bid'), el('div', { class: 'big-call' }, callElement(result.expectedCall, { long: true })))
      );

  const contract = lesson.outcome?.contract
    ? el(
        'p',
        { class: 'contract-line' },
        'Final contract: ',
        callElement(lesson.outcome.contract),
        ` by ${SEAT_NAMES[lesson.outcome.declarer] || ''}`
      )
    : null;

  const auctionCard = el(
    'section',
    { class: 'card' },
    el('h2', { class: 'card-title' }, 'Correct auction'),
    buildAuctionTable(lesson.dealer, fullAuction, { markIndex: passed ? null : result.stepIndex }),
    contract
  );

  const handsGrid = el(
    'div',
    { class: 'hands-grid' },
    el('section', { class: 'card' }, renderHand(lesson.hands.S.cards, { label: 'South (you)' })),
    el('section', { class: 'card' }, renderHand(lesson.hands.N.cards, { label: 'North' }))
  );

  const whyCard = el(
    'section',
    { class: 'card' },
    el('h2', { class: 'card-title' }, passed ? 'Why each bid works' : 'Why'),
    renderWhy(explanation)
  );

  // Key ideas: the lesson's concepts with their one-line rules
  const ideas = (lesson.concepts || []).map((id) => concepts[id]).filter(Boolean);
  const ideasCard = ideas.length
    ? el(
        'section',
        { class: 'card' },
        el('h2', { class: 'card-title' }, 'Key ideas'),
        el(
          'ul',
          { class: 'rule-list' },
          ideas.map((concept) => el('li', {}, el('strong', {}, `${concept.title}: `), concept.rule))
        )
      )
    : null;

  const actions = el(
    'div',
    { class: 'btn-stack' },
    passed && links.next ? el('a', { class: 'btn', href: links.next }, 'Next lesson') : null,
    el('a', { class: passed ? 'btn secondary' : 'btn', href: links.retry }, passed ? 'Play again' : 'Try again'),
    el('a', { class: 'btn secondary', href: links.levels }, 'Back to lessons')
  );

  // Skip empty sections (replaceChildren would turn null into the text "null")
  container.replaceChildren(...[banner, compare, auctionCard, handsGrid, whyCard, ideasCard, actions].filter(Boolean));
}
