"""Build the app's runtime artifacts from the local-only Underkeep extract.

Reads  ../_uk_extract/data/resolved/def_def_*.json   (parent chains merged; _uk_extract/tools/resolve.py)
       ../_uk_extract/data/defs/{def_def,def_def_skill,text_text_*_en}.json   (_uk_extract/tools/dft.py)
       ../_uk_extract/data/mechanics.json   (code-verified formulas, hand-maintained in the extract; optional)
       ../_uk_extract/assets/sprites/<name>.png   (_uk_extract/tools/cut_sprites.py)
Writes data.js (window.UK_DATA), assets/icons/<name>.png (only sprites the app uses), precache-list.json; then stamps
the cache-bust tokens (../tools/app/stamp_cache.py, rule A-cache-bust).
The extract itself is never copied here (G-extract-not-in-app). Guardrails (A-provenance-guards): every entry needs a
game display name and an icon, every sprite must exist; misses are listed, and --strict turns them into a failed build
with data.js left as it was.

  python tools/build_data.py [--strict]
"""
import hashlib, json, os, re, shutil, subprocess, sys

APP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
X = os.path.join(os.path.dirname(APP), "_uk_extract")
R = os.path.join(X, "data", "resolved")
D = os.path.join(X, "data", "defs")
SPRITES = os.path.join(X, "assets", "sprites")
STRICT = "--strict" in sys.argv
errors, warnings, skipped = [], [], []


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


T = {}
for part in ("common", "game", "items", "skills"):
    T.update(next(iter(load(os.path.join(D, "text_text_%s_en.json" % part)).values())))


def txt(key):
    """Game text with markup kept as light tokens the app renders: {color_x} -> «c:x», line breaks -> \n."""
    s = T.get(key)
    if s is None:
        return None
    s = s.replace("\\n", "\n").replace("\r", "")
    s = re.sub(r"\{a:(left|right)\}", "\t", s)
    s = re.sub(r"\{(italic|regular)\}", "", s)
    s = re.sub(r"\{sprite:[^}]*\}", "", s)
    s = re.sub(r"\{color:?_?([a-z_0-9]+)\}", lambda m: "«c:%s»" % m.group(1), s)
    return s.strip()


def label(part):
    """Stat label from the game's own item tooltip (item_info_part_<part>), markup stripped. A value placed
    mid-sentence keeps its slot as '#' (the app fills it); a trailing value slot is dropped (shown right-aligned)."""
    s = T.get("item_info_part_" + part)
    if s is None:
        return None
    s = re.sub(r"\{[^}]*\}", "", s).replace("\\n", "").strip()
    s = s[:-2].strip() if s.endswith("%1") else s
    return s.replace("%1", "#")


used_icons = set()


def icon(name, owner):
    if not name:
        warnings.append("%s: no icon field" % owner)
        return None
    if not os.path.exists(os.path.join(SPRITES, name + ".png")):
        errors.append("%s: sprite %s missing" % (owner, name))
        return None
    used_icons.add(name)
    return name


# data key -> item_info_part key (game tooltip label). Keys equal to their part key are found automatically.
PART_ALIAS = {
    "req_str": "req_strength", "req_dex": "req_dexterity", "req_wis": "req_wisdom", "req_end": "req_endurance",
    "extra_damage": "damage3", "armor_pierce": "damage4",
}
# numeric keys that are not stats (presentation / economy / engine) and never shown in the stat list
NON_STAT = {"price", "buy_price", "throw_distance", "shadow_size", "def_line", "show_on_map", "stackable",
            "projectile_relx", "projectile_rely", "relz", "base_angle", "no_flip", "max_fly_distance", "use_once",
            "use_face_fx", "quest_item", "uses_dexterity", "two_handed", "long_reach", "item_feature_bonus",
            "item_feature_chance", "food_value", "heal_min", "heal_max", "mana_min", "mana_max", "stamina_min",
            "stamina_max", "show_status_effect_bonus", "show_status_effect_duration", "interact_priority",
            "interact_area", "shadow_offset", "tip_offset", "custom_text_vars"}
STAT_LABELS = {}
UNLABELED = {}  # stat key -> owners; reported once per key


