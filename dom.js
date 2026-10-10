/**
 * dom.js
 * Tiny helpers for building DOM without a framework.
 * Text is always added as text nodes, never as HTML, so lesson data cannot inject markup.
 */

/**
 * Create an element.
 * @param {string} tag - Tag name, e.g. "div".
 * @param {Object} [attrs] - Attributes. Special keys: "class", "text", "dataset", and "onclick"-style handlers.
 * @param {...any} children - Strings, Nodes, arrays of those, or null/false (ignored).
 * @returns {HTMLElement}
 */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;

    if (key === 'class') {
      node.className = value;
    } else if (key === 'text') {
      node.textContent = value;
    } else if (key === 'dataset') {
      Object.assign(node.dataset, value);
    } else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else {
      node.setAttribute(key, value === true ? '' : String(value));
    }
  }

  appendChildren(node, children);
  return node;
}

/**
 * Append children to a node, flattening arrays and skipping empty values.
 * @param {Node} node
 * @param {any[]} children
 */
export function appendChildren(node, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/**
 * Remove all children from a node.
 * @param {Node} node
 */
export function clear(node) {
  node.replaceChildren();
}

/**
 * Promise-based delay, used for the computer's "thinking" pause.
 * @param {number} ms
 * @returns {Promise<void>}
 */
export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
