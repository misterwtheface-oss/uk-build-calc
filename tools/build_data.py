"""Build the app's runtime artifacts from the local-only Underkeep extract.

Reads  ../_uk_extract/data/resolved/def_def_*.json   (parent chains merged; _uk_extract/tools/resolve.py)
       ../_uk_extract/data/defs/{def_def,def_def_skill,text_text_*_en}.json   (_uk_extract/tools/dft.py)
       ../_uk_extract/data/mechanics.json   (code-verified formulas, hand-maintained in the extract)
       ../_uk_extract/assets/sprites/<name>.png   (_uk_extract/tools/cut_sprites.py)
Writes data.js (window.UK_DATA), assets/icons/<name>.png (only sprites the app uses), precache-list.json; then stamps
the cache-bust tokens (../tools/app/stamp_cache.py, rule A-cache-bust).
The extract itself is never copied here (G-extract-not-in-app).

Art rule (user, 2026-11-12): every reference to a game object that has an icon or UI element shows that art. All art goes
through sprite(), which validates the file exists (A-provenance-guards: a missing sprite is an error, never a silent
blank). UI symbols are a fixed map (UI below) of game sprites the game itself uses for that concept (hud_symbol_*,
hud_barbie_*, skill buttons, slot frames). Inline {sprite:x} tokens in game text are kept and rendered.
--strict turns warnings into a failed build; data.js is left as it was.

  python tools/build_data.py [--strict]
"""
import hashlib, json, os, re, shutil, subprocess, sys

APP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
X = os.path.join(os.path.dirname(APP), "_uk_extract")
R = os.path.join(X, "data", "resolved")
D = os.path.join(X, "data", "defs")
SPRITES = os.path.join(X, "assets", "sprites")
STRICT = "--strict" in sys.argv
errors, warnings, skipped, derived = [], [], [], []


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


G = load(os.path.join(D, "def_def.json"))
GP = G.get("global_params", {})
T = {}
for part in ("common", "game", "items", "skills"):
    T.update(next(iter(load(os.path.join(D, "text_text_%s_en.json" % part)).values())))

# ---- sprites: every image the app shows passes through here
used = set()


def sprite(name, owner, required=True):
    if not name:
        return None
    if not os.path.exists(os.path.join(SPRITES, name + ".png")):
        (errors if required else warnings).append("%s: sprite %s missing" % (owner, name))
        return None
    used.add(name)
    return name


# ---- game text colours (gui.text_vars), resolved to hex at build time
TV = G["gui"]["text_vars"]
DEFAULT_COLOR = G["gui"].get("default_text_color", "#baa98b")


def color_hex(name, depth=0):
    v = TV.get(name)
    if v is None or depth > 4:
        return None
    m = re.fullmatch(r"\{color:#?([0-9a-fA-F]{6}|default)\}", v)
    if m:
        return DEFAULT_COLOR if m.group(1) == "default" else "#" + m.group(1).lower()
    m = re.fullmatch(r"\{(color_[a-z_0-9]+)\}", v)
    return color_hex(m.group(1), depth + 1) if m else None


def txt(key, owner=None):
    """Game text -> app tokens: «c:#hex» colour, «s:name» inline sprite, \t left/right split, \n line."""
    s = T.get(key)
    if s is None:
        return None
    s = s.replace("\\n", "\n").replace("\r", "")
    s = re.sub(r"\{a:(left|right)\}", "\t", s)
    s = re.sub(r"\{(italic|regular)\}", "", s)

    def spr(m):
        n = sprite(m.group(1), owner or key, required=False)
        return "«s:%s»" % n if n else ""
    s = re.sub(r"\{sprite:([a-z_0-9]+)\}", spr, s)

    def col(m):
        tok = m.group(1)
        if tok.startswith("color:"):
            h = tok[6:].lstrip("#")
            return "«c:%s»" % (DEFAULT_COLOR if h == "default" else "#" + h.lower())
        h = color_hex(tok)
        return "«c:%s»" % h if h else ""
    s = re.sub(r"\{(color:#?[0-9a-fA-F]{6}|color:default|color_[a-z_0-9]+)\}", col, s)
    return s.strip()