def stats_of(v, owner):
    out = []
    for k, val in v.items():
        if k in NON_STAT or k.startswith("_") or k.startswith("req_") or k in ("damage", "element_damage"):
            continue
        if isinstance(val, bool) or not isinstance(val, (int, float, list)):
            continue
        if isinstance(val, list) and not all(isinstance(n, (int, float)) for n in val):
            continue
        lab = label(PART_ALIAS.get(k, k))
        if lab is None:
            UNLABELED.setdefault(k, []).append(owner)
            continue
        STAT_LABELS[k] = lab
        out.append([k, val])
    return out


def status(se):
    if not isinstance(se, dict):
        return None
    return {k: se[k] for k in ("type", "chance", "power", "duration") if k in se}


def feature(v):
    f = v.get("item_feature")
    if not f:
        return None
    s = txt("item_feature_" + f) if isinstance(f, str) else None
    if s:
        s = s.replace("{item_feature_bonus}", str(v.get("item_feature_bonus", "")))
        s = s.replace("{item_feature_chance}", str(v.get("item_feature_chance", "")))
    return s


def item_common(k, v, kind):
    name = T.get(k)
    if not name:
        skipped.append("%s %s (no display name: dev/test entry)" % (kind, k))
        return None
    e = {"id": k, "name": name, "icon": icon(v.get("icon") or v.get("sprite"), k), "type": v.get("item_type")}
    for key, field in (("desc", k + "_desc"), ("feat", k + "_feat")):
        s = txt(field)
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
    return e


def entries(fname):
    data = load(os.path.join(R, fname))
    return [(k, v) for k, v in data.items() if isinstance(v, dict) and not k.startswith("_") and not k.startswith("engine")]


# ---- items
weapons, armor, accessories, consumables = [], [], [], []
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
    weapons.append(e)
for k, v in entries("def_def_item_armor.json"):
    e = item_common(k, v, "armor")
    if e:
        armor.append(e)
CONSUMABLE = {"potion", "food", "consumable", "book"}
for k, v in entries("def_def_item.json"):
    t = v.get("item_type")
    if t not in ("ring", "amulet") and t not in CONSUMABLE:
        continue
    e = item_common(k, v, t)
    if not e:
        continue
    for f in ("heal_min", "heal_max", "mana_min", "mana_max", "stamina_min", "stamina_max", "food_value"):
        if v.get(f):
            e[f] = v[f]
    (accessories if t in ("ring", "amulet") else consumables).append(e)

# ---- skills
SKILL_KEYS = ("cost", "cooldown", "damage", "bonus", "bonus2", "bonus3", "passive_bonus", "heal_amount", "ignore_armor",
              "chance", "duration")
classes = {}
skills = []
for s in load(os.path.join(D, "def_def_skill.json"))["skills"]:
    k = s["name"]
    name = T.get(k)
    if not name:
        skipped.append("skill %s (no display name)" % k)
        continue
    e = {"id": k, "name": name, "icon": icon(s.get("icon"), k), "cls": s.get("class"), "lvl": s.get("req_class_level"),
         "max": s.get("max_level", 1)}
    for key, field in (("summary", k + "_summary"), ("desc", k + "_desc")):
        t = txt(field)
        if t:
            e[key] = t
    lines = [txt("%s_stat_%d" % (k, i)) for i in range(1, 6)]
    e["lines"] = [x for x in lines if x]
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
    classes.setdefault(s.get("class"), None)
    skills.append(e)
CLASS_ORDER = ["warrior", "paladin", "thief", "archer", "wizard", "voidcaller", "bloodmage"]
cls_out = []
for c in CLASS_ORDER + [c for c in classes if c not in CLASS_ORDER]:
    if c not in classes:
        continue
    nm = T.get("hero_class_" + c)
    if not nm:
        errors.append("class %s has no display name" % c)
    cls_out.append({"id": c, "name": nm or c, "desc": txt("hero_class_%s_desc" % c)})

