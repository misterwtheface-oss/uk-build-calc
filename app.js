"use strict";
/* Underkeep Codex: browse the datamined game. Data: data.js (tools/build_data.py).
   Art rule: every game object with an icon or UI element is shown with it. All art goes through the helpers in
   "art" below (img / sym / framed / thumb / chips); never write an <img> for game art anywhere else. */
const FEATURES = { mechanics: true, companions: true, shops: true, alchemy: true };
const D = window.UK_DATA;
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const cap = (s) => String(s || "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
const fmt = (v) => (Array.isArray(v) ? (v[0] === v[1] ? String(v[0]) : `${v[0]}–${v[1]}`) : String(v ?? ""));
const hi = (v) => (Array.isArray(v) ? v[v.length - 1] : v);
const byName = (a, b) => a.name.localeCompare(b.name);

/* ---------- art */
const src = (n) => `assets/icons/${encodeURIComponent(n)}.png`;
const img = (n, cls = "") => (n ? `<img class="px ${cls}" src="${src(n)}" alt="" loading="lazy">` : "");
const sym = (key) => img(D.ui[key], "sym");                       // UI concept symbol (stat, element, tag, coins…)
const symFor = (k) => img(D.statIcons[k], "sym");                 // symbol for an item stat key, if the game has one
const framed = (icon, frame) => `<span class="frame" style="background-image:url(${src(frame)})">${img(icon)}</span>`;
const itemArt = (e) => framed(e.icon, D.ui.slot_frame);
const skillArt = (s) => framed(s.icon, s.frame || D.ui.skill_frame);
const thumb = (n, cls = "") => (n ? `<span class="thumb ${cls}">${img(n)}</span>` : "");   // native-pixel crop of big art
const ELEM = { fire: 1, ice: 1, lightning: 1, poison: 1, blood: 1, void: 1 };
const elemSym = (el) => (ELEM[el] ? sym(el) : "");
const coins = (v) => `<span class="nowrap">${sym("coins")} ${esc(v)}</span>`;

/* lookup of every openable game object: kind -> id -> entry */
const ITEM_CATS = ["weapons", "armor", "accessories", "consumables", "misc"];
const IDX = { item: {}, skill: {}, enemy: {}, class: {}, race: {}, shop: {}, companion: {}, status: D.status, recipe: {} };
for (const c of ITEM_CATS) for (const e of D[c]) IDX.item[e.id] = e;
for (const e of D.skills) IDX.skill[e.id] = e;
for (const e of D.enemies) IDX.enemy[e.id] = e;
for (const e of D.classes) IDX.class[e.id] = e;
for (const e of D.races) IDX.race[e.id] = e;
for (const e of D.shops) IDX.shop[e.id] = e;
for (const e of D.companions) IDX.companion[e.id] = e;
for (const e of D.recipes) IDX.recipe[e.id] = e;
const CLASS = IDX.class;

/* chips: one shared look for every cross-reference */
const chip = (open, art, text, extra = "") => `<button class="ref" data-open="${esc(open)}">${art}<span>${esc(text)}</span>${extra}</button>`;
function itemChip(r) {
  if (r.pool) {  // a drop list the game draws from: one group, never shown as fixed items
    const n = r.n && r.n !== "1" ? `×${esc(r.n)} ` : "";
    const ch = r.chance ? `${r.chance}% · ` : "";
    return `<span class="pool"><span class="dim">${ch}${n}one of</span>${r.items.map(itemChip).join("")}</span>`;
  }
  if (r.coins) return `<span class="ref static">${sym("coins")}<span>${esc(r.coins)}</span></span>`;
  const e = IDX.item[r.id];
  if (!e) return "";
  const n = r.n === "-1" ? ` ${sym("infinity")}` : r.n && r.n !== "1" ? ` <span class="dim">×${esc(r.n)}</span>` : "";
  const ch = r.chance ? ` <span class="dim">${r.chance}%</span>` : "";
  return chip(`item/${e.id}`, itemArt(e), e.name, n + ch);
}
const statusChip = (t, extra = "") => { const s = D.status[t]; return s ? chip(`status/${t}`, img(s.icon, "sym"), s.name, extra) : esc(cap(t)) + extra; };
const enemyChip = (id, extra = "") => { const e = IDX.enemy[id]; return e ? chip(`enemy/${id}`, thumb(e.icon), e.name, extra) : ""; };
const skillChip = (id) => { const s = IDX.skill[id]; return s ? chip(`skill/${id}`, skillArt(s), s.name) : ""; };
const shopChip = (id) => { const s = IDX.shop[id]; return s ? chip(`shop/${id}`, thumb(s.art), s.name) : ""; };
const classChip = (id) => { const c = CLASS[id]; return c ? chip(`class/${id}`, "", c.name) : esc(id); };
const raceChip = (id) => { const r = IDX.race[id]; return r ? chip(`race/${id}`, thumb(r.faces[0]), r.name) : esc(id); };
const recipeChip = (id) => { const r = IDX.recipe[id]; const o = r && r.out[0] && IDX.item[r.out[0].id]; return o ? chip(`recipe/${id}`, itemArt(o), `Recipe: ${o.name}`) : ""; };
const chips = (html) => (html ? `<div class="refs">${html}</div>` : "");

/* ---------- game text: «c:#hex» colour, «s:name» inline sprite, \t left/right, \n line */
function gameText(s) {
  if (!s) return "";
  return s.split("\n").map((line) => {
    let open = 0;
    const html = esc(line)
      .replace(/«s:([a-z_0-9]+)»/g, (_, n) => img(n, "sym"))
      .replace(/«c:(#[0-9a-f]{6})»/g, (_, c) => { const r = (open ? "</span>" : "") + `<span style="color:${c}">`; open = 1; return r; });
    const close = open ? "</span>" : "";
    const parts = html.split("\t").filter((p) => p.replace(/<(?!img)[^>]*>/g, "").trim() !== "");
    if (line.includes("\t") && parts.length >= 2) return `<div class="ln"><span>${parts.slice(0, -1).join(" ")}${close}</span><span>${parts[parts.length - 1]}${close}</span></div>`;
    return `<div>${html}${close}</div>`;
  }).join("");
}

/* ---------- stats */
const statLabel = (k) => D.names["stat_" + k] || cap(k);
const stat = (e, k) => { const s = (e.stats || []).find((x) => x[0] === k); return s ? s[1] : undefined; };
function statRow(k, v) {
  const lab = statLabel(k), ic = symFor(k);
  if (k.startsWith("immunity_")) return `<tr><td colspan="2">${ic}${esc(lab)}</td></tr>`;
  if (lab.includes("#")) return `<tr><td colspan="2">${ic}${esc(lab.replace("#", fmt(v)))}</td></tr>`;
  return `<tr><td>${ic}${esc(lab)}</td><td>${esc(fmt(v))}</td></tr>`;
}
const STAT4 = { req_str: "str", req_dex: "dex", req_wis: "wis", req_end: "end" };
const reqInline = (e) => (e.req ? Object.entries(e.req).map(([k, v]) => `<span class="nowrap">${sym(STAT4[k])}${v}</span>`).join(" ") : "");
function statusLine(s) {
  if (!s) return "";
  const bits = [];
  if (s.chance !== undefined) bits.push(`${fmt(s.chance)}%`);
  if (s.power !== undefined) bits.push(`power ${fmt(s.power)}`);
  if (s.duration !== undefined) bits.push(`${sym("duration")}${fmt(s.duration)}`);
  return statusChip(s.type, bits.length ? ` <span class="dim">${bits.join(" · ")}</span>` : "");
}

/* ---------- magnitude bars (A-magnitude-bars): share of that field's largest value among shown entries */
function fieldMax(entries, get) { let m = 0; for (const e of entries) { const v = hi(get(e)); if (typeof v === "number" && v > m) m = v; } return m; }
function bars(e, fields, maxes) {
  return `<div class="bars">${fields.map((f, i) => {
    const v = f.get(e);
    if (v === undefined || v === null || v === 0) return "";
    const pct = maxes[i] ? Math.max(0, Math.min(100, (hi(v) / maxes[i]) * 100)) : 0;
    return `<span class="k">${f.icon ? sym(f.icon) : ""}${esc(f.label)}</span><span class="mb"><i style="width:${pct.toFixed(1)}%"></i></span><span class="v">${esc(fmt(v))}</span>`;
  }).join("")}</div>`;
}

/* ---------- skills: value at level = base + step x (level - 1); ranges scale both ends */
function valAt(v, L) {
  const [base, step] = v;
  if (Array.isArray(base)) return base.map((b, i) => b + (Array.isArray(step) ? step[i] : step) * (L - 1));
  return base + (Array.isArray(step) ? step[0] : step || 0) * (L - 1);
}
const PCT_KEYS = new Set(["status_chance", "chance"]);
function skillVal(e, key, L) {
  const v = e.v[key];
  if (!v) return null;
  const pct = PCT_KEYS.has(key) || String(v[2] || "").startsWith("percentage");
  return fmt(valAt(v, L)) + (pct ? "%" : "");
}
const fillSkill = (s, e, L) => (s ? s.replace(/\{skill_([a-z_0-9]+)\}/g, (m, k) => skillVal(e, k, L) ?? m) : s);
const SKILL_ROW = { cost: "Cost", cooldown: "Cooldown", damage: "Damage", bonus: "Bonus", bonus2: "Bonus 2", bonus3: "Bonus 3", passive_bonus: "Passive bonus", heal_amount: "Heal", ignore_armor: "Armor ignored", chance: "Chance", duration: "Duration", status_chance: "Status chance", status_power: "Status power", status_duration: "Status duration" };
const SKILL_ICON = { cooldown: "cooldown", duration: "duration", status_duration: "duration", damage: "damage", ignore_armor: "armor" };
const costLine = (s, L) => { const c = CLASS[s.cls]; return c && c.cost && s.v.cost && hi(valAt(s.v.cost, L)) ? gameText(c.cost.replace("{skill_cost}", fmt(valAt(s.v.cost, L)))) : ""; };

/* ---------- tabs */
const subItem = (e) => [e.typeName || cap(e.type)].filter(Boolean).join(" · ");
const TABS = [
  { id: "classes", label: "Classes", kind: "class", items: D.classes, art: () => "", sub: (c) => `${c.skills.length} skills`, keepOrder: 1 },
  { id: "races", label: "Races", kind: "race", items: D.races, art: (r) => thumb(r.faces[0], "big"), sub: (r) => ["str", "dex", "end", "wis"].map((k) => `${k.toUpperCase()} ${fmt(r.base[k])}`).join(" · "), keepOrder: 1 },
  {
    id: "weapons", label: "Weapons", kind: "item", items: D.weapons, chip: (e) => e.typeName, art: itemArt,
    fields: [
      { label: "Damage", icon: "damage", get: (e) => e.damage },
      { label: statLabel("extra_damage"), get: (e) => stat(e, "extra_damage") },
      { label: statLabel("armor_pierce"), get: (e) => stat(e, "armor_pierce") },
    ],
    subHtml: (e) => [esc(e.typeName), e.two_handed ? sym("two_handed") : "", e.long_reach ? sym("long_reach") : "", e.element ? elemSym(e.element[0]) : "", e.status ? img(D.status[e.status.type]?.icon, "sym") : "", reqInline(e)].filter(Boolean).join(" "),
  },
  {
    id: "armor", label: "Armor", kind: "item", items: D.armor, chip: (e) => e.type, chipArt: (t) => sym("slot_" + t), chipLabel: cap, art: itemArt,
    fields: [
      { label: statLabel("armor"), icon: "armor", get: (e) => stat(e, "armor") },
      { label: statLabel("evasion"), icon: "evasion", get: (e) => stat(e, "evasion") },
    ],
    subHtml: (e) => [sym("slot_" + e.type) + esc(cap(e.type)), reqInline(e)].filter(Boolean).join(" "),
  },
  {
    id: "accessories", label: "Rings & Amulets", kind: "item", items: D.accessories, chip: (e) => e.type, chipArt: (t) => sym("slot_" + t), chipLabel: cap, art: itemArt, fields: [],
    subHtml: (e) => (e.stats || []).map(([k, v]) => `<span class="nowrap">${symFor(k)}${esc(statLabel(k).includes("#") ? statLabel(k).replace("#", fmt(v)) : `${statLabel(k)} ${fmt(v)}`)}</span>`).join(" · "),
  },
  {
    id: "consumables", label: "Consumables", kind: "item", items: D.consumables, chip: (e) => e.type, chipLabel: cap, art: itemArt, fields: [],
    subHtml: (e) => [esc(cap(e.type)), e.heal_min ? `Heal ${fmt([e.heal_min, e.heal_max])}` : "", e.mana_min ? `Mana ${fmt([e.mana_min, e.mana_max])}` : "", e.stamina_min ? `Stamina ${fmt([e.stamina_min, e.stamina_max])}` : "", e.food_value ? `${sym("food")}${e.food_value}` : ""].filter(Boolean).join(" · "),
  },
  { id: "misc", label: "Other Items", kind: "item", items: D.misc, chip: (e) => e.type || "item", chipLabel: cap, art: itemArt, fields: [], subHtml: (e) => esc(cap(e.type || "item")) },
  {
    id: "skills", label: "Skills", kind: "skill", items: D.skills, chip: (e) => e.cls, chipLabel: (c) => CLASS[c]?.name || c, chipOrder: D.classes.map((c) => c.id), art: skillArt,
    sort: (a, b) => (a.lvl - b.lvl) || byName(a, b), fields: [],
    subHtml: (e) => [esc(CLASS[e.cls]?.name), `${sym("level")}${e.lvl}`, e.is_passive ? "Passive" : "", e.damage_element ? elemSym(e.damage_element) : "", e.statusType ? img(D.status[e.statusType]?.icon, "sym") : "", e.v.cooldown ? `${sym("cooldown")}${fmt(valAt(e.v.cooldown, 1))}` : ""].filter(Boolean).join(" "),
  },
  {
    id: "enemies", label: "Enemies", kind: "enemy", items: D.enemies, chip: (e) => (e.tags.length ? e.tags[0] : "other"), chipArt: (t) => (D.ui[t] ? sym(t) : ""), chipLabel: cap, art: (e) => thumb(e.icon, "big"),
    fields: [
      { label: "Health", get: (e) => e.hp },
      { label: "Armor", icon: "armor", get: (e) => e.armor },
      { label: "Evasion", icon: "evasion", get: (e) => e.evasion },
      { label: "Experience", get: (e) => e.exp },
    ],
    subHtml: (e) => [e.tags.map((t) => sym(t)).join(""), e.imm.map((t) => img(D.status[t]?.icon, "sym")).join("")].filter(Boolean).join(" "),
  },
];
if (FEATURES.companions) TABS.push({ id: "companions", label: "Companions", kind: "companion", items: D.companions, art: (c) => thumb(c.face, "big"), subHtml: (c) => gameText(c.feat) });
if (FEATURES.shops) TABS.push({ id: "shops", label: "Shops", kind: "shop", items: D.shops, art: (s) => thumb(s.art, "big"), sub: (s) => `${s.stock.length} items` });
if (FEATURES.alchemy) TABS.push({ id: "alchemy", label: "Alchemy", page: () => alchemyPage() });
if (FEATURES.mechanics) TABS.push({ id: "mechanics", label: "Mechanics", page: () => mechanicsPage() });
for (const t of TABS) { t.fields = t.fields || []; t.chipLabel = t.chipLabel || ((x) => x); }
const TAB = Object.fromEntries(TABS.map((t) => [t.id, t]));
const KIND_TAB = { class: "classes", race: "races", skill: "skills", enemy: "enemies", companion: "companions", shop: "shops", status: "mechanics", recipe: "alchemy" };
const tabOf = (kind, e) => (kind === "item" ? e.cat : KIND_TAB[kind]);
const SORTS = (t) => [["name", "Name"], ...(t.sort ? [["lvl", "Class level"]] : []), ...t.fields.map((f, i) => ["f" + i, f.label]), ...(t.items?.some((e) => e.price) ? [["price", "Price"]] : [])];

const state = { tab: "weapons", q: {}, chip: {}, sort: {}, scroll: {} };

function renderTabs() {
  $("#tabs").innerHTML = TABS.map((t) => `<button class="tab${t.id === state.tab ? " on" : ""}" data-tab="${t.id}" role="tab">${esc(t.label)}</button>`).join("");
}
function shown(t) {
  const q = (state.q[t.id] || "").toLowerCase();
  const c = state.chip[t.id];
  const list = t.items.filter((e) => (!c || t.chip(e) === c) && (!q || e.name.toLowerCase().includes(q) || (e.desc || "").toLowerCase().includes(q) || (e.summary || "").toLowerCase().includes(q)));
  const s = state.sort[t.id] || (t.sort ? "lvl" : "name");
  if (t.keepOrder && s === "name" && !state.sort[t.id]) return list;
  if (s === "name") list.sort(byName);
  else if (s === "lvl") list.sort(t.sort);
  else if (s === "price") list.sort((a, b) => (b.price || 0) - (a.price || 0) || byName(a, b));
  else { const f = t.fields[+s.slice(1)]; list.sort((a, b) => (hi(f.get(b)) || 0) - (hi(f.get(a)) || 0) || byName(a, b)); }
  return list;
}
function renderControls() {
  const t = TAB[state.tab];
  if (t.page || !t.chip) { $("#controls").innerHTML = t.page ? "" : `<div class="row2"><input type="search" id="q" placeholder="Search" value="${esc(state.q[t.id] || "")}"></div>`; return; }
  let cs = [...new Set(t.items.map(t.chip).filter(Boolean))];
  cs.sort(t.chipOrder ? (a, b) => t.chipOrder.indexOf(a) - t.chipOrder.indexOf(b) : (a, b) => String(t.chipLabel(a)).localeCompare(t.chipLabel(b)));
  const cur = state.chip[t.id];
  const sort = state.sort[t.id] || (t.sort ? "lvl" : "name");
  $("#controls").innerHTML = `<div class="row2"><input type="search" id="q" placeholder="Search" value="${esc(state.q[t.id] || "")}">
    <select id="sort">${SORTS(t).map(([v, l]) => `<option value="${v}"${v === sort ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></div>
    <div class="chips">${cs.map((c) => `<button class="chip${c === cur ? " on" : ""}" data-chip="${esc(c)}">${t.chipArt ? t.chipArt(c) : ""}${esc(t.chipLabel(c))}</button>`).join("")}</div>`;
}
function renderList() {
  const t = TAB[state.tab];
  if (t.page) { $("#list").innerHTML = t.page(); return; }
  const list = shown(t);
  const maxes = t.fields.map((f) => fieldMax(list, f.get));
  $("#list").innerHTML = list.length ? list.map((e) => `<button class="card" data-open="${t.kind}/${esc(e.id)}">
      <span class="ico">${t.art(e)}</span>
      <span><div class="nm">${esc(e.name)}</div><div class="sub">${t.subHtml ? t.subHtml(e) : esc(t.sub(e))}</div>${t.fields.length ? bars(e, t.fields, maxes) : ""}</span>
    </button>`).join("") : `<div class="empty">No matches</div>`;
}
function switchTab(id) {
  state.scroll[state.tab] = scrollY;
  state.tab = id;
  renderTabs(); renderControls(); renderList();
  scrollTo(0, state.scroll[id] || 0);
}

/* ---------- detail views */
const sec = (title, body) => (body ? `<div class="sec">${title ? `<h3>${title}</h3>` : ""}${body}</div>` : "");
const head = (art, name, subHtml) => `<div class="dhead">${art ? `<span class="ico big">${art}</span>` : ""}<div><h2>${esc(name)}</h2><div class="sub">${subHtml || ""}</div></div></div>`;

function sourcesHtml(e) {
  const s = e.src || {};
  const out = [];
  if (s.shop) out.push(sec("Sold by", chips([...new Set(s.shop)].map(shopChip).join(""))));
  if (s.made) out.push(sec("Made by alchemy", chips(s.made.map(recipeChip).join(""))));
  if (s.used) out.push(sec("Ingredient in", chips(s.used.map(recipeChip).join(""))));
  if (s.teaches) out.push(sec("Teaches", chips(s.teaches.map(recipeChip).join(""))));
  if (s.drop) out.push(sec("Dropped by", chips(s.drop.map((d) => enemyChip(d.enemy, d.chance ? ` <span class="dim">${d.chance}%</span>` : "")).join(""))));
  if (s.start) out.push(sec("Starting gear", chips(s.start.map((x) => (x.cls ? classChip(x.cls) : x.race ? raceChip(x.race) : skillChip(x.skill))).join(""))));
  return out.join("");
}

/* item text placeholders the game fills from the item's own values */
const itemVars = (e) => ({ heal_amount: e.heal_min && fmt([e.heal_min, e.heal_max]), mana_amount: e.mana_min && fmt([e.mana_min, e.mana_max]), stamina_amount: e.stamina_min && fmt([e.stamina_min, e.stamina_max]) });
const fillItem = (s, e) => { const v = itemVars(e); return s && s.replace(/\{([a-z_]+)\}/g, (m, k) => v[k] || m); };
function itemDetail(e) {
  const rows = [];
  const featText = (e.feat || "") + (e.feature || "");
  if (e.damage) rows.push(`<tr><td>${sym("damage")}Damage</td><td>${fmt(e.damage)}</td></tr>`);
  if (e.element) rows.push(`<tr><td>${elemSym(e.element[0])}${esc(cap(e.element[0]))} damage</td><td>${fmt(e.element[1])}</td></tr>`);
  if (e.heal_min && !featText.includes("{heal_amount}")) rows.push(`<tr><td>Health restored</td><td>${fmt([e.heal_min, e.heal_max])}</td></tr>`);
  if (e.mana_min && !featText.includes("{mana_amount}")) rows.push(`<tr><td>Mana restored</td><td>${fmt([e.mana_min, e.mana_max])}</td></tr>`);
  if (e.stamina_min && !featText.includes("{stamina_amount}")) rows.push(`<tr><td>Stamina restored</td><td>${fmt([e.stamina_min, e.stamina_max])}</td></tr>`);
  if (e.food_value) rows.push(`<tr><td>${sym("food")}Food supply</td><td>${e.food_value}</td></tr>`);
  const tags = [e.two_handed && `${sym("two_handed")}Two-handed`, e.long_reach && `${sym("long_reach")}Long reach`, e.uses_dexterity && `${sym("dex")}Uses Dexterity`, e.quest && "Quest item"].filter(Boolean);
  const reqRows = e.req ? Object.entries(e.req).map(([k, v]) => `<tr><td>${sym(STAT4[k])}${esc(statLabel(k))}</td><td>${v}</td></tr>`).join("") : "";
  const sub = [e.cat === "armor" || e.cat === "accessories" ? sym("slot_" + e.type) : "", esc(e.typeName || cap(e.type || "item"))].join("");
  return `${head(itemArt(e), e.name, sub)}
    ${tags.length ? `<div>${tags.map((x) => `<span class="tag">${x}</span>`).join("")}</div>` : ""}
    ${e.reqClass ? sec("", `<div class="refs">Class: ${classChip(e.reqClass)}</div>`) : ""}
    ${sec("", `<table class="kv">${rows.join("")}${(e.stats || []).map(([k, v]) => statRow(k, v)).join("")}${reqRows}
      ${e.price ? `<tr><td>Sell price</td><td>${coins(e.price)}</td></tr>` : ""}${e.buy_price ? `<tr><td>Buy price</td><td>${coins(e.buy_price)}</td></tr>` : ""}</table>`)}
    ${e.status ? sec("On hit", chips(statusLine(e.status))) : ""}
    ${e.feat ? sec("", `<div class="gtxt">${gameText(fillItem(e.feat, e))}</div>`) : ""}
    ${e.feature ? sec("", `<div class="gtxt">${gameText(fillItem(e.feature, e))}</div>`) : ""}
    ${e.desc ? sec("", `<div class="gtxt prose flavor">${gameText(fillItem(e.desc, e))}</div>`) : ""}
    ${sourcesHtml(e)}`;
}

let detailLevel = 1;
function skillDetail(e) {
  const L = detailLevel;
  const lv = Array.from({ length: e.max }, (_, i) => i + 1);
  const rows = Object.keys(e.v).filter((k) => SKILL_ROW[k]);
  const gear = D.skillGear.find((g) => g.skill === e.id);
  const sub = [classChip(e.cls), `${sym("level")}Class level ${e.lvl}`, e.is_passive ? "Passive" : "", e.is_spell ? "Spell" : "", e.damage_element ? `${elemSym(e.damage_element)}${esc(cap(e.damage_element))}` : ""].filter(Boolean).join(" · ");
  return `${head(skillArt(e), e.name, sub)}
    <div class="lvl">${lv.map((l) => `<button class="chip${l === L ? " on" : ""}" data-lvl="${l}">Level ${l}</button>`).join("")}</div>
    ${e.summary ? sec("", `<div class="gtxt">${gameText(fillSkill(e.summary, e, L))}</div>`) : ""}
    ${sec("", `<div class="gtxt">${costLine(e, L)}${e.v.cooldown ? `<div class="ln"><span>${sym("cooldown")}Cooldown</span><span>${fmt(valAt(e.v.cooldown, L))}</span></div>` : ""}${e.lines.map((x) => gameText(fillSkill(x, e, L))).join("")}</div>`)}
    ${e.statusType ? sec("Applies", chips(statusChip(e.statusType))) : ""}
    ${rows.length ? sec("Per level", `<div class="tbl-wrap"><table class="grid"><tr><th></th>${lv.map((l) => `<th>${l}</th>`).join("")}</tr>
      ${rows.map((k) => `<tr><td>${SKILL_ICON[k] ? sym(SKILL_ICON[k]) : ""}${SKILL_ROW[k]}</td>${lv.map((l) => `<td${l === L ? ' class="cur"' : ""}>${esc(skillVal(e, k, l))}</td>`).join("")}</tr>`).join("")}</table></div>`) : ""}
    ${e.desc ? sec("", `<div class="gtxt prose">${gameText(e.desc)}</div>`) : ""}
    ${gear ? sec("Starting gear with this skill", chips(gear.gear.map(itemChip).join(""))) : ""}`;
}

function enemyDetail(e) {
  const res = Object.entries(e.res);
  return `${head(img(e.icon), e.name, e.tags.map((t) => `${sym(t)}${esc(cap(t))}`).join(" · "))}
    ${sec("", `<table class="kv"><tr><td>Health</td><td>${e.hp}</td></tr><tr><td>${sym("armor")}Armor</td><td>${e.armor}</td></tr><tr><td>${sym("evasion")}Evasion</td><td>${e.evasion}</td></tr>
      ${e.melee_evasion ? `<tr><td>${sym("evasion")}Melee evasion</td><td>${e.melee_evasion}</td></tr>` : ""}${e.ranged_evasion ? `<tr><td>${sym("evasion")}Ranged evasion</td><td>${e.ranged_evasion}</td></tr>` : ""}
      ${e.melee_physical_resist ? `<tr><td>${sym("armor")}Melee physical resist</td><td>${e.melee_physical_resist}%</td></tr>` : ""}${e.ranged_physical_resist ? `<tr><td>${sym("armor")}Ranged physical resist</td><td>${e.ranged_physical_resist}%</td></tr>` : ""}
      ${e.hp_shield ? `<tr><td>Shield</td><td>${e.hp_shield}</td></tr>` : ""}${e.exp ? `<tr><td>Experience</td><td>${e.exp}</td></tr>` : ""}</table>`)}
    ${res.length ? sec("Resistances", `<table class="kv">${res.map(([k, v]) => `<tr><td style="color:${D.colors[k === "blood" ? "blood_magic" : k] || "inherit"}">${elemSym(k)}${cap(k)}</td><td>${v}%</td></tr>`).join("")}</table>`) : ""}
    ${e.imm.length ? sec("Immune to", chips(e.imm.map((x) => (D.status[x] ? statusChip(x) : `<span class="tag">${esc(cap(x))}</span>`)).join(""))) : ""}
    ${e.attacks.length ? sec("Attacks", `<div class="tbl-wrap"><table class="grid"><tr><th>Use</th><th>${sym("damage")}Damage</th><th>Crit</th><th>Pierce</th><th>Range</th></tr>
      ${e.attacks.map((a) => `<tr><td>${a.probability ?? ""}%</td><td>${fmt(a.damage)}${a.element_type ? ` ${elemSym(a.element_type)}+${fmt(a.element_damage)}` : ""}</td><td>${a.critical_chance ?? ""}</td><td>${a.armor_pierce ?? ""}</td><td>${a.range ?? ""}</td></tr>`).join("")}</table></div>
      ${chips(e.attacks.filter((a) => a.status).map((a) => statusLine(a.status)).join(""))}`) : ""}
    ${e.loot ? sec("Drops", chips(e.loot.map(itemChip).join(""))) : ""}`;
}

const BASE_ROWS = (b) => ["str", "dex", "end", "wis"].filter((k) => b[k] !== undefined).map((k) => `<tr><td>${sym(k)}${k.toUpperCase()}</td><td>${fmt(b[k])}${b[k + "_mod"] ? ` <span class="dim">(${b[k + "_mod"] > 0 ? "+" : ""}${b[k + "_mod"]})</span>` : ""}</td></tr>`).join("");
function classDetail(c) {
  const b = c.base;
  return `${head("", c.name, "")}
    ${c.desc ? sec("", `<div class="gtxt prose">${gameText(c.desc)}</div>`) : ""}
    ${sec("Base stats", `<table class="kv">${BASE_ROWS(b)}${b.hp_class !== undefined ? `<tr><td>Class HP modifier</td><td>${b.hp_class}</td></tr>` : ""}${b.stamina_class !== undefined ? `<tr><td>Class stamina modifier</td><td>${b.stamina_class}</td></tr>` : ""}</table>`)}
    ${c.cost ? sec("Skill cost", `<div class="gtxt">${gameText(c.cost.replace("{skill_cost}", "…"))}</div>`) : ""}
    ${sec("Starting gear", chips(c.gear.map(itemChip).join("")))}
    ${sec("Skills", chips(c.skills.map(skillChip).join("")))}`;
}
function raceDetail(r) {
  const b = r.base;
  return `${head(thumb(r.faces[0], "big"), r.name, "")}
    ${r.faces.length > 1 ? `<div class="faces">${r.faces.map((f) => img(f)).join("")}</div>` : ""}
    ${r.desc ? sec("", `<div class="gtxt prose">${gameText(r.desc)}</div>`) : ""}
    ${sec("Starting stats", `<table class="kv">${BASE_ROWS(b)}${b.stats_range ? `<tr><td>Stat total</td><td>${fmt(b.stats_range)}</td></tr>` : ""}${b.hp_bonus !== undefined ? `<tr><td>Race HP bonus</td><td>${b.hp_bonus}</td></tr>` : ""}</table>`)}
    ${sec("Starting gear", chips(r.gear.map(itemChip).join("")))}`;
}
function companionDetail(c) {
  return `${head(img(c.face), c.name, gameText(c.feat))}
    ${c.desc ? sec("", `<div class="gtxt prose">${gameText(c.desc)}</div>`) : ""}
    ${sec("Attack", `<table class="kv">${c.melee_damage ? `<tr><td>${sym("damage")}Damage</td><td>${fmt(c.melee_damage)}</td></tr>` : ""}${c.element_type ? `<tr><td>${elemSym(c.element_type)}${cap(c.element_type)} damage</td><td>${fmt(c.element_damage)}</td></tr>` : ""}${c.melee_critical_chance ? `<tr><td>Crit chance</td><td>${c.melee_critical_chance}%</td></tr>` : ""}</table>`)}
    ${c.status ? sec("On hit", chips(statusLine(c.status))) : ""}`;
}
function shopDetail(s) {
  return `<div class="scene">${img(s.art)}</div><h2 class="title">${esc(s.name)}</h2>${sec("Stock", chips(s.stock.map(itemChip).join("")))}`;
}
function statusDetail(s, id) {
  const rows = [s.power !== undefined && `<tr><td>Default power</td><td>${fmt(s.power)}${String(s.power_type || "").startsWith("percentage") ? "%" : ""}</td></tr>`, s.duration !== undefined && `<tr><td>${sym("duration")}Default duration</td><td>${fmt(s.duration)}</td></tr>`, s.combine && `<tr><td>Re-applied</td><td>${esc(s.combine)}</td></tr>`].filter(Boolean).join("");
  const from = [];
  for (const c of ITEM_CATS) for (const e of D[c]) if (e.status?.type === id) from.push(itemChip({ id: e.id }));
  for (const sk of D.skills) if (sk.statusType === id) from.push(skillChip(sk.id));
  for (const en of D.enemies) if (en.attacks.some((a) => a.status?.type === id)) from.push(enemyChip(en.id));
  const imm = D.enemies.filter((en) => en.imm.includes(id)).map((en) => enemyChip(en.id));
  return `${head(img(s.icon), s.name, "")}${sec("", `<table class="kv">${rows}</table>`)}${s.desc ? sec("", `<div class="gtxt prose">${gameText(s.desc)}</div>`) : ""}
    ${sec("Applied by", chips(from.join("")))}${sec("Enemies immune", chips(imm.join("")))}`;
}
function recipeCard(r) {
  const o = r.out.map(itemChip).join("");
  return `<div class="recipe" id="${r.id}">${chips(o)}<div class="arrow">←</div>${chips(r.ing.map(itemChip).join(""))}${r.book ? `<div class="refs"><span class="dim">Recipe:</span> ${itemChip({ id: r.book })}</div>` : ""}</div>`;
}
function alchemyPage() { return `<div class="recipes">${D.recipes.map(recipeCard).join("")}</div>`; }

/* ---------- mechanics: tables first, game prose behind its own toggle (A-appendix-explainers) */
function mechanicsPage() {
  const m = D.mechanics, code = m.code || {};
  const diff = Object.entries(m.difficulty);
  const dkeys = diff.length ? Object.keys(diff[0][1]) : [];
  const rest = m.resting;
  const n = Math.max(...Object.values(rest).map((a) => (a ? a.length : 0)), (m.poisonByEndurance || []).length);
  const se = Object.entries(D.status);
  return `<div class="detail" style="padding:0">
    ${code.formulas ? sec("Formulas", code.formulas.map((f) => `<div class="formula"><b>${esc(f.name)}</b><div><code>${esc(f.formula)}</code></div>${f.note ? `<div>${esc(f.note)}</div>` : ""}${f.src ? `<div class="src">${esc(f.src)}</div>` : ""}</div>`).join("")) : ""}
    ${sec("Status effects", chips(se.map(([k]) => statusChip(k)).join("")))}
    ${sec("Difficulty", `<div class="tbl-wrap"><table class="grid"><tr><th></th>${diff.map(([d]) => `<th>${cap(d)}</th>`).join("")}</tr>
      ${dkeys.map((k) => `<tr><td>${esc(cap(k.replace(/^enemy_/, "enemy ")))}</td>${diff.map(([, v]) => `<td>${v[k]}${k.endsWith("multiplier") ? "%" : ""}</td>`).join("")}</tr>`).join("")}</table></div>`)}
    ${m.xp ? sec("Experience per level", `<div class="tbl-wrap"><table class="grid"><tr><th>${sym("level")}Level</th>${m.xp.map((_, i) => `<th>${i + 1}</th>`).join("")}</tr><tr><td>Total XP</td>${m.xp.map((x) => `<td>${x}</td>`).join("")}</tr></table></div>`) : ""}
    ${sec("Resting recovery and poison duration by stat value", `<div class="tbl-wrap"><table class="grid"><tr><th>Value</th><th>HP</th><th>Stamina</th><th>Mana</th><th>${img(D.status.poison?.icon, "sym")}Poison rounds (${sym("end")}END)</th></tr>
      ${Array.from({ length: n }, (_, i) => `<tr><td>${i + 1}</td><td>${rest.hp?.[i] ?? ""}</td><td>${rest.stamina?.[i] ?? ""}</td><td>${rest.mana?.[i] ?? ""}</td><td>${m.poisonByEndurance?.[i] ?? ""}</td></tr>`).join("")}</table></div>
      <div class="sub">${esc(code.restingNote || "")}</div>`)}
    ${sec("", `<button class="toggle" data-toggle="tips">Game's own stat explanations</button><div id="tips" hidden>${Object.values(m.tooltips).map((t) => `<div class="formula gtxt prose">${gameText(t)}</div>`).join("")}</div>`)}
  </div>`;
}

/* ---------- overlay + routing (#tab, #kind/id) */
const DETAIL = { item: itemDetail, skill: skillDetail, enemy: enemyDetail, class: classDetail, race: raceDetail, companion: companionDetail, shop: shopDetail, status: statusDetail };
let current = null;
function drawDetail() {
  const [kind, id] = current;
  $("#detail").innerHTML = DETAIL[kind](IDX[kind][id], id);
}
function openDetail(kind, id, push = true) {
  if (kind === "recipe") { if (push) history.pushState(null, "", "#alchemy"); closeDetail(); switchTab("alchemy"); document.getElementById(id)?.scrollIntoView({ block: "center" }); return; }
  if (!DETAIL[kind] || !IDX[kind]?.[id]) return;
  if (push) history.pushState(null, "", `#${kind}/${id}`);
  if (kind === "skill" && (!current || current[1] !== id)) detailLevel = 1;
  current = [kind, id];
  drawDetail();
  $(".sheet").scrollTop = 0;
  $("#overlay").classList.remove("hidden");
  $("#overlay").setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}
function closeDetail() {
  $("#overlay").classList.add("hidden");
  $("#overlay").setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}
function route() {
  const [a, b] = decodeURIComponent(location.hash.slice(1)).split("/");
  if (b && IDX[a]?.[b]) {
    const tab = tabOf(a, IDX[a][b]);
    if (tab && TAB[tab] && tab !== state.tab && !current) switchTab(tab);
    openDetail(a, b, false);
  } else { closeDetail(); if (a && TAB[a] && a !== state.tab) switchTab(a); }
}

document.addEventListener("click", (ev) => {
  const el = ev.target.closest("[data-tab],[data-chip],[data-open],[data-lvl],[data-toggle],#back");
  if (!el) { if (ev.target.id === "overlay") history.back(); return; }
  if (el.dataset.tab) { history.replaceState(null, "", "#" + el.dataset.tab); current = null; switchTab(el.dataset.tab); }
  else if (el.dataset.chip !== undefined) { const t = state.tab; state.chip[t] = state.chip[t] === el.dataset.chip ? null : el.dataset.chip; renderControls(); renderList(); }
  else if (el.dataset.open) { const [k, id] = el.dataset.open.split("/"); openDetail(k, id); }
  else if (el.dataset.lvl) { detailLevel = +el.dataset.lvl; const sh = $(".sheet"), top = sh.scrollTop; drawDetail(); sh.scrollTop = top; }
  else if (el.dataset.toggle) { const box = document.getElementById(el.dataset.toggle); box.hidden = !box.hidden; }
  else if (el.id === "back") history.back();
});
document.addEventListener("input", (ev) => { if (ev.target.id === "q") { state.q[state.tab] = ev.target.value; renderList(); } });
document.addEventListener("change", (ev) => { if (ev.target.id === "sort") { state.sort[state.tab] = ev.target.value; renderList(); } });
document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && !$("#overlay").classList.contains("hidden")) history.back(); });
addEventListener("popstate", () => { current = current && location.hash.includes("/") ? current : null; route(); });

/* page art: stone panel tile + section separator come from the game's own UI sprites */
document.documentElement.style.setProperty("--panel-art", `url(${src(D.ui.panel)})`);
document.documentElement.style.setProperty("--sep-art", `url(${src(D.ui.separator)})`);
document.documentElement.style.setProperty("--tab-art", `url(${src(D.ui.tab)})`);

const [h0, h1] = decodeURIComponent(location.hash.slice(1)).split("/");
state.tab = TAB[h0] ? h0 : h1 && IDX[h0]?.[h1] ? tabOf(h0, IDX[h0][h1]) || "weapons" : "weapons";
renderTabs(); renderControls(); renderList();
route();
