/**
 * Smart Skeletons smoke test — plain Node, no test framework introduced.
 * Run: node Sahatak-2/frontend/assets/js/experience/skeleton.test.cjs
 * (.cjs because the repo root package.json declares "type": "module".)
 * Loads skeleton.js the same way the browser does (window attach) and drives
 * the pure logic: blocksFor (variant selection + fixed dimensions),
 * reducedMotion (branching via a stubbed matchMedia), classifyError
 * (asserted in lockstep with care-summary.js's classifyError), and the
 * EN/AR string contract (module STRINGS ↔ locales/*.json skeleton.* keys).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const code = fs.readFileSync(path.join(__dirname, 'skeleton.js'), 'utf8');
vm.runInThisContext(code, { filename: 'skeleton.js' });
const S = globalThis.SahatakSkeleton;

let passed = 0;
let failed = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { passed++; }
  else { failed++; console.error(`FAIL: ${name}\n  expected: ${e}\n  actual:   ${a}`); }
}

// ── blocksFor: variant selection ──
const card = S.blocksFor('card');
check('card: one card spec', card.length, 1);
check('card: variant', card[0].variant, 'card');
check('card: avatar + 2 lines', card[0].blocks.length, 3);
check('card: avatar variant first', card[0].blocks[0].variant, 'avatar');

const list = S.blocksFor('list', { count: 4 });
check('list: count honored', list.length, 4);
check('list: all cards', list.every(b => b.variant === 'card'), true);
check('list: default count 3', S.blocksFor('list').length, 3);

const grid = S.blocksFor('grid', { count: 8 });
check('grid: count honored', grid.length, 8);
check('grid: cell variant', grid.every(b => b.variant === 'cell'), true);

const records = S.blocksFor('records', { count: 3 });
check('records: count honored', records.length, 3);
check('records: line variant', records.every(b => b.variant === 'line'), true);

const care = S.blocksFor('care_summary');
check('care_summary: default 6 IA sections', care.length, 6);
check('care_summary: card variant', care.every(b => b.variant === 'card'), true);
check('care_summary: header + body line each', care.every(b => b.blocks.length === 2), true);
check('care_summary: custom count', S.blocksFor('care_summary', { count: 2 }).length, 2);

// Unknown type falls back to a single line, never throws.
check('default: single line', S.blocksFor('mystery'), [{ variant: 'line', width: '100%', height: '0.85rem', radius: '7px' }]);

// ── blocksFor: fixed dimensions (no layout shift) ──
check('card avatar fixed dims', [card[0].blocks[0].width, card[0].blocks[0].height], ['3rem', '3rem']);
check('cell fixed dims', [grid[0].width, grid[0].height], ['6.5rem', '2.25rem']);
check('line widths are %', records.every(b => /%$/.test(b.width)), true);

// ── reducedMotion branching ──
// In Node (no window) the default branch is shimmer (false = not reduced).
check('reducedMotion: default false in Node', S.reducedMotion(), false);
// Stub matchMedia: reduce → true, no-preference → false.
globalThis.window = {
  matchMedia(q) { return { matches: /reduce/.test(q) ? true : false }; },
};
check('reducedMotion: true under reduce', S.reducedMotion(), true);
globalThis.window = { matchMedia() { return { matches: false }; } };
check('reducedMotion: false under no-preference', S.reducedMotion(), false);
globalThis.window = undefined;

// ── classifyError: lockstep with care-summary.js ──
const csCode = fs.readFileSync(path.join(__dirname, 'care-summary.js'), 'utf8');
vm.runInThisContext(csCode, { filename: 'care-summary.js' });
const C = globalThis.SahatakCareSummary;

const cases = [
  [{ status: 401 }, 'unauthorized'],
  [{ status: 403 }, 'unauthorized'],
  [{ statusCode: 403 }, 'unauthorized'],
  [{ status: 500 }, 'failure'],
  [{}, 'failure'],
  [new Error('boom'), 'failure'],
];
cases.forEach(([input, expected]) => {
  check(`classifyError lockstep ${JSON.stringify(input)}`,
    [S.classifyError(input), C.classifyError(input)], [expected, expected]);
});
// renderError: string kinds branch to the right strings; object errors go
// through classifyError. Minimal DOM stub (Node has no document).
function stubNode(tag) {
  return {
    tagName: tag, className: '', children: [], type: undefined,
    classList: { add() {} },
    style: {}, textContent: undefined,
    setAttribute() {}, removeAttribute() {},
    appendChild(n) { this.children.push(n); },
    addEventListener(type, fn) { this._onclick = fn; },
  };
}
globalThis.document = { createElement: stubNode };
globalThis.window = globalThis.window || {}; // translate() reads window.LanguageManager
const errBox = { innerHTML: '', removeAttribute() {}, appendChild(n) { this._panel = n; } };
S.renderError(errBox, 'offline', () => {});
const panel = errBox._panel;
check('renderError(offline): panel class', panel.className, 'cg-care-state');
check('renderError(offline): offline title', panel.children[0].textContent, S.STRINGS.offline_title.en);
check('renderError(offline): offline sub', panel.children[1].textContent, S.STRINGS.offline_sub.en);
check('renderError(offline): retry button', panel.children[2].className, 'cg-care-retry-btn cg-skeleton-retry-btn');
const retried = [];
S.renderError(errBox, new Error('x'), () => retried.push(1));
check('renderError(failure): generic title', errBox._panel.children[0].textContent, S.STRINGS.error_title.en);
errBox._panel.children[2]._onclick();
check('renderError: retry handler wired', retried, [1]);
globalThis.document = undefined;
globalThis.window = undefined;

// ── EN/AR string contract: module STRINGS ↔ locales skeleton.* keys ──
const en = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'locales', 'en.json'), 'utf8'));
const ar = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'locales', 'ar.json'), 'utf8'));
const keys = Object.keys(S.STRINGS);
check('locales have skeleton section', [!!en.skeleton, !!ar.skeleton], [true, true]);
keys.forEach(k => {
  check(`en.skeleton.${k} === STRINGS`, en.skeleton[k], S.STRINGS[k].en);
  check(`ar.skeleton.${k} === STRINGS`, ar.skeleton[k], S.STRINGS[k].ar);
});
check('EN/AR skeleton key parity', Object.keys(en.skeleton).sort(), Object.keys(ar.skeleton).sort());

// ── module surface ──
check('exports', Object.keys(S).sort(),
  ['STRINGS', 'blocksFor', 'calmSimplified', 'classifyError', 'clear', 'reducedMotion', 'render', 'renderError'].sort());

console.log(`\nskeleton smoke test: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