def label(part):
    s = T.get("item_info_part_" + part)
    if s is None:
        return None
    s = re.sub(r"\{[^}]*\}", "", s).replace("\\n", "").strip()
    s = s[:-2].strip() if s.endswith("%1") else s
    return s.replace("%1", "#")


# ---- UI symbol map: concept -> the game's own sprite for it
UI = {
    "str": "hud_symbol_strength", "dex": "hud_symbol_dexterity", "end": "hud_symbol_endurance", "wis": "hud_symbol_wisdom",
    "armor": "hud_symbol_armor", "damage": "hud_symbol_damage", "coins": "hud_symbol_coins", "food": "hud_symbol_food",
    "bone": "hud_symbol_bone", "duration": "hud_symbol_hourglass", "cooldown": "hud_symbol_hourglass",
    "two_handed": "hud_symbol_two_handed", "long_reach": "hud_symbol_long_reach", "unskilled": "hud_symbol_unskilled",
    "evasion": "hud_symbol_bonus_evasion", "resist": "hud_symbol_bonus_elemental_resistance", "unarmed": "hud_icon_fist",
    "level": "hud_icon_level_up", "mana_up": "hud_symbol_permanent_mana_up", "infinity": "hud_symbol_infinity",
    "fire": "hud_symbol_fire", "ice": "hud_symbol_ice", "lightning": "hud_symbol_lightning", "poison": "hud_symbol_poison",
    "blood": "hud_symbol_blood_magic", "void": "hud_symbol_void",
    "animal": "hud_symbol_animal", "undead": "hud_symbol_undead", "demon": "hud_symbol_demon",
    "slot_frame": "hud_item_slot_bg", "skill_frame": "hud_skill_slot_bg", "panel": "hud_hero_panel_bg_small",
    "separator": "hud_info_panel_separator", "tab": "menu_button_metal",
}
SLOTS = {"helmet": "hud_barbie_helmet", "armor": "hud_barbie_armor", "belt": "hud_barbie_belt", "boots": "hud_barbie_boots",
         "cloak": "hud_barbie_cloak", "gloves": "hud_barbie_gloves", "ring": "hud_barbie_ring", "amulet": "hud_barbie_amulet",
         "shield": "hud_barbie_shield", "weapon": "hud_barbie_sword"}
ui = {k: sprite(v, "ui:" + k) for k, v in UI.items()}
ui.update({"slot_" + k: sprite(v, "ui:slot_" + k) for k, v in SLOTS.items()})

# status effects: their own icon field (def_def.status_effects); names from status_effect_<id>_active
STATUS = {}
for k, v in G.get("status_effects", {}).items():
    STATUS[k] = {"name": T.get("status_effect_%s_active" % k) or T.get("stats_status_effect_" + k),
                 "icon": sprite(v.get("icon"), "status " + k, required=False) if v.get("icon") else None,
                 "desc": txt("stats_status_effect_%s_desc" % k)}
    for f in ("power", "duration", "combine", "power_type"):
        if f in v:
            STATUS[k][f] = v[f]
    if not STATUS[k]["name"]:
        STATUS[k]["name"] = k.replace("_", " ").capitalize()
        derived.append("status %s: no game name, label from id" % k)


def stat_icon(k):
    """Sprite for a stat key, when the game has a symbol for that concept."""
    m = re.match(r"(req_|)(str|dex|end|wis)(_up|_mod|)$", k)
    if m:
        return UI[m.group(2)]
    for el in ("fire", "ice", "lightning", "poison", "void", "blood"):
        if el in k:
            return UI[el]
    m = re.match(r"immunity_to_(\w+)$", k)
    if m:
        st = {"paralysis": "paralyze"}.get(m.group(1), m.group(1))
        if st in STATUS and STATUS[st]["icon"]:
            return STATUS[st]["icon"]
        return None
    if k in ("burn_chance", "burn_duration_bonus"):
        return STATUS["burn"]["icon"]
    if k in ("freeze_chance", "spell_freeze_chance"):
        return STATUS["freeze"]["icon"]
    if k == "bleed_damage_up" or k == "damage_up_to_bleed":
        return STATUS["bleed"]["icon"]
    if k in ("armor", "shield_armor", "blunt_protection", "ranged_protection"):
        return UI["armor"]
    if k == "armor_vs_animals" or k == "damage_up_to_animals":
        return UI["animal"]
    if k.startswith("evasion"):
        return UI["evasion"]
    if k.startswith("unarmed"):
        return UI["unarmed"]
    if k == "mana_up":
        return UI["mana_up"]
    if "damage" in k or "armor_pierce" in k or k == "extra_damage":
        return UI["damage"]
    return None


