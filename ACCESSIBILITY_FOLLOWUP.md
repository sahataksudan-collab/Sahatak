# Accessibility Follow-up Log

Tracked accessibility items that span multiple pages/batches. Kept out of the
per-batch commits so nothing is lost between reviews. Batch numbering follows
the Clinical Glass rollout commits (Batch 1 = 1101588 … Batch 5 = cf1e937).

---

## Item A1 — `#6c757d` / `.text-muted` borderline-pass muted text (TRACKED, open)

**Status:** Open — keep checking every remaining batch.
**Severity:** Borderline. `#6c757d` on white is 4.48:1 — technically *fails*
AA (4.5:1) for normal text by a hair, and clearly fails on any tinted
background. Fix pattern when we take the batch: swap muted text to
`--cg-text-soft` (#475569, ≥ 6.2:1 on any glass surface) or equivalent.

Occurrences found so far (inline styles and page CSS, all using the raw hex):

- `frontend/assets/css/main.css:1008` — `.footer .text-muted`
- `frontend/assets/css/components/appointments.css:157,227,538,829`
- `frontend/assets/css/components/availability.css:29,174,242,312`
- `frontend/assets/css/components/ehr.css:1020`
- `frontend/assets/css/components/messaging.css:439,466`
- `frontend/assets/js/components/calendar-widget.js:338` (injected CSS)
- `frontend/assets/js/components/ehr-manager.js:325` (inline badge color)
- `frontend/pages/appointments/video-consultation.html:227,281`
- **Batch 6 additions:**
  - `frontend/pages/common/support.html` — `.support-note` and `.support-phone-note` (two raw `#6c757d` declarations)
  - `frontend/pages/common/services.html` — placeholder color rule in the inline `<style>`
  - `frontend/pages/reset-password.html` — `.password-requirements`
  - `frontend/pages/common/about.html` — `.text-muted` overridden to `rgba(6,42,67,0.66)` (≈ 4.5:1 on white, same borderline class of issue; verify when styling)

## Item A2 — `btn-outline-warning` low contrast (~1.9:1) (TRACKED, open)

**Status:** Open — dedicated accessibility batch, NOT yet scheduled.
**Severity:** Fails AA badly (≈ 1.9:1); affects icon-only and text buttons.

**Key observation (added per review of Batch 5):** this looks like ONE shared
class definition, not per-page bugs. `btn-outline-warning` comes from the
Bootstrap warning token, possibly re-mapped in the shared stylesheets. When we
reach the dedicated accessibility batch:

1. First check the **shared class/definition** (Bootstrap override in
   `main.css` / `dashboard.css` / component CSS rather than page-level rules).
2. If one shared definition is the cause, **fix it once** and verify it
   resolves ALL occurrences — do not patch each page individually.

Known occurrences to verify against the single fix (add new ones here under
this same item instead of opening separate entries):

- `frontend/pages/admin/admin.html:369,419` (admin filters / verification tabs)
- `frontend/pages/appointments/appointment-list.html:729` (reschedule button)
- `frontend/assets/js/components/video-consultation.js:1592` (audio-only fallback button)
- `frontend/assets/js/admin.js:600` (change-password icon button)
- `frontend/pages/dashboard/doctor.html:258`
- `frontend/pages/dashboard/patient.html:1360`
- `frontend/pages/medical/patient/prescriptions.html:628`

No `btn-outline-warning` occurrences exist in Batch 6 pages.

---

## Batch 6 notes (Common/auth pages)

- `maintenance.html` originally had **zero existing CSS links** (Bootstrap CDN
  + inline `<style>` only, no `main.css`, no `dashboard-container` layout —
  standalone centered white card over a purple gradient). Layout pattern was
  flagged to the owner before styling, per process. **Decision (owner): keep
  the purple gradient canvas, glass card only.** Applied as:
  `clinical-glass.css` linked last + `.cg-glass` on `.maintenance-container`,
  with the required cg-* custom properties declared locally on the container
  (page opts out of `.cg-page`, so `.cg-page`'s variable scope is unavailable;
  values mirror clinical-glass.css exactly). No changes to shared CSS.
- `verify-email.html` line ~101 has a pre-existing stray `1` after the
  `email-verification.js` script tag (`</script>1`) that renders a stray "1"
  in the page. Flagged; not fixed in the visual-only batch.
- New occurrences for Item A1 logged above from support/services/reset pages.

## Item R1 — Stray `1` rendered in verify-email.html (TRACKED, open — rendering bug, not WCAG)

**Status:** Open — logged only. Do NOT fix during the Clinical Glass redesign
batches; this is a rendering bug, not an accessibility/contrast item.
**Location:** `frontend/pages/verify-email.html:101` — a stray `1` immediately
after the `email-verification.js` script tag (`</script>1`) which renders a
literal "1" at the end of the page body.
**Nature:** Pre-existing typo/debris in the markup, unrelated to the Clinical
Glass rollout (present before Batch 6; only the stylesheet link/`cg-glass`
class were added there).
**Fix pattern (when scheduled):** delete the trailing `1` on line 101 —
one-character change, no other file affected.

