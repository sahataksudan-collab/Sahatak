/**
 * Care Summary — post-consultation "Understand" stage section (WEB PORT).
 * Mirrors sahatak-mobile/src/components/records/CareSummaryScreen.tsx:
 *   - IA order (fixed): Consultation Info → Doctor Info → Clinical Info →
 *     Prescription → Next Steps → Follow-Up.
 *   - Sections are collapsed by default with a "View details →" toggle.
 *
 * HARD RULE: only fields literally returned by the backend endpoints are
 * rendered — Diagnosis.to_dict (primary_diagnosis, clinical_findings,
 * treatment_plan, follow_up_required, follow_up_date, follow_up_notes,
 * diagnosis_date, doctor_name, appointment_id), ConsultationSession.to_dict
 * fields on the appointment (symptoms, follow_up_required, follow_up_date,
 * follow_up_notes) and Prescription endpoint items (medication_name, dosage,
 * frequency, duration, instructions). Nothing is generated, inferred, or
 * summarized.
 *
 * Journey rule (same as follow-up.js): reads window.SahatakJourney state —
 * never re-derives stage/eligibility here. The Follow-Up section embeds the
 * existing window.SahatakFollowUp action rather than duplicating its logic.
 *
 * All 11 mobile states are handled explicitly:
 *   1. completed (full data)      7. cancelled appointment
 *   2. notes pending              8. loading
 *   3. prescription available     9. API failure + retry
 *   4. no prescription           10. offline
 *   5. follow-up available       11. unauthorized
 *   6. follow-up unavailable
 * plus one graceful extra: no completed consultation yet → the section stays
 * empty (mirrors mobile, where the screen is only reachable from a completed
 * appointment's CTA).
 *
 * Data comes from two REAL endpoints that already exist in the backend:
 *   GET /ehr/diagnoses/patient/<user_id>   (MedicalRecordsAPI.getPatientDiagnoses)
 *   GET /prescriptions/                    (ApiHelper — PrescriptionsAPI swallows
 *                                           error kinds, and this UI must
 *                                           classify offline/401/failure)
 * Dual-mode like follow-up.js: browser script (window.SahatakCareSummary) +
 * CommonJS for the Node smoke test. Translations via LanguageManager with
 * EN/AR fallbacks.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SahatakCareSummary = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** EN/AR fallbacks — mirror of the mobile screen strings. */
  var STRINGS = {
    title: { en: 'Care Summary', ar: 'ملخص الرعاية' },
    loading: { en: 'Loading your care summary', ar: 'جارٍ تحميل ملخص الرعاية' },
    view_details: { en: 'View details', ar: 'عرض التفاصيل' },
    hide_details: { en: 'Hide details', ar: 'إخفاء التفاصيل' },
    offline_title: { en: 'You appear to be offline', ar: 'يبدو أنك غير متصل بالإنترنت' },
    offline_sub: { en: 'Your care summary will load once you are back online. Nothing was lost.', ar: 'سيتم تحميل ملخص الرعاية عند عودة الاتصال. لم يتم فقدان أي شيء.' },
    failure_title: { en: 'Something went wrong', ar: 'حدث خطأ ما' },
    failure_sub: { en: 'We could not load your care summary right now. Please try again.', ar: 'لم نتمكن من تحميل ملخص الرعاية الآن. حاول مرة أخرى.' },
    unauthorized_title: { en: 'You are not authorized to view this', ar: 'لا تملك صلاحية عرض هذا المحتوى' },
    unauthorized_sub: { en: 'Please sign in with your patient account to view your care summary.', ar: 'يرجى تسجيل الدخول بحسابك كمريض لعرض ملخص الرعاية.' },
    retry: { en: 'Try Again', ar: 'إعادة المحاولة' },
    cancelled: { en: 'This appointment was cancelled.', ar: 'تم إلغاء هذا الموعد.' },
    notes_pending: { en: 'Your consultation is complete. Your doctor hasn\'t added the notes yet.', ar: 'اكتملت استشارتك. لم يضف طبيبك الملاحظات بعد.' },
    sec_consultation: { en: 'Consultation Info', ar: 'معلومات الاستشارة' },
    sec_doctor: { en: 'Doctor Info', ar: 'معلومات الطبيب' },
    sec_clinical: { en: 'Clinical Info', ar: 'المعلومات الطبية' },
    sec_prescription: { en: 'Prescription', ar: 'الوصفة الطبية' },
    sec_next_steps: { en: 'Next Steps', ar: 'الخطوات التالية' },
    sec_follow_up: { en: 'Follow-Up', ar: 'المتابعة' },
    lbl_date: { en: 'Date', ar: 'التاريخ' },
    lbl_reason: { en: 'Reason for visit', ar: 'سبب الزيارة' },
    lbl_doctor: { en: 'Doctor', ar: 'الطبيب' },
    lbl_diagnosis: { en: 'Diagnosis', ar: 'التشخيص' },
    lbl_findings: { en: 'Clinical findings', ar: 'الفحوصات السريرية' },
    lbl_treatment: { en: 'Treatment plan', ar: 'خطة العلاج' },
    lbl_recorded: { en: 'Recorded on', ar: 'تاريخ التسجيل' },
    lbl_dosage: { en: 'Dosage', ar: 'الجرعة' },
    lbl_frequency: { en: 'Frequency', ar: 'التكرار' },
    lbl_duration: { en: 'Duration', ar: 'المدة' },
    lbl_instructions: { en: 'Instructions', ar: 'التعليمات' },
    lbl_recommended_date: { en: 'Recommended date', ar: 'التاريخ الموصى به' },
    lbl_doctor_note: { en: 'Doctor\'s note', ar: 'ملاحظة الطبيب' },
    not_provided: { en: 'Not provided', ar: 'غير محدد' },
    rx_none: { en: 'No prescription was added for this consultation.', ar: 'لم تتم إضافة وصفة طبية لهذه الاستشارة.' },
    rx_view_records: { en: 'View in Medical Records', ar: 'عرض في السجل الطبي' },
    next_steps_none: { en: 'Your doctor has not added any next steps yet.', ar: 'لم يضف طبيبك أي خطوات تالية بعد.' },
    fu_not_required: { en: 'Your doctor did not request a follow-up for this consultation.', ar: 'لم يطلب طبيبك موعد متابعة لهذه الاستشارة.' },
    fu_booked: { en: 'A follow-up is already booked with this doctor.', ar: 'لديك موعد متابعة محجوز بالفعل مع هذا الطبيب.' },
    items_count: { en: '{n} item(s)', ar: '{n} عنصر' },
    summary_none: { en: 'None', ar: 'لا يوجد' },
  };

  var MEDICAL_RECORDS_PAGE_URL = '../medical/patient/medicalHistory.html';

  function currentLang() {
    return (window.LanguageManager && LanguageManager.getLanguage && LanguageManager.getLanguage()) || 'en';
  }

  function translate(key) {
    try {
      if (window.LanguageManager && typeof LanguageManager.translate === 'function') {
        var value = LanguageManager.translate('care_summary.' + key);
        if (value && value !== 'care_summary.' + key) return value;
      }
    } catch (e) { /* fall through to fallback */ }
    var entry = STRINGS[key];
    return entry ? entry[currentLang()] : key;
  }

  function t(key) { return translate(key); }

  // ────────────────────────── pure logic (smoke-tested) ──────────────────────

  /**
   * Pick the diagnosis for this appointment — exact appointment_id match when
   * an appointment is given, else the most recent diagnosis (backend returns
   * newest first). Same rule as the mobile screen.
   * @returns {Object|null}
   */
  function pickDiagnosis(diagnoses, appointment) {
    if (!Array.isArray(diagnoses) || !diagnoses.length) return null;
    var appointmentId = appointment && (appointment.id != null ? appointment.id : appointment.appointment_id);
    if (appointmentId != null) {
      for (var i = 0; i < diagnoses.length; i++) {
        if (String(diagnoses[i].appointment_id == null ? '' : diagnoses[i].appointment_id) === String(appointmentId)) {
          return diagnoses[i];
        }
      }
    }
    return diagnoses[0];
  }

  /**
   * Pick prescriptions belonging to this appointment — by the prescription
   * item's appointment_id, else by the appointment's prescription_id.
   * Same rule as the mobile screen.
   * @returns {Array}
   */
  function pickPrescriptions(prescriptions, appointment) {
    if (!Array.isArray(prescriptions) || !appointment) return [];
    var appointmentId = appointment.id != null ? appointment.id : appointment.appointment_id;
    var rxId = appointment.prescription_id || appointment.prescriptionId;
    return prescriptions.filter(function (p) {
      if (appointmentId != null && p.appointment_id != null) {
        return String(p.appointment_id) === String(appointmentId);
      }
      return rxId != null && String(p.id) === String(rxId);
    });
  }

  /**
   * Derive the Care Summary display state from ALREADY-COMPUTED inputs.
   * Pure function — the smoke test drives this through all states.
   * Precedence mirrors the mobile screen:
   *   unauthorized → offline → failure → cancelled → notes pending → completed
   *
   * @param {{
   *   hasUser: boolean,
   *   errorKind: ('unauthorized'|'offline'|'failure'|null),
   *   journey: ({cancelled: boolean, stages: Array<{id: string, state: string}>}|null),
   *   diagnosis: Object|null,
   *   prescriptions: Array
   * }} input
   * @returns {('unauthorized'|'offline'|'failure'|'cancelled'|'notes_pending'|'completed')}
   */
  function deriveSummaryState(input) {
    if (!input) return 'failure';
    if (input.errorKind === 'unauthorized' || !input.hasUser) return 'unauthorized';
    if (input.errorKind === 'offline') return 'offline';
    if (input.errorKind === 'failure') return 'failure';
    if (input.journey && input.journey.cancelled) return 'cancelled';
    if (!input.diagnosis) return 'notes_pending';
    return 'completed';
  }

  /**
   * Follow-up sub-state from REAL backend flags + the journey stage state
   * (read, never re-derived):
   *   - follow-up flag not set anywhere → 'not_required'
   *   - flag set and journey FOLLOW_UP stage is 'completed' → 'booked'
   *   - flag set otherwise → 'available' (the embedded SahatakFollowUp action
   *     itself decides whether a CTA is actually shown, per journey stage)
   * @returns {('not_required'|'booked'|'available')}
   */
  function followUpState(diagnosis, appointment, journey) {
    var required = Boolean(
      (diagnosis && diagnosis.follow_up_required) ||
      (appointment && (appointment.follow_up_required || appointment.followUpRequired))
    );
    if (!required) return 'not_required';
    var fuState = journey && journey.stages
      ? journey.stages.filter(function (s) { return s.id === 'FOLLOW_UP'; })
          .map(function (s) { return s.state; })[0]
      : undefined;
    if (fuState === 'completed') return 'booked';
    return 'available';
  }

  /**
   * Classify a thrown ApiHelper error into the mobile screen's error kinds.
   * ApiHelper.makeRequest throws ApiError(message, status, ...) — 401/403 are
   * authorization problems, network failures carry no status, everything else
   * is a generic failure.
   * @returns {('unauthorized'|'offline'|'failure')}
   */
  function classifyError(err) {
    var status = err && (err.status != null ? err.status : err.statusCode);
    if (status === 401 || status === 403) return 'unauthorized';
    if (status == null && typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
    return 'failure';
  }

  // ────────────────────────────── data loading ───────────────────────────────

  /**
   * Fetch the two real endpoints in parallel and select the records for the
   * focus appointment. Throws ApiError (classification happens upstream).
   */
  async function loadSummaryData(userId, appointment) {
    var results = await Promise.all([
      window.MedicalRecordsAPI && window.MedicalRecordsAPI.getPatientDiagnoses
        ? window.MedicalRecordsAPI.getPatientDiagnoses(userId)
        : ApiHelper.makeRequest('/ehr/diagnoses/patient/' + userId).then(function (r) {
            return { success: true, data: (r.data && r.data.diagnoses) || [] };
          }),
      ApiHelper.makeRequest('/prescriptions/').then(function (r) {
        var data = r.data;
        return Array.isArray(data) ? data : ((data && data.prescriptions) || []);
      }),
    ]);
    var diagnoses = Array.isArray(results[0]) ? results[0] : (results[0].data || []);
    return {
      diagnosis: pickDiagnosis(diagnoses, appointment),
      prescriptions: pickPrescriptions(results[1], appointment),
    };
  }

  // ──────────────────────────────── rendering ────────────────────────────────

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  /** A label/value row — omitted entirely when the value is empty/missing. */
  function row(labelKey, value) {
    if (value == null || value === '') return null;
    var wrap = el('div', 'cg-care-row');
    wrap.appendChild(el('span', 'cg-care-row-label', t(labelKey)));
    wrap.appendChild(el('span', 'cg-care-row-value', String(value)));
    return wrap;
  }

  /** Collapsed-by-default section with a "View details →" disclosure button. */
  function section(id, titleKey, summaryText) {
    var card = el('section', 'cg-care-section');
    var header = el('button', 'cg-care-section-header');
    header.type = 'button';
    header.setAttribute('aria-expanded', 'false');
    header.setAttribute('aria-controls', 'cg-care-body-' + id);
    var textWrap = el('span', 'cg-care-section-text');
    textWrap.appendChild(el('span', 'cg-care-section-title', t(titleKey)));
    if (summaryText) textWrap.appendChild(el('span', 'cg-care-section-summary', summaryText));
    header.appendChild(textWrap);
    header.appendChild(el('span', 'cg-care-section-toggle', t('view_details')));

    var body = el('div', 'cg-care-section-body');
    body.id = 'cg-care-body-' + id;
    body.hidden = true;

    header.addEventListener('click', function () {
      var open = body.hidden;
      body.hidden = !open;
      header.setAttribute('aria-expanded', open ? 'true' : 'false');
      header.querySelector('.cg-care-section-toggle').textContent =
        t(open ? 'hide_details' : 'view_details');
      card.classList.toggle('cg-care-open', open);
    });

    card.appendChild(header);
    card.appendChild(body);
    return { card: card, body: body };
  }

  function renderStatePanel(container, titleKey, subKey, withRetry, retry) {
    var panel = el('div', 'cg-care-state');
    panel.setAttribute('role', 'status');
    panel.appendChild(el('p', 'cg-care-state-title', t(titleKey)));
    if (subKey) panel.appendChild(el('p', 'cg-care-state-sub', t(subKey)));
    if (withRetry) {
      var btn = el('button', 'cg-care-retry-btn', t('retry'));
      btn.type = 'button';
      btn.addEventListener('click', retry);
      panel.appendChild(btn);
    }
    container.appendChild(panel);
  }

  /**
   * Render the Care Summary into `container`.
   * @param {HTMLElement} container
   * @param {Array|Object|null} appointments - data the page already fetched
   *   (window.__patientAppointmentsCache on the dashboard). No new appointment
   *   API call; journey state is read via window.SahatakJourney.
   * @returns {boolean} true if anything was rendered.
   */
  function render(container, appointments) {
    if (!container || typeof window.SahatakJourney === 'undefined') return false;

    var user = (window.AuthGuard && AuthGuard.getCurrentUser && AuthGuard.getCurrentUser()) || null;
    var apt = Array.isArray(appointments) && window.SahatakJourneyTracker
      ? window.SahatakJourneyTracker.pickFocusAppointment(appointments)
      : (appointments || null);
    var journey = window.SahatakJourney.deriveJourneyFromAppointment(apt);
    var lang = currentLang();

    container.innerHTML = '';
    container.className = 'cg-care-summary';
    container.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');

    // Nothing to summarize before a consultation completes — mirrors mobile,
    // where the screen is only reachable from a completed appointment's CTA.
    var completeState = window.SahatakJourney.stageStateOf(journey, 'COMPLETE');
    if (!journey.cancelled && completeState !== 'completed') return false;

    var head = el('h5', 'cg-care-title', t('title'));
    head.id = 'cg-care-heading';
    container.setAttribute('aria-labelledby', 'cg-care-heading');
    container.appendChild(head);
    var bodyWrap = el('div', 'cg-care-body');
    container.appendChild(bodyWrap);

    // ── 11. unauthorized ──
    if (!user || user.id == null) {
      renderStatePanel(bodyWrap, 'unauthorized_title', 'unauthorized_sub', false, null);
      return true;
    }

    // ── 8. loading — Smart Skeleton (shared window.SahatakSkeleton), shape-
    //    matched to the IA order rendered below (Consultation Info → Doctor
    //    Info → Clinical Info → Prescription → Next Steps → Follow-Up).
    //    Shimmer/reduced-motion/a11y contract lives in the skeleton module;
    //    failure paths (9/10/11) render friendly error + retry — never an
    //    indefinite skeleton. Fallback keeps the old static label only if the
    //    shared module failed to load.
    if (window.SahatakSkeleton) {
      window.SahatakSkeleton.render(bodyWrap, 'care_summary', { label: t('loading') });
    } else {
      bodyWrap.appendChild(el('p', 'cg-care-loading', t('loading')));
    }

    function attempt() { render(container, appointments); }

    loadSummaryData(user.id, apt).then(function (data) {
      if (!container.isConnected) return;
      if (window.SahatakSkeleton) window.SahatakSkeleton.clear(container);
      container.innerHTML = '';
      container.className = 'cg-care-summary';
      container.appendChild(head);
      var wrap = el('div', 'cg-care-body');
      container.appendChild(wrap);

      var state = deriveSummaryState({
        hasUser: true,
        errorKind: null,
        journey: journey,
        diagnosis: data.diagnosis,
        prescriptions: data.prescriptions,
      });

      // ── 7. cancelled ──
      if (state === 'cancelled') {
        renderStatePanel(wrap, 'cancelled', null, false, null);
        return;
      }
      // ── 2. notes pending ──
      if (state === 'notes_pending') {
        renderStatePanel(wrap, 'notes_pending', null, false, null);
        return;
      }

      var diagnosis = data.diagnosis;

      // ── Consultation Info (real ConsultationSession fields only) ──
      var consultation = section('consultation', 'sec_consultation', null);
      var cRows = [
        row('lbl_date', apt && apt.appointment_date ? String(apt.appointment_date).slice(0, 10) : ''),
        row('lbl_reason', apt && (apt.symptoms || apt.reason)),
      ].filter(Boolean);
      if (cRows.length) cRows.forEach(function (r) { consultation.body.appendChild(r); });
      else consultation.body.appendChild(el('p', 'cg-care-empty', t('not_provided')));
      wrap.appendChild(consultation.card);

      // ── Doctor Info (Diagnosis.to_dict doctor_name — real field only) ──
      var doctor = section('doctor', 'sec_doctor', null);
      var dRow = row('lbl_doctor', diagnosis.doctor_name || (apt && apt.doctor_name));
      if (dRow) doctor.body.appendChild(dRow);
      else doctor.body.appendChild(el('p', 'cg-care-empty', t('not_provided')));
      wrap.appendChild(doctor.card);

          // ── Clinical Info (Diagnosis.to_dict only) ──
      var clinical = section('clinical', 'sec_clinical', diagnosis.primary_diagnosis || null);
      [
        row('lbl_diagnosis', diagnosis.primary_diagnosis),
        row('lbl_findings', diagnosis.clinical_findings),
        row('lbl_treatment', diagnosis.treatment_plan),
        row('lbl_recorded', diagnosis.diagnosis_date ? String(diagnosis.diagnosis_date).slice(0, 10) : ''),
      ].forEach(function (r) { if (r) clinical.body.appendChild(r); });
      wrap.appendChild(clinical.card);

      // ── Prescription (3/4 states: available / none) ──
      var prescriptions = data.prescriptions;
      var hasRx = prescriptions.length > 0 || Boolean(diagnosis.prescription);
      var rxSummary = hasRx
        ? t('items_count').replace('{n}', String(prescriptions.length || 1))
        : t('summary_none');
      var rx = section('prescription', 'sec_prescription', rxSummary);
      if (hasRx) {
        prescriptions.forEach(function (p) {
          var item = el('div', 'cg-care-rx-item');
          item.appendChild(el('p', 'cg-care-rx-name', p.medication_name || ''));
          [
            ['lbl_dosage', p.dosage],
            ['lbl_frequency', p.frequency],
            ['lbl_duration', p.duration],
            ['lbl_instructions', p.instructions],
          ].forEach(function (pair) {
            if (pair[1]) item.appendChild(el('p', 'cg-care-rx-line', t(pair[0]) + ': ' + pair[1]));
          });
          rx.body.appendChild(item);
        });
        if (!prescriptions.length && diagnosis.prescription) {
          rx.body.appendChild(el('p', 'cg-care-body-text', String(diagnosis.prescription)));
        }
        var recordsLink = el('a', 'cg-care-inline-btn', t('rx_view_records'));
        recordsLink.href = MEDICAL_RECORDS_PAGE_URL;
        rx.body.appendChild(recordsLink);
      } else {
        // ── 4. no prescription ──
        rx.body.appendChild(el('p', 'cg-care-empty', t('rx_none')));
      }
      wrap.appendChild(rx.card);

      // ── Next Steps (treatment_plan / clinical_findings only) ──
      var steps = section('next_steps', 'sec_next_steps', null);
      var plan = diagnosis.treatment_plan || diagnosis.clinical_findings;
      steps.body.appendChild(plan
        ? el('p', 'cg-care-body-text', String(plan))
        : el('p', 'cg-care-empty', t('next_steps_none')));
      wrap.appendChild(steps.card);

      // ── Follow-Up (5/6 states; real flags + journey state) ──
      var fu = section('follow_up', 'sec_follow_up', null);
      var fuRequired = Boolean(diagnosis.follow_up_required ||
        (apt && (apt.follow_up_required || apt.followUpRequired)));
      var fuDate = diagnosis.follow_up_date ||
        (apt && (apt.follow_up_date || apt.followUpDate)) || null;
      var fuNotes = diagnosis.follow_up_notes ||
        (apt && (apt.follow_up_notes || apt.followUpNotes)) || null;

      if (fuRequired) {
        var dateRow = row('lbl_recommended_date', fuDate ? String(fuDate).slice(0, 10) : '');
        if (dateRow) fu.body.appendChild(dateRow);
        var noteRow = row('lbl_doctor_note', fuNotes);
        if (noteRow) fu.body.appendChild(noteRow);

        var fuState = followUpState(diagnosis, apt, journey);
        if (fuState === 'booked') {
          // journey FOLLOW_UP stage completed → follow-up already booked
          fu.body.appendChild(el('p', 'cg-care-empty', t('fu_booked')));
        } else {
          // ── 5. follow-up available: embed the EXISTING One-Tap Follow-Up
          //      action — reuse, never duplicate its journey logic. It renders
          //      nothing when the journey stage says no CTA applies. ──
          var actionsHost = el('div', 'cg-care-followup-actions');
          fu.body.appendChild(actionsHost);
          if (window.SahatakFollowUp) {
            window.SahatakFollowUp.render(actionsHost, apt || appointments || null);
          }
          if (!actionsHost.hasChildNodes()) {
            actionsHost.appendChild(el('p', 'cg-care-empty', t('fu_not_required')));
          }
        }
      } else {
        // ── 6. follow-up unavailable (not requested) ──
        fu.body.appendChild(el('p', 'cg-care-empty', t('fu_not_required')));
      }
      wrap.appendChild(fu.card);
    }).catch(function (err) {
      if (!container.isConnected) return;
      if (window.SahatakSkeleton) window.SahatakSkeleton.clear(container);
      var kind = classifyError(err);
      container.innerHTML = '';
      container.className = 'cg-care-summary';
      container.appendChild(head);
      var wrap = el('div', 'cg-care-body');
      container.appendChild(wrap);
      // ── 10. offline / 9. failure + retry / 11. unauthorized ──
      renderStatePanel(
        wrap,
        kind === 'offline' ? 'offline_title'
          : (kind === 'unauthorized' ? 'unauthorized_title' : 'failure_title'),
        kind === 'offline' ? 'offline_sub'
          : (kind === 'unauthorized' ? 'unauthorized_sub' : 'failure_sub'),
        kind !== 'unauthorized',
        attempt
      );
    });

    return true;
  }

  /**
   * Convenience for pages: render into a container id with appointment data
   * the page already has in memory. No-ops when the container or journey
   * modules are not present.
   */
  function refresh(containerId, appointments) {
    var container = document.getElementById(containerId || 'care-summary');
    if (!container) return false;
    return render(container, appointments);
  }

  return {
    pickDiagnosis: pickDiagnosis,
    pickPrescriptions: pickPrescriptions,
    deriveSummaryState: deriveSummaryState,
    followUpState: followUpState,
    classifyError: classifyError,
    render: render,
    refresh: refresh,
  };




});
