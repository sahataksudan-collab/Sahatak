/**
 * One-Tap Follow-Up — stage-driven patient actions (WEB PORT).
 * Mirrors the mobile entry point in sahatak-mobile/src/components/home/HomeScreen.tsx
 * (the "journeyActions" block under the Journey Tracker):
 *   - DISCOVER current     → primary: Find a Doctor (booking page, doctor step)
 *   - PREPARE/WAIT current → primary: Prepare for Consultation (appointments list)
 *   - FOLLOW_UP current    → primary: Book Follow-Up (booking page, doctor preselected
 *                            via ?doctor=<id>&follow_up=1) — the One-Tap Follow-Up CTA.
 * Suppression rules mirror mobile: nothing renders when the journey is
 * cancelled, and nothing renders when the journey is fully completed (follow-up
 * already booked — there is no current stage) — never a second booking path.
 *
 * Purely advisory/derived UI — the backend's authorization and appointment status
 * remain the real gate. No API calls of its own: callers pass appointment data the
 * page already fetched (window.__patientAppointmentsCache on the dashboard).
 * Dual-mode like journey.js: browser script (window.SahatakFollowUp) + CommonJS
 * for the Node smoke test. Translations via LanguageManager with EN/AR fallbacks.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SahatakFollowUp = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var BOOKING_PAGE_URL = '../appointments/book-appointment.html';
  var APPOINTMENTS_PAGE_URL = '../appointments/appointment-list.html';
  /** Care Summary section on the patient dashboard (rendered by SahatakCareSummary). */
  var CARE_SUMMARY_ANCHOR = '#care-summary';

  /** Mirror of the mobile action labels — fallback if translations fail to load. */
  var ACTION_LABELS = {
    find_doctor: { en: 'Find a Doctor', ar: 'ابحث عن طبيب' },
    prepare: { en: 'Prepare for Consultation', ar: 'استعد للاستشارة' },
    book_follow_up: { en: 'Book Follow-Up', ar: 'احجز موعد متابعة' },
    view_care_summary: { en: 'View Care Summary', ar: 'عرض ملخص الرعاية' },
  };


  function currentLang() {
    return (window.LanguageManager && LanguageManager.getLanguage && LanguageManager.getLanguage()) || 'en';
  }

  function translate(key, fallback) {
    try {
      if (window.LanguageManager && typeof LanguageManager.translate === 'function') {
        var value = LanguageManager.translate(key);
        if (value && value !== key) return value;
      }
    } catch (e) { /* fall through to fallback */ }
    return fallback;
  }

  function label(actionId, lang) {
    var translated = translate('journey.actions.' + actionId, null);
    if (translated) return translated;
    var entry = ACTION_LABELS[actionId];
    return entry ? entry[lang] : actionId;
  }

  /**
   * Deep link into the booking flow with the doctor preselected so the patient
   * lands directly on slot selection. The booking page (appointment-booking.js)
   * honors `doctor` + `follow_up=1` query params.
   * @param {Object|null} appointment - completed appointment the follow-up is for.
   * @returns {string} booking URL (doctor param only when an id is available).
   */
  function bookingUrl(appointment) {
    var doctorId = appointment && (appointment.doctorId || appointment.doctor_id ||
      (appointment.doctor && appointment.doctor.id));
    return doctorId != null
      ? BOOKING_PAGE_URL + '?doctor=' + encodeURIComponent(doctorId) + '&follow_up=1'
      : BOOKING_PAGE_URL;
  }

  /**
   * Pure logic: given a journey result (from window.SahatakJourney.deriveJourney*)
   * and the focus appointment, decide which actions to show. Mirrors the mobile
   * HomeScreen journeyActions switch 1:1. Reads journey state — never re-derives it.
   *
   * @param {{cancelled: boolean, stages: Array<{id: string, state: string}>}|null} journey
   * @param {Object|null} focusAppointment
   * @returns {Array<{id: string, kind: 'primary'|'note', href: string|null}>}
   */
  function stageActions(journey, focusAppointment) {
    if (!journey || journey.cancelled) return [];
    var current = null;
    for (var i = 0; i < journey.stages.length; i++) {
      if (journey.stages[i].state === 'current') { current = journey.stages[i]; break; }
    }
    if (!current) return [];

    if (current.id === 'DISCOVER') {
      return [{ id: 'find_doctor', kind: 'primary', href: BOOKING_PAGE_URL }];
    }
    if (current.id === 'PREPARE' || current.id === 'WAIT') {
      return [{ id: 'prepare', kind: 'primary', href: APPOINTMENTS_PAGE_URL }];
    }
    if (current.id === 'UNDERSTAND' || current.id === 'FOLLOW_UP') {
      // Mirrors mobile HomeScreen: "View Care Summary" is the primary action at
      // this stage (the Care Summary section on this page), with the Book
      // Follow-Up CTA as the secondary action when a focus appointment exists.
      var actions = [{ id: 'view_care_summary', kind: 'primary', href: CARE_SUMMARY_ANCHOR }];
      if (focusAppointment) {
        actions.push({
          id: 'book_follow_up',
          kind: 'secondary',
          href: bookingUrl(focusAppointment),
        });
      }
      return actions;
    }

    // COMPLETE / BOOK / CONSULT — mobile shows no action for these either.
    // A fully completed journey (follow-up already booked) has no current
    // stage at all, so it also renders nothing — exactly like mobile.
    return [];
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  /**
   * Render the actions into `container`. Uses SahatakJourneyTracker's focus
   * appointment picker (same appointment the tracker highlights) and the
   * journey logic module — no duplicate derivation here.
   * @param {HTMLElement} container
   * @param {Array|Object|null} appointments - data the page already fetched.
   * @returns {boolean} true if anything was rendered.
   */
  function render(container, appointments) {
    if (!container || typeof window.SahatakJourney === 'undefined') return false;

    // Journey state comes from the ONE shared derivation (journey-tracker's
    // memoized journeyFor) — never re-derived here. Falls back to a direct
    // derive only if the tracker module is absent.
    var apt, journey;
    if (Array.isArray(appointments) && window.SahatakJourneyTracker &&
        window.SahatakJourneyTracker.journeyFor) {
      journey = window.SahatakJourneyTracker.journeyFor(appointments);
      apt = window.SahatakJourneyTracker.pickFocusAppointment(appointments);
    } else {
      apt = Array.isArray(appointments) && window.SahatakJourneyTracker
        ? window.SahatakJourneyTracker.pickFocusAppointment(appointments)
        : (appointments || null);
      journey = window.SahatakJourney.deriveJourneyFromAppointment(apt);
    }
    var actions = stageActions(journey, apt);
    var lang = currentLang();

    container.innerHTML = '';
    container.classList.add('cg-journey-actions');
    if (!actions.length) return false;

    actions.forEach(function (action) {
      if (action.kind === 'note') {
        container.appendChild(el('p', 'cg-journey-action-note', label(action.id, lang)));
        return;
      }
      var link = el('a', 'cg-journey-action-btn cg-journey-action-' + action.kind);
      link.href = action.href || '#';
      link.setAttribute('role', 'button');
      link.setAttribute('aria-label', label(action.id, lang));
      link.appendChild(el('span', 'cg-journey-action-label', label(action.id, lang)));
      container.appendChild(link);
    });
    return true;
  }

  /**
   * Convenience for pages: render into a container id with appointment data the
   * page already has in memory. Silently no-ops when the container or journey
   * modules are not present.
   */
  function refresh(containerId, appointments) {
    var container = document.getElementById(containerId || 'journey-actions');
    if (!container) return false;
    return render(container, appointments);
  }

  return {
    BOOKING_PAGE_URL: BOOKING_PAGE_URL,
    APPOINTMENTS_PAGE_URL: APPOINTMENTS_PAGE_URL,
    CARE_SUMMARY_ANCHOR: CARE_SUMMARY_ANCHOR,

    bookingUrl: bookingUrl,
    stageActions: stageActions,
    render: render,
    refresh: refresh,
  };
});