PART_ALIAS = {"req_str": "req_strength", "req_dex": "req_dexterity", "req_wis": "req_wisdom", "req_end": "req_endurance",
              "extra_damage": "damage3", "armor_pierce": "damage4"}
NON_STAT = {"price", "buy_price", "throw_distance", "shadow_size", "def_line", "show_on_map", "stackable",
            "projectile_relx", "projectile_rely", "relz", "base_angle", "no_flip", "max_fly_distance", "use_once",
            "use_face_fx", "quest_item", "uses_dexterity", "two_handed", "long_reach", "item_feature_bonus",
            "item_feature_chance", "food_value", "heal_min", "heal_max", "mana_min", "mana_max", "stamina_min",
            "stamina_max", "show_status_effect_bonus", "show_status_effect_duration", "interact_priority",
            "interact_area", "shadow_offset", "tip_offset", "custom_text_vars"}
STAT_LABELS, STAT_ICONS, UNLABELED = {}, {}, {}


def note_stat(k):
    lab = label(PART_ALIAS.get(k, k))
    if lab is None:
        return False
    STAT_LABELS[k] = lab
    ic = stat_icon(k)
    if ic:
        STAT_ICONS[k] = sprite(ic, "stat " + k)
    return True


for k in ("req_str", "req_dex", "req_wis", "req_end", "extra_damage", "armor_pierce", "armor", "evasion"):
    note_stat(k)


def stats_of(v, owner):
    out = []
    for k, val in v.items():
        if k in NON_STAT or k.startswith("_") or k.startswith("req_") or k in ("damage", "element_damage"):
            continue
        if isinstance(val, bool) or not isinstance(val, (int, float, list)):
            continue
        if isinstance(val, list) and not all(isinstance(n, (int, float)) for n in val):
            continue
        if not note_stat(k):
            UNLABELED.setdefault(k, []).append(owner)
            continue
        out.append([k, val])
    return out


def status(se):
    if not isinstance(se, dict):
        return None
    out = {k: se[k] for k in ("type", "chance", "power", "duration") if k in se}
    if se.get("type") and se["type"] not in STATUS:
        warnings.append("status type %s not in status_effects" % se["type"])
    return out


def feature(v):
    f = v.get("item_feature")
    s = txt("item_feature_" + f) if isinstance(f, str) else None
    if s:
        s = s.replace("{item_feature_bonus}", str(v.get("item_feature_bonus", ""))).replace(
            "{item_feature_chance}", str(v.get("item_feature_chance", "")))
    return s


ITEMS = {}  # id -> entry (every item with a game name, any tab)


def item_common(k, v, kind):
    name = T.get(k)
    if not name:
        skipped.append("%s %s (no display name: dev/test entry)" % (kind, k))
        return None
    e = {"id": k, "name": name, "icon": sprite(v.get("icon") or v.get("sprite"), k), "type": v.get("item_type")}
    for key, field in (("desc", k + "_desc"), ("feat", k + "_feat")):
        s = txt(field, k)
        if s:
            e[key] = s
    f = feature(v)
    if f:
        e["feature"] = f
    req = {s: v[s] for s in ("req_str", "req_dex", "req_wis", "req_end") if v.get(s)}
    if req:
        e["req"] = req
    if v.get("req_class"):
        e["reqClass"] = v["req_class"]
    e["stats"] = stats_of(v, k)
    if v.get("status_effect"):
        e["status"] = status(v["status_effect"])
    for key in ("price", "buy_price"):
        if v.get(key):
            e[key] = v[key]
    if v.get("quest_item"):
        e["quest"] = 1
    for f in ("heal_min", "heal_max", "mana_min", "mana_max", "stamina_min", "stamina_max", "food_value"):
        if v.get(f):
            e[f] = v[f]
    ITEMS[k] = e
    return e


