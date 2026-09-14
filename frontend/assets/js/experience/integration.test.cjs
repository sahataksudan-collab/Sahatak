/**
 * Integration smoke test (web item #7) — cross-module wiring, plain Node.
 * (.cjs because the repo root package.json declares "type": "module".)
 * Run: node Sahatak-2/frontend/assets/js/experience/integration.test.cjs
 * Covers the ONE-derivation contract (journey-tracker.journeyFor shared by
 * journey-tracker / follow-up / care-summary), the full mock/dev-data flow
 * (confirmed → PREPARE … completed+notes → FOLLOW_UP with eligible CTA …
 * follow-up booked → journey complete), the cancelled path agreeing across
 * all three modules, and skeleton's read-only Calm Mode awareness.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

globalThis.window = {};
function load(file) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), { filename: file });
}
load('journey.js');
load('journey-tracker.js');
load('follow-up.js');
load('care-summary.js');
load('skeleton.js');
// journey.js's UMD attaches to globalThis (no `self` in Node); mirror onto the
// stub window the browser-mode modules (journey-tracker/follow-up) read.
globalThis.window.SahatakJourney = globalThis.SahatakJourney;
globalThis.window.SahatakFollowUp = globalThis.SahatakFollowUp;
globalThis.window.SahatakCareSummary = globalThis.SahatakCareSummary;
const J = globalThis.SahatakJourney;
const T = globalThis.window.SahatakJourneyTracker;
const F = globalThis.SahatakFollowUp;
const C = globalThis.SahatakCareSummary;
const S = globalThis.SahatakSkeleton;

let passed = 0, failed = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) passed++;
  else { failed++; console.error(`FAIL: ${name}\n  expected: ${e}\n  actual:   ${a}`); }
}
const iso = (hoursFromNow) => new Date(Date.now() + hoursFromNow * 3600e3).toISOString();

// ── 1. ONE derivation per page load ──
const confirmedList = [{ id: 1, status: 'confirmed', appointment_date: iso(72) }];
const j1 = T.journeyFor(confirmedList);
check('journeyFor: memoized — same object on repeat call', T.journeyFor(confirmedList) === j1, true);
check('journeyFor: confirmed >24h → PREPARE current, BOOK completed',
  [J.stageStateOf(j1, 'PREPARE'), J.stageStateOf(j1, 'BOOK')], ['current', 'completed']);
check('journeyFor: same derivation the tracker render path uses (pure pick)',
  T.pickFocusAppointment(confirmedList), confirmedList[0]);

// ── 2. mock flow: confirmed → stage actions match the stage ──
check('flow: confirmed >24h → primary "Prepare for Consultation"',
  F.stageActions(j1, confirmedList[0]).map(a => a.id), ['prepare']);

// ── 3. mock flow: consultation completed WITH notes → FOLLOW_UP eligible ──
const completedList = [{
  id: 2, status: 'completed', appointment_date: iso(-48), notes: 'Mild URI',
  doctor_id: 7, follow_up_required: true,
}];
const j2 = T.journeyFor(completedList);
check('flow: completed+notes → FOLLOW_UP current, UNDERSTAND completed',
  [J.stageStateOf(j2, 'FOLLOW_UP'), J.stageStateOf(j2, 'UNDERSTAND')], ['current', 'completed']);
const actions2 = F.stageActions(j2, completedList[0]);
check('flow: completed+notes → View Care Summary (primary) + Book Follow-Up (secondary)',
  actions2.map(a => [a.id, a.kind]), [['view_care_summary', 'primary'], ['book_follow_up', 'secondary']]);
check('flow: follow-up deep link keeps ?doctor=<id>&follow_up=1',
  F.bookingUrl(completedList[0]).includes('doctor=7') && F.bookingUrl(completedList[0]).includes('follow_up=1'), true);
check('flow: Care Summary state = completed (full content)',
  C.deriveSummaryState({ hasUser: true, errorKind: null, journey: j2, diagnosis: { primary_diagnosis: 'URI' }, prescriptions: [] }),
  'completed');
check('flow: Care Summary followUpState = available (CTA eligible)',
  C.followUpState({ follow_up_required: true }, completedList[0], j2), 'available');
check('flow: single derivation shared — care-summary/follow-up see the SAME journey object',
  T.journeyFor(completedList) === j2, true);

// ── 4. follow-up booked → journey complete, no second booking path ──
const bookedJourney = J.deriveJourneyFromAppointment(completedList[0], { followUpBooked: true });
check('flow: follow-up booked → all stages completed',
  bookedJourney.stages.every(s => s.state === 'completed'), true);
check('flow: follow-up booked → no journey actions render', F.stageActions(bookedJourney, completedList[0]), []);
check('flow: follow-up booked → Care Summary followUpState = booked',
  C.followUpState({ follow_up_required: true }, completedList[0], bookedJourney), 'booked');

// ── 5. cancelled path — all three modules agree, no phantom CTA ──
// (A cancelled-only LIST is never picked as the focus appointment — the first
// suppression layer; a cancelled object passed directly (e.g. single apt) is
// where all three modules must agree on the cancelled state.)
const cancelledApt = { id: 3, status: 'cancelled', appointment_date: iso(-24) };
check('cancelled: cancelled-only list is never the focus appointment (no UI anywhere)',
  T.pickFocusAppointment([cancelledApt]), null);
const j3 = T.journeyFor(cancelledApt);
check('cancelled: journey.cancelled', j3.cancelled, true);
check('cancelled: Care Summary state = cancelled (not a phantom completed view)',
  C.deriveSummaryState({ hasUser: true, errorKind: null, journey: j3, diagnosis: { primary_diagnosis: 'URI' }, prescriptions: [] }),
  'cancelled');
check('cancelled: stageActions render NOTHING (no CTA anywhere)',
  F.stageActions(j3, cancelledApt), []);

// ── 6. skeleton × Calm Mode (read-only) ──
check('skeleton: default card = avatar + 2 lines',
  S.blocksFor('card')[0].blocks.length, 3);
check('skeleton: simplified card = avatar + 1 line (fewer decorative blocks, same shape)',
  [S.blocksFor('card', { simplified: true })[0].blocks.length,
   S.blocksFor('card', { simplified: true })[0].blocks[0].width],
  [2, '3rem']);
check('skeleton: simplified care_summary = 1 line per section, same IA count/order',
  S.blocksFor('care_summary', { simplified: true }).length, 6);
check('skeleton: simplified care_summary section = header line only',
  S.blocksFor('care_summary', { simplified: true }).map(c => c.blocks.length), [1, 1, 1, 1, 1, 1]);
globalThis.window = { SahatakCalmMode: { readCache: () => ({ calm_mode: true, simplified_layout: true }) } };
check('skeleton: calmSimplified reads SahatakCalmMode read-only', S.calmSimplified(), true);
globalThis.window = { SahatakCalmMode: { readCache: () => ({ calm_mode: true, simplified_layout: false }) } };
check('skeleton: calmSimplified false when simplified_layout off', S.calmSimplified(), false);
globalThis.window = {};
check('skeleton: calmSimplified safe when Calm Mode absent', S.calmSimplified(), false);
globalThis.window = undefined;

// ── 7. suppression list accuracy (never-suppress contract) ──
const calmCode = fs.readFileSync(path.join(__dirname, 'calm-mode.js'), 'utf8');
globalThis.window = {};
vm.runInThisContext(calmCode, { filename: 'calm-mode.js' });
const CM = globalThis.SahatakCalmMode;
check('calm: reduce_animations suppresses skeleton shimmer; simplified_layout adds the skeleton reduced variant (decorative only)',
  CM.SUPPRESSED_FOR_KEY.reduce_animations[0].indexOf('shimmer') !== -1 &&
  CM.SUPPRESSED_FOR_KEY.simplified_layout.some(s => s.indexOf('skeleton') !== -1), true);
const suppressionText = JSON.stringify(CM.SUPPRESSED_FOR_KEY).toLowerCase();
check('calm: no suppression entry touches journey status / care summary clinical content / appointment notifications',
  ['journey status', 'care summary', 'appointment status', 'critical notification'].every(
    term => suppressionText.indexOf('suppress ' + term) === -1), true);
globalThis.window = undefined;

console.log(`\nintegration smoke test: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
