# UI

> **The app is the board.**
> **Type carries the order, not boxes.**
> **The phone does everything. The desk only gets more room.**

## Where it runs

One week, Mon–Sun, on the phone of whoever is planning. The app is week-bound
and needs no second mode.

**The phone does everything, curation included.** It may be more comfortable at
the desk, and that is the whole of the desktop's claim: **no function exists
only on the wide layout.** One codebase, one set of routes, one type scale — the
width changes the layout, never the app. Exactly one breakpoint (~48 rem):

- **The planning screens keep their column at every width** (~30 rem, centred).
  The board is a phone artifact; seven rows stretched across a monitor are
  harder to read, not easier.
- **`Bestand` is the one view that takes the width.** Above the breakpoint its
  rows use the space and its editor lays out on one line instead of two — many
  items comparable at once, the same editor either way.
- **The header is the app bar.** The mark, what the screen is, and the screen's
  own actions. The board is one line at every width — `KW 35`, `‹ ● ›`,
  `Bestand` — and gives up the date range on a phone before it gives up a
  48 px target; `Bestand` takes a second line for its search field.
- **Targets stay 48 px at every width.** Nothing shrinks because a mouse showed
  up.
- **Hover is never the only cue.** The phone has none.

## Week board (home)

```
  ☰ KW 34            Bestand
  ───────────────────────────
  MONTAG   17          KURZ
     Gnocchi · Tomatensoße
  ───────────────────────────
  MITTWOCH 19    KURZ     ⚠
     Nudeln
  ───────────────────────────
  DONNERSTAG 20      NORMAL
     –
  ───────────────────────────
  SONNTAG  23          HEUTE
     Käsefondue
  ───────────────────────────
  ‹          today          ›
```

**Seven rows fit on a phone without scrolling.** Whoever scrolls has a list,
not a board, and the reason this view exists is gone. Everything follows:

- A row carries only what is enough to **judge** — plate, effort level,
  warning. Nothing to edit; the whole row is the button.
- An empty day is a dash, not an alarm.
- `⚠` means the evening blows the effort level. A hint; the reason in plain
  words lives in the day focus.
- If seven rows ever stop fitting, the effort level leaves the row first, then
  the date.

## Day focus (editing)

```
  ‹ ☰ MITTWOCH 19                KURZ
  ───────────────────────────────────
  Nudeln                            ✕
  Tomatensoße                       ✕
  ───────────────────────────────────
   ⌕ suchen oder neu …         fertig
  Reis               noch nie geplant
  Salat            zuletzt mit Nudeln
  Lasagne       zu aufwendig für kurz
```

- **One day fills the screen** — targets stay large, eight suggestions fit
  without scrolling.
- **A suggestion is ranked for this evening, not for the inventory.** What is
  already on the plate decides the order; an empty evening is ranked by what
  has not been on the table for a while.
- **Every suggestion carries its reason** in plain words („vor 21 Tagen",
  „zuletzt mit Gnocchi", „zu aufwendig für kurz"). Never a score: while the log
  is this thin a number would be bogus. Nothing is filtered away — the worst
  item in the inventory still shows up, it just shows up last.
- **`Abend vorschlagen` proposes the whole evening**, and only ever fills a day
  that is still empty. Clearing a day is how you ask for another one; there is
  no re-roll, no confirming and nothing to undo.
- **One tap adds, one tap removes**, written immediately, no confirming.
- **The search field sits at the bottom** and is at the same time the field for
  creating — what isn't found gets entered, and the field itself offers
  `anlegen`, so the keyboard never covers the way to create.
- **`fertig` returns to the board**, not to the next day. Planning together
  doesn't move in sequence.
- Swiping to the neighbouring day may exist, never as the only way.

## Bestand (curation)

Not a planning screen: this is where the item list is built and kept honest —
create, rename, delete, pause, set roles and levels.

- **It starts empty and is filled by hand.** Nothing outside the app seeds it,
  so creating an item has to be as cheap as planning with one.
- **Every action works with a thumb.** The keyboard is an accelerator where
  there is one: Enter submits, Esc cancels the open form. No gesture without a
  visible twin.
- **A row is never edited in place. The bar becomes its editor.** The list
  keeps its shape, so nothing moves under the thumb and no control ends up
  behind the bar; the open row stays marked, and the name in the field says
  which item is meant.
