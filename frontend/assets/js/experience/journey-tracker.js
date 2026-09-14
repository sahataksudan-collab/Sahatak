/**
 * Journey Tracker UI (WEB) — renders window.SahatakJourney output on the page.
 * Mirrors sahatak-mobile/src/components/experience/JourneyTracker.tsx:
 *   - compact variant: "Step X of N — STAGE" + progress bar + stage strip
 *   - desktop variant: horizontal step rail (timeline)
 * Both variants are rendered into the same container; CSS (clinical-glass.css,
 * .cg-journey-* section) decides which one is visible at the current viewport.
 * Purely advisory/derived UI — never a gate for anything. No API calls of its
 * own: callers pass appointment data the page already fetched.
 */
(function () {
  'use strict';

  /** Mirror of mobile STAGE_LABELS — kept as fallback if translations fail to load. */
  var STAGE_LABELS = {
    DISCOVER: { en: 'Discover', ar: 'استكشف' },
    BOOK: { en: 'Book', ar: 'احجز' },
    PREPARE: { en: 'Prepare', ar: 'استعد' },
    WAIT: { en: 'Wait', ar: 'انتظر' },
    CONSULT: { en: 'Consult', ar: 'الاستشارة' },
    COMPLETE: { en: 'Complete', ar: 'الإكمال' },
    UNDERSTAND: { en: 'Understand', ar: 'افهم' },
    FOLLOW_UP: { en: 'Follow Up', ar: 'المتابعة' },
  };

  function currentLang() {
    return (window.LanguageManager && LanguageManager.getLanguage && LanguageManager.getLanguage()) || 'ar';
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

  function stageLabel(stageId, lang) {
    var translated = translate('journey.stages.' + stageId, null);
    if (translated) return translated;
    var entry = STAGE_LABELS[stageId];
    return entry ? entry[lang] : stageId;
  }

  /** Pick the focus appointment — mirror of mobile HomeScreen logic. */
  function pickFocusAppointment(appointments) {
    if (!appointments || !appointments.length) return null;
    var upcoming = appointments
      .filter(function (a) {
        return ['scheduled', 'confirmed', 'in_progress'].indexOf(a.status) !== -1;
      })
      .sort(function (a, b) {
        return new Date(a.appointment_date) - new Date(b.appointment_date);
      });
    if (upcoming.length) return upcoming[0];
    var completed = appointments
      .filter(function (a) { return a.status === 'completed'; })
      .sort(function (a, b) {
        return new Date(b.appointment_date) - new Date(a.appointment_date);
      });
    return completed.length ? completed[0] : null;
  }

  /**
   * THE single journey derivation per page load (integration contract):
   * journey-tracker, follow-up.js and care-summary.js all read the journey
   * through this memoized helper — the derivation runs once per distinct
   * focus appointment (per appointments payload reference), and every module
   * sees the SAME journey object. No module re-derives journey state.
   * @param {Array|Object|null} appointments
   * @returns {{cancelled: boolean, stages: Array<{id: string, state: string}>}}
   */
  var journeyCache = null;
  function journeyFor(appointments) {
    if (typeof window.SahatakJourney === 'undefined') return null;
    var apt = Array.isArray(appointments) ? pickFocusAppointment(appointments) : (appointments || null);
    if (journeyCache && journeyCache.apt === apt) return journeyCache.journey;
    var journey = window.SahatakJourney.deriveJourneyFromAppointment(apt);
    journeyCache = { apt: apt, journey: journey };
    return journey;
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  /**
   * Render the tracker into `container`.
   * @param {HTMLElement} container
   * @param {Array|Object|null} appointments - full list the page already fetched,
   *        or a single appointment object, or null for "no appointment".
   * @returns {boolean} true if rendered, false if container missing.
   */
  function render(container, appointments) {
    if (!container || typeof window.SahatakJourney === 'undefined') return false;

    var apt = Array.isArray(appointments) ? pickFocusAppointment(appointments) : (appointments || null);
    var journey = journeyFor(appointments); // single shared derivation — see journeyFor()
    var lang = currentLang();

    container.innerHTML = '';
    container.classList.add('cg-journey');
    container.setAttribute('data-journey-state', journey.cancelled ? 'cancelled' : 'active');

    // Cancelled — mirror the mobile tracker's minimal cancelled state.
    if (journey.cancelled) {
      container.appendChild(
        el('p', 'cg-journey-cancelled cg-text-soft',
          translate('journey.cancelled', 'This appointment was cancelled.'))
      );
      return true;
    }

    var stages = journey.stages;
    var currentStage = null;
    var completedCount = 0;
    stages.forEach(function (s) {
      if (s.state === 'current') currentStage = s;
      if (s.state === 'completed') completedCount += 1;
    });

    // Action stages exclude DISCOVER (mirror of mobile stepLabel logic):
    // BOOK, PREPARE, WAIT, CONSULT, COMPLETE, UNDERSTAND, FOLLOW_UP.
    var actionStages = stages.filter(function (s) { return s.id !== 'DISCOVER'; });
    var actionIdx = currentStage ? actionStages.findIndex(function (s) { return s.id === currentStage.id; }) : -1;
    var inAction = currentStage && currentStage.id !== 'DISCOVER';
    var stepLabel = inAction
      ? translate('journey.step_of', 'Step {x} of {n}')
          .replace('{x}', String(actionIdx + 1))
          .replace('{n}', String(actionStages.length))
      : translate('journey.get_started', 'Get started');
    var stageText = currentStage ? stageLabel(currentStage.id, lang) : '';
    var progress = stages.length ? completedCount / stages.length : 0;

    // ── Header: "Step X of N — STAGE" ──
    var header = el('div', 'cg-journey-header');
    header.setAttribute('role', 'text');
    header.appendChild(el('span', 'cg-journey-step', stepLabel));
    if (stageText) {
      header.appendChild(el('span', 'cg-journey-sep', '—'));
      header.appendChild(el('span', 'cg-journey-stage', stageText));
    }
    container.appendChild(header);

    // ── Progress bar (static fill — no animation by default; any transition is
    //    gated behind prefers-reduced-motion: no-preference in clinical-glass.css) ──
    var track = el('div', 'cg-journey-track');
    track.setAttribute('role', 'progressbar');
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', '100');
    track.setAttribute('aria-valuenow', String(Math.round(progress * 100)));
    track.setAttribute('aria-label', Math.round(progress * 100) + '%');
    var fill = el('div', 'cg-journey-fill');
    fill.style.width = (Math.max(progress, 0.04) * 100) + '%';
    track.appendChild(fill);
    container.appendChild(track);

    // ── Steps: one ordered list, styled as the compact strip on narrow
    //    viewports and the horizontal rail on desktop (CSS decides). Semantic
    //    <ol> keeps logical DOM order; CSS uses logical properties so RTL
    //    inherits the site's dir="rtl" handling with no manual flip. ──
    var list = el('ol', 'cg-journey-steps');
    stages.forEach(function (stage) {
      var li = el('li', 'cg-journey-step-item cg-journey-' + stage.state);
      if (stage.state === 'current') li.setAttribute('aria-current', 'step');
      var dot = el('span', 'cg-journey-dot');
      dot.setAttribute('aria-hidden', 'true');
      li.appendChild(dot);
      li.appendChild(el('span', 'cg-journey-step-label', stageLabel(stage.id, lang)));
      list.appendChild(li);
    });
    container.appendChild(list);
    return true;
  }

  /**
   * Convenience for pages: re-render into a container id with appointment data
   * the page already has in memory. Silently no-ops when the container or the
   * journey logic module is not present.
   */
  function refresh(containerId, appointments) {
    var container = document.getElementById(containerId || 'journey-tracker');
    if (!container) return false;
    return render(container, appointments);
  }

  window.SahatakJourneyTracker = {
    render: render,
    refresh: refresh,
    pickFocusAppointment: pickFocusAppointment,
    journeyFor: journeyFor,
  };
})();
