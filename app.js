"use strict";
/* Underkeep Codex: browse the datamined items, skills, enemies and mechanics. Data: data.js (tools/build_data.py). */
const FEATURES = { mechanics: true };
const D = window.UK_DATA;
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const cap = (s) => String(s || "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
const fmt = (v) => (Array.isArray(v) ? (v[0] === v[1] ? String(v[0]) : `${v[0]}–${v[1]}`) : String(v ?? ""));
const hi = (v) => (Array.isArray(v) ? v[v.length - 1] : v);
const CLASS = Object.fromEntries(D.classes.map((c) => [c.id, c]));
const statLabel = (k) => D.names["stat_" + k] || cap(k);
const iconImg = (n, cls = "") => (n ? `<img class="px ${cls}" src="assets/icons/${esc(n)}.png" alt="" loading="lazy">` : "");
const stat = (e, k) => { const s = (e.stats || []).find((x) => x[0] === k); return s ? s[1] : undefined; };

/* ---- game text: «c:x» colour tokens, \t = left/right split, \n = line */
function gameText(s) {
  if (!s) return "";
  return s.split("\n").map((line) => {
    let open = 0;
    const html = esc(line).replace(/«c:([a-z_0-9]+)»/g, (_, c) => { const r = (open ? "</span>" : "") + `<span class="c-${c}">`; open = 1; return r; });
    const parts = html.split("\t").filter((p) => p.replace(/<[^>]*>/g, "").trim() !== "" || p.includes("<span"));
    const close = open ? "</span>" : "";
    if (line.includes("\t") && parts.length >= 2) return `<div class="ln"><span>${parts.slice(0, -1).join(" ")}${close}</span><span>${parts[parts.length - 1]}${close}</span></div>`;
    return `<div>${html}${close}</div>`;
  }).join("");
}

/* ---- magnitude bars (A-magnitude-bars): share of the largest value of that field among the shown entries */
function fieldMax(entries, get) { let m = 0; for (const e of entries) { const v = hi(get(e)); if (typeof v === "number" && v > m) m = v; } return m; }
function bars(e, fields, maxes) {
  return `<div class="bars">${fields.map((f, i) => {
    const v = f.get(e);
    if (v === undefined || v === null || v === 0) return "";
    const pct = maxes[i] ? Math.max(0, Math.min(100, (hi(v) / maxes[i]) * 100)) : 0;
    return `<span class="k">${esc(f.label)}</span><span class="mb"><i style="width:${pct.toFixed(1)}%"></i></span><span class="v">${esc(fmt(v))}</span>`;
  }).join("")}</div>`;
}

function statRows(e) {
  return (e.stats || []).map(([k, v]) => {
    const lab = statLabel(k);
    if (k.startsWith("immunity_")) return `<tr><td colspan="2">${esc(lab)}</td></tr>`;
    if (lab.includes("#")) return `<tr><td colspan="2">${esc(lab.replace("#", fmt(v)))}</td></tr>`;
    return `<tr><td>${esc(lab)}</td><td>${esc(fmt(v))}</td></tr>`;
  }).join("");
}
const REQ = { req_str: "req_str", req_dex: "req_dex", req_wis: "req_wis", req_end: "req_end" };
function reqText(e) { return e.req ? Object.entries(e.req).map(([k, v]) => `${cap(statLabel(REQ[k]).replace(/^Required /, ""))} ${v}`).join(" · ") : ""; }
function statusText(s) {
  if (!s) return "";
  const bits = [cap(s.type)];
  if (s.chance !== undefined) bits.push(`${fmt(s.chance)}% chance`);
  if (s.power !== undefined) bits.push(`power ${fmt(s.power)}`);
  if (s.duration !== undefined) bits.push(`${fmt(s.duration)} rounds`);
  return bits.join(", ");
}

/* ---- tab definitions */
const byName = (a, b) => a.name.localeCompare(b.name);
const TABS = [
  {
    id: "weapons", label: "Weapons", items: D.weapons, chip: (e) => e.typeName,
    fields: [
      { label: "Damage", get: (e) => e.damage },
      { label: statLabel("extra_damage"), get: (e) => stat(e, "extra_damage") },
      { label: statLabel("armor_pierce"), get: (e) => stat(e, "armor_pierce") },
    ],
    sub: (e) => [e.typeName, e.two_handed ? "Two-handed" : "", reqText(e)].filter(Boolean).join(" · "),
  },
  {
    id: "armor", label: "Armor", items: D.armor, chip: (e) => cap(e.type),
    fields: [
      { label: statLabel("armor"), get: (e) => stat(e, "armor") },
      { label: statLabel("evasion"), get: (e) => stat(e, "evasion") },
    ],
    sub: (e) => [cap(e.type), reqText(e)].filter(Boolean).join(" · "),
  },
  {
    id: "accessories", label: "Rings & Amulets", items: D.accessories, chip: (e) => cap(e.type), fields: [],
    sub: (e) => (e.stats || []).map(([k, v]) => (statLabel(k).includes("#") ? statLabel(k).replace("#", fmt(v)) : `${statLabel(k)} ${fmt(v)}`)).join(" · "),
  },
  {
    id: "consumables", label: "Consumables", items: D.consumables, chip: (e) => cap(e.type), fields: [],
    sub: (e) => [cap(e.type), e.heal_min ? `Heal ${fmt([e.heal_min, e.heal_max])}` : "", e.mana_min ? `Mana ${fmt([e.mana_min, e.mana_max])}` : "", e.stamina_min ? `Stamina ${fmt([e.stamina_min, e.stamina_max])}` : ""].filter(Boolean).join(" · "),
  },
  {
    id: "skills", label: "Skills", items: D.skills, chip: (e) => CLASS[e.cls]?.name || e.cls, chipOrder: D.classes.map((c) => c.name),
    sort: (a, b) => (a.lvl - b.lvl) || byName(a, b),
    fields: [],
    sub: (e) => [CLASS[e.cls]?.name, `Class level ${e.lvl}`, e.is_passive ? "Passive" : "", hi(e.v.cost ? valAt(e.v.cost, 1) : 0) ? `Cost ${fmt(valAt(e.v.cost, 1))}` : "", e.v.cooldown ? `Cooldown ${fmt(valAt(e.v.cooldown, 1))}` : ""].filter(Boolean).join(" · "),
  },
  {
    id: "enemies", label: "Enemies", items: D.enemies, chip: (e) => (e.tags.length ? cap(e.tags[0]) : "Other"),
    fields: [
      { label: "Health", get: (e) => e.hp },
      { label: "Armor", get: (e) => e.armor },
      { label: "Evasion", get: (e) => e.evasion },
      { label: "Experience", get: (e) => e.exp },
    ],
    sub: () => "",
  },
];
if (FEATURES.mechanics) TABS.push({ id: "mechanics", label: "Mechanics", page: true });
const TAB = Object.fromEntries(TABS.map((t) => [t.id, t]));
const SORTS = (t) => [["name", "Name"], ...(t.id === "skills" ? [["lvl", "Class level"]] : []), ...t.fields.map((f, i) => ["f" + i, f.label]), ...(t.items?.some((e) => e.price) ? [["price", "Price"]] : [])];

const state = { tab: "weapons", q: {}, chip: {}, sort: {}, scroll: {} };

function renderTabs() {
  $("#tabs").innerHTML = TABS.map((t) => `<button class="tab${t.id === state.tab ? " on" : ""}" data-tab="${t.id}" role="tab">${esc(t.label)}</button>`).join("");
}

function shown(t) {
  const q = (state.q[t.id] || "").toLowerCase();
  const chip = state.chip[t.id];
  let list = t.items.filter((e) => (!chip || t.chip(e) === chip) && (!q || e.name.toLowerCase().includes(q) || (e.desc || "").toLowerCase().includes(q) || (e.summary || "").toLowerCase().includes(q)));
  const s = state.sort[t.id] || (t.sort ? "lvl" : "name");
  if (s === "name") list.sort(byName);
  else if (s === "lvl") list.sort(t.sort);
  else if (s === "price") list.sort((a, b) => (b.price || 0) - (a.price || 0) || byName(a, b));
  else { const f = t.fields[+s.slice(1)]; list.sort((a, b) => (hi(f.get(b)) || 0) - (hi(f.get(a)) || 0) || byName(a, b)); }
  return list;
}

function renderControls() {
  const t = TAB[state.tab];
  if (t.page) { $("#controls").innerHTML = ""; return; }
  let chips = [...new Set(t.items.map(t.chip).filter(Boolean))];
  chips.sort(t.chipOrder ? (a, b) => t.chipOrder.indexOf(a) - t.chipOrder.indexOf(b) : (a, b) => a.localeCompare(b));
  const cur = state.chip[t.id];
  const sort = state.sort[t.id] || (t.sort ? "lvl" : "name");
  $("#controls").innerHTML = `<div class="row2"><input type="search" id="q" placeholder="Search" value="${esc(state.q[t.id] || "")}">
    <select id="sort">${SORTS(t).map(([v, l]) => `<option value="${v}"${v === sort ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></div>
    <div class="chips">${chips.map((c) => `<button class="chip${c === cur ? " on" : ""}" data-chip="${esc(c)}">${esc(c)}</button>`).join("")}</div>`;
}

function renderList() {
  const t = TAB[state.tab];
  if (t.page) { $("#list").innerHTML = mechanicsPage(); return; }
  const list = shown(t);
  const maxes = t.fields.map((f) => fieldMax(list, f.get));
  $("#list").innerHTML = list.length ? list.map((e) => `<button class="card" data-open="${t.id}/${esc(e.id)}">
      <span class="ico">${iconImg(e.icon)}</span>
      <span><div class="nm">${esc(e.name)}</div><div class="sub">${esc(t.sub(e))}</div>${t.fields.length ? bars(e, t.fields, maxes) : ""}</span>
    </button>`).join("") : `<div class="empty">No matches</div>`;
}

function switchTab(id) {
  state.scroll[state.tab] = scrollY;
  state.tab = id;
  renderTabs(); renderControls(); renderList();
  scrollTo(0, state.scroll[id] || 0);
}

/* ---- skills: value at level = base + step * (level - 1); ranges scale both ends */
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
function fillSkill(s, e, L) { return s ? s.replace(/\{skill_([a-z_0-9]+)\}/g, (m, k) => skillVal(e, k, L) ?? m) : s; }
const SKILL_ROW = { cost: "Cost", cooldown: "Cooldown", damage: "Damage", bonus: "Bonus", bonus2: "Bonus 2", bonus3: "Bonus 3", passive_bonus: "Passive bonus", heal_amount: "Heal", ignore_armor: "Armor ignored", chance: "Chance", duration: "Duration", status_chance: "Status chance", status_power: "Status power", status_duration: "Status duration" };

function skillDetail(e, L) {
  const lv = Array.from({ length: e.max }, (_, i) => i + 1);
  const rows = Object.keys(e.v).filter((k) => SKILL_ROW[k]);
  return `<div class="dhead"><span class="ico big">${iconImg(e.icon)}</span><div><h2>${esc(e.name)}</h2>
      <div class="sub">${esc([CLASS[e.cls]?.name, `Class level ${e.lvl}`, e.is_passive ? "Passive" : "", e.is_spell ? "Spell" : "", e.damage_element ? cap(e.damage_element) : "", e.statusType ? cap(e.statusType) : ""].filter(Boolean).join(" · "))}</div></div></div>
    <div class="lvl">${lv.map((l) => `<button class="chip${l === L ? " on" : ""}" data-lvl="${l}">Level ${l}</button>`).join("")}</div>
    ${e.summary ? `<div class="sec gtxt">${gameText(fillSkill(e.summary, e, L))}</div>` : ""}
    ${e.lines.length ? `<div class="sec gtxt">${e.lines.map((x) => gameText(fillSkill(x, e, L))).join("")}</div>` : ""}
    ${rows.length ? `<div class="sec"><h3>Per level</h3><div class="tbl-wrap"><table class="grid"><tr><th></th>${lv.map((l) => `<th>${l}</th>`).join("")}</tr>
      ${rows.map((k) => `<tr><td>${SKILL_ROW[k]}</td>${lv.map((l) => `<td${l === L ? ' class="cur"' : ""}>${esc(skillVal(e, k, l))}</td>`).join("")}</tr>`).join("")}</table></div></div>` : ""}
    ${e.desc ? `<div class="sec gtxt prose">${gameText(e.desc)}</div>` : ""}`;
}

function itemDetail(t, e) {
  const head = `<div class="dhead"><span class="ico big">${iconImg(e.icon)}</span><div><h2>${esc(e.name)}</h2><div class="sub">${esc(t.sub(e))}</div></div></div>`;
  const rows = [];
  if (e.damage) rows.push(`<tr><td>Damage</td><td>${fmt(e.damage)}</td></tr>`);
  if (e.element) rows.push(`<tr><td class="c-${esc(e.element[0])}">${esc(cap(e.element[0]))} damage</td><td>${fmt(e.element[1])}</td></tr>`);
  if (e.heal_min) rows.push(`<tr><td>Health restored</td><td>${fmt([e.heal_min, e.heal_max])}</td></tr>`);
  if (e.mana_min) rows.push(`<tr><td>Mana restored</td><td>${fmt([e.mana_min, e.mana_max])}</td></tr>`);
  if (e.stamina_min) rows.push(`<tr><td>Stamina restored</td><td>${fmt([e.stamina_min, e.stamina_max])}</td></tr>`);
  if (e.food_value) rows.push(`<tr><td>Food supply</td><td>${e.food_value}</td></tr>`);
  const tags = [e.two_handed && "Two-handed", e.long_reach && "Long reach", e.uses_dexterity && "Uses Dexterity", e.reqClass && `Class: ${CLASS[e.reqClass]?.name || e.reqClass}`, e.quest && "Quest item"].filter(Boolean);
  return `${head}
    ${tags.length ? `<div>${tags.map((x) => `<span class="tag">${esc(x)}</span>`).join("")}</div>` : ""}
    <div class="sec"><table class="kv">${rows.join("")}${statRows(e)}
      ${e.status ? `<tr><td>On hit</td><td>${esc(statusText(e.status))}</td></tr>` : ""}
      ${e.req ? Object.entries(e.req).map(([k, v]) => `<tr><td>${esc(statLabel(k))}</td><td>${v}</td></tr>`).join("") : ""}
      ${e.price ? `<tr><td>Sell price</td><td>${e.price}</td></tr>` : ""}${e.buy_price ? `<tr><td>Buy price</td><td>${e.buy_price}</td></tr>` : ""}</table></div>
    ${e.feat ? `<div class="sec gtxt">${gameText(e.feat)}</div>` : ""}
    ${e.feature ? `<div class="sec gtxt">${gameText(e.feature)}</div>` : ""}
    ${e.desc ? `<div class="sec gtxt prose flavor">${gameText(e.desc)}</div>` : ""}`;
}

function enemyDetail(e) {
  const res = Object.entries(e.res);
  return `<div class="dhead"><span class="ico big">${iconImg(e.icon)}</span><div><h2>${esc(e.name)}</h2><div class="sub">${esc(e.tags.map(cap).join(" · "))}</div></div></div>
    <div class="sec"><table class="kv"><tr><td>Health</td><td>${e.hp}</td></tr><tr><td>Armor</td><td>${e.armor}</td></tr><tr><td>Evasion</td><td>${e.evasion}</td></tr>
      ${e.melee_evasion ? `<tr><td>Melee evasion</td><td>${e.melee_evasion}</td></tr>` : ""}${e.ranged_evasion ? `<tr><td>Ranged evasion</td><td>${e.ranged_evasion}</td></tr>` : ""}
      ${e.melee_physical_resist ? `<tr><td>Melee physical resist</td><td>${e.melee_physical_resist}</td></tr>` : ""}${e.ranged_physical_resist ? `<tr><td>Ranged physical resist</td><td>${e.ranged_physical_resist}</td></tr>` : ""}
      ${e.hp_shield ? `<tr><td>Shield</td><td>${e.hp_shield}</td></tr>` : ""}${e.exp ? `<tr><td>Experience</td><td>${e.exp}</td></tr>` : ""}</table></div>
    ${res.length ? `<div class="sec"><h3>Resistances</h3><table class="kv">${res.map(([k, v]) => `<tr><td class="c-${k}">${cap(k)}</td><td>${v}</td></tr>`).join("")}</table></div>` : ""}
    ${e.imm.length ? `<div class="sec"><h3>Immune to</h3>${e.imm.map((x) => `<span class="tag">${esc(cap(x))}</span>`).join("")}</div>` : ""}
    ${e.attacks.length ? `<div class="sec"><h3>Attacks</h3><div class="tbl-wrap"><table class="grid"><tr><th>Use</th><th>Damage</th><th>Crit</th><th>Pierce</th><th>Range</th><th>Effect</th></tr>
      ${e.attacks.map((a) => `<tr><td>${a.probability ?? ""}%</td><td>${fmt(a.damage)}${a.element_type ? ` <span class="c-${esc(a.element_type)}">+${fmt(a.element_damage)}</span>` : ""}</td><td>${a.critical_chance ?? ""}</td><td>${a.armor_pierce ?? ""}</td><td>${a.range ?? ""}</td><td style="text-align:left">${esc(statusText(a.status))}</td></tr>`).join("")}</table></div></div>` : ""}`;
}

/* ---- mechanics page: tables first, game prose behind its own toggle (A-appendix-explainers) */
function mechanicsPage() {
  const m = D.mechanics;
  const diff = Object.entries(m.difficulty);
  const dkeys = diff.length ? Object.keys(diff[0][1]) : [];
  const se = Object.entries(m.statusEffects);
  const code = m.code || {};
  const rest = m.resting;
  const n = Math.max(...Object.values(rest).map((a) => (a ? a.length : 0)), (m.poisonByEndurance || []).length);
  return `<div class="detail" style="padding:0">
    ${code.formulas ? `<div class="sec"><h3>Formulas</h3>${code.formulas.map((f) => `<div class="formula"><b>${esc(f.name)}</b><div><code>${esc(f.formula)}</code></div>${f.note ? `<div>${esc(f.note)}</div>` : ""}${f.src ? `<div class="src">${esc(f.src)}</div>` : ""}</div>`).join("")}</div>` : ""}
    <div class="sec"><h3>Difficulty</h3><div class="tbl-wrap"><table class="grid"><tr><th></th>${diff.map(([d]) => `<th>${cap(d)}</th>`).join("")}</tr>
      ${dkeys.map((k) => `<tr><td>${esc(cap(k.replace(/^enemy_/, "enemy ")))}</td>${diff.map(([, v]) => `<td>${v[k]}${k.endsWith("multiplier") ? "%" : ""}</td>`).join("")}</tr>`).join("")}</table></div></div>
    <div class="sec"><h3>Status effects (defaults)</h3><div class="tbl-wrap"><table class="grid"><tr><th>Effect</th><th>Power</th><th>Duration</th><th>Re-apply</th></tr>
      ${se.map(([k, v]) => `<tr><td>${esc(cap(k))}</td><td>${fmt(v.power)}${String(v.power_type || "").startsWith("percentage") ? "%" : ""}</td><td>${fmt(v.duration)}</td><td>${esc(v.combine || "")}</td></tr>`).join("")}</table></div></div>
    <div class="sec"><h3>Resting recovery and poison duration by stat value</h3><div class="tbl-wrap"><table class="grid"><tr><th>Value</th><th>HP</th><th>Stamina</th><th>Mana</th><th>Poison rounds (Endurance)</th></tr>
      ${Array.from({ length: n }, (_, i) => `<tr><td>${i + 1}</td><td>${rest.hp?.[i] ?? ""}</td><td>${rest.stamina?.[i] ?? ""}</td><td>${rest.mana?.[i] ?? ""}</td><td>${m.poisonByEndurance?.[i] ?? ""}</td></tr>`).join("")}</table></div>
      <div class="sub">${esc(code.restingNote || "Row index = the stat value the table is looked up by (1-based); see Formulas once verified.")}</div></div>
    <div class="sec"><button class="toggle" data-toggle="tips">Game's own stat explanations</button>
      <div id="tips" hidden>${Object.values(m.tooltips).map((t) => `<div class="formula gtxt prose">${gameText(t)}</div>`).join("")}</div></div>
  </div>`;
}

/* ---- overlay + routing (#tab or #tab/id) */
let detailLevel = 1;
function openDetail(tabId, id, push = true) {
  const t = TAB[tabId];
  const e = t?.items?.find((x) => x.id === id);
  if (!e) return;
  if (push) history.pushState(null, "", `#${tabId}/${id}`);
  if (tabId === "skills") detailLevel = 1;
  drawDetail(t, e);
  $("#overlay").classList.remove("hidden");
  $("#overlay").setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}
function drawDetail(t, e) {
  const html = t.id === "skills" ? skillDetail(e, detailLevel) : t.id === "enemies" ? enemyDetail(e) : itemDetail(t, e);
  $("#detail").innerHTML = html;
  $("#detail").dataset.key = `${t.id}/${e.id}`;
}
function closeDetail() {
  $("#overlay").classList.add("hidden");
  $("#overlay").setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}
function route() {
  const [tab, id] = decodeURIComponent(location.hash.slice(1)).split("/");
  if (tab && TAB[tab] && tab !== state.tab) switchTab(tab);
  if (id) openDetail(tab, id, false); else closeDetail();
}

document.addEventListener("click", (ev) => {
  const el = ev.target.closest("[data-tab],[data-chip],[data-open],[data-lvl],[data-toggle],#back");
  if (!el) { if (ev.target.id === "overlay") history.back(); return; }
  if (el.dataset.tab) { history.replaceState(null, "", "#" + el.dataset.tab); switchTab(el.dataset.tab); }
  else if (el.dataset.chip !== undefined) { const t = state.tab; state.chip[t] = state.chip[t] === el.dataset.chip ? null : el.dataset.chip; renderControls(); renderList(); }
  else if (el.dataset.open) { const [t, id] = el.dataset.open.split("/"); openDetail(t, id); }
  else if (el.dataset.lvl) { detailLevel = +el.dataset.lvl; const [t, id] = $("#detail").dataset.key.split("/"); const sheet = $(".sheet"); const top = sheet.scrollTop; drawDetail(TAB[t], TAB[t].items.find((x) => x.id === id)); sheet.scrollTop = top; }
  else if (el.dataset.toggle) { const box = document.getElementById(el.dataset.toggle); box.hidden = !box.hidden; }
  else if (el.id === "back") history.back();
});
document.addEventListener("input", (ev) => { if (ev.target.id === "q") { state.q[state.tab] = ev.target.value; renderList(); } });
document.addEventListener("change", (ev) => { if (ev.target.id === "sort") { state.sort[state.tab] = ev.target.value; renderList(); } });
document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && !$("#overlay").classList.contains("hidden")) history.back(); });
addEventListener("popstate", route);

const start = decodeURIComponent(location.hash.slice(1)).split("/")[0];
state.tab = TAB[start] ? start : "weapons";
renderTabs(); renderControls(); renderList();
route();