def entries(fname):
    data = load(os.path.join(R, fname))
    return [(k, v) for k, v in data.items() if isinstance(v, dict) and not k.startswith("_") and not k.startswith("engine")]


weapons, armor, accessories, consumables, misc = [], [], [], [], []
for k, v in entries("def_def_item_weapon.json"):
    e = item_common(k, v, "weapon")
    if not e:
        continue
    e["damage"] = v.get("damage")
    for f in ("two_handed", "long_reach", "uses_dexterity"):
        if v.get(f):
            e[f] = 1
    if v.get("element_type"):
        e["element"] = [v["element_type"], v.get("element_damage")]
    e["typeName"] = T.get("item_type_" + str(v.get("weapon_type"))) or v.get("weapon_type")
    e["type"] = v.get("weapon_type")
    e["cat"] = "weapons"
    weapons.append(e)
for k, v in entries("def_def_item_armor.json"):
    e = item_common(k, v, "armor")
    if e:
        e["cat"] = "armor"
        armor.append(e)
CONSUMABLE = {"potion", "food", "consumable", "book"}
for k, v in entries("def_def_item.json"):
    t = v.get("item_type")
    if v.get("class") == "projectile" or (t is None and not T.get(k)):
        continue
    e = item_common(k, v, t or "item")
    if not e:
        continue
    if t in ("ring", "amulet"):
        e["cat"] = "accessories"; accessories.append(e)
    elif t in CONSUMABLE:
        e["cat"] = "consumables"; consumables.append(e)
    else:
        e["cat"] = "misc"; misc.append(e)

# ---- item references: "item_x", "item_x:2", "item_x:1-5", "item_x%25", space-separated lists, drop-list names
DROPS = GP.get("drop_lists", {})


def parse_refs(spec, owner, seen=()):
    out = []
    for tok in str(spec).split():
        m = re.fullmatch(r"([a-z_0-9]+)(?::(-1|\d+(?:-\d+)?))?(?:%(\d+))?", tok)  # :-1 = unlimited stock
        if not m:
            warnings.append("%s: unparsed item ref %r" % (owner, tok)); continue
        iid, cnt, ch = m.groups()
        if iid in DROPS and iid not in seen and isinstance(DROPS[iid], list):
            # a named drop list: the game draws from it, so it stays one grouped entry (never shown as fixed items)
            members = []
            for sub in DROPS[iid]:
                members += parse_refs(sub, owner, seen + (iid,))
            pool = {"pool": iid, "items": members}
            if cnt:
                pool["n"] = cnt
            if ch:
                pool["chance"] = int(ch)
            out.append(pool)
            continue
        if iid == "item_coins":
            out.append({"coins": cnt or "1"}); continue
        if iid not in ITEMS:
            warnings.append("%s: item %s has no app entry" % (owner, iid)); continue
        r = {"id": iid}
        if cnt:
            r["n"] = cnt
        if ch:
            r["chance"] = int(ch)
        out.append(r)
    return out


def flat(refs):
    """Item refs incl. the members of drop-list pools (for "where to get it" sources)."""
    for r in refs:
        if "pool" in r:
            yield from flat(r["items"])
        elif "id" in r:
            yield r


def src(iid, kind, val):
    ITEMS[iid].setdefault("src", {}).setdefault(kind, []).append(val)


# ---- classes, races, starting gear
SKILL_KEYS = ("cost", "cooldown", "damage", "bonus", "bonus2", "bonus3", "passive_bonus", "heal_amount", "ignore_armor",
              "chance", "duration")
