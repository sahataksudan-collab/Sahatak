/**
 * Calm Mode — shared web UI-preferences system (SITE-WIDE).
 * Web port of sahatak-mobile's calmUi (src/api/userSettings.ts +
 * AppContext.tsx + ProfileScreen.tsx — same contract, same set of toggles):
 *
 *   - ONE master "Calm Mode" toggle + FOUR sub-toggles:
 *     reduce_animations / reduce_clutter / reduce_notifications /
 *     simplified_layout. No new sub-toggles are invented; the set is the
 *     mobile set verbatim.
 *   - Zero schema change: stored INSIDE the existing
 *     `notification_preferences` JSON under a `ui` key and persisted via the
 *     existing GET/PUT /api/user-settings/patient/preferences endpoint
 *     (main.js already wires both — same endpoint mobile uses).
 *   - Cached locally (localStorage, key `sahatak_calm_ui`) for instant apply,
 *     then synced with the backend on load — same pattern as mobile's
 *     AsyncStorage cache.
 *   - Visual effect: classes on the cg- token root (.cg-page and body):
 *       cg-calm              master flag (informational hook)
 *       cg-calm-anim         reduce animations (decorative shimmer/transitions only)
 *       cg-calm-clutter      reduce clutter (decorative mesh blobs)
 *       cg-calm-notif        hide NON-ESSENTIAL unread badge dots only
 *       cg-calm-simplified   simplified layout (data-calm="decorative" hidden)
 *     Never hides or delays medical info, appointment status, critical
 *     notifications, security warnings, or primary navigation.
 *   - Reduced motion: reuses skeleton.js's established reducedMotion()
 *     detection (same prefers-reduced-motion contract) when available.
 *
 * Dual-mode like journey.js/follow-up.js/care-summary.js/skeleton.js:
 * browser script (window.SahatakCalmMode) + CommonJS for the Node smoke test.
 * Translations via LanguageManager with EN/AR fallbacks (calm_mode.* keys in
 * locales, EN/AR-matched).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SahatakCalmMode = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** EN/AR fallbacks — mirror of the locale file strings. */
  var STRINGS = {
    title: { en: 'Calm Mode', ar: 'الوضع الهادئ' },
    master_hint: { en: 'A quieter, simpler app experience.', ar: 'تجربة تطبيق أهدأ وأبسط.' },
    reduce_animations: { en: 'Reduce animations', ar: 'تقليل الحركات' },
    reduce_clutter: { en: 'Reduce clutter', ar: 'تقليل التكدس' },
    reduce_notifications: { en: 'Reduce non-essential notifications', ar: 'تقليل الإشعارات غير الضرورية' },
    simplified_layout: { en: 'Simplified layout', ar: 'تصميم مبسّط' },
    note: {
      en: 'Calm Mode never hides medical information, appointment status, or urgent notifications.',
      ar: 'لا يخفي الوضع الهادئ أبداً المعلومات الطبية أو حالة المواعيد أو الإشعارات العاجلة.',
    },
    save_failed: { en: 'Could not save Calm Mode preferences.', ar: 'تعذر حفظ تفضيلات الوضع الهادئ.' },
  };

  var STORAGE_KEY = 'sahatak_calm_ui';

  var DEFAULT_CALM_UI_PREFS = {
    calm_mode: false,
    reduce_animations: false,
    reduce_clutter: false,
    reduce_notifications: false,
    simplified_layout: false,
  };

  var SUB_TOGGLE_KEYS = [
    'reduce_animations',
    'reduce_clutter',
    'reduce_notifications',
    'simplified_layout',
  ];

  /**
   * Body class per sub-toggle — the ONLY effect pathway (CSS in
   * clinical-glass.css reads these; every selector it targets is decorative).
   */
  var CLASS_FOR_KEY = {
    calm_mode: 'cg-calm',
    reduce_animations: 'cg-calm-anim',
    reduce_clutter: 'cg-calm-clutter',
    reduce_notifications: 'cg-calm-notif',
    simplified_layout: 'cg-calm-simplified',
  };

  /**
   * Which DECORATIVE element groups each sub-toggle suppresses. Pure mapping
   * (smoke-tested); the actual hiding lives in clinical-glass.css and never
   * touches medical content, appointment status, critical notifications,
   * security warnings, or primary navigation.
   */
  var SUPPRESSED_FOR_KEY = {
    reduce_animations: [
      'skeleton shimmer (::after) on .cg-skeleton-block/.cg-skeleton-avatar',
      'hover lift/transform on .cg-glass-lift and .cg-icon-badge',
      'journey progress-fill transition (static width instead)',
    ],
    reduce_clutter: [
      'decorative mesh gradient blobs (.cg-page::before)',
    ],
    reduce_notifications: [
      'non-essential unread badge dots (.notification-badge, [data-calm="notif-badge"])',
    ],
    simplified_layout: [
      'purely decorative elements marked data-calm="decorative"',
      'decorative mesh gradient blobs (.cg-page::before)',
      'skeleton loading blocks reduced to the fewer-decorative-blocks variant (skeleton.js reads this toggle read-only via SahatakCalmMode.readCache / the cg-calm-simplified class — skeleton state is never owned here)',
    ],
  };

  // ────────────────────────── pure logic (smoke-tested) ──────────────────────

  /**
   * Normalize any partial/raw calm-UI object into the full 5-key boolean set.
   * Mirrors mobile's extractCalmUiPrefs (Boolean() coercion of each key).
   */
  function normalizeCalmUi(raw) {
    var ui = (raw && typeof raw === 'object') ? raw : {};
    var out = {};
    Object.keys(DEFAULT_CALM_UI_PREFS).forEach(function (k) {
      out[k] = Boolean(ui[k]);
    });
    return out;
  }

  /**
   * Extract the `ui` calm-mode object from a /user-settings/patient/preferences
   * response body safely.
   */
  function extractFromPreferences(preferences) {
    var np = (preferences && preferences.notification_preferences) || {};
    var ui = np.ui || {};
    return normalizeCalmUi(ui);
  }

  /**
   * Merge a calm-UI object into the existing notification_preferences payload
   * WITHOUT disturbing any other keys — the exact PUT body mobile sends.
   */
  function mergeIntoNotificationPreferences(currentNotificationPreferences, ui) {
    var merged = {};
    var cur = (currentNotificationPreferences && typeof currentNotificationPreferences === 'object')
      ? currentNotificationPreferences : {};
    Object.keys(cur).forEach(function (k) { merged[k] = cur[k]; });
    merged.ui = normalizeCalmUi(ui);
    return merged;
  }

  /** Merge a partial update onto the current prefs (mobile setCalmUi merge). */
  function mergePrefs(current, partial) {
    var next = normalizeCalmUi(current);
    var p = (partial && typeof partial === 'object') ? partial : {};
    Object.keys(DEFAULT_CALM_UI_PREFS).forEach(function (k) {
      if (typeof p[k] !== 'undefined') next[k] = Boolean(p[k]);
    });
    return next;
  }

  /** Sub-toggles are only operable while the master toggle is on (mobile UX). */
  function subTogglesEnabled(prefs) {
    return Boolean(prefs && prefs.calm_mode);
  }

  /**
   * Which body classes a prefs object activates. Sub-toggles apply
   * independently (same semantics as mobile, where Header/HomeScreen read the
   * sub-flag directly); the master flag adds the informational cg-calm hook.
   */
  function classesFor(prefs) {
    var p = normalizeCalmUi(prefs);
    var classes = [];
    Object.keys(CLASS_FOR_KEY).forEach(function (k) {
      if (p[k]) classes.push(CLASS_FOR_KEY[k]);
    });
    return classes;
  }

  /**
   * Decorative element groups suppressed under a prefs combination. Pure
   * function — mirrors what clinical-glass.css implements for each class.
   * @returns {Array<{key: string, suppressed: string[]}>} entries only for
   *          ACTIVE sub-toggles, in SUB_TOGGLE_KEYS order.
   */
  function suppressedFor(prefs) {
    var p = normalizeCalmUi(prefs);
    return SUB_TOGGLE_KEYS
      .filter(function (k) { return p[k]; })
      .map(function (k) { return { key: k, suppressed: SUPPRESSED_FOR_KEY[k].slice() }; });
  }

  /**
   * True when the user prefers reduced motion. Reuses skeleton.js's
   * established detection rather than reimplementing it; falls back to the
   * same matchMedia contract if the skeleton module isn't loaded.
   */
  function reducedMotion() {
    var owner = (typeof self !== 'undefined') ? self : (typeof window !== 'undefined' ? window : null);
    if (owner && owner.SahatakSkeleton && typeof owner.SahatakSkeleton.reducedMotion === 'function') {
      return owner.SahatakSkeleton.reducedMotion();
    }
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    try {
      return Boolean(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) {
      return false;
    }
  }

  // ────────────────────────── browser glue (not smoke-tested) ───────────────

  function translate(key) {
    var localized = null;
    try {
      if (typeof window !== 'undefined' && window.LanguageManager &&
          typeof window.LanguageManager.translate === 'function') {
        localized = window.LanguageManager.translate('calm_mode.' + key);
      }
    } catch (e) { /* fall through to EN/AR fallback */ }
    if (typeof localized === 'string' && localized && localized.indexOf('calm_mode.') !== 0) {
      return localized;
    }
    var lang = 'en';
    try {
      if (typeof window !== 'undefined' && window.LanguageManager &&
          typeof window.LanguageManager.getLanguage === 'function') {
        lang = window.LanguageManager.getLanguage() || 'en';
      }
    } catch (e) { /* keep en */ }
    var entry = STRINGS[key] || { en: '' };
    return entry[lang] || entry.en;
  }

  /** Cache read/write (localStorage — browser only). */
  function readCache() {
    if (typeof localStorage === 'undefined') return null;
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? normalizeCalmUi(JSON.parse(raw)) : null;
    } catch (e) { return null; }
  }

  function writeCache(prefs) {
    if (typeof localStorage === 'undefined') return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch (e) { /* ignore */ }
  }

  /** Apply prefs visually: toggle the calm classes on body and every .cg-page token root. */
  function apply(prefs) {
    var p = normalizeCalmUi(prefs);
    var classes = classesFor(p);
    var targets = [];
    if (typeof document !== 'undefined') {
      targets.push(document.body);
      if (document.querySelectorAll) {
        Array.prototype.forEach.call(document.querySelectorAll('.cg-page'), function (el) {
          targets.push(el);
        });
      }
    }
    targets.forEach(function (el) {
      if (!el || !el.classList) return;
      Object.keys(CLASS_FOR_KEY).forEach(function (k) {
        var c = CLASS_FOR_KEY[k];
        if (classes.indexOf(c) !== -1) el.classList.add(c);
        else el.classList.remove(c);
      });
    });
    return classes;
  }

  /** GET the patient preferences payload via the existing API wiring. */
  function fetchPreferences() {
    if (typeof window === 'undefined' || !window.ApiHelper) return Promise.resolve(null);
    return window.ApiHelper.makeRequest('/user-settings/patient/preferences')
      .then(function (response) { return response || null; })
      .catch(function () { return null; });
  }

  /**
   * PUT the calm-UI object into notification_preferences via the existing
   * endpoint, preserving every other key (same PUT body as mobile).
   */
  function persistPreferences(ui) {
    if (typeof window === 'undefined' || !window.ApiHelper) return Promise.resolve(false);
    return fetchPreferences().then(function (prefs) {
      var currentNp = (prefs && prefs.notification_preferences) || {};
      return window.ApiHelper.makeRequest('/user-settings/patient/preferences', {
        method: 'PUT',
        body: JSON.stringify({ notification_preferences: mergeIntoNotificationPreferences(currentNp, ui) }),
      }).then(function () { return true; }).catch(function () { return false; });
    });
  }

  /**
   * Update a partial set of calm prefs: instant local apply + cache, then
   * persist in the background (mobile setCalmUi flow).
   * @param {Object} partial
   * @param {Object} [current] - current prefs; read from cache when omitted.
   * @returns {Promise<Object>} the resulting normalized prefs.
   */
  function save(partial, current) {
    var next = mergePrefs(current || readCache() || DEFAULT_CALM_UI_PREFS, partial);
    apply(next);
    writeCache(next);
    return persistPreferences(next).then(function (ok) {
      if (!ok && typeof console !== 'undefined' && console.warn) {
        console.warn('[CalmMode] Could not persist calm mode prefs to server');
      }
      return next;
    });
  }

  /**
   * Load cached prefs instantly, then sync from the backend on load
   * (server wins — same pattern as mobile's AppContext).
   * @returns {Promise<Object>} the final normalized prefs.
   */
  function sync() {
    var cached = readCache();
    if (cached) apply(cached);
    return fetchPreferences().then(function (prefs) {
      if (!prefs) return cached || DEFAULT_CALM_UI_PREFS;
      var serverUi = extractFromPreferences(prefs);
      apply(serverUi);
      writeCache(serverUi);
      return serverUi;
    });
  }

  /**
   * Render the Calm Mode toggle group (master + four sub-toggles + safety
   * note) into `container` and wire change handlers — the web equivalent of
   * mobile's ProfileScreen Calm Mode group, placed in the dashboard's
   * existing Preferences & Notifications settings area.
   * @param {HTMLElement} container
   * @returns {boolean} true if mounted.
   */
  function mount(container) {
    if (!container || typeof document === 'undefined') return false;
    var prefs = readCache() || DEFAULT_CALM_UI_PREFS;

    container.innerHTML = '';
    var wrap = document.createElement('div');
    wrap.className = 'cg-calm-group';

    var heading = document.createElement('h6');
    heading.className = 'cg-calm-heading';
    heading.textContent = translate('title');
    wrap.appendChild(heading);

    function row(id, key, isMaster) {
      var div = document.createElement('div');
      div.className = 'cg-calm-row';
      var input = document.createElement('input');
      input.type = 'checkbox';
      input.className = 'cg-calm-switch';
      input.id = id;
      input.checked = Boolean(prefs[key]);
      if (!isMaster && !subTogglesEnabled(prefs)) input.disabled = true;
      var label = document.createElement('label');
      label.className = 'cg-calm-label';
      label.setAttribute('for', id);
      label.textContent = isMaster ? translate('title') : translate(key);
      if (isMaster) {
        var hint = document.createElement('span');
        hint.className = 'cg-calm-hint';
        hint.textContent = translate('master_hint');
        label.appendChild(hint);
      }
      input.addEventListener('change', function () {
        var update = {};
        update[key] = input.checked;
        save(update, readCache() || prefs);
        // Master toggle gates the sub-toggles' disabled state (mobile UX).
        var enabled = subTogglesEnabled(readCache() || prefs);
        Array.prototype.forEach.call(
          wrap.querySelectorAll('.cg-calm-switch:not(#cg-calm-master)'),
          function (sub) { sub.disabled = !enabled; }
        );
      });
      div.appendChild(input);
      div.appendChild(label);
      wrap.appendChild(div);
      return div;
    }

    row('cg-calm-master', 'calm_mode', true);
    SUB_TOGGLE_KEYS.forEach(function (key) {
      row('cg-calm-sub-' + key, key, false);
    });

    var note = document.createElement('p');
    note.className = 'cg-calm-note';
    note.textContent = translate('note');
    wrap.appendChild(note);

    container.appendChild(wrap);
    return true;
  }

  /**
   * Re-render the toggle group with the CURRENT language (labels are read at
   * render time via LanguageManager). Called by the dashboard's language
   * switcher so switching AR/EN updates the group in place instead of only
   * on the next page load. Idempotent: mount() clears the container and
   * rebuilds from readCache(), so no preference state is lost.
   * @param {HTMLElement|string} container - element or element id.
   * @returns {boolean} true if re-rendered.
   */
  function refresh(container) {
    if (typeof document === 'undefined') return false;
    var el = typeof container === 'string' ? document.getElementById(container) : container;
    return mount(el);
  }

  return {

    STRINGS: STRINGS,
    STORAGE_KEY: STORAGE_KEY,
    DEFAULT_CALM_UI_PREFS: DEFAULT_CALM_UI_PREFS,
    SUB_TOGGLE_KEYS: SUB_TOGGLE_KEYS,
    CLASS_FOR_KEY: CLASS_FOR_KEY,
    SUPPRESSED_FOR_KEY: SUPPRESSED_FOR_KEY,
    normalizeCalmUi: normalizeCalmUi,
    extractFromPreferences: extractFromPreferences,
    mergeIntoNotificationPreferences: mergeIntoNotificationPreferences,
    mergePrefs: mergePrefs,
    subTogglesEnabled: subTogglesEnabled,
    classesFor: classesFor,
    suppressedFor: suppressedFor,
    reducedMotion: reducedMotion,
    readCache: readCache,
    writeCache: writeCache,
    apply: apply,
    save: save,
    sync: sync,
    mount: mount,
    refresh: refresh,
  };
});

