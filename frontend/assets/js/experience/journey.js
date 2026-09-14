/**
 * Patient Journey — canonical single source of truth for stage derivation (WEB PORT).
 * Plain-JS port of sahatak-mobile/src/experience/journey.ts and
 * sahatak-mobile/src/experience/rules/stageTransitions.ts — the same 8-stage
 * lifecycle, the same step states, the same rules. Do not redesign here;
 * changes must go through the mobile source first, then be mirrored.
 *
 * Pure logic only: no DOM, no API calls, no navigation. Stage/step state is
 * ADVISORY/derived — the backend's authorization and appointment status remain
 * the real gate for everything a patient can actually do.
 *
 * Dual-mode: loads as a plain browser script (window.SahatakJourney) and also
 * exports as a CommonJS module so a Node-based test harness can verify it
 * without introducing any test framework.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SahatakJourney = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Fixed order: DISCOVER → BOOK → PREPARE → WAIT → CONSULT → COMPLETE → UNDERSTAND → FOLLOW UP */
  const JOURNEY_STAGE_ORDER = [
    'DISCOVER',
    'BOOK',
    'PREPARE',
    'WAIT',
    'CONSULT',
    'COMPLETE',
    'UNDERSTAND',
    'FOLLOW_UP',
  ];

  /**
   * Stage-transition table — testable DATA, not inline logic.
   * Key: classification of the appointment; value: which stage is current and
   * which stages are completed. deriveJourney() looks up rows here.
   */
  const STAGE_TRANSITIONS = {
    no_appointment: {
      description: 'No appointment — DISCOVER is current, nothing completed.',
      current: 'DISCOVER',
      completedThrough: null,
      journeyState: null,
      suggestNextStep: true,
    },
    upcoming_far: {
      description: 'Scheduled/confirmed more than 24h out — BOOK done, PREPARE current.',
      current: 'PREPARE',
      completedThrough: 'BOOK',
      journeyState: null,
      suggestNextStep: true,
    },
    upcoming_near: {
      description: 'Scheduled/confirmed within 24h — PREPARE done, WAIT current.',
      current: 'WAIT',
      completedThrough: 'PREPARE',
      journeyState: null,
      suggestNextStep: true,
    },
    in_progress: {
      description: 'In progress — WAIT done, CONSULT current.',
      current: 'CONSULT',
      completedThrough: 'WAIT',
      journeyState: null,
      suggestNextStep: true,
    },
    completed_no_notes: {
      description: 'Completed, no notes/diagnosis yet — COMPLETE done, UNDERSTAND current.',
      current: 'UNDERSTAND',
      completedThrough: 'COMPLETE',
      journeyState: null,
      suggestNextStep: true,
    },
    completed_notes_no_followup: {
      description: 'Completed with notes, no follow-up booked — UNDERSTAND done, FOLLOW UP current.',
      current: 'FOLLOW_UP',
      completedThrough: 'UNDERSTAND',
      journeyState: null,
      suggestNextStep: true,
    },
    completed_notes_followup_booked: {
      description: 'Completed with notes and a booked follow-up — FOLLOW UP completed.',
      current: 'FOLLOW_UP',
      completedThrough: 'UNDERSTAND',
      journeyState: null,
      suggestNextStep: true,
    },
    cancelled: {
      description: 'Cancelled — entire journey cancelled, no next-step suggestion.',
      current: 'DISCOVER',
      completedThrough: null,
      journeyState: 'cancelled',
      suggestNextStep: false,
    },
  };

  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

  /**
   * Map a raw backend appointment status to a StageKey classification bucket.
   * The far/near split by the 24h rule happens in deriveJourney (time-based).
   */
  function classifyAppointmentStatus(status) {
    switch (status) {
      case 'none':
        return 'no_appointment';
      case 'scheduled':
      case 'confirmed':
      case 'pending':
        return 'upcoming_far';
      case 'in_progress':
        return 'in_progress';
      case 'completed':
        return 'completed_no_notes';
      case 'cancelled':
      case 'canceled':
        return 'cancelled';
      default:
        return 'no_appointment';
    }
  }

  function buildStages(current, completedThrough) {
    const currentIdx = JOURNEY_STAGE_ORDER.indexOf(current);
    const completedIdx = completedThrough === null ? -1 : JOURNEY_STAGE_ORDER.indexOf(completedThrough);
    return JOURNEY_STAGE_ORDER.map(function (id) {
      const idx = JOURNEY_STAGE_ORDER.indexOf(id);
      if (idx <= completedIdx) return { id: id, state: 'completed' };
      if (id === current) return { id: id, state: 'current' };
      return { id: id, state: 'not_started' };
    });
  }

  function allStagesInState(state) {
    return JOURNEY_STAGE_ORDER.map(function (id) {
      return { id: id, state: state };
    });
  }

  /**
   * Derives the patient journey from an appointment object plus consultation /
   * diagnosis / prescription availability flags. Never invents clinical data —
   * the flags are expected to come from real API fields only.
   *
   * @param {Object} input
   * @param {string} [input.appointmentStatus] Raw backend status; 'none' when
   *   the patient has no appointment.
   * @param {string} [input.appointmentDateTime] ISO datetime; only used to
   *   split upcoming appointments into PREPARE (>24h) vs WAIT (<24h).
   * @param {boolean} [input.hasNotes]
   * @param {boolean} [input.hasDiagnosis]
   * @param {boolean} [input.hasPrescription]
   * @param {boolean} [input.followUpBooked]
   * @returns {{cancelled: boolean, stages: Array<{id: string, state: string}>}}
   */
  function deriveJourney(input) {
    const status = (input && input.appointmentStatus) || 'none';

    if (status === 'cancelled' || status === 'canceled') {
      return { cancelled: true, stages: allStagesInState('cancelled') };
    }

    // No appointment at all → start of the journey. BOOK is "up next"
    // conceptually; keep it not_started (DISCOVER is current).
    if (status === 'none') {
      return { cancelled: false, stages: buildStages('DISCOVER', null) };
    }

    // In progress → live consultation.
    if (status === 'in_progress') {
      return { cancelled: false, stages: buildStages('CONSULT', 'WAIT') };
    }

    // Upcoming (scheduled / confirmed / pending).
    if (status === 'scheduled' || status === 'confirmed' || status === 'pending') {
      const ts = input.appointmentDateTime ? Date.parse(input.appointmentDateTime) : NaN;
      const within24h = !Number.isNaN(ts) && ts - Date.now() <= TWENTY_FOUR_HOURS_MS;
      if (within24h) {
        // PREPARE completed, WAIT current.
        return { cancelled: false, stages: buildStages('WAIT', 'PREPARE') };
      }
      // BOOK completed, PREPARE current.
      return { cancelled: false, stages: buildStages('PREPARE', 'BOOK') };
    }

    // Completed appointment.
    if (status === 'completed') {
      const notesReady = Boolean(input.hasNotes || input.hasDiagnosis || input.hasPrescription);
      if (!notesReady) {
        // COMPLETE done, doctor hasn't added notes yet → UNDERSTAND current.
        return { cancelled: false, stages: buildStages('UNDERSTAND', 'COMPLETE') };
      }
      if (input.followUpBooked) {
        // Journey complete: every stage (including FOLLOW UP) is completed.
        return { cancelled: false, stages: allStagesInState('completed') };
      }
      // UNDERSTAND done (notes present), follow-up not booked → FOLLOW UP current.
      return { cancelled: false, stages: buildStages('FOLLOW_UP', 'UNDERSTAND') };
    }

    // Unknown status — treat defensively as no-appointment-equivalent DISCOVER.
    return { cancelled: false, stages: buildStages('DISCOVER', null) };
  }

  /**
   * Derives the patient journey from an appointment object the web frontend
   * already fetches (no new API calls). Ports deriveJourneyFromAppointment()
   * from mobile: accepts the web appointment payload shape (snake_case and
   * camelCase variants), normalizes it, then delegates to deriveJourney().
   *
   * @param {Object|null} apt - Appointment object or null for "no appointment".
   * @param {{hasDiagnosis?: boolean, followUpBooked?: boolean}} [options]
   * @returns {{cancelled: boolean, stages: Array<{id: string, state: string}>}}
   */
  function deriveJourneyFromAppointment(apt, options) {
    if (!apt) return deriveJourney({ appointmentStatus: 'none' });

    let rawStatus = 'none';
    if (apt.status === 'cancelled') rawStatus = 'cancelled';
    else if (apt.status === 'completed') rawStatus = 'completed';
    else if (apt.status === 'upcoming') rawStatus = 'scheduled';
    else rawStatus = apt.status; // pass through raw backend statuses as-is

    let dateTime = apt.appointmentDate || apt.appointment_date || apt.date || undefined;
    // Combine date + time slot when the ISO date is missing or date-only.
    const timeSlot = apt.timeSlot || apt.time_slot;
    if (dateTime && timeSlot && !/t\d{2}:\d{2}/i.test(dateTime)) {
      const hhmm = (String(timeSlot).match(/\d{1,2}:\d{2}/) || [])[0];
      if (hhmm) dateTime = dateTime + 'T' + hhmm + ':00';
    }

    return deriveJourney({
      appointmentStatus: rawStatus,
      appointmentDateTime: dateTime,
      hasNotes: Boolean(apt.notes),
      hasPrescription: Boolean(apt.prescriptionId || apt.prescription_id),
      hasDiagnosis: options && options.hasDiagnosis,
      followUpBooked: options && options.followUpBooked,
    });
  }

  /**
   * Convenience helper for the UI: find a stage's state by id.
   * @returns {string|undefined}
   */
  function stageStateOf(journeyResult, id) {
    const found = journeyResult && journeyResult.stages.find(function (s) { return s.id === id; });
    return found ? found.state : undefined;
  }

  return {
    JOURNEY_STAGE_ORDER: JOURNEY_STAGE_ORDER,
    STAGE_TRANSITIONS: STAGE_TRANSITIONS,
    classifyAppointmentStatus: classifyAppointmentStatus,
    deriveJourney: deriveJourney,
    deriveJourneyFromAppointment: deriveJourneyFromAppointment,
    stageStateOf: stageStateOf,
  };
});
