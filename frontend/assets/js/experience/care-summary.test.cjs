/**
 * Care Summary smoke test — plain Node, no test framework introduced.
 * Run: node Sahatak-2/frontend/assets/js/experience/care-summary.test.cjs
 * (.cjs because the repo root package.json declares "type": "module".)
 * Loads care-summary.js the same way the browser does (window attach) and
 * drives the pure logic (pickDiagnosis, pickPrescriptions, deriveSummaryState,
 * followUpState, classifyError) through all 11 mobile states.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const code = fs.readFileSync(path.join(__dirname, 'care-summary.js'), 'utf8');
vm.runInThisContext(code, { filename: 'care-summary.js' });
const C = globalThis.SahatakCareSummary;

let passed = 0;
let failed = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { passed++; }
  else { failed++; console.error(`FAIL: ${name}\n  expected: ${e}\n  actual:   ${a}`); }
}

const diagnosis = {
  id: 1,
  appointment_id: 7,
  primary_diagnosis: 'Common cold',
  clinical_findings: 'Mild fever',
  treatment_plan: 'Rest and fluids',
  prescription: null,
  follow_up_required: true,
  follow_up_date: '2026-09-20',
  follow_up_notes: 'Return if fever persists',
  diagnosis_date: '2026-09-10',
  doctor_name: 'Dr. Sara',
};
const completedApt = { id: 7, status: 'completed', doctor_id: 42 };

// ── pickDiagnosis ──
check('pickDiagnosis: exact appointment_id match wins', C.pickDiagnosis([diagnosis], completedApt).id, 1);
const otherApt = { id: 99, status: 'completed' };
check('pickDiagnosis: falls back to newest (first) record', C.pickDiagnosis([diagnosis], otherApt).id, 1);
check('pickDiagnosis: null/empty input', C.pickDiagnosis([], completedApt), null);
check('pickDiagnosis: non-array input', C.pickDiagnosis(null, completedApt), null);

// ── pickPrescriptions ──
const rx1 = { id: 11, appointment_id: 7, medication_name: 'Paracetamol', dosage: '500mg', frequency: '3x/day', duration: '5 days', instructions: 'After meals' };
const rx2 = { id: 12, appointment_id: 8, medication_name: 'Ibuprofen' };
check('pickPrescriptions: filters by appointment_id', C.pickPrescriptions([rx1, rx2], completedApt), [rx1]);
check('pickPrescriptions: falls back to prescription_id when rx has none',
  C.pickPrescriptions([{ id: 11, medication_name: 'X' }], { id: 7, prescription_id: 11 }), [{ id: 11, medication_name: 'X' }]);
check('pickPrescriptions: no appointment → empty', C.pickPrescriptions([rx1], null), []);
check('pickPrescriptions: non-array → empty', C.pickPrescriptions(null, completedApt), []);

// ── deriveSummaryState (11-state precedence) ──
const base = { hasUser: true, errorKind: null, journey: { cancelled: false, stages: [] }, diagnosis: diagnosis, prescriptions: [rx1] };
check('state 1: completed', C.deriveSummaryState(base), 'completed');
check('state 2: notes pending (no diagnosis yet)', C.deriveSummaryState({ ...base, diagnosis: null }), 'notes_pending');
check('state 3: prescription available → still completed (rx is a section, not a state)',
  C.deriveSummaryState({ ...base, prescriptions: [] }), 'completed');
check('state 7: cancelled', C.deriveSummaryState({ ...base, journey: { cancelled: true, stages: [] } }), 'cancelled');
check('state 9: API failure', C.deriveSummaryState({ ...base, errorKind: 'failure' }), 'failure');
check('state 10: offline', C.deriveSummaryState({ ...base, errorKind: 'offline' }), 'offline');
check('state 11: unauthorized (error)', C.deriveSummaryState({ ...base, errorKind: 'unauthorized' }), 'unauthorized');
check('state 11: unauthorized (no user)', C.deriveSummaryState({ ...base, hasUser: false }), 'unauthorized');
check('precedence: unauthorized beats everything', C.deriveSummaryState({ ...base, hasUser: false, journey: { cancelled: true, stages: [] } }), 'unauthorized');
check('precedence: offline beats cancelled', C.deriveSummaryState({ ...base, errorKind: 'offline', journey: { cancelled: true, stages: [] } }), 'offline');
check('null input → failure', C.deriveSummaryState(null), 'failure');

// ── followUpState ──
check('state 6: follow-up not requested', C.followUpState({ ...diagnosis, follow_up_required: false }, completedApt, null), 'not_required');
check('state 5: follow-up available (flag set, journey not completed)',
  C.followUpState(diagnosis, completedApt, { cancelled: false, stages: [{ id: 'FOLLOW_UP', state: 'current' }] }), 'available');
check('follow-up booked when journey FOLLOW_UP stage completed',
  C.followUpState(diagnosis, completedApt, { cancelled: false, stages: [{ id: 'FOLLOW_UP', state: 'completed' }] }), 'booked');
check('followUpState: appointment-level flag (snake_case)',
  C.followUpState(null, { id: 7, follow_up_required: true }, null), 'available');
check('followUpState: appointment-level flag (camelCase)',
  C.followUpState(null, { id: 7, followUpRequired: true }, null), 'available');
check('followUpState: no flags anywhere → not_required', C.followUpState(null, completedApt, null), 'not_required');

// ── classifyError ──
check('401 → unauthorized', C.classifyError({ status: 401 }), 'unauthorized');
check('403 → unauthorized', C.classifyError({ statusCode: 403 }), 'unauthorized');
check('network failure while online → failure', C.classifyError(new Error('fetch failed')), 'failure');
check('500 → failure', C.classifyError({ status: 500 }), 'failure');

console.log(`care-summary.test.js: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