# ---- enemies
RESISTS = ("fire", "ice", "lightning", "poison", "blood", "void")
have_sprites = None
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
        if have_sprites is None:
            have_sprites = sorted(f[:-4] for f in os.listdir(SPRITES))
        cands = [pre + "_idle", pre] + [h for h in have_sprites if h.startswith(pre + "_")]
        spr = next((c for c in cands if os.path.exists(os.path.join(SPRITES, c + ".png"))), None)
    e = {"id": k, "name": name, "icon": icon(spr, k) if spr else None,
         "hp": v.get("health"), "armor": v.get("armor"), "evasion": v.get("evasion"), "exp": v.get("exp")}
    if not spr:
        warnings.append("%s: no sprite" % k)
    for f in ("melee_evasion", "ranged_evasion", "melee_physical_resist", "ranged_physical_resist", "hp_shield"):
        if v.get(f):
            e[f] = v[f]
    e["res"] = {r: v.get(r + "_resist") for r in RESISTS if v.get(r + "_resist") is not None}
    e["imm"] = sorted(key[len("immunity_to_"):] for key, val in v.items() if key.startswith("immunity_to_") and val)
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
    enemies.append(e)

# ---- mechanics
G = load(os.path.join(D, "def_def.json"))
gp = G.get("global_params", {})
mech = {
    "difficulty": {d: gp.get("difficulty_" + d) for d in ("easy", "normal", "hard") if gp.get("difficulty_" + d)},
    "statusEffects": {k: {f: v.get(f) for f in ("power", "duration", "combine", "power_type") if f in v}
                      for k, v in G.get("status_effects", {}).items()},
    "resting": {k: G.get("resting_%s_recovery" % k) for k in ("hp", "stamina", "mana")},
    "poisonByEndurance": G.get("poison_duration_reduction_by_endurance"),
    "tooltips": {k: txt(k) for k in sorted(T) if re.match(r"stats_(dex|wis|str|end|total_damage|critical|ranged_critical|armor|evasion)_desc$", k)},
}
mp = os.path.join(X, "data", "mechanics.json")
if os.path.exists(mp):
    mech["code"] = load(mp)
else:
    warnings.append("mechanics.json not written yet: formulas section shows game tooltips only")
names = {k: T[k] for k in T if re.match(r"(hero_race_|item_type_)[a-z_]+$", k)}
names.update({"stat_" + k: v for k, v in STAT_LABELS.items()})

# ---- report / guard
for k, owners in sorted(UNLABELED.items()):
    warnings.append("stat %s has no game label, not shown (%d entries, e.g. %s)" % (k, len(owners), owners[0]))
for s in skipped:
    print("skip  ", s)
for w in warnings:
    print("warn  ", w)
for e in errors:
    print("ERROR ", e)
if errors or (STRICT and warnings):
    print("build failed: %d errors, %d warnings (strict=%s); data.js left as it was" % (len(errors), len(warnings), STRICT))
    sys.exit(1)

out = {"classes": cls_out, "weapons": weapons, "armor": armor, "accessories": accessories, "consumables": consumables,
       "skills": skills, "enemies": enemies, "mechanics": mech, "names": names}
js = "window.UK_DATA=" + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n"
icon_dir = os.path.join(APP, "assets", "icons")
os.makedirs(icon_dir, exist_ok=True)
for f in os.listdir(icon_dir):
    if f[:-4] not in used_icons:
        os.remove(os.path.join(icon_dir, f))
for n in sorted(used_icons):
    src, dst = os.path.join(SPRITES, n + ".png"), os.path.join(icon_dir, n + ".png")
    if not os.path.exists(dst) or open(src, "rb").read() != open(dst, "rb").read():
        shutil.copyfile(src, dst)
urls = ["assets/icons/%s.png" % n for n in sorted(used_icons)]
with open(os.path.join(APP, "data.js"), "w", encoding="utf-8", newline="\n") as f:
    f.write(js)
h = hashlib.md5("".join(urls).encode() + js.encode()).hexdigest()[:8]
with open(os.path.join(APP, "precache-list.json"), "w", encoding="utf-8", newline="\n") as f:
    json.dump({"v": h, "urls": urls}, f)
print("data.js: %d weapons, %d armor, %d accessories, %d consumables, %d skills / %d classes, %d enemies; %d icons; %d skipped"
      % (len(weapons), len(armor), len(accessories), len(consumables), len(skills), len(cls_out), len(enemies),
         len(used_icons), len(skipped)))
subprocess.run([sys.executable, os.path.join(os.path.dirname(APP), "tools", "app", "stamp_cache.py"), APP], check=True)
