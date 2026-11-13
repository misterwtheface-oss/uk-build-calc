/*
  render_check.js — render every list tab and every detail view headlessly (Node vm, stub DOM) against the real data.js.
  Fails (exit 1) on a thrown error, a literal "undefined" in the HTML, or an <img> pointing at a file not in assets/icons.
  Usage: node tools/render_check.js     (run after tools/build_data.py, before committing)
*/
const fs = require("fs"), vm = require("vm"), path = require("path");
const APP = path.join(__dirname, "..");
const el = () => ({ innerHTML: "", dataset: {}, scrollTop: 0, hidden: false, classList: { add() {}, remove() {}, contains() { return true; } },
  setAttribute() {}, style: { setProperty() {} }, closest() { return null; }, scrollIntoView() {} });
const els = {};
const ctx = { window: {}, console, location: { hash: "" }, history: { pushState() {}, replaceState() {}, back() {} }, scrollY: 0, scrollTo() {},
  addEventListener() {}, encodeURIComponent, decodeURIComponent,
  document: { documentElement: { style: { setProperty() {} } }, querySelector: (s) => els[s] || (els[s] = el()), addEventListener() {}, getElementById: () => el(), body: { style: {} } } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(APP, "data.js"), "utf8"), ctx);
ctx.UK_DATA = ctx.window.UK_DATA;
const app = fs.readFileSync(path.join(APP, "app.js"), "utf8").replace('"use strict";', "").replace("const D = window.UK_DATA", "const D = UK_DATA");
vm.runInContext(app + "\n;globalThis.__app = { IDX, DETAIL, TABS, state, renderControls, renderList, els: null };", ctx);
const { IDX, DETAIL, TABS, state, renderControls, renderList } = ctx.__app;
const IMG = /assets\/icons\/([^"?)]+)\.png/g;
const problems = [], imgs = new Set();
function scan(where, html) {
  for (const m of html.matchAll(IMG)) imgs.add(decodeURIComponent(m[1]));
  const i = html.indexOf("undefined");
  if (i >= 0) problems.push(`${where}: "undefined" near …${html.slice(Math.max(0, i - 80), i + 10)}`);
}
let n = 0;
for (const [kind, map] of Object.entries(IDX)) {
  if (!DETAIL[kind]) continue;
  for (const id in map) {
    n++;
    try { scan(`${kind}/${id}`, DETAIL[kind](map[id], id)); } catch (e) { problems.push(`${kind}/${id}: ${e.message}`); }
  }
}
for (const t of TABS) {
  state.tab = t.id;
  try { renderControls(); renderList(); scan(`tab ${t.id}`, els["#list"].innerHTML + els["#controls"].innerHTML); }
  catch (e) { problems.push(`tab ${t.id}: ${e.stack}`); }
}
for (const i of imgs) if (!fs.existsSync(path.join(APP, "assets", "icons", i + ".png"))) problems.push(`missing image file: ${i}`);
const shipped = fs.readdirSync(path.join(APP, "assets", "icons")).map((f) => f.slice(0, -4)).filter((f) => !imgs.has(f));
console.log(`render_check: ${TABS.length} tabs, ${n} detail views, ${imgs.size} distinct images, ${problems.length} problems`);
for (const p of problems.slice(0, 30)) console.log("  " + p);
if (shipped.length) console.log(`  shipped but never shown (${shipped.length}): ${shipped.slice(0, 60).join(" ")}`);
process.exit(problems.length ? 1 : 0);
