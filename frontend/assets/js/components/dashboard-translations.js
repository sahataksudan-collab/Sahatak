// Dashboard Translation Management
const DashboardTranslations = {
    
    // Helper function to update element text
    updateElementText(elementId, text) {
        const element = document.getElementById(elementId);
        if (element && text) {
            // Debug for footer elements (disabled to reduce console noise)
            element.textContent = text;
        }
    },
    
    // Update patient dashboard translations
    updatePatientDashboard(lang) {
        const t = LanguageManager.translations[lang];
        if (!t || !t.dashboard || !t.dashboard.patient) {
            console.error('Patient dashboard translations not found');
            return;
        }
        
        const patient = t.dashboard.patient;
        
        // Header section
        this.updateElementText('dashboard-title', patient.title);
        this.updateElementText('dashboard-subtitle', patient.subtitle);
        this.updateElementText('logout-text', patient.logout);
        
        // Show the opposite language (the one you can switch TO)
        const oppositeLanguage = lang === 'ar' ? 'English' : 'Ø§Ù„Ø¹Ø±Ø¨ÙŠØ©';
        this.updateElementText('current-lang', oppositeLanguage);
        
        // Navigation
        this.updateElementText('nav-title', patient.nav.title);
        this.updateElementText('nav-home', patient.nav.home);
        this.updateElementText('nav-appointments', patient.nav.appointments);
        this.updateElementText('nav-records', patient.nav.records);
        this.updateElementText('nav-prescriptions', patient.nav.prescriptions);
        this.updateElementText('nav-profile', patient.nav.profile);
        this.updateElementText('nav-settings', patient.nav.settings);
        
        // Quick Actions
        this.updateElementText('action-book', patient.quick_actions.book);
        this.updateElementText('action-book-desc', patient.quick_actions.book_desc);
        this.updateElementText('action-records', patient.quick_actions.records);
        this.updateElementText('action-records-desc', patient.quick_actions.records_desc);
        this.updateElementText('action-chat', patient.quick_actions.chat);
        this.updateElementText('action-chat-desc', patient.quick_actions.chat_desc);
        
        // Statistics
        this.updateElementText('stat-appointments', patient.stats.appointments);
        this.updateElementText('stat-prescriptions', patient.stats.prescriptions);
        this.updateElementText('stat-reports', patient.stats.reports);
        
        // Profile Action Buttons (new layout)
        this.updateElementText('btn-profile', patient.buttons?.profile || patient.dropdown?.profile);
        this.updateElementText('btn-settings', patient.buttons?.settings || patient.dropdown?.settings);
        this.updateElementText('btn-logout', patient.buttons?.logout || patient.dropdown?.logout);
        
        // Dropdown menu (legacy)
        this.updateElementText('dropdown-profile', patient.dropdown?.profile);
        this.updateElementText('dropdown-settings', patient.dropdown?.settings);
        this.updateElementText('dropdown-logout', patient.dropdown?.logout);
        
        // Upcoming Appointments
        this.updateElementText('upcoming-title', patient.upcoming.title);
        this.updateElementText('join-call', patient.upcoming.join_call);
        this.updateElementText('reschedule', patient.upcoming.reschedule);
        this.updateElementText('status-pending', patient.upcoming.status_pending);
        this.updateElementText('view-all-appointments', patient.upcoming.view_all);
        
        // Past Appointments Button
        this.updateElementText('btn-view-past', t.appointments?.view_past_appointments || 'View Past Appointments');
        
        // Upcoming Appointments Section
        this.updateElementText('upcoming-appointments-title', t.dashboard?.patient?.sections?.upcoming_appointments || 'Upcoming Appointments');
        this.updateElementText('no-upcoming-appointments', t.dashboard?.patient?.no_data?.no_appointments || 'No upcoming appointments');
        
        // Health Summary
        this.updateElementText('health-summary-title', patient.health_summary.title);
        this.updateElementText('blood-pressure', patient.health_summary.blood_pressure);
        this.updateElementText('temperature', patient.health_summary.temperature);
        this.updateElementText('blood-sugar', patient.health_summary.blood_sugar);
        this.updateElementText('weight', patient.health_summary.weight);
        
        // Loading messages
        this.updateElementText('loading-appointments', patient.loading.appointments);
        this.updateElementText('loading-health-data', patient.loading.health_data);
        this.updateElementText('loading-prescriptions', patient.loading.prescriptions);
        this.updateElementText('loading-medical-records', patient.loading.medical_records);
        
        // Section titles
        this.updateElementText('upcoming-appointments-title', patient.sections.upcoming_appointments);
        
        // No data messages
        this.updateElementText('no-upcoming-appointments', patient.no_data.no_appointments);
        this.updateElementText('no-active-prescriptions', patient.no_data.no_prescriptions);
        this.updateElementText('no-medical-records', patient.no_data.no_records);
        
        // Profile and Settings
        // Patient profile and settings update logging disabled
        try {
            this.updateProfileAndSettings(patient.profile, patient.settings);
            // Profile and settings updated
        } catch (profileError) {
            console.error('âŒ Patient profile and settings update failed:', profileError);
        }
        
        // Update footer using standalone function to ensure it works
        // Footer update section
        try {
            DashboardTranslations.updateFooter(t);
            // Footer update completed
        } catch (footerError) {
            console.error('âŒ Patient footer update failed:', footerError);
        }
        
        // Refresh dynamic content that uses inline translations
        if (typeof loadHealthSummary === 'function') {
            // Refreshing Health Summary for language change
            loadHealthSummary();
        }
        
        // Refresh appointments list if function exists
        if (typeof loadDashboardStats === 'function') {
            // Refreshing Dashboard Stats for language change
            setTimeout(() => loadDashboardStats(), 100); // Small delay to ensure translation is applied
        }
    },
    
    // Update doctor dashboard translations
    updateDoctorDashboard(lang) {
        const t = LanguageManager.translations[lang];
        if (!t || !t.dashboard || !t.dashboard.doctor) {
            console.error('âŒ Doctor dashboard translations not found for:', lang);
            return;
        }
        
        const doctor = t.dashboard.doctor;
        
        try {
            // Header section
        this.updateElementText('dashboard-title', doctor.title);
        this.updateElementText('dashboard-subtitle', doctor.subtitle);
        this.updateElementText('user-status', doctor.user_status);
        this.updateElementText('availability-status', doctor.available);
        this.updateElementText('logout-text', doctor.logout);
        
        // Show the opposite language (the one you can switch TO)
        const oppositeLanguage = lang === 'ar' ? 'English' : 'Ø§Ù„Ø¹Ø±Ø¨ÙŠØ©';
        this.updateElementText('current-lang', oppositeLanguage);
        
        // Navigation
        this.updateElementText('nav-title', doctor.nav.title);
        this.updateElementText('nav-home', doctor.nav.home);
        this.updateElementText('nav-patients', doctor.nav.patients);
        this.updateElementText('nav-appointments', doctor.nav.appointments);
        this.updateElementText('nav-consultations', doctor.nav.consultations);
        this.updateElementText('nav-prescriptions', doctor.nav.prescriptions);
        this.updateElementText('nav-schedule', doctor.nav.schedule);
        this.updateElementText('nav-profile', doctor.nav.profile);
        this.updateElementText('nav-settings', doctor.nav.settings);
        
        // Quick Actions
        this.updateElementText('action-communication', doctor.quick_actions.communication);
        this.updateElementText('action-communication-desc', doctor.quick_actions.communication_desc);
        this.updateElementText('action-prescription', doctor.quick_actions.prescription);
        this.updateElementText('action-prescription-desc', doctor.quick_actions.prescription_desc);
        this.updateElementText('action-records', doctor.quick_actions.records);
        this.updateElementText('action-records-desc', doctor.quick_actions.records_desc);
        this.updateElementText('action-schedule', doctor.quick_actions.schedule);
        this.updateElementText('action-schedule-desc', doctor.quick_actions.schedule_desc);
        
        // Profile Action Buttons (new layout)
        this.updateElementText('btn-profile', doctor.buttons?.profile || doctor.dropdown?.profile);
        this.updateElementText('btn-settings', doctor.buttons?.settings || doctor.dropdown?.settings);
        this.updateElementText('btn-logout', doctor.buttons?.logout || doctor.dropdown?.logout);
        
        // Verification Notice
        if (doctor.verification_notice) {
            this.updateElementText('notice-title', doctor.verification_notice.title);
            this.updateElementText('notice-message', doctor.verification_notice.message);
            this.updateElementText('complete-profile', doctor.verification_notice.complete_profile);
        }
        
        // Dropdown menu (legacy)
        this.updateElementText('dropdown-profile', doctor.dropdown?.profile);
        this.updateElementText('dropdown-settings', doctor.dropdown?.settings);
        this.updateElementText('dropdown-logout', doctor.dropdown?.logout);
        
        // Schedule
        this.updateElementText('schedule-title', doctor.schedule.title);
        this.updateElementText('start-consultation', doctor.schedule.start_consultation);
        this.updateElementText('view-file', doctor.schedule.view_file);
        this.updateElementText('view-full-schedule', doctor.schedule.view_full);
        
        // Quick Stats
        this.updateElementText('quick-stats-title', doctor.quick_stats.title);
        this.updateElementText('stat-appointments-today', doctor.quick_stats.appointments_today);
        this.updateElementText('stat-consultations', doctor.quick_stats.consultations);
        this.updateElementText('stat-rating', doctor.quick_stats.rating);
        this.updateElementText('new-patients-week', doctor.quick_stats.new_patients);
        
        // Activity
        this.updateElementText('activity-title', doctor.activity.title);
        this.updateElementText('view-all-activity', doctor.activity.view_all);
        
        // Waiting Patients
        this.updateElementText('waiting-title', doctor.waiting.title);
        this.updateElementText('reply', doctor.waiting.reply);
        this.updateElementText('reply-2', doctor.waiting.reply);
        this.updateElementText('view-all-messages', doctor.waiting.view_all);
        
        // Update verification status dynamically
        this.updateVerificationStatus(doctor.verification_status);
        
        // Profile and Settings (always update during language switch)
        try {
            this.updateProfileAndSettings(doctor.profile, doctor.settings);
        } catch (profileError) {
            console.error('âŒ Profile and settings update failed:', profileError);
        }
        
        
        // Update footer using standalone function to ensure it works
        try {
            DashboardTranslations.updateFooter(t);
        } catch (error) {
            console.error('âŒ Doctor dashboard footer update failed:', error);
        }
        
        } catch (error) {
            console.error('âŒ Doctor dashboard update failed at:', error.message, error);
        }
        
    },
    
    // Update verification status with translation
    updateVerificationStatus(verificationTranslations) {
        const statusElement = document.getElementById('verification-status');
        if (!statusElement || !verificationTranslations) return;
        
        // Get verification status from user data
        const user = JSON.parse(localStorage.getItem('sahatak_doctor_data') || '{}');
        const isVerified = user.verification_status === 'verified';
        
        if (isVerified) {
            statusElement.textContent = verificationTranslations.verified;
            statusElement.className = 'badge bg-success';
        } else {
            statusElement.textContent = verificationTranslations.unverified;
            statusElement.className = 'badge bg-warning text-dark';
        }
    },
    
    // Update profile and settings translations (shared between dashboards)
    updateProfileAndSettings(profileTranslations, settingsTranslations) {
        // Profile translations
        if (profileTranslations) {
            // Section headers
            this.updateElementText('profile-title', profileTranslations.title);
            this.updateElementText('close-profile', profileTranslations.close);
            this.updateElementText('personal-info', profileTranslations.personal_info);
            this.updateElementText('professional-info', profileTranslations.professional_info);
            this.updateElementText('medical-info', profileTranslations.medical_info);
            this.updateElementText('contact-info', profileTranslations.contact_info);
            this.updateElementText('documents-info', profileTranslations.documents_info);
            this.updateElementText('schedule-info', profileTranslations.schedule_info);
            this.updateElementText('stats-info', profileTranslations.stats_info);
            this.updateElementText('account-info', profileTranslations.account_info);
            this.updateElementText('save-profile', profileTranslations.save_profile);
            this.updateElementText('reset-profile', profileTranslations.reset_profile);
            this.updateElementText('edit-profile', profileTranslations.edit_profile);
            
            // Field labels (shared fields)
            if (profileTranslations.fields) {
                this.updateElementText('label-full-name', profileTranslations.fields.full_name);
                this.updateElementText('label-email', profileTranslations.fields.email);
                this.updateElementText('label-phone', profileTranslations.fields.phone);
                
                // Doctor-specific fields
                this.updateElementText('label-doctor-id', profileTranslations.fields.doctor_id);
                this.updateElementText('label-medical-license', profileTranslations.fields.medical_license);
                this.updateElementText('label-specialization', profileTranslations.fields.specialization);
                this.updateElementText('label-experience', profileTranslations.fields.experience);
                this.updateElementText('label-hospital-affiliations', profileTranslations.fields.hospital_affiliations);
                this.updateElementText('label-department', profileTranslations.fields.department);
                this.updateElementText('label-consultation-fee', profileTranslations.fields.consultation_fee);
                this.updateElementText('label-education-details', profileTranslations.fields.education_details);
                this.updateElementText('label-certifications', profileTranslations.fields.certifications);
                this.updateElementText('label-memberships', profileTranslations.fields.memberships);
                this.updateElementText('label-languages', profileTranslations.fields.languages);
                this.updateElementText('label-consultation-areas', profileTranslations.fields.consultation_areas);
                
                // Patient-specific fields
                this.updateElementText('label-patient-id', profileTranslations.fields.patient_id);
                this.updateElementText('label-date-of-birth', profileTranslations.fields.date_of_birth);
                this.updateElementText('label-gender', profileTranslations.fields.gender);
                this.updateElementText('label-blood-type', profileTranslations.fields.blood_type);
                this.updateElementText('label-national-id', profileTranslations.fields.national_id);
                this.updateElementText('label-allergies', profileTranslations.fields.allergies);
                this.updateElementText('label-chronic-conditions', profileTranslations.fields.chronic_conditions);
                this.updateElementText('label-current-medications', profileTranslations.fields.current_medications);
                this.updateElementText('label-insurance-provider', profileTranslations.fields.insurance_provider);
                this.updateElementText('label-insurance-number', profileTranslations.fields.insurance_number);
            }
            
            // Update country dropdown options (for doctor profile only)
            this.updateCountryOptions();
        }
        
        // Settings translations
        if (settingsTranslations) {
            // Section headers
            this.updateElementText('settings-title', settingsTranslations.title);
            this.updateElementText('close-settings', settingsTranslations.close);
            this.updateElementText('account-settings', settingsTranslations.account_settings);
            this.updateElementText('preferences-settings', settingsTranslations.preferences_settings);
            this.updateElementText('privacy-settings', settingsTranslations.privacy_settings);
            this.updateElementText('security-settings', settingsTranslations.security_settings);
            this.updateElementText('save-settings', settingsTranslations.save_settings);
            this.updateElementText('reset-settings', settingsTranslations.reset_settings);
            
            // Field labels
            if (settingsTranslations.fields) {
                this.updateElementText('full-name-label', settingsTranslations.fields.full_name);
                this.updateElementText('email-label', settingsTranslations.fields.email);
                this.updateElementText('phone-label', settingsTranslations.fields.phone);
                this.updateElementText('medical-license-label', settingsTranslations.fields.medical_license);
                this.updateElementText('specialization-label', settingsTranslations.fields.specialization);
                this.updateElementText('language-label', settingsTranslations.fields.language);
                this.updateElementText('email-notifications-label', settingsTranslations.fields.email_notifications);
                this.updateElementText('sms-notifications-label', settingsTranslations.fields.sms_notifications);
                this.updateElementText('appointment-reminders-label', settingsTranslations.fields.appointment_reminders);
            }
        }
    },
    
    // Update footer translations (shared between dashboards)
    updateFooter(t) {
        if (!t.footer) {
            return;
        }
        
        this.updateElementText('footer-brand', t.footer.brand);
        this.updateElementText('footer-links-title', t.footer.links_title);
        this.updateElementText('footer-about', t.footer.about);
        this.updateElementText('footer-services', t.footer.services);
        this.updateElementText('footer-support-title', t.footer.support_title);
        this.updateElementText('footer-help', t.footer.help);
        this.updateElementText('footer-contact', t.footer.contact);
        this.updateElementText('footer-emergency-text', t.footer.emergency_text);
        this.updateElementText('footer-emergency-action', t.footer.emergency_action);
        this.updateElementText('footer-emergency-note', t.footer.emergency_note);
        this.updateElementText('footer-copyright', t.footer.copyright);
    },
    
    // Update admin dashboard translations
    updateAdminDashboard(lang) {
        const t = LanguageManager.translations[lang];
        if (!t || !t.admin) {
            console.warn('Admin translations not available for language:', lang);
            return;
        }

        const admin = t.admin;

        // Header translations
        this.updateElementText('admin-dashboard-title', admin.dashboard.title);
        this.updateElementText('admin-dashboard-subtitle', admin.dashboard.subtitle);

        // Navigation translations
        this.updateElementText('admin-nav-dashboard', admin.navigation.dashboard);
        this.updateElementText('admin-nav-users', admin.navigation.users);
        this.updateElementText('admin-nav-verification', admin.navigation.verification);
        this.updateElementText('admin-nav-appointments', admin.navigation.appointments);
        this.updateElementText('admin-nav-settings', admin.navigation.settings);
        this.updateElementText('admin-nav-health', admin.navigation.health);
        this.updateElementText('admin-nav-analytics', admin.navigation.analytics);

        // Statistics translations
        this.updateElementText('admin-stat-total-users', admin.stats.total_users);
        this.updateElementText('admin-stat-verified-doctors', admin.stats.verified_doctors);
        this.updateElementText('admin-stat-appointments', admin.stats.appointments);
        this.updateElementText('admin-stat-system-health', admin.stats.system_health);

        // Section titles
        this.updateElementText('user-management-title', admin.sections?.user_management || 'User Management');
        this.updateElementText('doctor-verification-title', admin.sections?.doctor_verification || 'Doctor Verification');
        this.updateElementText('appointment-management-title', admin.sections?.appointment_management || 'Appointment Management');
        this.updateElementText('system-settings-title', admin.sections?.system_settings || 'System Settings');
        this.updateElementText('platform-health-title', admin.sections?.platform_health || 'Platform Health');
        this.updateElementText('analytics-title', admin.sections?.analytics || 'Analytics');

        // Settings translations
        this.updateElementText('save-all-settings', admin.settings?.save_all || 'Save All Settings');
        this.updateElementText('settings-general-tab', admin.settings?.general || 'General');
        this.updateElementText('settings-notifications-tab', admin.settings?.notifications || 'Notifications');
        this.updateElementText('settings-maintenance-tab', admin.settings?.maintenance || 'Maintenance');
        
        // Form labels
        this.updateElementText('default-language-label', admin.forms?.default_language || 'Default Language');
        this.updateElementText('timezone-label', admin.forms?.timezone || 'Timezone');
        this.updateElementText('registration-status-label', admin.forms?.registration_status || 'Registration Status');
        this.updateElementText('max-appointments-label', admin.forms?.max_appointments || 'Max Appointments Per Day');
        
        // Health monitoring
        this.updateElementText('server-uptime-label', admin.monitoring?.server_uptime || 'Server Uptime');
        this.updateElementText('cpu-usage-label', admin.monitoring?.cpu_usage || 'CPU Usage');
        this.updateElementText('memory-usage-label', admin.monitoring?.memory_usage || 'Memory Usage');
        this.updateElementText('response-time-label', admin.monitoring?.response_time || 'Response Time');
        this.updateElementText('analytics-cpu-label', admin.monitoring?.cpu_usage || 'CPU Usage');
        this.updateElementText('analytics-memory-label', admin.monitoring?.memory_usage || 'Memory Usage');

        // Buttons
        this.updateElementText('refresh-button', admin.buttons?.refresh || 'Refresh');
        this.updateElementText('add-doctor-manually', admin.buttons?.add_doctor_manually || 'Add Doctor Manually');
        this.updateElementText('refresh-appointments', admin.buttons?.refresh_appointments || 'Refresh');
        this.updateElementText('export-appointments', admin.buttons?.export_appointments || 'Export Data');

        // Tabs
        this.updateElementText('pending-tab', admin.tabs?.pending || 'Pending');
        this.updateElementText('approved-tab', admin.tabs?.approved || 'Approved');
        this.updateElementText('rejected-tab', admin.tabs?.rejected || 'Rejected');

        // Filters
        this.updateElementText('filter-all-appointments', admin.filters?.all_appointments || 'All Appointments');
        this.updateElementText('filter-upcoming', admin.filters?.upcoming || 'Upcoming');
        this.updateElementText('filter-today', admin.filters?.today || 'Today');
        this.updateElementText('filter-completed', admin.filters?.completed || 'Completed');
        this.updateElementText('filter-cancelled', admin.filters?.cancelled || 'Cancelled');

        // Table headers
        this.updateElementText('table-full-name', admin.table?.full_name || 'Full Name');
        this.updateElementText('table-email', admin.table?.email || 'Email');
        this.updateElementText('table-phone', admin.table?.phone || 'Phone');
        this.updateElementText('table-type', admin.table?.type || 'Type');
        this.updateElementText('table-status', admin.table?.status || 'Status');
        this.updateElementText('table-registration-date', admin.table?.registration_date || 'Registration Date');
        this.updateElementText('table-actions', admin.table?.actions || 'Actions');
        this.updateElementText('appointment-patient', admin.table?.patient || 'Patient');
        this.updateElementText('appointment-doctor', admin.table?.doctor || 'Doctor');
        this.updateElementText('appointment-datetime', admin.table?.datetime || 'Date & Time');
        this.updateElementText('appointment-status', admin.table?.status || 'Status');
        this.updateElementText('appointment-actions', admin.table?.actions || 'Actions');

        // Pagination
        this.updateElementText('per-page-10', admin.pagination?.per_page_10 || '10 per page');
        this.updateElementText('per-page-20', admin.pagination?.per_page_20 || '20 per page');
        this.updateElementText('per-page-50', admin.pagination?.per_page_50 || '50 per page');

        // Loading states
        this.updateElementText('loading-users', admin.loading?.text || 'Loading...');
        this.updateElementText('loading-appointments', admin.loading?.text || 'Loading...');
        this.updateElementText('loading-verification', admin.loading?.text || 'Loading...');
        this.updateElementText('loading-users-text', admin.loading?.users || 'Loading user data...');
        this.updateElementText('loading-appointments-text', admin.loading?.appointments || 'Loading appointment data...');
        this.updateElementText('loading-verification-text', admin.loading?.verification || 'Loading verification requests...');

        // Language options
        this.updateElementText('language-arabic', admin.languages?.arabic || 'Arabic');
        this.updateElementText('language-english', admin.languages?.english || 'English');

        // Timezone options
        this.updateElementText('timezone-cairo', admin.timezones?.cairo || 'Cairo');
        this.updateElementText('timezone-riyadh', admin.timezones?.riyadh || 'Riyadh');

        // Registration options
        this.updateElementText('registration-open', admin.registration?.open || 'Open');
        this.updateElementText('registration-closed', admin.registration?.closed || 'Closed');
        this.updateElementText('registration-doctors-only', admin.registration?.doctors_only || 'Doctors Only');

        // Notification settings
        this.updateElementText('notification-settings-title', admin.notifications?.settings_title || 'Notification Settings');
        this.updateElementText('email-notifications-label', admin.notifications?.email_notifications || 'Email Notifications');
        this.updateElementText('sms-notifications-label', admin.notifications?.sms_notifications || 'SMS Notifications');
        this.updateElementText('appointment-reminders-label', admin.notifications?.appointment_reminders || 'Appointment Reminders');
        this.updateElementText('system-alerts-label', admin.notifications?.system_alerts || 'System Alerts');

        // Maintenance settings
        this.updateElementText('maintenance-warning', admin.maintenance?.warning || 'Enabling maintenance mode will prevent users from accessing the system');
        this.updateElementText('maintenance-mode-label', admin.maintenance?.mode_label || 'Enable Maintenance Mode');
        this.updateElementText('maintenance-message-label', admin.maintenance?.message_label || 'Maintenance Message');
        
        // Set placeholder for maintenance message
        const maintenanceTextarea = document.getElementById('maintenance_message');
        if (maintenanceTextarea && admin.maintenance?.message_placeholder) {
            maintenanceTextarea.setAttribute('placeholder', admin.maintenance.message_placeholder);
        }

        // User filters
        this.updateElementText('filter-all', admin.user_filters?.all || 'All');
        this.updateElementText('filter-patients', admin.user_filters?.patients || 'Patients');
        this.updateElementText('filter-doctors', admin.user_filters?.doctors || 'Doctors');
        this.updateElementText('filter-admins', admin.user_filters?.admins || 'Admins');

        // Status filters
        this.updateElementText('status-all', admin.status_filters?.all || 'All Status');
        this.updateElementText('status-active', admin.status_filters?.active || 'Active');
        this.updateElementText('status-inactive', admin.status_filters?.inactive || 'Inactive');

        // Additional buttons
        this.updateElementText('export-data', admin.more_buttons?.export_data || 'Export Data');
        this.updateElementText('add-admin', admin.more_buttons?.add_admin || 'Add Admin');

        // Search placeholder
        const searchInput = document.getElementById('user-search');
        if (searchInput && admin.search?.placeholder) {
            searchInput.setAttribute('placeholder', admin.search.placeholder);
        }

        // Gauge labels
        this.updateElementText('gauge-uptime', admin.gauges?.uptime || 'Server Uptime');
        this.updateElementText('gauge-cpu', admin.gauges?.cpu || 'CPU Usage');
        this.updateElementText('gauge-memory', admin.gauges?.memory || 'Memory Usage');
        this.updateElementText('gauge-response', admin.gauges?.response || 'Response Time');

        // Show the opposite language (the one you can switch TO)
        const oppositeLanguage = lang === 'ar' ? 'English' : 'Ø§Ù„Ø¹Ø±Ø¨ÙŠØ©';
        this.updateElementText('current-admin-language', oppositeLanguage);

        // Action buttons (using title attribute for tooltips)
        const profileBtn = document.getElementById('admin-btn-profile');
        const settingsBtn = document.getElementById('admin-btn-settings');
        const logoutBtn = document.getElementById('admin-btn-logout');
        
        if (profileBtn) profileBtn.title = admin.actions.profile;
        if (settingsBtn) settingsBtn.title = admin.actions.settings;
        if (logoutBtn) logoutBtn.title = admin.actions.logout;

        // Update footer
        this.updateFooter(t);

    },
    
    // Language switching for dashboards
    switchDashboardLanguage(lang, dashboardType) {
        // Apply language settings
        LanguageManager.applyLanguage(lang);
        LanguageManager.setLanguage(lang);
        
        // Update dashboard content based on type
        if (dashboardType === 'patient') {
            this.updatePatientDashboard(lang);
        } else if (dashboardType === 'doctor') {
            this.updateDoctorDashboard(lang);
        } else if (dashboardType === 'admin') {
            this.updateAdminDashboard(lang);
        }
        
        // Update user name with correct language prefix (admin doesn't need this)
        if (dashboardType !== 'admin') {
            this.updateUserName();
        }
        
    },
    
    // Update user name in dashboard header
    updateUserName() {
        const userName = localStorage.getItem('sahatak_user_name');
        const userType = localStorage.getItem('sahatak_user_type');
        
        if (userName) {
            let displayName = userName;
            
            // Add Dr. prefix for doctors if not already present
            if (userType === 'doctor' && !userName.toLowerCase().startsWith('dr.') && !userName.toLowerCase().startsWith('Ø¯.')) {
                const currentLang = LanguageManager.getLanguage() || 'ar';
                const prefix = currentLang === 'ar' ? 'Ø¯. ' : 'Dr. ';
                displayName = prefix + userName;
            }
            
            this.updateElementText('user-name', displayName);
            // User name updated in header
        } else {
            console.warn('User name not found in localStorage');
        }
    },

    // Initialize dashboard translations on page load
    async initializeDashboard(dashboardType) {
        
        // Load translations first
        await LanguageManager.loadTranslations();
        
        // Get saved language or default to Arabic
        const savedLanguage = LanguageManager.getLanguage() || 'ar';
        
        // Apply language settings
        LanguageManager.applyLanguage(savedLanguage);
        
        // Update dashboard content
        if (dashboardType === 'patient') {
            this.updatePatientDashboard(savedLanguage);
        } else if (dashboardType === 'doctor') {
            this.updateDoctorDashboard(savedLanguage);
        } else if (dashboardType === 'admin') {
            this.updateAdminDashboard(savedLanguage);
        } else if (dashboardType === 'records') {
            this.updateRecordsDashboard(savedLanguage);
        } else if (dashboardType === 'availability') {
            this.updateAvailabilityDashboard(savedLanguage);
        } else if (dashboardType === 'appointments') {
            this.updateAppointmentsDashboard(savedLanguage);
        }
        
        // Update user name from localStorage (admin doesn't need this)
        if (dashboardType !== 'admin') {
            this.updateUserName();
        }
        
        // Update footer translations for all pages
        const t = LanguageManager.translations[savedLanguage];
        if (t && this.updateFooter) {
            this.updateFooter(t);
        }
        
        // Initialize dashboard data loading (only on actual dashboard pages)
        if (typeof Dashboard !== 'undefined' && Dashboard.initialize && !window.location.pathname.includes('video-consultation.html')) {
            try {
                await Dashboard.initialize();
            } catch (error) {
                console.error('Error initializing dashboard data:', error);
            }
        }
        
        // Dashboard initialized with saved language preference
    },

    // Initialize records pages on page load
    async initializeRecords() {
        
        // Load translations first
        await LanguageManager.loadTranslations();
        
        // Get saved language or default to Arabic
        const savedLanguage = LanguageManager.getLanguage() || 'ar';
        
        // Apply language settings
        LanguageManager.applyLanguage(savedLanguage);
        
        // Update records content
        this.updateRecordsDashboard(savedLanguage);
        
        // Update user name from localStorage
        this.updateUserName();
        
    },

    // Update country dropdown options
    updateCountryOptions() {
        const lang = localStorage.getItem('sahatak_language') || 'ar';
        const translations = LanguageManager.translations[lang];
        
        if (!translations?.country_options) return;
        
        const countryOptions = translations.country_options;
        
        // Update each country option
        this.updateElementText('select-country', countryOptions.select_country);
        this.updateElementText('country-sudan', countryOptions.country_sudan);
        this.updateElementText('country-egypt', countryOptions.country_egypt);
        this.updateElementText('country-saudi', countryOptions.country_saudi);
        this.updateElementText('country-uae', countryOptions.country_uae);
        this.updateElementText('country-ireland', countryOptions.country_ireland);
        this.updateElementText('country-usa', countryOptions.country_usa);
        this.updateElementText('country-uk', countryOptions.country_uk);
    }
};

