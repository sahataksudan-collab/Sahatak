/**
 * Site-level AR/EN + RTL audit (web item #8) — plain Node, no framework.
 * (.cjs because the repo root package.json declares "type": "module".)
 * Run: node Sahatak-2/frontend/assets/js/experience/locales-rtl-audit.test.cjs
 *
 * Scope: the FOUR locale sections added by the web experience modules
 * (journey, care_summary, skeleton, calm_mode) ONLY. The pre-existing
 * en/ar key-count imbalance elsewhere in locales/*.json is explicitly
 * out of scope (separately flagged; do not "fix" it here).
 *
 * Checks:
 *  1. EXACT key-name parity en ↔ ar for each of the four sections
 *     (full dotted paths — equal counts alone can hide a
 *     missing-here/extra-there mismatch).
 *  2. Every STRINGS-fallback key in the five experience modules exists
 *     under the matching locale section in BOTH languages.
 *  3. The module CSS sections in clinical-glass.css (.cg-journey / .cg-care /
 *     .cg-calm / .cg-skeleton) use CSS logical properties — no physical
 *     left/right properties that would need a manual RTL override.
 */
const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) passed++;
  else { failed++; console.error(`FAIL: ${name}\n  expected: ${e}\n  actual:   ${a}`); }
}

const FRONTEND = path.resolve(__dirname, '..', '..', '..');
const en = JSON.parse(fs.readFileSync(path.join(FRONTEND, 'locales', 'en.json'), 'utf8'));
const ar = JSON.parse(fs.readFileSync(path.join(FRONTEND, 'locales', 'ar.json'), 'utf8'));
const css = fs.readFileSync(path.join(FRONTEND, 'assets', 'css', 'components', 'clinical-glass.css'), 'utf8');

const SECTIONS = ['journey', 'care_summary', 'skeleton', 'calm_mode'];

function flatten(obj, prefix) {
  return Object.keys(obj).sort().flatMap((k) => {
    const full = prefix ? prefix + '.' + k : k;
    return (obj[k] && typeof obj[k] === 'object')
      ? flatten(obj[k], full)
      : [full];
  });
}

// ── 1. exact key-name parity per section, en ↔ ar ──
for (const sec of SECTIONS) {
  check(`${sec}: section exists in en.json`, typeof en[sec] === 'object' && en[sec] !== null, true);
  check(`${sec}: section exists in ar.json`, typeof ar[sec] === 'object' && ar[sec] !== null, true);
  if (!en[sec] || !ar[sec]) continue;
  const enKeys = flatten(en[sec]);
  const arKeys = flatten(ar[sec]);
  check(`${sec}: every en key exists in ar (exact names)`,
    enKeys.filter((k) => arKeys.indexOf(k) === -1), []);
  check(`${sec}: every ar key exists in en (exact names)`,
    arKeys.filter((k) => enKeys.indexOf(k) === -1), []);
  check(`${sec}: en key count > 0 (sanity)`, enKeys.length > 0, true);
}

// ── 2. module STRINGS-fallback keys ⊆ locale sections (both languages) ──
const experienceDir = __dirname;
function loadStrings(file, pattern) {
  const src = fs.readFileSync(path.join(experienceDir, file), 'utf8');
  const match = src.match(pattern);
  if (!match) return null;
  return JSON.parse(match[1].replace(/,(\s*[}\]])/g, '$1')); // tolerate trailing commas
}
function keySet(section) {
  const out = [];
  (function walk(obj, prefix) {
    Object.keys(obj).forEach((k) => {
      const full = prefix ? prefix + '.' + k : k;
      if (obj[k] && typeof obj[k] === 'object') walk(obj[k], full);
      else out.push(full);
    });
  })(section);
  return out;
}

// journey-tracker: STAGE_LABELS (journey.stages.<ID>) + step_of / get_started
{
  const src = fs.readFileSync(path.join(experienceDir, 'journey-tracker.js'), 'utf8');
  const stageIds = [...src.matchAll(/^\s{4}([A-Z_]+):/gm)].map((m) => m[1]);
  const needed = [...stageIds.map((id) => 'stages.' + id), 'step_of', 'get_started'];
  for (const lang of ['en', 'ar']) {
    const section = (lang === 'en' ? en : ar).journey || {};
    const keys = keySet(section);
    check(`journey-tracker fallback keys exist in journey.${lang}`,
      needed.filter((k) => keys.indexOf(k) === -1), []);
  }
}
function stringKeysFor(file, requireExpr) {
  delete require.cache[require.resolve(path.join(experienceDir, file))];
  const mod = require(path.join(experienceDir, file));
  return keySet(mod[requireExpr]);
}
// calm-mode / skeleton: exported STRINGS objects (vm-load, as the other suites
// do — the UMD wrappers need a global `self`/`this`, which plain require lacks)
const vm = require('vm');
function loadModule(file) {
  vm.runInThisContext(fs.readFileSync(path.join(experienceDir, file), 'utf8'), { filename: file });
  return globalThis;
}
for (const [file, exportName, section] of [
  ['skeleton.js', 'STRINGS', 'skeleton'],
]) {
  const mod = loadModule(file)['Sahatak' + (file === 'skeleton.js' ? 'Skeleton' : '')];
  const keys = Object.keys(mod[exportName]).sort();
  for (const lang of ['en', 'ar']) {
    const localeKeys = keySet((lang === 'en' ? en : ar)[section]).sort();
    check(`${file}: every ${exportName} fallback key exists in ${section}.${lang}`,
      keys.filter((k) => localeKeys.indexOf(k) === -1), []);
  }
}
{
  const g = loadModule('calm-mode.js');
  const mod = g.SahatakCalmMode;
  const keys = Object.keys(mod.STRINGS).sort();
  for (const lang of ['en', 'ar']) {
    const localeKeys = keySet((lang === 'en' ? en : ar).calm_mode).sort();
    check(`calm-mode.js: every STRINGS fallback key exists in calm_mode.${lang}`,
      keys.filter((k) => localeKeys.indexOf(k) === -1), []);
  }
}

// ── 3. module CSS uses logical properties (no physical left/right) ──
// Isolate the shared-module region: from the Journey Tracker section header
// to end of file (sections 9, 9b, 9c, 10, 11 — journey, follow-up actions,
// care summary, skeleton, calm mode).
const regionStart = css.indexOf('9. Journey Tracker (.cg-journey)');
const moduleCss = regionStart !== -1 ? css.slice(regionStart) : css;
const physical = [];
const physicalRe = /(?:^|;|\{)\s*(margin-left|margin-right|padding-left|padding-right|left|right|text-align|float)\s*:\s*([^;}]*)/g;
let m;
while ((m = physicalRe.exec(moduleCss)) !== null) {
  const prop = m[1], val = m[2].trim();
  if (prop === 'text-align' && /^(start|center|justify|inherit|initial|unset)$/.test(val)) continue;
  physical.push(`${prop}: ${val}`);
}
check('module CSS: no physical left/right properties in shared-module region', physical, []);

console.log(`\nlocales-rtl-audit: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
