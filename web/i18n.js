// Every word the interface says, in the two languages the household reads.
// The item names themselves are never in here — those are data, typed by
// whoever added them, and they stay exactly as they were typed.
//
// German is the house language and the fallback: a key missing from `en` shows
// its German rather than its key, because a word nobody understands still
// beats `day.suggestions` on the screen.

/** @type {Record<string, Record<string, string>>} */
const STRINGS = {
  de: {
    'nav.week': 'Woche',
    'nav.inventory': 'Bestand',
    'nav.prevWeek': 'Woche zurück',
    'nav.thisWeek': 'Diese Woche',
    'nav.nextWeek': 'Woche vor',

    'board.week': 'KW {week}',
    'board.today': 'heute',
    'board.offline': 'offline — die Woche kann veraltet sein',
    'board.unreachable': 'Keine Verbindung. Sobald das Netz da ist, ist die Woche da.',

    'day.level': 'Aufwand für {weekday}, gerade: {effort}',
    'day.suggestions': 'Vorschläge',
    'day.propose': 'Abend vorschlagen',
    'day.tooMuch': '⚠︎ Aufwendiger als ein {evening}: {items}.',
    'day.empty': 'Der Bestand ist noch leer.',
    'day.search': 'suchen oder neu …',
    'day.searchLabel': 'Zutat suchen oder anlegen',
    'day.add': 'hinzufügen',
    'day.addItem': '{name} hinzufügen',
    'day.createAndAdd': '„{name}“ anlegen und hinzufügen',
    'day.remove': '{name} entfernen',

    'reason.retired': 'pausiert',
    'reason.effort': 'zu aufwendig für {effort}',
    'reason.alone': 'reicht allein',
    'reason.doubled': 'schon {component} dabei',
    'reason.pair': 'zuletzt mit {partner}',
    'reason.gap': '{component} fehlt noch',
    'reason.fresh': 'noch nie geplant',
    'reason.due': 'wieder dran · {ago}',
    'reason.planned': 'schon eingeplant',
    'reason.ago': 'vor {days} Tagen',
    'reason.agoOne': 'vor einem Tag',

    'inventory.title': 'Bestand',
    'inventory.search': 'suchen oder neu …',
    'inventory.searchLabel': 'Item suchen oder anlegen',
    'inventory.create': 'anlegen',
    'inventory.filter': 'Filter, zeigt gerade: {filter}',
    'inventory.filter.all': 'alle',
    'inventory.filter.unsorted': 'ohne Rolle',
    'inventory.filter.unused': 'ungenutzt',
    'inventory.done': 'fertig',
    'inventory.name': 'Name',
    'inventory.paused': 'pausiert',
    'inventory.pause': 'pausieren',
    'inventory.resume': 'wieder aufnehmen',
    'inventory.delete': 'löschen',
    'inventory.confirmDelete': 'wirklich löschen?',
    'inventory.nothingFound': 'Nichts gefunden.',
    'inventory.empty': 'Noch nichts drin. Was esst ihr? Oben eintippen.',

    // The part an item plays on a plate.
    'component.base': 'Sättigung',
    'component.vegetable': 'Gemüse',
    'component.protein': 'Protein',
    'component.extra': 'Extra',
    'component.whole': 'Komplett',
    'component.none': 'ohne Rolle',

    // The same level from three sides: the chip on the board, the evening in a
    // sentence, and the cost an item carries in `Bestand`.
    'level.kurz': 'kurz',
    'level.normal': 'normal',
    'level.entspannt': 'entspannt',
    'evening.kurz': 'kurzer Abend',
    'evening.normal': 'normaler Abend',
    'evening.entspannt': 'entspannter Abend',
    'effort.kurz': 'schnell',
    'effort.normal': 'mittel',
    'effort.entspannt': 'aufwendig',
  },

  en: {
    'nav.week': 'Week',
    'nav.inventory': 'Items',
    'nav.prevWeek': 'Previous week',
    'nav.thisWeek': 'This week',
    'nav.nextWeek': 'Next week',

    'board.week': 'Week {week}',
    'board.today': 'today',
    'board.offline': 'offline — this week may be out of date',
    'board.unreachable': 'No connection. The week is here as soon as the network is.',

    'day.level': 'Effort for {weekday}, currently: {effort}',
    'day.suggestions': 'Suggestions',
    'day.propose': 'Propose an evening',
    'day.tooMuch': '⚠︎ More than a {evening} allows: {items}.',
    'day.empty': 'Nothing in the list yet.',
    'day.search': 'search or new …',
    'day.searchLabel': 'Search for an item or create one',
    'day.add': 'add',
    'day.addItem': 'add {name}',
    'day.createAndAdd': 'create “{name}” and add it',
    'day.remove': 'remove {name}',

    'reason.retired': 'paused',
    'reason.effort': 'too much for a {effort} day',
    'reason.alone': 'enough on its own',
    'reason.doubled': 'already has {component}',
    'reason.pair': 'last with {partner}',
    'reason.gap': '{component} still missing',
    'reason.fresh': 'never planned',
    'reason.due': 'due again · {ago}',
    'reason.planned': 'already planned',
    'reason.ago': '{days} days ago',
    'reason.agoOne': 'a day ago',

    'inventory.title': 'Items',
    'inventory.search': 'search or new …',
    'inventory.searchLabel': 'Search for an item or create one',
    'inventory.create': 'create',
    'inventory.filter': 'Filter, currently showing: {filter}',
    'inventory.filter.all': 'all',
    'inventory.filter.unsorted': 'no role',
    'inventory.filter.unused': 'unused',
    'inventory.done': 'done',
    'inventory.name': 'Name',
    'inventory.paused': 'paused',
    'inventory.pause': 'pause',
    'inventory.resume': 'bring back',
    'inventory.delete': 'delete',
    'inventory.confirmDelete': 'really delete?',
    'inventory.nothingFound': 'Nothing found.',
    'inventory.empty': 'Nothing here yet. What do you eat? Type it above.',

    'component.base': 'Filling',
    'component.vegetable': 'Vegetable',
    'component.protein': 'Protein',
    'component.extra': 'Extra',
    'component.whole': 'Whole',
    'component.none': 'no role',

    'level.kurz': 'short',
    'level.normal': 'normal',
    'level.entspannt': 'relaxed',
    'evening.kurz': 'short evening',
    'evening.normal': 'normal evening',
    'evening.entspannt': 'relaxed evening',
    'effort.kurz': 'quick',
    'effort.normal': 'medium',
    'effort.entspannt': 'involved',
  },
};

/**
 * The language of this deployment, not of this device: the server sets it on
 * the shell (`TABLE_SIX_LANG`), the interface reads it back here. One family,
 * one kitchen, one language — nobody switches it mid-plan.
 */
export const language = document.documentElement.lang === 'en' ? 'en' : 'de';

/**
 * One word or sentence, with `{name}` filled in.
 * @param {string} key @param {Record<string, string | number>} [values]
 */
export function t(key, values) {
  const text = STRINGS[language]?.[key] ?? STRINGS.de[key] ?? key;
  return values ? text.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? '')) : text;
}
