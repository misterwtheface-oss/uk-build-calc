# Underkeep Codex — Progress

## Status
- 2026-11-12: v1 built: Weapons, Armor, Rings & Amulets, Consumables, Skills (per-level table + level picker), Enemies (resists, immunities, attacks), Mechanics (difficulty, status effects, resting / poison tables, game stat tooltips).
- 2026-11-12: Mechanics shows 17 code-verified formulas (hit, damage range, armor / Sharpness, crit x1.75, physical resist, evasion cap, resists, HP / stamina / mana start + per level) from the extract's data/mechanics.json.

- 2026-11-12: game art on every object reference (user rule; see README § Art). New tabs Classes (base stats, cost line, starting gear, skills), Races (all portraits, stat ranges), Companions, Shops (merchant scene + stock), Alchemy, Other Items. Items list sources: sold by, alchemy, ingredient in, dropped by, starting gear. Status effects open their own page. `node tools/render_check.js` renders all 13 tabs and 671 detail views.

## Next
- Spell / elemental damage pipeline and the enemy-attacks-hero side (melee / ranged protection).
- Race and class base stats (live in the exe, not the data files).
- Shops, alchemy recipes, encounters / where enemies appear.