// Global function for language switching in dashboards
// Update EHR (Electronic Health Record) dashboard translations
DashboardTranslations.updateEHRDashboard = function(lang) {
    const t = LanguageManager.translations[lang];
    if (!t || !t.ehr) {
        console.warn('EHR translations not available for language:', lang);
        return;
    }

    const ehr = t.ehr;

    // Header translations
    this.updateElementText('ehr-title', ehr.title);
    this.updateElementText('patient-info', ehr.patient_loading);

    // Tab translations - check if tabs have text elements
    const diagnosesTab = document.querySelector('#diagnoses-tab');
    const vitalsTab = document.querySelector('#vitals-tab');
    const historyTab = document.querySelector('#history-tab');
    const appointmentsTab = document.querySelector('#appointments-tab');

    if (diagnosesTab && ehr.tabs?.diagnoses) {
        diagnosesTab.innerHTML = `<i class="bi bi-clipboard-pulse me-1"></i>${ehr.tabs.diagnoses}`;
    }
    if (vitalsTab && ehr.tabs?.vitals) {
        vitalsTab.innerHTML = `<i class="bi bi-activity me-1"></i>${ehr.tabs.vitals}`;
    }
    if (historyTab && ehr.tabs?.history) {
        historyTab.innerHTML = `<i class="bi bi-journal-medical me-1"></i>${ehr.tabs.history}`;
    }
    if (appointmentsTab && ehr.tabs?.appointments) {
        appointmentsTab.innerHTML = `<i class="bi bi-calendar-event me-1"></i>${ehr.tabs.appointments}`;
    }

    // Footer translations
    this.updateElementText('footer-brand', ehr.footer?.brand || t.footer?.brand);
    this.updateElementText('footer-links-title', ehr.footer?.links_title || t.footer?.quick_links);
    this.updateElementText('footer-support-title', ehr.footer?.support_title || t.footer?.support);
    this.updateElementText('footer-emergency-text', ehr.footer?.emergency_text || t.footer?.emergency?.text);
    this.updateElementText('footer-emergency-action', ehr.footer?.emergency_action || t.footer?.emergency?.action);
    this.updateElementText('footer-emergency-note', ehr.footer?.emergency_note || t.footer?.emergency?.note);
    this.updateElementText('footer-copyright', ehr.footer?.copyright || t.footer?.copyright);
    this.updateElementText('footer-medical-disclaimer', ehr.footer?.medical_disclaimer || t.footer?.disclaimer);

    // Language switch
    const oppositeLanguage = lang === 'ar' ? 'English' : 'Ø§Ù„Ø¹Ø±Ø¨ÙŠØ©';
    this.updateElementText('current-lang', oppositeLanguage);

};

