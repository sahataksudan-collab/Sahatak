/**
 * SahatakAvatar — shared profile-avatar helper (web).
 *
 * B1: Renders the stored profile photo inside an avatar container when one
 * exists, and keeps the existing Bootstrap-icons silhouette (bi-person-* / etc.)
 * as the fallback whenever no photo exists or the image fails to load —
 * mirroring the mobile app's lucide "User" silhouette fallback.
 *
 * B2: Click-to-upload on the user's OWN avatar (id="profile-avatar"):
 * hidden <input type="file" accept="image/*">, client-side validation
 * (images only, 5MB — matching the backend's AVATAR_MAX_SIZE_BYTES and
 * AVATAR_ALLOWED_EXTENSIONS in Sahatak-2/backend/routes/users.py),
 * instant preview, then multipart POST to the SAME endpoint the mobile app
 * already uses: POST /api/users/profile/avatar (field name: 'image').
 */
(function () {
    'use strict';

    const API_BASE = (window.ApiHelper && ApiHelper.baseUrl) || 'https://sahatak.pythonanywhere.com/api';
    const MAX_SIZE_BYTES = 5 * 1024 * 1024; // must match backend AVATAR_MAX_SIZE_BYTES
    const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];

    // Bilingual messages (EN/AR). Locale JSON keys ("avatar.*") are preferred
    // when LanguageManager has loaded them; these are the fallbacks.
    const MESSAGES = {
        change_photo: { en: 'Change profile photo', ar: 'تغيير الصورة الشخصية' },
        invalid_type: { en: 'Please choose an image file (PNG, JPG, WEBP, or GIF).', ar: 'يرجى اختيار ملف صورة (PNG أو JPG أو WEBP أو GIF).' },
        too_large: { en: 'Image is too large. Maximum size is 5MB.', ar: 'الصورة كبيرة جداً. الحد الأقصى للحجم هو 5 ميجابايت.' },
        uploading: { en: 'Uploading photo...', ar: 'جارٍ رفع الصورة...' },
        upload_success: { en: 'Profile photo updated successfully.', ar: 'تم تحديث الصورة الشخصية بنجاح.' },
        upload_failed: { en: 'Failed to upload photo. Please try again.', ar: 'تعذر رفع الصورة. يرجى المحاولة مرة أخرى.' },
        not_authenticated: { en: 'Please log in to change your photo.', ar: 'يرجى تسجيل الدخول لتغيير صورتك.' }
    };

    function getLang() {
        try { return (window.LanguageManager && LanguageManager.getLanguage()) || 'ar'; } catch (e) { return 'ar'; }
    }

    function t(key) {
        const lang = getLang();
        // Prefer locale-file key (locales/en.json & locales/ar.json → "avatar.*")
        try {
            if (window.LanguageManager && LanguageManager.translations && LanguageManager.translations[lang]) {
                const val = LanguageManager.translations[lang].avatar && LanguageManager.translations[lang].avatar[key];
                if (val) return val;
            }
        } catch (e) { /* fall through to bundled fallback */ }
        return (MESSAGES[key] && (MESSAGES[key][lang] || MESSAGES[key].en)) || MESSAGES[key].en;
    }

    function showToast(message, type) {
        // Lightweight, non-blocking bilingual toast (Bootstrap 5 is already loaded site-wide)
        let host = document.getElementById('sahatak-avatar-toast-host');
        if (!host) {
            host = document.createElement('div');
            host.id = 'sahatak-avatar-toast-host';
            host.className = 'toast-container position-fixed top-0 start-50 translate-middle-x p-3';
            host.style.zIndex = '20000';
            document.body.appendChild(host);
        }
        const el = document.createElement('div');
        el.className = `toast align-items-center text-bg-${type === 'error' ? 'danger' : 'success'} border-0`;
        el.setAttribute('role', 'alert');
        el.innerHTML = `<div class="d-flex"><div class="toast-body">${message}</div>` +
            '<button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>';
        host.appendChild(el);
        if (window.bootstrap && bootstrap.Toast) {
            const toast = new bootstrap.Toast(el, { delay: 4000 });
            toast.show();
            el.addEventListener('hidden.bs.toast', () => el.remove());
        } else {
            el.style.display = 'block';
            setTimeout(() => el.remove(), 4000);
        }
    }

    /**
     * B1 core: render a photo inside an avatar container, falling back to the
     * existing inline silhouette <i> icon if `url` is empty or fails to load.
     * The original fallback icon is preserved in the DOM (hidden while the
     * image is shown) so markup changes stay minimal.
     */
    function apply(avatarEl, url) {
        if (!avatarEl) return;
        // Remove any previously injected image
        avatarEl.querySelectorAll('img.avatar-img').forEach(img => img.remove());

        if (!url) {
            avatarEl.classList.remove('has-photo');
            avatarEl.querySelectorAll(':scope > i.bi').forEach(i => { i.style.display = ''; });
            return;
        }
        avatarEl.classList.add('has-photo');
        // Resolve relative backend URLs (/static/uploads/...) against the API origin
        const src = url.startsWith('http') ? url : (API_BASE.replace(/\/api\/?$/, '') + url);
        const img = document.createElement('img');
        img.className = 'avatar-img';
        img.alt = '';
        img.onerror = function () {
            img.remove();
            avatarEl.classList.remove('has-photo');
            avatarEl.querySelectorAll(':scope > i.bi').forEach(i => { i.style.display = ''; });
        };
        avatarEl.querySelectorAll(':scope > i.bi').forEach(i => { i.style.display = 'none'; });
        img.src = src;
        avatarEl.appendChild(img);
    }

    function getStoredUser() {
        try { return JSON.parse(localStorage.getItem('sahatak_user_data') || 'null'); } catch (e) { return null; }
    }

    function storeAvatarUrl(url) {
        const user = getStoredUser() || {};
        user.avatar = url;
        user.profile_picture = url;
        try { localStorage.setItem('sahatak_user_data', JSON.stringify(user)); } catch (e) { /* ignore */ }
    }

    /** B1 convenience: restore the logged-in user's photo on page load. */
    function restore(avatarEl) {
        if (!avatarEl) return;
        const user = getStoredUser();
        apply(avatarEl, (user && (user.profile_picture || user.avatar)) || avatarEl.dataset.avatarUrl || '');
    }

    async function uploadFile(avatarEl, file) {
        const token = (window.AuthStorage && AuthStorage.getToken()) || localStorage.getItem('sahatak_access_token');
        if (!token) { showToast(t('not_authenticated'), 'error'); return; }

        showToast(t('uploading'), 'success');
        const formData = new FormData();
        formData.append('image', file); // field name expected by POST /api/users/profile/avatar

        try {
            const response = await fetch(`${API_BASE}/users/profile/avatar`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Authorization': `Bearer ${token}`, 'Accept-Language': getLang() },
                body: formData
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || data.success === false) {
                // Surface the backend's own validation message when provided
                const msg = (data.error && data.error.message) || data.message || t('upload_failed');
                showToast(msg, 'error');
                restore(avatarEl); // roll back preview
                return;
            }
            const avatarUrl = (data.data && (data.data.avatar || data.data.profile_picture)) ||
                data.avatar || data.profile_picture || '';
            if (avatarUrl) {
                apply(avatarEl, avatarUrl);
                storeAvatarUrl(avatarUrl);
            }
            showToast(t('upload_success'), 'success');
        } catch (err) {
            console.error('Avatar upload failed:', err);
            restore(avatarEl);
            showToast(t('upload_failed'), 'error');
        }
    }

    /**
     * B2: make the user's OWN avatar clickable to upload/replace their photo.
     * Other people's avatars are never passed here, so they remain
     * non-interactive.
     */
    function bindUpload(avatarEl) {
        if (!avatarEl || avatarEl.dataset.avatarUploadBound === 'true') return;
        avatarEl.dataset.avatarUploadBound = 'true';
        avatarEl.classList.add('avatar-editable');
        avatarEl.setAttribute('role', 'button');
        avatarEl.setAttribute('tabindex', '0');
        avatarEl.setAttribute('title', t('change_photo'));
        avatarEl.setAttribute('aria-label', t('change_photo'));

        // Hover/tap affordance: small pencil badge overlay
        if (!avatarEl.querySelector('.avatar-edit-badge')) {
            const badge = document.createElement('span');
            badge.className = 'avatar-edit-badge';
            badge.innerHTML = '<i class="bi bi-pencil-fill"></i>';
            avatarEl.appendChild(badge);
        }

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.style.display = 'none';
        avatarEl.appendChild(input);

        const trigger = () => input.click();
        avatarEl.addEventListener('click', (e) => { e.preventDefault(); trigger(); });
        avatarEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); trigger(); }
        });

        input.addEventListener('change', () => {
            const file = input.files && input.files[0];
            input.value = ''; // allow re-selecting the same file
            if (!file) return;

            // Client-side validation mirroring backend rules
            const extOk = ALLOWED_TYPES.includes(file.type) ||
                /\.(png|jpe?g|webp|gif)$/i.test(file.name || '');
            if (!extOk) { showToast(t('invalid_type'), 'error'); return; }
            if (file.size > MAX_SIZE_BYTES) { showToast(t('too_large'), 'error'); return; }

            // Instant local preview while uploading; rolled back on failure
            apply(avatarEl, URL.createObjectURL(file));
            uploadFile(avatarEl, file);
        });
    }

    /** Bind the user's own avatar. Safe to call repeatedly. */
    function init() {
        const own = document.getElementById('profile-avatar');
        if (own && own.dataset.avatarUploadBound !== 'true') {
            restore(own);
            bindUpload(own);
        }
    }

    // Dashboard pages normally contain the avatar in their initial markup, but
    // dashboard/header renderers can replace it after this script has loaded.
    // Keep the binding alive for that case as well as for deployments that
    // inject the dashboard shell after DOMContentLoaded.
    function observeAvatarReplacements() {
        if (!window.MutationObserver || !document.documentElement) return;

        const observer = new MutationObserver(() => init());
        observer.observe(document.documentElement, { childList: true, subtree: true });
    }

    // Bind immediately when the script is loaded near the end of the page,
    // and keep the DOM-ready fallback for pages that load it earlier.
    init();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    }
    observeAvatarReplacements();

    // Expose for other pages/scripts that render avatars dynamically
    window.SahatakAvatar = { apply, restore, bindUpload, init };
})();
