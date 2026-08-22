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
  protein: 'Eiweiß',
  extra: 'Extra',
  whole: 'Komplett',
};

/** @param {string | null} component */
export const componentName = (component) => (component && NAMES[component]) || 'ohne Rolle';