function showLanguageSelector() {
    const currentLang = LanguageManager.getLanguage() || 'ar';
    const newLang = currentLang === 'ar' ? 'en' : 'ar';
    
    // Determine page type from URL
    const isEHRPage = window.location.href.includes('patient-ehr.html');
    const isDoctorDashboard = window.location.href.includes('doctor.html');
    const isRecordsPage = window.location.href.includes('/records/');
    const isAvailabilityPage = window.location.href.includes('manage-availability.html');
    
    if (isEHRPage) {
        // Switch language for EHR page
        DashboardTranslations.switchEHRLanguage(newLang);
    } else if (isRecordsPage) {
        // Switch language for Records pages
        DashboardTranslations.switchRecordsLanguage(newLang);
    } else if (isAvailabilityPage) {
        // Switch language for Availability pages
        DashboardTranslations.switchAvailabilityLanguage(newLang);
    } else {
        const dashboardType = isDoctorDashboard ? 'doctor' : 'patient';
        // Switch language for dashboard
        DashboardTranslations.switchDashboardLanguage(newLang, dashboardType);
    }
}

// Also add the toggleLanguage function for compatibility
function toggleLanguage() {
    showLanguageSelector();
}

// Add EHR language switching function
DashboardTranslations.switchEHRLanguage = function(newLang) {
    
    // Store new language
    LanguageManager.setLanguage(newLang);
    
    // Update EHR interface
    this.updateEHRDashboard(newLang);
    
    // Update HTML direction
    document.documentElement.lang = newLang;
    document.documentElement.dir = newLang === 'ar' ? 'rtl' : 'ltr';
    
    // Update title
    const title = LanguageManager.translations[newLang]?.ehr?.page_title || 'Ø§Ù„Ø³Ø¬Ù„ Ø§Ù„Ø·Ø¨ÙŠ Ø§Ù„Ø¥Ù„ÙƒØªØ±ÙˆÙ†ÙŠ | ØµØ­ØªÙƒ';
    document.title = title;
};