- **A row says what the item costs, not what the evening feels like.** The
  level is one scale; the evening is `kurz` / `normal` / `entspannt`, the item
  that needs one is `schnell` / `mittel` / `aufwendig`.
- **Search sits under the header, the filter is one button beside the name.**
  Both stay put while the list scrolls — they are how a long inventory becomes
  finishable in sittings. The filter cycles through `alle`, `ohne Rolle`,
  `ungenutzt` the way the editor's chips cycle, and it turns brass while it is
  hiding rows.
- **The bar belongs to the editor alone.** It exists while a row is open and
  is not there otherwise.
- It may scroll. It is a list and admits to being one.

## Colour

| Role | Value | for |
|---|---|---|
| ground | `#1a1815` | page |
| surface | `#221f1b` | pressed, selected, input field |
| line | `#35302a` | hairline between the days |
| bone | `#f4efe6` | text |
| soft | `#9c9186` | date, effort level, reason |
| brass | `#d9a441` | today, warning, active selection |

Contrast against the ground: bone ~15:1, brass ~7.9:1, soft ~5.7:1. Soft is
deliberately lighter than would be pretty — it carries the 12 px effort level,
and that has to stay readable under kitchen light.

The plate roles get **no** colours of their own. There is one colour, and it is
spoken for by states. A light variant stays possible, never maintained as an
equal.

## Type

Seven days without scrolling makes white space the scarcest good on screen, and
cards with borders, rounding and padding cost the most of it while carrying no
information. So typography does the box's job: weekdays large in caps as
anchors, the meal beneath in a lighter weight, a hairline in between. The image
behind it is the daily board — the slate a restaurant writes the menu on:
readable at a distance, one colour, not a form.

**System grotesque, no webfont**, no external resource. A narrow grotesque is
not reliably a system font, so caps plus tracking plus weight contrast
substitute for it. `font-stretch: 87.5%` takes effect where a variable system
font can do it and is silently ignored otherwise — a bonus, not a condition.

| Element | Size | Weight |
|---|---|---|
| weekday (board) | 15 px | 600, caps, `letter-spacing: .08em` |
| date | 15 px | 400, tabular figures, soft |
| effort level | 12 px | 500, caps, `.1em`, soft |
| plate (board) | 17 px | 400, bone, single line with ellipsis |
| weekday (day focus) | 24 px | 600, caps, `.06em` |
| item (day focus) | 19 px | 400 |
| reason | 13 px | 400, soft |

Base size 17 px, day row ~64 px high. **One scale for both widths** — the desk
gets more room, not bigger type.

## Symbols

Colour is scarce, so symbols carry every state that isn't "today" or "careful".

| | means |
|---|---|
| `⚠` | blows the effort level — a hint, not a veto |
| `–` | empty, and that's fine |
| `●` | this week — between `‹` and `›`, and where they lead back to |

The three week controls are the one place a glyph stands without a word: they
are one group, they are the only navigation on that line, and three labels
would take the room the week itself needs. Everywhere else the word stays.

## Touch

- **Targets at least 48 × 48 px, 8 px apart.** The day row is large enough at
  ~64 px; the hairline is only drawn, the hit area reaches to the next one.
- **Frequent things belong at the bottom where something is being edited.** Hit
  accuracy is ~96% in the thumb zone against ~61% in the stretch zone — hence
  the day focus keeps its search, `fertig` and the item editor down there. The
  board and `Bestand` are read and navigated, not edited, and carry their
  actions in the app bar instead.
- **Gestures only as accelerators.** Each one has a visible twin; hidden
  interactions don't get found.
- A press is acknowledged with the surface `#221f1b`, not with an animation.
- `env(safe-area-inset-bottom)` for the footer bar.

## Deliberately not

- **No rolling window.** The app is week-bound; on Friday the coming week is
  one `›` tap away, and that is accepted.
- **No week grid on the desktop.** The board keeps one layout at every width.
- **No notes, no shopping.** They stay on the magnet board.
- **No drag & drop.** It presupposes a matrix of recipe cards; here you would
  drag items between days that are not visible at the same time.
- **No automatic filling of the week.** One evening at a time, from the day
  focus. Seven at once waits until the ranking has earned it: a weak evening
  costs one ✕, a weak week costs seven and teaches the family to stop pressing
  the button. Its screen already exists — the week board.

Role colours · a colour per weekday · cards with borders and rounding · icons
where a word fits · animation · numbers in the suggestion · webfonts · a second
accent beside the brass.
