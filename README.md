# Underkeep Codex

Browser for Underkeep's weapons, armor, rings and amulets, consumables, skills, enemies and combat mechanics, built from
the game's own data files. Mobile first.

Live: https://misterwtheface-oss.github.io/uk-build-calc/

## Build
```
python tools/build_data.py [--strict]   # reads ../_uk_extract (local only), writes data.js + assets/icons + precache-list.json
node tools/serve.mjs                     # local preview; stop it when done
```
`git config core.hooksPath .githooks` once per clone: the pre-commit hook re-stamps cache-bust tokens.
`node tools/render_check.js` after every build: renders every tab and detail view, fails on errors or missing art.

## Art
Every game object that has an icon or UI element is shown with it, everywhere it is referenced. Sprites pass through
`sprite()` in build_data.py (missing file = build error); the UI symbol map `UI` / `SLOTS` names the game sprite for each
concept (stats, elements, creature types, slots, coins, cooldown…). In app.js all art goes through the "art" helpers
(`img`, `sym`, `symFor`, `framed`, `thumb`, the `*Chip` functions); never write a bare `<img>` for game art. Native pixels
only: big art in chips is a native-pixel crop, never scaled.