// Update Records dashboard translations
DashboardTranslations.updateRecordsDashboard = function(lang) {
    const t = LanguageManager.translations[lang];
    
    if (!t || !t.records) {
        console.warn('Records translations not available for language:', lang);
        return;
    }

    const records = t.records;

    // Main titles
    this.updateElementText('records-title', records.title);
    this.updateElementText('records-subtitle', records.subtitle);
    
    // Common navigation elements (same as patient dashboard)
    this.updateElementText('nav-dashboard', t.dashboard?.patient?.nav?.home || 'Dashboard');
    this.updateElementText('nav-back', t.auth?.back || 'Back');
    this.updateElementText('btn-logout', t.dashboard?.patient?.buttons?.logout || 'Logout');
    
    // Stats - use medical_dashboard section for these specific IDs
    const medicalDashboard = t.medical_dashboard;
    this.updateElementText('history-completion', records.stats?.history_completion || medicalDashboard?.['stat-history-completion']);
    this.updateElementText('active-prescriptions-count', records.stats?.active_prescriptions || medicalDashboard?.['stat-active-prescriptions']);
    this.updateElementText('recent-updates-count', records.stats?.recent_updates || medicalDashboard?.['stat-recent-updates']);
    this.updateElementText('last-update-days', records.stats?.days_since_update || medicalDashboard?.['stat-days-since-update']);
    
    // Stat labels - use medical_dashboard section as primary source
    this.updateElementText('stat-history-completion', medicalDashboard?.['stat-history-completion'] || records.stats?.history_completion);
    this.updateElementText('stat-active-prescriptions', medicalDashboard?.['stat-active-prescriptions'] || records.stats?.active_prescriptions);
    this.updateElementText('stat-recent-updates', medicalDashboard?.['stat-recent-updates'] || records.stats?.recent_updates);
    this.updateElementText('stat-days-since-update', medicalDashboard?.['stat-days-since-update'] || records.stats?.days_since_update);

    // Navigation cards - use medical_dashboard section as primary source
    this.updateElementText('medical-history-card-title', medicalDashboard?.['medical-history-card-title'] || records.navigation?.medical_history);
    this.updateElementText('medical-history-card-desc', medicalDashboard?.['medical-history-card-desc'] || records.navigation?.medical_history_desc);
    this.updateElementText('prescriptions-card-title', medicalDashboard?.['prescriptions-card-title'] || records.navigation?.prescriptions);
    this.updateElementText('prescriptions-card-desc', medicalDashboard?.['prescriptions-card-desc'] || records.navigation?.prescriptions_desc);

    // Buttons - use medical_dashboard section as primary source
    this.updateElementText('view-complete-history-btn', medicalDashboard?.['view-complete-history-btn'] || records.buttons?.view_complete_history || 'View Complete History');
    this.updateElementText('update-history-btn', medicalDashboard?.['update-history-btn'] || records.buttons?.update_data || 'Update Data');
    this.updateElementText('view-all-prescriptions-btn', medicalDashboard?.['view-all-prescriptions-btn'] || records.buttons?.view_all_prescriptions || 'View All Prescriptions');
    this.updateElementText('active-prescriptions-btn', medicalDashboard?.['active-prescriptions-btn'] || records.buttons?.active_prescriptions || 'Active Prescriptions');

    // Recent Activity - use medical_dashboard section as primary source
    this.updateElementText('recent-activity-title', medicalDashboard?.['recent-activity-title'] || records.recent_activity?.title);
    this.updateElementText('view-all-activity', records.recent_activity?.view_all);
    
    // Pagination elements - use medical_dashboard section
    this.updateElementText('pagination-info-text', medicalDashboard?.['pagination-info-text']);
    this.updateElementText('prev-text', medicalDashboard?.['prev-text']);
    this.updateElementText('next-text', medicalDashboard?.['next-text']);

    // Loading states
    this.updateElementText('loading-text', records.loading?.default || records.loading || 'Loading...');
    this.updateElementText('medical-loading-text', records.loading?.medical || records.loading?.default || 'Loading medical data...');
    this.updateElementText('prescription-loading-text', records.loading?.prescription || records.loading?.default || 'Loading prescriptions...');
    this.updateElementText('spinner-loading-text', records.loading?.default || records.loading || 'Loading...');
    this.updateElementText('loading-activity-text', records.loading?.activity || records.recent_activity?.loading_activity || 'Loading recent activity...');
    this.updateElementText('loading-prescriptions-text', records.loading?.prescriptions || 'Loading prescriptions...');

    // Medical History page specific
    this.updateElementText('medical-history-title', t.medical_history?.title);
    this.updateElementText('medical-history-subtitle', t.medical_history?.subtitle);
    this.updateElementText('edit-history', t.medical_history?.buttons?.edit || 'Edit History');
    this.updateElementText('summary-title', t.medical_history?.summary_title || 'Medical Summary');
    this.updateElementText('timeline-title', t.medical_history?.timeline_title || 'Update Timeline');
    this.updateElementText('filter-all', t.medical_history?.filter?.all || 'All');
    this.updateElementText('filter-appointments', t.medical_history?.filter?.appointments || 'Appointments');
    this.updateElementText('filter-self-updates', t.medical_history?.filter?.self_updates || 'Self Updates');
    this.updateElementText('summary-loading', t.medical_history?.loading?.summary || 'Loading summary...');
    this.updateElementText('timeline-loading', t.medical_history?.loading?.timeline || 'Loading timeline...');
    
    // Medical History Form Labels
    this.updateElementText('modal-title', t.medical_history?.modal?.title || 'Edit Medical History');
    this.updateElementText('basic-info-title', t.medical_history?.form?.basic_info || 'Basic Information');
    this.updateElementText('lifestyle-title', t.medical_history?.form?.lifestyle || 'Lifestyle');
    this.updateElementText('medical-conditions-title', t.medical_history?.form?.medical_conditions || 'Medical Conditions');
    this.updateElementText('blood-type-label', t.medical_history?.form?.blood_type || 'Blood Type');
    this.updateElementText('height-label', t.medical_history?.form?.height || 'Height (cm)');
    this.updateElementText('weight-label', t.medical_history?.form?.weight || 'Weight (kg)');
    this.updateElementText('smoking-label', t.medical_history?.form?.smoking || 'Smoking Status');
    this.updateElementText('exercise-label', t.medical_history?.form?.exercise || 'Exercise Frequency');
    this.updateElementText('alcohol-label', t.medical_history?.form?.alcohol || 'Alcohol Consumption');
    this.updateElementText('allergies-label', t.medical_history?.form?.allergies || 'Allergies');
    this.updateElementText('current-medications-label', t.medical_history?.form?.current_medications || 'Current Medications');
    this.updateElementText('chronic-conditions-label', t.medical_history?.form?.chronic_conditions || 'Chronic Conditions');
    this.updateElementText('family-history-label', t.medical_history?.form?.family_history || 'Family History');
    this.updateElementText('surgical-history-label', t.medical_history?.form?.surgical_history || 'Surgical History');
    this.updateElementText('medical-history-label', t.medical_history?.form?.general_history || 'General Medical History');
    this.updateElementText('update-notes-label', t.medical_history?.form?.update_notes || 'Update Notes');
    
    // Medical History Form Options
    this.updateElementText('select-blood-type', t.medical_history?.form?.select_blood_type || 'Select Blood Type');
    this.updateElementText('select-smoking', t.medical_history?.form?.select_smoking || 'Select Status');
    this.updateElementText('never-smoked', t.medical_history?.form?.never_smoked || 'Never');
    this.updateElementText('former-smoker', t.medical_history?.form?.former_smoker || 'Former');
    this.updateElementText('current-smoker', t.medical_history?.form?.current_smoker || 'Current');
    this.updateElementText('select-exercise', t.medical_history?.form?.select_exercise || 'Select Frequency');
    this.updateElementText('rare-exercise', t.medical_history?.form?.rare || 'Rare');
    this.updateElementText('weekly-exercise', t.medical_history?.form?.weekly || 'Weekly');
    this.updateElementText('daily-exercise', t.medical_history?.form?.daily || 'Daily');
    this.updateElementText('select-alcohol', t.medical_history?.form?.select_alcohol || 'Select Consumption');
    this.updateElementText('no-drink', t.medical_history?.form?.none || 'None');
    this.updateElementText('sometimes', t.medical_history?.form?.occasional || 'Occasional');
    this.updateElementText('moderate', t.medical_history?.form?.moderate || 'Moderate');
    this.updateElementText('heavy', t.medical_history?.form?.heavy || 'Heavy');
    
    // Medical History Modal Buttons
    this.updateElementText('cancel-btn-text', t.buttons?.cancel || 'Cancel');
    this.updateElementText('save-btn-text', t.buttons?.save || 'Save Changes');
    this.updateElementText('close-details-btn', t.buttons?.close || 'Close');
    this.updateElementText('timeline-details-title', t.medical_history?.details_title || 'Update Details');

    // Prescriptions page specific  
    this.updateElementText('prescriptions-title', t.prescriptions?.title);
    this.updateElementText('prescriptions-subtitle', t.prescriptions?.subtitle);
    this.updateElementText('create-prescription', t.prescriptions?.create_prescription);
    
    // Prescriptions Stats
    this.updateElementText('stat-total-prescriptions', t.prescriptions?.stats?.total || 'Total Prescriptions');
    this.updateElementText('stat-active-prescriptions', t.prescriptions?.stats?.active || 'Active Prescriptions');
    this.updateElementText('stat-completed-prescriptions', t.prescriptions?.stats?.completed || 'Completed Prescriptions');
    this.updateElementText('stat-patients', t.prescriptions?.stats?.patients || 'Patients');
    
    // Prescriptions Search & Filter
    const searchPlaceholder = t.prescriptions?.search_placeholder || 'Search prescriptions...';
    const searchInput = document.getElementById('search-prescriptions');
    if (searchInput) searchInput.placeholder = searchPlaceholder;
    
    this.updateElementText('filter-all-status', t.prescriptions?.filter?.all || 'All Status');
    this.updateElementText('filter-active', t.prescriptions?.filter?.active || 'Active');
    this.updateElementText('filter-completed', t.prescriptions?.filter?.completed || 'Completed');
    this.updateElementText('filter-cancelled', t.prescriptions?.filter?.cancelled || 'Cancelled');
    this.updateElementText('filter-expired', t.prescriptions?.filter?.expired || 'Expired');
    
    this.updateElementText('sort-newest', t.prescriptions?.sort?.newest || 'Newest First');
    this.updateElementText('sort-oldest', t.prescriptions?.sort?.oldest || 'Oldest First');
    this.updateElementText('sort-medication', t.prescriptions?.sort?.medication || 'By Medication');
    this.updateElementText('sort-status', t.prescriptions?.sort?.status || 'By Status');
    
    this.updateElementText('loading-text', t.prescriptions?.loading?.default || 'Loading...');
    this.updateElementText('loading-prescriptions-text', t.prescriptions?.loading?.prescriptions || 'Loading prescriptions...');
    
    // Prescriptions Modal
    this.updateElementText('modal-new-prescription', t.prescriptions?.modal?.new_prescription || 'New Prescription');
    this.updateElementText('patient-label', t.prescriptions?.form?.patient || 'Patient');
    this.updateElementText('select-patient', t.prescriptions?.form?.select_patient || 'Select Patient');
    this.updateElementText('appointment-label', t.prescriptions?.form?.appointment || 'Appointment');
    this.updateElementText('select-appointment', t.prescriptions?.form?.select_appointment || 'Select Appointment');
    this.updateElementText('medication-name-label', t.prescriptions?.form?.medication_name || 'Medication Name *');
    this.updateElementText('dosage-label', t.prescriptions?.form?.dosage || 'Dosage *');
    this.updateElementText('frequency-label', t.prescriptions?.form?.frequency || 'Frequency *');
    this.updateElementText('duration-label', t.prescriptions?.form?.duration || 'Duration *');
    this.updateElementText('quantity-label', t.prescriptions?.form?.quantity || 'Quantity');
    this.updateElementText('refills-label', t.prescriptions?.form?.refills || 'Refills Allowed');
    this.updateElementText('start-date-label', t.prescriptions?.form?.start_date || 'Start Date');
    this.updateElementText('end-date-label', t.prescriptions?.form?.end_date || 'End Date');
    this.updateElementText('instructions-label', t.prescriptions?.form?.instructions || 'Instructions');
    this.updateElementText('notes-label', t.prescriptions?.form?.notes || 'Doctor Notes');
    
    // Prescriptions Modal Buttons
    this.updateElementText('modal-cancel', t.buttons?.cancel || 'Cancel');
    this.updateElementText('modal-save', t.buttons?.save || 'Save Prescription');
    this.updateElementText('details-modal-title', t.prescriptions?.details_title || 'Prescription Details');
    this.updateElementText('edit-btn-text', t.buttons?.edit || 'Edit');
    this.updateElementText('mark-complete-btn', t.prescriptions?.mark_complete || 'Mark as Complete');
    this.updateElementText('close-details-btn', t.buttons?.close || 'Close');
    
    // Status Change Modal
    this.updateElementText('status-modal-title', t.prescriptions?.status_modal_title || 'Change Status');
    this.updateElementText('confirm-complete-text', t.prescriptions?.confirm_complete || 'Do you want to mark this prescription as complete?');
    this.updateElementText('completion-notes-label', t.prescriptions?.completion_notes || 'Notes (Optional)');
    this.updateElementText('confirm-complete-btn-text', t.prescriptions?.confirm || 'Yes, Mark as Complete');
    this.updateElementText('status-cancel-btn', t.buttons?.cancel || 'Cancel');

    // Common navigation elements
    this.updateElementText('nav-dashboard', t.dashboard?.patient?.nav?.home || 'Ù„ÙˆØ­Ø© Ø§Ù„ØªØ­ÙƒÙ…');
    this.updateElementText('nav-back', t.auth?.back || 'Ø§Ù„Ø¹ÙˆØ¯Ø©');
    this.updateElementText('btn-logout', t.dashboard?.patient?.buttons?.logout || 'ØªØ³Ø¬ÙŠÙ„ Ø®Ø±ÙˆØ¬');

    // Language toggle - show the opposite language (the one you can switch TO)
    const oppositeLanguage = lang === 'ar' ? 'English' : 'Ø§Ù„Ø¹Ø±Ø¨ÙŠØ©';
    this.updateElementText('current-lang', oppositeLanguage);

    // Update footer
    this.updateFooter(t);

};

