// The item vocabulary: what a component is called on screen and the order the
// curation button cycles through. The words come from `i18n.js`; the data
// stays English.
import { t } from './i18n.js';

/**
 * Starts where an unsorted item is and reaches the three parts a plate wants
 * first — most items are one of those, so most items are one or two taps.
 * @type {(string | null)[]}
 */
export const COMPONENT_ORDER = [null, 'base', 'vegetable', 'protein', 'extra', 'whole'];

/** @param {string | null} component */
export const componentName = (component) => t(component ? `component.${component}` : 'component.none');

/**
 * The same level, said from the item's side. `kurz` / `normal` / `entspannt`
 * describe the evening — an item does not have a mood, it has a cost, and in
 * `Bestand` that is what the row is judged on.
 * @param {string} effort
 */
export const effortName = (effort) => t(`effort.${effort}`);