skills = []
for s in load(os.path.join(D, "def_def_skill.json"))["skills"]:
    k = s["name"]
    name = T.get(k)
    if not name:
        skipped.append("skill %s (no display name)" % k)
        continue
    e = {"id": k, "name": name, "icon": sprite(s.get("icon"), k), "frame": sprite(s.get("button"), k + " button"),
         "cls": s.get("class"), "lvl": s.get("req_class_level"), "max": s.get("max_level", 1)}
    for key, field in (("summary", k + "_summary"), ("desc", k + "_desc")):
        t = txt(field, k)
        if t:
            e[key] = t
    e["lines"] = [x for x in (txt("%s_stat_%d" % (k, i), k) for i in range(1, 6)) if x]
    vals = {}
    for key in SKILL_KEYS:
        if key in s:
            vals[key] = [s[key], s.get(key + "_step", 0)]
            if s.get(key + "_type"):
                vals[key].append(s[key + "_type"])
    se = s.get("status_effect")
    if isinstance(se, dict):
        for key in ("chance", "power", "duration"):
            if key in se:
                vals["status_" + key] = [se[key], se.get(key + "_step", 0)]
        e["statusType"] = se.get("type")
    e["v"] = vals
    for f in ("is_spell", "is_passive", "is_ranged", "check_evasion", "is_void_spell"):
        if s.get(f):
            e[f] = 1
    for f in ("damage_element", "requires", "skill_target", "skill_type"):
        if s.get(f):
            e[f] = s[f]
    skills.append(e)

CLASS_ORDER = ["warrior", "paladin", "thief", "archer", "wizard", "voidcaller", "bloodmage"]
# class resource: the game's cost line per class (skill_stat_*_cost) and the bar it fills
COST = {"warrior": "stamina", "thief": "stamina", "archer": "stamina", "paladin": "zeals", "wizard": "mana",
        "voidcaller": "mana", "bloodmage": "bloodmage"}
start = GP.get("starting_equipment", [])
classes = []
for c in CLASS_ORDER:
    nm = T.get("hero_class_" + c)
    if not nm:
        errors.append("class %s has no display name" % c)
    bs = GP.get("base_stats_" + c, {})
    gear = []
    for who, specs in start:
        parts = who.split()
        if parts and parts[0] == c:
            for sp in specs:
                gear += parse_refs(sp, "start " + c)
    for g in flat(gear):
        src(g["id"], "start", {"cls": c})
    classes.append({"id": c, "name": nm or c, "desc": txt("hero_class_%s_desc" % c), "base": bs, "gear": gear,
                    "cost": txt("skill_stat_%s_cost" % COST[c]), "skills": [s["id"] for s in skills if s["cls"] == c]})
RACE_ORDER = ["human", "dwarf", "horemount", "raven", "elk", "slugman"]
races = []
for r in RACE_ORDER:
    nm = T.get("hero_race_" + r)
    if not nm:
        errors.append("race %s has no display name" % r)
    faces = [sprite(f["sprite"], "face " + f["sprite"]) for f in G.get("hero_faces", [])
             if r in str(f.get("race", "")).split() and not f.get("special")]
    gear = []
    for who, specs in start:
        parts = who.split()
        if len(parts) == 2 and parts[0] == "*" and parts[1] == r:
            for sp in specs:
                gear += parse_refs(sp, "start " + r)
    for g in flat(gear):
        src(g["id"], "start", {"race": r})
    races.append({"id": r, "name": nm or r, "desc": txt("hero_race_%s_desc" % r), "base": GP.get("base_stats_" + r, {}),
                  "faces": [f for f in faces if f], "gear": gear})
skill_gear = []
for who, specs in start:
    parts = who.split()
    if len(parts) == 3 and parts[2].startswith("skill_"):
        g = []
        for sp in specs:
            g += parse_refs(sp, "start " + parts[2])
        for x in flat(g):
            src(x["id"], "start", {"skill": parts[2]})
        skill_gear.append({"skill": parts[2], "gear": g})