// Update Availability dashboard translations
DashboardTranslations.updateAvailabilityDashboard = function(lang) {
    const t = LanguageManager.translations[lang];
    
    if (!t || !t.availability) {
        console.warn('Availability translations not available for language:', lang);
        return;
    }

    const availability = t.availability;

    // Header section - match doctor dashboard
    this.updateElementText('user-name', availability.user_name);
    this.updateElementText('dashboard-title', availability.dashboard_title);
    this.updateElementText('dashboard-subtitle', availability.dashboard_subtitle);

    // Buttons
    this.updateElementText('btn-back', availability.buttons?.back);
    this.updateElementText('btn-profile', availability.buttons?.profile);
    this.updateElementText('btn-logout', availability.buttons?.logout);
    this.updateElementText('btn-weekly', availability.buttons?.weekly);

    // Tabs
    this.updateElementText('tab-weekly', availability.tabs?.weekly);
    this.updateElementText('tab-calendar', availability.tabs?.calendar);
    this.updateElementText('tab-blocked', availability.tabs?.blocked);

    // Weekly schedule
    this.updateElementText('weekly-title', availability.weekly?.title);
    this.updateElementText('loading-weekly', availability.weekly?.loading);
    this.updateElementText('quick-templates', availability.weekly?.quick_templates);
    this.updateElementText('template-fulltime', availability.weekly?.template_fulltime);
    this.updateElementText('template-weekdays', availability.weekly?.template_weekdays);
    this.updateElementText('template-parttime', availability.weekly?.template_parttime);

    // Calendar
    this.updateElementText('calendar-title', availability.calendar?.title);
    this.updateElementText('loading-calendar', availability.calendar?.loading);
    this.updateElementText('current-month', 'January 2025'); // This would be dynamic

    // Blocked times
    this.updateElementText('blocked-title', availability.blocked?.title);
    this.updateElementText('loading-blocked', availability.blocked?.loading);
    this.updateElementText('btn-block-new', availability.blocked?.block_new);

    // Modal elements
    this.updateElementText('modal-block-title', availability.modal?.block_title);
    this.updateElementText('modal-edit-title', availability.modal?.edit_title);
    this.updateElementText('label-date', availability.modal?.date);
    this.updateElementText('label-start-time', availability.modal?.start_time);
    this.updateElementText('label-end-time', availability.modal?.end_time);
    this.updateElementText('label-reason', availability.modal?.reason);
    this.updateElementText('btn-cancel', availability.modal?.cancel);
    this.updateElementText('btn-block-time', availability.modal?.block_time);
    this.updateElementText('btn-unblock', availability.modal?.unblock);
    this.updateElementText('btn-close', availability.modal?.close);

    // Set placeholder for reason textarea
    const reasonTextarea = document.getElementById('block-reason');
    if (reasonTextarea && availability.modal?.placeholder_reason) {
        reasonTextarea.setAttribute('placeholder', availability.modal.placeholder_reason);
    }

    // Action buttons
    this.updateElementText('btn-save-schedule', availability.buttons?.save_schedule);
    this.updateElementText('btn-reset', availability.buttons?.reset);
    this.updateElementText('btn-export', availability.buttons?.export);

    // Loading states
    this.updateElementText('loading-text', availability.loading);
    this.updateElementText('loading-text-2', availability.loading);
    this.updateElementText('loading-text-3', availability.loading);

    // Language toggle - show the opposite language (the one you can switch TO)
    const oppositeLanguage = lang === 'ar' ? 'English' : 'Ø§Ù„Ø¹Ø±Ø¨ÙŠØ©';
    this.updateElementText('current-lang', oppositeLanguage);

    // Update footer
    this.updateFooter(t);

};

