// The item vocabulary: what a component is called on screen and the order the
// curation button cycles through. German in the interface, English in the data.

/**
 * Starts where an unsorted item is and reaches the three parts a plate wants
 * first — most items are one of those, so most items are one or two taps.
 * @type {(string | null)[]}
 */
export const COMPONENT_ORDER = [null, 'base', 'vegetable', 'protein', 'extra', 'whole'];

/** @type {Record<string, string>} */
const NAMES = {
  base: 'Sättigung',
  vegetable: 'Gemüse',
  protein: 'Protein',
  extra: 'Extra',
  whole: 'Komplett',
};

/** @param {string | null} component */
export const componentName = (component) => (component && NAMES[component]) || 'ohne Rolle';

/**
 * The same level, said from the item's side. `kurz` / `normal` / `entspannt`
 * describe the evening — an item does not have a mood, it has a cost, and in
 * `Bestand` that is what the row is judged on.
 * @type {Record<string, string>}
 */
const EFFORTS = {
  kurz: 'schnell',
  normal: 'mittel',
  entspannt: 'aufwendig',
};

/** @param {string} effort */
export const effortName = (effort) => EFFORTS[effort] ?? effort;