# ---- shops, alchemy
shops = []
for k, v in G.items():
    if not k.startswith("shop_") or k.endswith("_test") or not isinstance(v, dict):
        continue
    who = k.split("_")[-1]
    derived.append("shop %s: label '%s' from id (game has no shop name)" % (k, who.capitalize()))
    stock = []
    for spec in v.get("items", []):
        stock += parse_refs(spec, k)
    for s_ in flat(stock):
        src(s_["id"], "shop", k)
    shops.append({"id": k, "name": who.capitalize(), "art": sprite(v.get("merchant_sprite"), k), "stock": stock})
recipes = []
for i, rc in enumerate(G.get("alchemy_recipes", [])):
    out = parse_refs(rc.get("item"), "recipe %d" % i)
    ing = []
    for x in rc.get("ingredients", []):
        ing += parse_refs(x, "recipe %d" % i)
    book = "item_" + rc["recipe"] if ("item_" + rc.get("recipe", "")) in ITEMS else (rc.get("recipe") if rc.get("recipe") in ITEMS and rc.get("recipe") != rc.get("item") and ITEMS[rc["recipe"]]["type"] == "recipe" else None)
    rid = "r%d" % i
    recipes.append({"id": rid, "out": out, "ing": ing, "book": book})
    for o in flat(out):
        src(o["id"], "made", rid)
    for x in {x["id"] for x in flat(ing)}:
        src(x, "used", rid)
    if book:
        src(book, "teaches", rid)

# ---- enemies
RESISTS = ("fire", "ice", "lightning", "poison", "blood", "void")
all_sprites = sorted(f[:-4] for f in os.listdir(SPRITES))
enemies = []
for k, v in entries("def_def_enemy.json"):
    if v.get("class") != "monster" or not v.get("health"):
        continue
    name = T.get(k)
    if not name:
        skipped.append("enemy %s (no display name)" % k)
        continue
    pre = v.get("sprite_prefix")
    spr = None
    if pre:
        cands = [pre + "_idle", pre] + [h for h in all_sprites if h.startswith(pre + "_")]
        spr = next((c for c in cands if os.path.exists(os.path.join(SPRITES, c + ".png"))), None)
    if not spr:
        warnings.append("%s: no sprite" % k)
    e = {"id": k, "name": name, "icon": sprite(spr, k) if spr else None,
         "hp": v.get("health"), "armor": v.get("armor"), "evasion": v.get("evasion"), "exp": v.get("exp")}
    for f in ("melee_evasion", "ranged_evasion", "melee_physical_resist", "ranged_physical_resist", "hp_shield"):
        if v.get(f):
            e[f] = v[f]
    e["res"] = {r: v.get(r + "_resist") for r in RESISTS if v.get(r + "_resist") is not None}
    e["imm"] = sorted({{"paralysis": "paralyze"}.get(x, x) for x in
                       (key[len("immunity_to_"):] for key, val in v.items() if key.startswith("immunity_to_") and val)})
    e["tags"] = [t for t in ("animal", "undead", "demon") if v.get(t)]
    atks = []
    for i in range(1, 8):
        a = v.get("attack%d" % i)
        if isinstance(a, dict):
            atk = {key: a[key] for key in ("probability", "range", "damage", "critical_chance", "armor_pierce",
                                            "element_type", "element_damage") if key in a}
            if a.get("status_effect"):
                atk["status"] = status(a["status_effect"])
            atks.append(atk)
    e["attacks"] = atks
    if v.get("loot"):
        e["loot"] = parse_refs(v["loot"], k)
        for l in flat(e["loot"]):
            src(l["id"], "drop", {"enemy": k, "chance": l.get("chance")})
    enemies.append(e)

companions = []
for k, v in G.get("companions", {}).items():
    nm = T.get(v.get("name", ""))
    if not nm:
        continue
    c = {"id": k, "name": nm, "face": sprite(v.get("sprite"), "companion " + k), "desc": txt(v["name"] + "_desc"),
         "feat": txt(v["name"] + "_feat_1")}
    for f in ("melee_damage", "melee_critical_chance", "element_type", "element_damage"):
        if v.get(f):
            c[f] = v[f]
    if v.get("status_effect"):
        c["status"] = status(v["status_effect"])
    companions.append(c)