// Update footer translations  
DashboardTranslations.updateFooter = function(t) {
    // updateFooter called with footer data
    if (t.footer) {
        // Footer data found and ready for update
        this.updateElementText('footer-brand', t.footer.brand || 'Sahatak | ØµØ­ØªÙƒ');
        this.updateElementText('footer-links-title', t.footer.links_title || 'Quick Links');
        this.updateElementText('footer-about', t.footer.about || 'About Platform');
        this.updateElementText('footer-services', t.footer.services || 'Services');
        this.updateElementText('footer-support-title', t.footer.support_title || 'Support & Help');
        this.updateElementText('footer-help', t.footer.help || 'Help Center');
        this.updateElementText('footer-contact', t.footer.contact || 'Contact Us');
        this.updateElementText('footer-emergency-text', t.footer.emergency_text || 'For medical emergencies');
        this.updateElementText('footer-emergency-action', t.footer.emergency_action || 'Go to nearest ER hospital');
        this.updateElementText('footer-emergency-note', t.footer.emergency_note || 'For non-urgent consultations use the platform');
        this.updateElementText('footer-copyright', t.footer.copyright || 'Â© 2025 Sahatak. All rights reserved.');
        this.updateElementText('footer-medical-disclaimer', t.footer.medical_disclaimer || 'This platform does not replace visiting a doctor in emergency cases');
    }
};

