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
