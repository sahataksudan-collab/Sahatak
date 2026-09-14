/**
 * One-Tap Follow-Up smoke test — plain Node, no test framework introduced.
 * Run: node Sahatak-2/frontend/assets/js/experience/follow-up.test.cjs
 * (.cjs because the repo root package.json declares "type": "module".)
 * Loads follow-up.js the same way the browser does (window attach) and drives
 * the pure logic (bookingUrl, stageActions) through every journey stage.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const journeyCode = fs.readFileSync(path.join(__dirname, 'journey.js'), 'utf8');
const followUpCode = fs.readFileSync(path.join(__dirname, 'follow-up.js'), 'utf8');
vm.runInThisContext(journeyCode, { filename: 'journey.js' });
vm.runInThisContext(followUpCode, { filename: 'follow-up.js' });
const J = globalThis.SahatakJourney;
const F = globalThis.SahatakFollowUp;

let passed = 0;
let failed = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { passed++; }
  else { failed++; console.error(`FAIL: ${name}\n  expected: ${e}\n  actual:   ${a}`); }
}

const completedApt = {
  id: 7,
  status: 'completed',
  appointment_date: '2026-08-01T10:00:00',
  doctor_id: 42,
  notes: 'Patient recovering well.',
};

// ── bookingUrl ──
check('bookingUrl snake_case doctor_id',
  F.bookingUrl({ doctor_id: 42 }), F.BOOKING_PAGE_URL + '?doctor=42&follow_up=1');
check('bookingUrl camelCase doctorId',
  F.bookingUrl({ doctorId: '42' }), F.BOOKING_PAGE_URL + '?doctor=42&follow_up=1');
check('bookingUrl nested doctor.id',
  F.bookingUrl({ doctor: { id: 9 } }), F.BOOKING_PAGE_URL + '?doctor=9&follow_up=1');
check('bookingUrl no doctor → plain booking page',
  F.bookingUrl(null), F.BOOKING_PAGE_URL);
check('bookingUrl encodes id',
  F.bookingUrl({ doctor_id: 'a b' }), F.BOOKING_PAGE_URL + '?doctor=a%20b&follow_up=1');

// ── stageActions: mirrors mobile HomeScreen journeyActions ──
const noApt = J.deriveJourney({ appointmentStatus: 'none' });
check('DISCOVER → find_doctor',
  F.stageActions(noApt, null),
  [{ id: 'find_doctor', kind: 'primary', href: F.BOOKING_PAGE_URL }]);

const far = J.deriveJourneyFromAppointment({ status: 'upcoming', appointment_date: futureDate(3) });
check('PREPARE → prepare',
  F.stageActions(far, far && completedApt),
  [{ id: 'prepare', kind: 'primary', href: F.APPOINTMENTS_PAGE_URL }]);

const near = J.deriveJourneyFromAppointment({ status: 'confirmed', appointment_date: futureDate(0) });
check('WAIT → prepare',
  F.stageActions(near, completedApt),
  [{ id: 'prepare', kind: 'primary', href: F.APPOINTMENTS_PAGE_URL }]);

const inProgress = J.deriveJourney({ appointmentStatus: 'in_progress', appointmentDateTime: new Date().toISOString() });
check('CONSULT → no actions',
  F.stageActions(inProgress, completedApt), []);

const noNotes = J.deriveJourney({ appointmentStatus: 'completed' });
check('UNDERSTAND → View Care Summary primary (no CTA without focus appointment)',
  F.stageActions(noNotes, null),
  [{ id: 'view_care_summary', kind: 'primary', href: F.CARE_SUMMARY_ANCHOR }]);
check('UNDERSTAND → View Care Summary + Book Follow-Up secondary with doctor deep link (mirrors mobile)',
  F.stageActions(noNotes, completedApt),
  [
    { id: 'view_care_summary', kind: 'primary', href: F.CARE_SUMMARY_ANCHOR },
    { id: 'book_follow_up', kind: 'secondary', href: F.BOOKING_PAGE_URL + '?doctor=42&follow_up=1' },
  ]);

const notesNoFollowUp = J.deriveJourney({
  appointmentStatus: 'completed', hasNotes: true, hasDiagnosis: true,
});
check('FOLLOW_UP → View Care Summary + book_follow_up secondary with doctor deep link',
  F.stageActions(notesNoFollowUp, completedApt),
  [
    { id: 'view_care_summary', kind: 'primary', href: F.CARE_SUMMARY_ANCHOR },
    { id: 'book_follow_up', kind: 'secondary', href: F.BOOKING_PAGE_URL + '?doctor=42&follow_up=1' },
  ]);


const fullyComplete = J.deriveJourney({
  appointmentStatus: 'completed', hasNotes: true, followUpBooked: true,
});
check('follow-up already booked → no current stage → no actions (mirrors mobile)',
  F.stageActions(fullyComplete, completedApt), []);

const cancelled = J.deriveJourney({ appointmentStatus: 'cancelled' });
check('cancelled → nothing renders',
  F.stageActions(cancelled, completedApt), []);

check('null journey → nothing renders', F.stageActions(null, completedApt), []);

// ── suppression rule: cancelled journey wins even with a completed apt present ──
const cancelledApt = { id: 8, status: 'cancelled', appointment_date: '2026-08-02T10:00:00', doctor_id: 42 };
const cancelledJourney = J.deriveJourneyFromAppointment(cancelledApt);
check('cancelled focus appointment → no actions', F.stageActions(cancelledJourney, cancelledApt), []);

function futureDate(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(10, 0, 0, 0);
  return d.toISOString();
}

console.log('follow-up.test.js: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
