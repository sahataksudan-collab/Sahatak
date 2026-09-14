/**
 * Journey logic test harness — plain Node, no test framework introduced.
 * Mirrors sahatak-mobile/src/experience/__tests__/journey.test.ts 1:1.
 * Run: node Sahatak-2/frontend/assets/js/experience/journey.test.cjs
 * (.cjs because the repo root package.json declares "type": "module".)
 */
'use strict';
// The repo root package.json declares "type": "module", so we load the browser
// script via vm with a CommonJS shim rather than require().
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JOURNEY_STAGE_ORDER, STAGE_TRANSITIONS, classifyAppointmentStatus, deriveJourney, deriveJourneyFromAppointment } = (() => {
  const code = fs.readFileSync(path.join(__dirname, 'journey.js'), 'utf8');
  const fakeModule = { exports: {} };
  vm.runInThisContext(code, { filename: 'journey.js' });
  // journey.js attaches to root — after runInThisContext, globalThis.SahatakJourney exists.
  return globalThis.SahatakJourney || fakeModule.exports;
})();


const NOW = Date.now();
const iso = (msFromNow) => new Date(NOW + msFromNow).toISOString();
const MORE_THAN_24H = 30 * 60 * 60 * 1000; // 30h out
const LESS_THAN_24H = 3 * 60 * 60 * 1000; // 3h out

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.error('  FAIL: ' + msg); }
}
function stateOf(stages, id) {
  const s = stages.find((x) => x.id === id);
  return s ? s.state : undefined;
}

// 1. no appointment → DISCOVER current, rest not_started
{
  const r = deriveJourney({ appointmentStatus: 'none' });
  assert(r.cancelled === false, 'no appointment: not cancelled');
  assert(stateOf(r.stages, 'DISCOVER') === 'current', 'no appointment: DISCOVER current');
  ['BOOK', 'PREPARE', 'WAIT', 'CONSULT', 'COMPLETE', 'UNDERSTAND', 'FOLLOW_UP'].forEach((id) => {
    assert(stateOf(r.stages, id) === 'not_started', 'no appointment: ' + id + ' not_started');
  });
}

// 2. upcoming more than 24h out → BOOK completed, PREPARE current
{
  const r = deriveJourney({ appointmentStatus: 'scheduled', appointmentDateTime: iso(MORE_THAN_24H) });
  assert(stateOf(r.stages, 'DISCOVER') === 'completed', 'far: DISCOVER completed');
  assert(stateOf(r.stages, 'BOOK') === 'completed', 'far: BOOK completed');
  assert(stateOf(r.stages, 'PREPARE') === 'current', 'far: PREPARE current');
  assert(stateOf(r.stages, 'WAIT') === 'not_started', 'far: WAIT not_started');
}

// 3. upcoming within 24h → PREPARE completed, WAIT current
{
  const r = deriveJourney({ appointmentStatus: 'confirmed', appointmentDateTime: iso(LESS_THAN_24H) });
  assert(stateOf(r.stages, 'BOOK') === 'completed', 'near: BOOK completed');
  assert(stateOf(r.stages, 'PREPARE') === 'completed', 'near: PREPARE completed');
  assert(stateOf(r.stages, 'WAIT') === 'current', 'near: WAIT current');
  assert(stateOf(r.stages, 'CONSULT') === 'not_started', 'near: CONSULT not_started');
}

// 4. in progress → CONSULT current
{
  const r = deriveJourney({ appointmentStatus: 'in_progress' });
  assert(stateOf(r.stages, 'WAIT') === 'completed', 'in_progress: WAIT completed');
  assert(stateOf(r.stages, 'CONSULT') === 'current', 'in_progress: CONSULT current');
  assert(stateOf(r.stages, 'COMPLETE') === 'not_started', 'in_progress: COMPLETE not_started');
}