# ---- mechanics
mech = {
    "difficulty": {d: GP.get("difficulty_" + d) for d in ("easy", "normal", "hard") if GP.get("difficulty_" + d)},
    "resting": {k: G.get("resting_%s_recovery" % k) for k in ("hp", "stamina", "mana")},
    "poisonByEndurance": G.get("poison_duration_reduction_by_endurance"),
    "xp": GP.get("hero_experience_levels"),
    "globals": {k: GP.get(k) for k in ("hero_critical_multiplier", "enemy_critical_multiplier", "hero_armor_damage_reduction",
                                        "fall_damage") if k in GP},
    "tooltips": {k: txt(k) for k in sorted(T) if re.match(r"stats_(dex|wis|str|end|total_damage|critical|ranged_critical|armor|evasion)_desc$", k)},
}
mp = os.path.join(X, "data", "mechanics.json")
if os.path.exists(mp):
    mech["code"] = load(mp)
else:
    warnings.append("mechanics.json missing: formulas section shows game tooltips only")
names = {k: T[k] for k in T if re.match(r"(hero_race_|item_type_)[a-z_]+$", k)}
names.update({"stat_" + k: v for k, v in STAT_LABELS.items()})
# cost-line resources take the game colour of their bar
res_color = {r: color_hex("color_" + r) for r in ("hp", "mana", "stamina", "zeals", "price", "text_darker", "item_feature",
                                                  "fire", "ice", "lightning", "poison", "blood_magic", "void")}

# ---- report / guard
for k, owners in sorted(UNLABELED.items()):
    warnings.append("stat %s has no game label, not shown (%d entries, e.g. %s)" % (k, len(owners), owners[0]))
for s in skipped:
    print("skip  ", s)
for s in derived:
    print("label ", s)
for w in warnings:
    print("warn  ", w)
for e in errors:
    print("ERROR ", e)
if errors or (STRICT and warnings):
    print("build failed: %d errors, %d warnings (strict=%s); data.js left as it was" % (len(errors), len(warnings), STRICT))
    sys.exit(1)

out = {"classes": classes, "races": races, "skillGear": skill_gear, "companions": companions,
       "weapons": weapons, "armor": armor, "accessories": accessories, "consumables": consumables, "misc": misc,
       "skills": skills, "enemies": enemies, "shops": shops, "recipes": recipes, "status": STATUS,
       "mechanics": mech, "names": names, "statIcons": STAT_ICONS, "ui": ui, "colors": res_color,
       "textColor": DEFAULT_COLOR}
js = "window.UK_DATA=" + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n"
icon_dir = os.path.join(APP, "assets", "icons")
os.makedirs(icon_dir, exist_ok=True)
for f in os.listdir(icon_dir):
    if f[:-4] not in used:
        os.remove(os.path.join(icon_dir, f))
for n in sorted(used):
    s_, d_ = os.path.join(SPRITES, n + ".png"), os.path.join(icon_dir, n + ".png")
    if not os.path.exists(d_) or open(s_, "rb").read() != open(d_, "rb").read():
        shutil.copyfile(s_, d_)
urls = ["assets/icons/%s.png" % n for n in sorted(used)]
with open(os.path.join(APP, "data.js"), "w", encoding="utf-8", newline="\n") as f:
    f.write(js)
h = hashlib.md5("".join(urls).encode() + js.encode()).hexdigest()[:8]
with open(os.path.join(APP, "precache-list.json"), "w", encoding="utf-8", newline="\n") as f:
    json.dump({"v": h, "urls": urls}, f)
print("data.js: %d weapons, %d armor, %d accessories, %d consumables, %d misc, %d skills, %d classes, %d races, %d enemies, "
      "%d shops, %d recipes, %d companions; %d sprites; %d skipped"
      % (len(weapons), len(armor), len(accessories), len(consumables), len(misc), len(skills), len(classes), len(races),
         len(enemies), len(shops), len(recipes), len(companions), len(used), len(skipped)))
subprocess.run([sys.executable, os.path.join(os.path.dirname(APP), "tools", "app", "stamp_cache.py"), APP], check=True)