// Add Records language switching function
DashboardTranslations.switchRecordsLanguage = function(newLang) {
    
    // Store new language
    LanguageManager.setLanguage(newLang);
    
    // Apply language settings
    LanguageManager.applyLanguage(newLang);
    
    // Update Records interface
    this.updateRecordsDashboard(newLang);
    
    // Update HTML direction
    document.documentElement.lang = newLang;
    document.documentElement.dir = newLang === 'ar' ? 'rtl' : 'ltr';
    
    // Update page title
    const t = LanguageManager.translations[newLang];
    const title = t?.records?.title ? `${t.records.title} | ${t.app_name}` : 'Medical Records | Sahatak';
    document.title = title;
};

// Add Availability language switching function
DashboardTranslations.switchAvailabilityLanguage = function(newLang) {
    
    // Store new language
    LanguageManager.setLanguage(newLang);
    
    // Apply language settings
    LanguageManager.applyLanguage(newLang);
    
    // Update Availability interface
    this.updateAvailabilityDashboard(newLang);
    
    // Update HTML direction
    document.documentElement.lang = newLang;
    document.documentElement.dir = newLang === 'ar' ? 'rtl' : 'ltr';
    
    // Update page title
    const t = LanguageManager.translations[newLang];
    const title = t?.availability?.dashboard_title ? `${t.availability.dashboard_title} | ${t.app_name}` : 'Manage Availability | Sahatak';
    document.title = title;
};

