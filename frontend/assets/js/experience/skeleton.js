/**
 * Smart Skeletons — shared web loading-state primitives (SITE-WIDE).
 * Web port of sahatak-mobile/src/components/ui/Skeleton.tsx (same contract):
 *   - Shape-matched blocks: `blocksFor(contentType)` returns block specs that
 *     approximate the real content's dimensions per surface (card skeleton for
 *     dashboard cards, line skeletons for text, pill cells for the availability
 *     grid, IA-ordered section blocks for the Care Summary). Fixed dimensions —
 *     nothing shifts when the real content arrives.
 *   - Motion: shimmer ONLY under @media (prefers-reduced-motion: no-preference)
 *     (CSS side, in clinical-glass.css). Reduced motion → static tint.
 *   - Accessibility: aria-busy="true" on the loading container, ONE polite
 *     status announcement per region — never per skeleton block (blocks are
 *     aria-hidden and pointer-events: none).
 *   - Failure path: `renderError()` → friendly error + retry. NEVER leave a
 *     skeleton showing indefinitely. Error classification reuses the exact
 *     pattern care-summary.js's classifyError() established (offline /
 *     unauthorized / failure) instead of inventing a new one.
 *
 * Consolidates the two legacy duplicated CSS implementations (`.skeleton` in
 * comm-hub.css and `.loading-skeleton` in dashboard.css — both were unused)
 * onto ONE cg-skeleton section in clinical-glass.css.
 *
 * Dual-mode like journey.js/follow-up.js/care-summary.js: browser script
 * (window.SahatakSkeleton) + CommonJS for the Node smoke test. Translations
 * via LanguageManager with EN/AR fallbacks (skeleton.* keys in locales).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SahatakSkeleton = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** EN/AR fallbacks — mirror of the locale file strings. */
  var STRINGS = {
    loading: { en: 'Loading…', ar: 'جارٍ التحميل…' },
    error_title: { en: 'Something went wrong', ar: 'حدث خطأ ما' },
    error_sub: { en: 'We could not load this section right now. Please try again.', ar: 'لم نتمكن من تحميل هذا القسم الآن. حاول مرة أخرى.' },
    offline_title: { en: 'You appear to be offline', ar: 'يبدو أنك غير متصل بالإنترنت' },
    offline_sub: { en: 'This section will load once you are back online. Please try again.', ar: 'سيتم تحميل هذا القسم عند عودة الاتصال. حاول مرة أخرى.' },
    retry: { en: 'Try Again', ar: 'إعادة المحاولة' },
  };

  // ────────────────────────── pure logic (smoke-tested) ──────────────────────

  /**
   * True when the user prefers reduced motion. Mirrors the mobile
   * AccessibilityInfo.isReduceMotionEnabled check; in Node (no matchMedia)
   * this reports false so the default (shimmer) branch stays testable.
   * @returns {boolean}
   */
  function reducedMotion() {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    try {
      return Boolean(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) {
      return false;
    }
  }

  /**
   * True when Calm Mode's simplified_layout sub-toggle is on. READ-ONLY:
   * the skeleton never owns or duplicates Calm Mode's state — it reads
   * window.SahatakCalmMode's cache (the same source calm-mode.apply()
   * mirrors onto the cg-calm-simplified body class), falling back to the
   * body class the CSS contract already uses. False in Node / when the
   * module is absent, so the default (full) variant stays testable.
   * @returns {boolean}
   */
  function calmSimplified() {
    if (typeof window === 'undefined') return false;
    var cm = window.SahatakCalmMode;
    if (cm && typeof cm.readCache === 'function') {
      try {
        var cached = cm.readCache();
        if (cached) return Boolean(cached.simplified_layout);
      } catch (e) { /* fall through to the body-class hook */ }
    }
    try {
      return Boolean(document.body && document.body.classList &&
        document.body.classList.contains('cg-calm-simplified'));
    } catch (e) { return false; }
  }

  /**
   * Classify a thrown ApiHelper error into the SAME three kinds the Care
   * Summary established (401/403 → unauthorized; no status + navigator.onLine
   * false → offline; everything else → failure). Kept in lockstep with
   * care-summary.js's classifyError — asserted equal by the smoke test.
   * @returns {('unauthorized'|'offline'|'failure')}
   */
  function classifyError(err) {
    var status = err && (err.status != null ? err.status : err.statusCode);
    if (status === 401 || status === 403) return 'unauthorized';
    if (status == null && typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
    return 'failure';
  }

  /**
   * Shape-matched block specs per content type — the ONE place that knows
   * what each loading surface approximates. Pure function; every spec carries
   * FIXED dimensions so the real content never shifts layout on arrival.
   *
   * Spec shape: { variant: 'line'|'avatar'|'cell', width: <css size>,
   *               height: <css size>, radius: <css size> }
   * Widths on lines are percentages of the region (like mobile's 85%/60%).
   *
   * @param {('card'|'line'|'list'|'grid'|'records'|'care_summary')} contentType
   * @param {{count?: number, simplified?: boolean}} [opts]
   *        `simplified` is set by render() from Calm Mode's simplified_layout
   *        sub-toggle (read-only via calmSimplified()); when true each card
   *        skeleton renders its REDUCED variant — fewer decorative blocks per
   *        card — while keeping the same shape (nothing shifts on arrival).
   * @returns {Array<Object>} block specs in visual order.
   */
  function blocksFor(contentType, opts) {
    var simplified = Boolean(opts && opts.simplified);
    switch (contentType) {
      // One dashboard/appointment card: avatar + two text lines (mirrors the
      // mobile SkeletonCard: 56px avatar, 85% + 60% lines). Simplified (Calm
      // Mode) → avatar + ONE line (fewer decorative blocks, same footprint).
      case 'card': {
        var card = [
          { variant: 'avatar', width: '3rem', height: '3rem', radius: '16px' },
          { variant: 'line', width: '85%', height: '0.75rem', radius: '7px' },
        ];
        if (!simplified) {
          card.push({ variant: 'line', width: '60%', height: '0.75rem', radius: '7px' });
        }
        return [{ variant: 'card', blocks: card }];
      }
      // A single text line.
      case 'line':
        return [{ variant: 'line', width: '100%', height: '0.85rem', radius: '7px' }];
      // A vertical list of cards (doctor list, appointment cards).
      case 'list': {
        var list = [];
        var ln = opts && opts.count ? opts.count : 3;
        for (var li = 0; li < ln; li++) list.push(blocksFor('card')[0]);
        return list;
      }
      // Availability grid: a wrapping row of slot pills.
      case 'grid': {
        var cells = [];
        var gn = opts && opts.count ? opts.count : 6;
        for (var gi = 0; gi < gn; gi++) {
          cells.push({ variant: 'cell', width: '6.5rem', height: '2.25rem', radius: '999px' });
        }
        return cells;
      }
      // Records summary: alternating stat lines (label/value rhythm).
      case 'records': {
        var rows = [];
        var rn = opts && opts.count ? opts.count : 3;
        for (var ri = 0; ri < rn; ri++) {
          rows.push({ variant: 'line', width: ri % 2 ? '70%' : '90%', height: '0.85rem', radius: '7px' });
        }
        return rows;
      }
      // Care Summary: one shape-matched section card per IA section, in the
      // fixed order — Consultation Info → Doctor Info → Clinical Info →
      // Prescription → Next Steps → Follow-Up (6 sections, mirroring
      // care-summary.js's render() IA order). Each approximates the collapsed
      // section card: header line + one body line. Simplified (Calm Mode) →
      // header line only per section (fewer decorative blocks, same order).
      case 'care_summary': {
        var sections = [];
        var sn = opts && opts.count ? opts.count : 6;
        for (var si = 0; si < sn; si++) {
          var sec = [
            { variant: 'line', width: '45%', height: '0.8rem', radius: '7px' },
          ];
          if (!simplified) {
            sec.push({ variant: 'line', width: si % 2 ? '60%' : '85%', height: '0.75rem', radius: '7px' });
          }
          sections.push({ variant: 'card', blocks: sec });
        }
        return sections;
      }
      default:
        return blocksFor('line');
    }
  }

  // ─────────────────────────────── rendering ────────────────────────────────

  function currentLang() {
    return (window.LanguageManager && window.LanguageManager.getLanguage &&
      window.LanguageManager.getLanguage()) || 'en';
  }

  function translate(key) {
    try {
      if (window.LanguageManager && typeof window.LanguageManager.translate === 'function') {
        var value = window.LanguageManager.translate('skeleton.' + key);
        if (value && value !== 'skeleton.' + key) return value;
      }
    } catch (e) { /* fall through to fallback */ }
    var entry = STRINGS[key];
    return entry ? entry[currentLang()] : key;
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function applySpec(node, spec) {
    node.classList.add('cg-skeleton-' + spec.variant);
    if (spec.width) node.style.inlineSize = spec.width;
    if (spec.height) node.style.blockSize = spec.height;
    if (spec.radius) node.style.borderRadius = spec.radius;
    return node;
  }

  function buildBlock(spec) {
    if (spec.variant === 'card') {
      var card = el('div', 'cg-skeleton-card');
      var body = el('div', 'cg-skeleton-card-body');
      (spec.blocks || []).forEach(function (child) {
        if (child.variant === 'avatar') card.appendChild(buildBlock(child));
        else body.appendChild(buildBlock(child));
      });
      if (body.hasChildNodes()) card.appendChild(body);
      return card;
    }
    return applySpec(el('div', 'cg-skeleton-block'), spec);
  }

  /**
   * Render skeleton blocks for `contentType` into `container`.
   * Marks the container aria-busy and adds ONE polite status announcement
   * for the whole region (never one per block).
   * @param {HTMLElement} container
   * @param {string} contentType - see blocksFor().
   * @param {{count?: number, label?: string, simplified?: boolean}} [opts]
   *        `opts.simplified` overrides; otherwise Calm Mode's simplified_layout
   *        sub-toggle decides (read-only — see calmSimplified()).
   * @returns {boolean} true if the skeleton was rendered.
   */
  function render(container, contentType, opts) {
    if (!container) return false;
    container.innerHTML = '';
    container.setAttribute('aria-busy', 'true');

    var region = el('div', 'cg-skeleton-region');
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    region.setAttribute('aria-label', (opts && opts.label) || translate('loading'));

    var specOpts = opts || {};
    if (typeof specOpts.simplified !== 'boolean') {
      specOpts.simplified = calmSimplified();
    }
    blocksFor(contentType, specOpts).forEach(function (spec) {
      var block = buildBlock(spec);
      block.setAttribute('aria-hidden', 'true');
      region.appendChild(block);
    });

    // Reduced motion → static tint (CSS media query is authoritative; the
    // class is an extra hook for forced-static contexts like the test page).
    if (reducedMotion()) region.classList.add('cg-skeleton-static');

    container.appendChild(region);
    return true;
  }

  /**
   * Friendly error + retry. Reuses care-summary.js's established state-panel
   * pattern (role=status, title, sub, retry button) — never leaves a skeleton
   * showing indefinitely.
   * @param {HTMLElement} container
   * @param {Error|{status?: number}|('unauthorized'|'offline'|'failure')} errOrKind
   * @param {Function} [retry] - click handler for the retry button.
   * @returns {boolean}
   */
  function renderError(container, errOrKind, retry) {
    if (!container) return false;
    container.innerHTML = '';
    container.removeAttribute('aria-busy');

    var kind = typeof errOrKind === 'string' ? errOrKind : classifyError(errOrKind);
    var panel = el('div', 'cg-care-state');
    panel.setAttribute('role', 'status');
    panel.appendChild(el('p', 'cg-care-state-title',
      translate(kind === 'offline' ? 'offline_title' : 'error_title')));
    panel.appendChild(el('p', 'cg-care-state-sub',
      translate(kind === 'offline' ? 'offline_sub' : 'error_sub')));
    if (typeof retry === 'function') {
      var btn = el('button', 'cg-care-retry-btn cg-skeleton-retry-btn', translate('retry'));
      btn.type = 'button';
      btn.addEventListener('click', retry);
      panel.appendChild(btn);
    }
    container.appendChild(panel);
    return true;
  }

  /** Clear the loading state (aria-busy + any skeleton region) from a container. */
  function clear(container) {
    if (!container) return false;
    container.removeAttribute('aria-busy');
    var region = container.querySelector('.cg-skeleton-region');
    if (region && region.parentNode === container) {
      region.parentNode.removeChild(region);
    }
    return true;
  }

  return {
    STRINGS: STRINGS,
    reducedMotion: reducedMotion,
    calmSimplified: calmSimplified,
    classifyError: classifyError,
    blocksFor: blocksFor,
    render: render,
    renderError: renderError,
    clear: clear,
  };
});