// 5. completed with no notes → COMPLETE completed, UNDERSTAND current
{
  const r = deriveJourney({ appointmentStatus: 'completed' });
  assert(stateOf(r.stages, 'CONSULT') === 'completed', 'no notes: CONSULT completed');
  assert(stateOf(r.stages, 'COMPLETE') === 'completed', 'no notes: COMPLETE completed');
  assert(stateOf(r.stages, 'UNDERSTAND') === 'current', 'no notes: UNDERSTAND current');
  assert(stateOf(r.stages, 'FOLLOW_UP') === 'not_started', 'no notes: FOLLOW_UP not_started');
}

// 6. completed with notes present → UNDERSTAND completed, FOLLOW UP current
{
  const r = deriveJourney({ appointmentStatus: 'completed', hasDiagnosis: true });
  assert(stateOf(r.stages, 'UNDERSTAND') === 'completed', 'notes: UNDERSTAND completed');
  assert(stateOf(r.stages, 'FOLLOW_UP') === 'current', 'notes: FOLLOW_UP current');
}

// 7. completed with notes AND follow-up booked → all completed
{
  const r = deriveJourney({ appointmentStatus: 'completed', hasNotes: true, followUpBooked: true });
  assert(stateOf(r.stages, 'UNDERSTAND') === 'completed', 'fu booked: UNDERSTAND completed');
  assert(stateOf(r.stages, 'FOLLOW_UP') === 'completed', 'fu booked: FOLLOW_UP completed');
  assert(!r.stages.some((s) => s.state === 'current'), 'fu booked: no stage is current');
}

// 8. cancelled → entire journey cancelled
['cancelled', 'canceled'].forEach((status) => {
  const r = deriveJourney({ appointmentStatus: status });
  assert(r.cancelled === true, status + ': cancelled flag true');
  assert(JSON.stringify(r.stages.map((s) => s.id)) === JSON.stringify(JOURNEY_STAGE_ORDER), status + ': stage ids match order');
  assert(r.stages.every((s) => s.state === 'cancelled'), status + ': all stages cancelled');
});

// 9. rules table consistent with canonical stage order
Object.keys(STAGE_TRANSITIONS).forEach((key) => {
  const row = STAGE_TRANSITIONS[key];
  assert(JOURNEY_STAGE_ORDER.includes(row.current), key + ': current stage in order');
  if (row.completedThrough) {
    assert(JOURNEY_STAGE_ORDER.includes(row.completedThrough), key + ': completedThrough in order');
    assert(
      JOURNEY_STAGE_ORDER.indexOf(row.completedThrough) < JOURNEY_STAGE_ORDER.indexOf(row.current),
      key + ': completedThrough precedes current',
    );
  }
});

// 10. classifyAppointmentStatus buckets
assert(classifyAppointmentStatus('none') === 'no_appointment', 'classify none');
assert(classifyAppointmentStatus('pending') === 'upcoming_far', 'classify pending');
assert(classifyAppointmentStatus('in_progress') === 'in_progress', 'classify in_progress');
assert(classifyAppointmentStatus('completed') === 'completed_no_notes', 'classify completed');
assert(classifyAppointmentStatus('weird') === 'no_appointment', 'classify unknown defensive');

// 11. deriveJourneyFromAppointment wrapper shapes
{
  const r1 = deriveJourneyFromAppointment(null);
  assert(stateOf(r1.stages, 'DISCOVER') === 'current', 'wrapper null → DISCOVER current');
  const r2 = deriveJourneyFromAppointment({ status: 'upcoming', appointment_date: iso(LESS_THAN_24H), time_slot: '14:30' });
  assert(stateOf(r2.stages, 'WAIT') === 'current', 'wrapper near upcoming (snake_case + time_slot) → WAIT current');
  const r3 = deriveJourneyFromAppointment({ status: 'completed', notes: 'hello' });
  assert(stateOf(r3.stages, 'FOLLOW_UP') === 'current', 'wrapper completed with notes → FOLLOW_UP current');
  const r4 = deriveJourneyFromAppointment({ status: 'completed', prescription_id: 'p1' }, { followUpBooked: true });
  assert(r4.stages.every((s) => s.state === 'completed'), 'wrapper prescription + follow-up → all completed');
}

console.log('journey.test.js: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
