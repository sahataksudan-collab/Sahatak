/**
 * Calm Mode smoke test — plain Node, no test framework introduced.
 * Run: node Sahatak-2/frontend/assets/js/experience/calm-mode.test.cjs
 * (.cjs because the repo root package.json declares "type": "module".)
 * Mirrors the skeleton.test.cjs pattern: loads calm-mode.js the same way the
 * browser does (window attach) and drives the pure logic — normalizeCalmUi,
 * extractFromPreferences (lockstep with mobile's extractCalmUiPrefs shape),
 * mergeIntoNotificationPreferences (zero schema change), mergePrefs,
 * subTogglesEnabled (master gates sub-toggles), classesFor (which body classes
 * activate under which sub-toggle combination), suppressedFor (which decorative
 * element groups get suppressed), reducedMotion (stubbed matchMedia + skeleton
 * reuse), and the EN/AR string contract (module STRINGS ↔ locales calm_mode.*).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const code = fs.readFileSync(path.join(__dirname, 'calm-mode.js'), 'utf8');
vm.runInThisContext(code, { filename: 'calm-mode.js' });
const C = globalThis.SahatakCalmMode;

let passed = 0;
let failed = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { passed++; }
  else { failed++; console.error(`FAIL: ${name}\n  expected: ${e}\n  actual:   ${a}`); }
}

// ── the toggle set is the mobile set, verbatim (no new sub-toggles) ──
check('toggle set matches mobile calmUi',
  Object.keys(C.DEFAULT_CALM_UI_PREFS).sort(),
  ['calm_mode', 'reduce_animations', 'reduce_clutter', 'reduce_notifications', 'simplified_layout'].sort());
check('SUB_TOGGLE_KEYS is the four mobile sub-toggles in order',
  C.SUB_TOGGLE_KEYS,
  ['reduce_animations', 'reduce_clutter', 'reduce_notifications', 'simplified_layout']);

// ── normalizeCalmUi: Boolean coercion, unknown input → all-false ──
check('normalizeCalmUi: undefined input', C.normalizeCalmUi(),
  { calm_mode: false, reduce_animations: false, reduce_clutter: false, reduce_notifications: false, simplified_layout: false });
check('normalizeCalmUi: truthy strings coerced', C.normalizeCalmUi({ calm_mode: '1', reduce_clutter: 'yes' }),
  { calm_mode: true, reduce_animations: false, reduce_clutter: true, reduce_notifications: false, simplified_layout: false });

// ── extractFromPreferences: reads notification_preferences.ui only ──
const response = { notification_preferences: { email_notifications: true, ui: { calm_mode: true, reduce_animations: true } } };
const extracted = C.extractFromPreferences(response);
check('extractFromPreferences: ui keys extracted', extracted,
  { calm_mode: true, reduce_animations: true, reduce_clutter: false, reduce_notifications: false, simplified_layout: false });
check('extractFromPreferences: other notification keys untouched by extraction', response.notification_preferences.email_notifications, true);
check('extractFromPreferences: safe on null/empty', [C.extractFromPreferences(null), C.extractFromPreferences({})],
  [C.normalizeCalmUi({}), C.normalizeCalmUi({})]);

// ── mergeIntoNotificationPreferences: zero schema change, preserves siblings ──
const merged = C.mergeIntoNotificationPreferences(
  { email_notifications: true, appointment_reminders: false },
  { calm_mode: true, simplified_layout: true }
);
check('mergeIntoNotificationPreferences: siblings preserved + ui merged', merged,
  { email_notifications: true, appointment_reminders: false, ui: { calm_mode: true, reduce_animations: false, reduce_clutter: false, reduce_notifications: false, simplified_layout: true } });
check('mergeIntoNotificationPreferences: null current', C.mergeIntoNotificationPreferences(null, {}).ui,
  C.normalizeCalmUi({}));
check('mergeIntoNotificationPreferences: ui is exactly 5 boolean keys',
  Object.keys(merged.ui).sort(),
  ['calm_mode', 'reduce_animations', 'reduce_clutter', 'reduce_notifications', 'simplified_layout'].sort());

// ── mergePrefs: partial update merge (mobile setCalmUi flow) ──
check('mergePrefs: partial update only changes given keys',
  C.mergePrefs(C.DEFAULT_CALM_UI_PREFS, { calm_mode: true, reduce_clutter: true }),
  { calm_mode: true, reduce_animations: false, reduce_clutter: true, reduce_notifications: false, simplified_layout: false });

// ── subTogglesEnabled: master gates the sub-toggles (mobile UX) ──
check('subTogglesEnabled: off when master off', C.subTogglesEnabled({ calm_mode: false, reduce_animations: true }), false);
check('subTogglesEnabled: on when master on', C.subTogglesEnabled({ calm_mode: true }), true);
check('subTogglesEnabled: on for null prefs', C.subTogglesEnabled(null), false);

// ── classesFor: which body classes activate under which combination ──
check('classesFor: all off → no classes', C.classesFor(C.DEFAULT_CALM_UI_PREFS), []);
check('classesFor: everything on → all five classes in key order',
  C.classesFor(C.normalizeCalmUi({ calm_mode: true, reduce_animations: true, reduce_clutter: true, reduce_notifications: true, simplified_layout: true })),
  ['cg-calm', 'cg-calm-anim', 'cg-calm-clutter', 'cg-calm-notif', 'cg-calm-simplified']);
check('classesFor: master only', C.classesFor({ calm_mode: true }), ['cg-calm']);
check('classesFor: sub-toggle without master still applies its class (mobile semantics)',
  C.classesFor({ reduce_notifications: true }), ['cg-calm-notif']);
check('classesFor: combo master + simplified', C.classesFor({ calm_mode: true, simplified_layout: true }),
  ['cg-calm', 'cg-calm-simplified']);

// ── suppressedFor: which decorative groups get suppressed per combination ──
check('suppressedFor: nothing suppressed when all off', C.suppressedFor(C.DEFAULT_CALM_UI_PREFS), []);
check('suppressedFor: reduce_animations → shimmer + hover transforms + journey transition',
  C.suppressedFor({ reduce_animations: true }),
  [{ key: 'reduce_animations', suppressed: C.SUPPRESSED_FOR_KEY.reduce_animations }]);
check('suppressedFor: reduce_notifications → unread badge dots only',
  C.suppressedFor({ reduce_notifications: true }),
  [{ key: 'reduce_notifications', suppressed: C.SUPPRESSED_FOR_KEY.reduce_notifications }]);
check('suppressedFor: simplified_layout includes mesh blobs + decorative-marked elements + skeleton reduced variant',
  C.suppressedFor({ simplified_layout: true })[0].suppressed.length, 3);
const combo = C.suppressedFor({ reduce_clutter: true, simplified_layout: true });
check('suppressedFor: combo order follows SUB_TOGGLE_KEYS',
  combo.map(e => e.key), ['reduce_clutter', 'simplified_layout']);
check('suppressedFor: SUPPRESSED_FOR_KEY covers exactly the four sub-toggles',
  Object.keys(C.SUPPRESSED_FOR_KEY).sort(), C.SUB_TOGGLE_KEYS.slice().sort());

// ── reducedMotion: reuses skeleton.js detection when present ──
check('reducedMotion: default false in Node (no window, no skeleton)', C.reducedMotion(), false);
// With skeleton loaded and matchMedia stubbed reduce → true (skeleton contract).
const skeletonCode = fs.readFileSync(path.join(__dirname, 'skeleton.js'), 'utf8');
globalThis.window = { matchMedia(q) { return { matches: /reduce/.test(q) }; } };
vm.runInThisContext(skeletonCode, { filename: 'skeleton.js' });
const S = globalThis.SahatakSkeleton;
check('reducedMotion: delegates to skeleton.js under reduce', [C.reducedMotion(), S.reducedMotion()], [true, true]);
globalThis.window = { matchMedia() { return { matches: false }; } };
check('reducedMotion: delegates to skeleton.js under no-preference', [C.reducedMotion(), S.reducedMotion()], [false, false]);
globalThis.window = undefined;

// ── EN/AR string contract: module STRINGS ↔ locales calm_mode.* keys ──
const en = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'locales', 'en.json'), 'utf8'));
const ar = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'locales', 'ar.json'), 'utf8'));
const keys = Object.keys(C.STRINGS);
check('locales have calm_mode section', [!!en.calm_mode, !!ar.calm_mode], [true, true]);
keys.forEach(k => {
  check(`en.calm_mode.${k} === STRINGS`, en.calm_mode[k], C.STRINGS[k].en);
  check(`ar.calm_mode.${k} === STRINGS`, ar.calm_mode[k], C.STRINGS[k].ar);
});
check('EN/AR calm_mode key parity', Object.keys(en.calm_mode).sort(), Object.keys(ar.calm_mode).sort());

// ── module surface ──
check('exports', Object.keys(C).sort(),
  ['CLASS_FOR_KEY', 'DEFAULT_CALM_UI_PREFS', 'STORAGE_KEY', 'STRINGS', 'SUB_TOGGLE_KEYS',
   'SUPPRESSED_FOR_KEY', 'apply', 'classesFor', 'extractFromPreferences', 'mergeIntoNotificationPreferences',
   'mergePrefs', 'mount', 'normalizeCalmUi', 'readCache', 'reducedMotion', 'save', 'subTogglesEnabled',
   'suppressedFor', 'sync', 'writeCache'].sort());

console.log(`\ncalm-mode smoke test: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
