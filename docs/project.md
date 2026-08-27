# Table Six

A local tool that fills a weekday grid for a six-person household with reasoned
suggestions. **The app suggests, it does not decide** — every slot is freely
overwritable, every warning is a hint, never a veto.

**An evening is a set of items, not a dish.** Potatoes, broccoli and bratwurst
is one meal for all six; the two vegetarians leave out one item. The component
plate is the data model, not a feature.

## Rules

> **The base first, features one at a time.** A week that can be filled by hand
> is the whole of the first version. The recommendation system comes after it,
> everything else after that — one at a time, each one used before the next is
> started. This rule outranks every other in this document.

> **No feature may create maintenance effort that the family stops sustaining
> after four weeks.** That is where private meal planners die.

## Outcome

On Sunday, within a few minutes, a weekly plan that

- fits the time actually available on each individual weekday,
- serves the two vegetarian eaters as equals, not as a special case,
- knows the preferences of all six and knows them better over time,
- treats leftovers and cold supper as full-value slots,
- assigns the two older daughters a predictable cooking duty.

## Value

- **The blank page disappears.** Sunday starts with a draft, not a question.
- **Time is first class.** The plan fails on 20 minutes, not on ideas.
- **Variety without risk.** History prevents repetition without proposing what
  is reliably rejected.
- **Iron becomes visible** — recalled, not calculated, at the point where it
  can still be influenced.
- **Cooking duty becomes negotiable.** Responsibility is in the plan, not in
  the argument.

## Constraints

### Hard

- **Vegetarian:** wife (45) and eldest daughter (15). Never overridable.
- **Vegetarian is a property of the item, never of the evening.** An evening
  works if those two can build a plate from it — not if everything is meatless.
- **A plate is a set of parts, and an item carries one:** `Sättigung`,
  `Gemüse`, `Protein`, `Extra`, or `Komplett`. The last is an evening on its
  own and wants nothing beside it; `Extra` is never missing from a plate.
  Unsorted is a legitimate state — it ranks like everything else, it just says
  nothing, so a half-curated inventory works.
- **Effort level per weekday** (`kurz` / `normal` / `entspannt`) as a recurring
  grid — a level, not a minute budget; exact cooking time doesn't matter to the
  family, so a derived minute figure would be a bogus number.
- **Local, no auth, no server, German content only.** No allergies (as of 08/2026).
- **The inventory stands on its own.** Items are created and renamed by hand;
  nothing outside the app is needed to fill it or to keep it usable.
- **Nothing the family has eaten is deleted, only paused.** An item that has
  been on an evening keeps every evening it was on; pausing takes it out of
  the suggestions and is undone with one tap. Deleting is for what nobody
  cooked — a typo has no history to lose. History is what the app reasons
  from, so losing it is never one tap away.

### Soft

- 7 warm meals per week (one per day), mostly 20–30 min active time.
- Leftovers and cold supper are ordinary items, not a category of their own.
- Batch cooking is an opportunistic hint, never a planning obligation.
- DGE flags inform, they never block.

### Non-goals

- **No pantry management** — tried in the family, failed. No inventory, no
  stock keeping, no leftover forecast.
- **No nutrient balances, no calories, no weight-loss programme.** With
  non-heme iron absorption decides, not milligrams.
- **No obligation to complete a week.** Empty and manual slots are normal.
- **No automation that cannot be switched off.**
- **No shopping list** in v1 — explicitly not a must.
- **No recommendation system in the base.** Slots are filled by hand from the
  inventory. Ranking is the first thing added afterwards, not the thing that has
  to work on day one.
- **No calendar, in or out, for now.** No import to seed the inventory, no
  school-lunch signal, no push. The plan lives in the app and nowhere else. If
  a calendar ever returns, it returns one-way: nothing outside may change the
  plan.