// Update medical history form translations
DashboardTranslations.updateMedicalHistoryForm = function(lang) {
    const t = LanguageManager.translations[lang];
    if (!t || !t.medical_history_form) {
        console.error('Medical history form translations not found');
        return;
    }

    const form = t.medical_history_form;

    // Header and main elements
    this.updateElementText('form-title', form.title);
    this.updateElementText('form-info', form.info);
    this.updateElementText('brand-name', t.app_name);
    
    // Show opposite language for language toggle
    const oppositeLanguage = lang === 'ar' ? 'English' : 'Ø§Ù„Ø¹Ø±Ø¨ÙŠØ©';
    this.updateElementText('current-lang', oppositeLanguage);
    
    // Navigation elements
    this.updateElementText('nav-dashboard', t.dashboard?.patient?.nav?.home || 'Dashboard');
    this.updateElementText('btn-logout', t.dashboard?.patient?.buttons?.logout || 'Logout');

    // Section headers
    this.updateElementText('section-basic-info', form.sections.basic_info);
    this.updateElementText('section-medical-history', form.sections.medical_history);
    this.updateElementText('section-lifestyle', form.sections.lifestyle);

    // Form labels
    this.updateElementText('label-height', form.labels.height);
    this.updateElementText('label-weight', form.labels.weight);
    this.updateElementText('label-blood-type', form.labels.blood_type);
    this.updateElementText('label-history', form.labels.history);
    this.updateElementText('label-allergies', form.labels.allergies);
    this.updateElementText('label-medications', form.labels.medications);
    this.updateElementText('label-chronic', form.labels.chronic);
    this.updateElementText('label-surgeries', form.labels.surgeries);
    this.updateElementText('label-family-history', form.labels.family_history);
    this.updateElementText('label-smoking', form.labels.smoking);
    this.updateElementText('label-alcohol', form.labels.alcohol);
    this.updateElementText('label-exercise', form.labels.exercise);

    // Placeholders
    this.updatePlaceholder('height', form.placeholders.height);
    this.updatePlaceholder('weight', form.placeholders.weight);
    this.updatePlaceholder('medical_history', form.placeholders.history);
    this.updatePlaceholder('allergies', form.placeholders.allergies);
    this.updatePlaceholder('current_medications', form.placeholders.medications);
    this.updatePlaceholder('chronic_conditions', form.placeholders.chronic);
    this.updatePlaceholder('surgical_history', form.placeholders.surgeries);
    this.updatePlaceholder('family_history', form.placeholders.family_history);

    // Options
    this.updateElementText('option-select-blood', form.options.select_blood);
    this.updateElementText('label-never-smoke', form.options.never_smoke);
    this.updateElementText('label-former-smoke', form.options.former_smoke);
    this.updateElementText('label-current-smoke', form.options.current_smoke);
    this.updateElementText('option-none', form.options.none || 'None');
    this.updateElementText('option-occasional', form.options.occasional || 'Occasional');
    this.updateElementText('option-moderate', form.options.moderate || 'Moderate');
    this.updateElementText('option-heavy', form.options.heavy || 'Heavy');
    this.updateElementText('option-no-exercise', form.options.no_exercise);
    this.updateElementText('option-rare-exercise', form.options.rare_exercise);
    this.updateElementText('option-weekly', form.options.weekly);
    this.updateElementText('option-daily', form.options.daily);

    // Buttons
    this.updateElementText('btn-skip', form.buttons.skip);
    this.updateElementText('btn-save', form.buttons.save);

};

// Update doctor profile completion translations
DashboardTranslations.updateDoctorProfile = function(lang) {
    const t = LanguageManager.translations[lang];
    if (!t || !t.doctor_profile) {
        console.error('Doctor profile translations not found');
        return;
    }

    const profile = t.doctor_profile;

    // Header and main elements
    this.updateElementText('page-title', profile.title);
    this.updateElementText('page-subtitle', profile.subtitle);
    
    // Show opposite language for language toggle
    const oppositeLanguage = lang === 'ar' ? 'English' : 'Ø§Ù„Ø¹Ø±Ø¨ÙŠØ©';
    this.updateElementText('current-lang', oppositeLanguage);
    
    // Navigation elements
    this.updateElementText('nav-dashboard', t.dashboard?.doctor?.nav?.home || 'Dashboard');
    this.updateElementText('btn-logout', t.dashboard?.doctor?.buttons?.logout || 'Logout');

    // Alert messages
    this.updateElementText('alert-title', profile.alerts.title);
    this.updateElementText('alert-message', profile.alerts.message);

    // Status badge
    this.updateElementText('status-badge', profile.status.incomplete);

    // Step titles
    this.updateElementText('step-1-title', profile.steps.professional);
    this.updateElementText('step-2-title', profile.steps.contact);
    this.updateElementText('step-3-title', profile.steps.documents);
    this.updateElementText('step-4-title', profile.steps.review);

    // Section headers
    this.updateElementText('section-professional', profile.sections.professional);
    this.updateElementText('section-contact', profile.sections.contact);
    this.updateElementText('section-documents', profile.sections.documents);
    this.updateElementText('section-review', profile.sections.review);

    // Form labels
    this.updateElementText('label-education', profile.labels.education);
    this.updateElementText('label-certifications', profile.labels.certifications);
    this.updateElementText('label-memberships', profile.labels.memberships);
    this.updateElementText('label-languages', profile.labels.languages);
    this.updateElementText('label-areas', profile.labels.areas);
    this.updateElementText('label-office-phone', profile.labels.office_phone);
    this.updateElementText('label-emergency', profile.labels.emergency);
    this.updateElementText('label-address', profile.labels.address);
    this.updateElementText('label-license-doc', profile.labels.license_doc);
    this.updateElementText('label-degree-doc', profile.labels.degree_doc);
    this.updateElementText('label-id-doc', profile.labels.id_doc);
    this.updateElementText('label-other-doc', profile.labels.other_doc);
    this.updateElementText('label-confirm', profile.labels.confirm);

    // Placeholders
    this.updatePlaceholder('education_details', profile.placeholders.education);
    this.updatePlaceholder('certifications', profile.placeholders.certifications);
    this.updatePlaceholder('memberships', profile.placeholders.memberships);
    this.updatePlaceholder('languages_spoken', profile.placeholders.languages);
    this.updatePlaceholder('consultation_areas', profile.placeholders.areas);
    this.updatePlaceholder('office_phone', profile.placeholders.office_phone);
    this.updatePlaceholder('emergency_contact', profile.placeholders.emergency);
    this.updatePlaceholder('office_address', profile.placeholders.address);

    // Hints
    this.updateElementText('hint-certifications', profile.hints.certifications);
    this.updateElementText('hint-memberships', profile.hints.memberships);
    this.updateElementText('hint-languages', profile.hints.languages);
    this.updateElementText('hint-areas', profile.hints.areas);
    this.updateElementText('hint-other', profile.hints.other);

    // Document info and review message
    this.updateElementText('document-info', profile.document_info);
    this.updateElementText('review-message', profile.review_message);

    // Buttons
    this.updateElementText('btn-previous', profile.buttons.previous);
    this.updateElementText('btn-next', profile.buttons.next);
    this.updateElementText('btn-submit', profile.buttons.submit);

};

// Helper function to update input placeholder (add if not already present)
if (!DashboardTranslations.updatePlaceholder) {
    DashboardTranslations.updatePlaceholder = function(elementId, text) {
        const element = document.getElementById(elementId);
        if (element && text) {
            element.placeholder = text;
        }
    };
 }
