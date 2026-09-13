// Admin Authentication and Dashboard Management
const AdminAuth = {
    API_BASE_URL: 'https://sahatak.pythonanywhere.com/api',
    sessionExpiredNotified: false,
    
    // Check if user is authenticated
    isAuthenticated() {
        const userType = localStorage.getItem('userType');
        const adminLoggedIn = localStorage.getItem('adminLoggedIn') === 'true' || sessionStorage.getItem('adminLoggedIn') === 'true';
        const hasToken = !!(localStorage.getItem('adminToken') || sessionStorage.getItem('adminToken'));
        return adminLoggedIn && userType === 'admin' && hasToken;
    },
    
    // Get auth token
    getToken() {
        return localStorage.getItem('adminToken') || sessionStorage.getItem('adminToken');
    },
    
    // Verify session validity
    async verifySession() {
        // Check with the backend if the session is still valid
        try {
            const response = await fetch(`${this.API_BASE_URL}/auth/me`, {
                method: 'GET',
                credentials: 'include', // Important for session cookies
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            return response.ok;
        } catch (error) {
            return false;
        }
    },
    
    // Admin authentication guard
    guard() {
        // Check if user is authenticated as admin
        if (!this.isAuthenticated()) {
            console.log('Admin not authenticated, redirecting to login');
            window.location.href = './index.html';
            return false;
        }
        
        return true;
    },
    
    // Verify token (for compatibility)
    async verifyToken() {
        const token = this.getToken();
        if (!token) return false;
        
        // JWT tokens are variable length (typically 100+ chars)
        // Base64 tokens are also variable length
        // Just check if token exists and has reasonable length
        return token && token.length > 20;
    },
    
    // Login function
    async login(email, password, remember = false) {
        try {
            const requestBody = {
                login_identifier: email,
                password: password,
                remember_me: remember
            };
            
            console.log('Sending login request with:', requestBody);
            
            const response = await fetch(`${this.API_BASE_URL}/auth/login`, {
                method: 'POST',
                credentials: 'include', // Important: include cookies for session
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });
            
            const data = await response.json();
            console.log('Login response:', response.status, data);
            
            if (response.ok && data.success) {
                // Check if user is admin (user data is nested under data.data.user)
                const userData = data.data.user;
                if (userData.user_type !== 'admin') {
                    throw new Error('Access denied. Admin credentials required.');
                }
                
                // Store authentication data
                const storage = remember ? localStorage : sessionStorage;
                storage.setItem('adminLoggedIn', 'true');
                
                // Store token if provided (for admin users)
                if (data.data.access_token) {
                    storage.setItem('adminToken', data.data.access_token);
                }
                
                localStorage.setItem('userType', userData.user_type);
                localStorage.setItem('adminEmail', userData.email);
                localStorage.setItem('adminName', userData.full_name);
                
                if (remember) {
                    localStorage.setItem('rememberAdmin', 'true');
                }
                
                return { success: true, data: userData };
            } else {
                throw new Error(data.message || 'Invalid email or password');
            }
        } catch (error) {
            console.error('Login error:', error);
            return { success: false, error: error.message || 'Login failed. Please try again.' };
        }
    },
    
    // Logout function
    logout() {
        localStorage.removeItem('adminLoggedIn');
        localStorage.removeItem('adminToken');
        localStorage.removeItem('userType');
        localStorage.removeItem('adminEmail');
        localStorage.removeItem('adminName');
        localStorage.removeItem('rememberAdmin');
        sessionStorage.removeItem('adminLoggedIn');
        sessionStorage.removeItem('adminToken');
        window.location.href = './index.html';
    },
    
    // Authentication guard
    guard() {
        if (!this.isAuthenticated()) {
            window.location.href = './index.html';
            return false;
        }
        return true;
    },
    
    // Make authenticated API request
    async apiRequest(endpoint, options = {}) {
        const token = this.getToken();
        if (!token) {
            throw new Error('Not authenticated');
        }
        
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            credentials: 'include'
        };
        
        const mergedOptions = {
            ...defaultOptions,
            ...options,
            headers: {
                ...defaultOptions.headers,
                ...(options.headers || {})
            }
        };
        
        const response = await fetch(`${this.API_BASE_URL}${endpoint}`, mergedOptions);
        
        // Handle 401 Unauthorized
        if (response.status === 401) {
            if (!this.sessionExpiredNotified) {
                if (window.AdminDashboard && typeof window.AdminDashboard.showNotification === 'function') {
                    window.AdminDashboard.showNotification('Session expired. Please log in again.', 'warning');
                } else {
                    alert('Your admin session has expired. Please log in again.');
                }
                this.sessionExpiredNotified = true;
            }
            this.logout();
            const sessionError = new Error('Session expired');
            sessionError.code = 'SESSION_EXPIRED';
            throw sessionError;
        }
        
        return response;
    }
};

// Dashboard functionality
const AdminDashboard = {
    currentSection: 'overview',
    currentAppointments: [],
    currentAdminUsers: [],
    currentPendingDoctors: [],

    // Initialize dashboard
    async init() {
        // Check authentication
        if (!AdminAuth.guard()) return;
        
        // Set user info in UI
        this.updateUserInfo();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Try to load dashboard data (but don't logout on failure)
        try {
            await this.loadDashboardData();
        } catch (error) {
            console.error('Failed to load initial dashboard data:', error);
        }
        
        // Setup periodic refresh
        this.setupAutoRefresh();
        
        // Setup create admin form
        this.setupCreateAdminForm();
        
        // Setup authenticated downloads for backend file links
        this.setupAuthenticatedDownloads();
    },
    
    // Update user info in UI
    updateUserInfo() {
        const adminName = localStorage.getItem('adminName');
        
        // Update name elements
        const userNameElement = document.getElementById('user-name');
        if (userNameElement) {
            userNameElement.textContent = adminName || 'Admin User';
        }
        
        // Also update any elements with user-name class
        const userNameElements = document.querySelectorAll('.user-name');
        userNameElements.forEach(el => {
            if (!el.id) el.textContent = adminName || 'Admin User';
        });
    },
    
    // Load dashboard data
    async loadDashboardData() {
        try {
            const response = await AdminAuth.apiRequest('/admin/dashboard');
            
            if (!response.ok) {
                console.error(`Dashboard API returned ${response.status}: ${response.statusText}`);
                const errorText = await response.text();
                console.error('Error response:', errorText);
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log('Dashboard data received:', data);
            
            if (data.success) {
                this.updateDashboardStats(data.data);
            } else {
                console.error('Dashboard API returned success=false:', data);
                throw new Error(data.error || 'Unknown error');
            }
        } catch (error) {
            console.error('Failed to load dashboard data:', error);
            this.showNotification(`Failed to load dashboard data: ${error.message}`, 'error');
        }
    },
    
    // Update dashboard statistics
    updateDashboardStats(data) {
        // Update stat cards
        if (data.stats) {
            // Update Total Users card
            const totalUsersElement = document.getElementById('total-users-count');
            if (totalUsersElement) {
                totalUsersElement.textContent = data.stats.total_users || 0;
            }
            
            // Update Total Patients card
            const totalPatientsElement = document.getElementById('total-patients-count');
            if (totalPatientsElement) {
                totalPatientsElement.textContent = data.stats.total_patients || 0;
            }
            
            // Update Verified Doctors card
            const verifiedDoctorsElement = document.getElementById('verified-doctors-count');
            if (verifiedDoctorsElement) {
                verifiedDoctorsElement.textContent = data.stats.verified_doctors || 0;
            }
            
            // Update Appointments card
            const appointmentsElement = document.getElementById('appointments-count');
            if (appointmentsElement) {
                appointmentsElement.textContent = data.stats.total_appointments || 0;
            }
            
            // Update System Health card
            const systemHealthElement = document.getElementById('system-health-percentage');
            if (systemHealthElement) {
                systemHealthElement.textContent = (data.stats.system_health || 0) + '%';
            }
        }
        
        // Update recent activities
        if (data.recent_activities) {
            this.updateRecentActivities(data.recent_activities);
        }
        
        // Update analytics data
        if (data.analytics) {
            this.updateAnalytics(data.analytics);
        }
        
        // Update 7-day activity statistics from analytics data
        if (data.analytics) {
            // Update 7-day activity summary with real data
            const newUsers7dEl = document.getElementById('new-users-7d');
            if (newUsers7dEl) newUsers7dEl.textContent = data.analytics.user_activity?.new_users_7d || 0;
            
            const appointments7dEl = document.getElementById('appointments-7d');
            if (appointments7dEl) appointments7dEl.textContent = data.analytics.appointment_metrics?.appointments_7d || 0;
            
            const completed7dEl = document.getElementById('completed-appointments-7d');
            if (completed7dEl) completed7dEl.textContent = data.analytics.appointment_metrics?.completed_appointments || 0;
            
            const activeUsers7dEl = document.getElementById('active-users-7d');
            if (activeUsers7dEl) activeUsers7dEl.textContent = data.analytics.user_activity?.active_users_7d || 0;
        }
    },
    
    // Update recent activities
    updateRecentActivities(activities) {
        const container = document.getElementById('recentActivities');
        if (!container) return;
        
        container.innerHTML = activities.map(activity => `
            <div class="activity-item">
                <div class="activity-icon">
                    <i class="fas fa-${this.getActivityIcon(activity.type)}"></i>
                </div>
                <div class="activity-content">
                    <p class="activity-text">${activity.description}</p>
                    <span class="activity-time">${this.formatTime(activity.timestamp)}</span>
                </div>
            </div>
        `).join('');
    },
    
    // Get activity icon based on type
    getActivityIcon(type) {
        const icons = {
            'user_registration': 'user-plus',
            'appointment': 'calendar-check',
            'payment': 'dollar-sign',
            'doctor_verification': 'user-md',
            'system': 'cog'
        };
        return icons[type] || 'circle';
    },
    
    // Format timestamp
    formatTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;
        
        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)} minutes ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)} hours ago`;
        return date.toLocaleDateString();
    },
    
    // Setup event listeners
    setupEventListeners() {
        // Logout button
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (confirm('Are you sure you want to logout?')) {
                    AdminAuth.logout();
                }
            });
        }
        
        // Navigation menu items
        document.querySelectorAll('.btn-admin-nav').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const section = btn.dataset.target;
                if (section) {
                    this.switchSection(section);
                }
            });
        });
        
        // Search functionality
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.handleSearch(e.target.value);
            });
        }

        // Maintenance mode toggle — persist immediately via the backend
        const maintenanceToggle = document.getElementById('maintenance_mode');
        if (maintenanceToggle) {
            maintenanceToggle.addEventListener('change', async (e) => {
                const enabling = e.target.checked;
                const confirmMsg = enabling
                    ? 'Enable maintenance mode? Visitors will be shown the maintenance page until it is turned off.'
                    : 'Disable maintenance mode and restore normal access for visitors?';
                if (!confirm(confirmMsg)) {
                    e.target.checked = !enabling;
                    return;
                }
                e.target.disabled = true;
                try {
                    const response = await AdminAuth.apiRequest('/admin/settings', {
                        method: 'PUT',
                        body: JSON.stringify({ maintenance_mode: enabling })
                    });
                    const data = await response.json();
                    if (data.success) {
                        this.showNotification(
                            enabling ? 'Maintenance mode ENABLED - visitors will see the maintenance page' : 'Maintenance mode disabled - normal access restored',
                            'success'
                        );
                    } else {
                        console.error('Maintenance toggle failed:', data);
                        e.target.checked = !enabling;
                        this.showNotification(data.message || 'Failed to update maintenance mode', 'error');
                    }
                } catch (error) {
                    console.error('Maintenance toggle error:', error);
                    e.target.checked = !enabling;
                    this.showNotification('Failed to update maintenance mode: ' + error.message, 'error');
                } finally {
                    e.target.disabled = false;
                }
            });
        }
    },

    // Intercept clicks on backend admin download links and fetch with Authorization header
    setupAuthenticatedDownloads() {
        document.addEventListener('click', async (e) => {
            const a = e.target.closest('a');
            if (!a) return;
            
            const href = a.getAttribute('href') || '';
            const apiBase = AdminAuth.API_BASE_URL;
            
            // Only intercept admin doctor file download links
            if (!href.startsWith(apiBase + '/admin/doctors/') || !href.includes('/file/')) return;
            
            e.preventDefault();
            
            try {
                const token = AdminAuth.getToken();
                console.log('Downloading from backend:', href, 'Token present:', !!token);
                
                const headers = { 'Accept': 'application/octet-stream' };
                if (token) headers['Authorization'] = `Bearer ${token}`;
                
                // Fetch the file with authentication
                const resp = await fetch(href, {
                    method: 'GET',
                    headers: headers,
                    credentials: 'include',
                    mode: 'cors'
                });
                
                if (!resp.ok) {
                    console.error('Download failed:', resp.status, resp.statusText);
                    alert('Failed to download file. Status: ' + resp.status);
                    return;
                }
                
                const blob = await resp.blob();
                
                // Extract filename from content-disposition or construct from URL
                let filename = 'document';
                const cd = resp.headers.get('content-disposition');
                if (cd && cd.includes('filename=')) {
                    filename = cd.split('filename=')[1].split(';')[0].replace(/"/g, '').trim();
                } else {
                    // Extract from URL: /admin/doctors/77/file/license -> license.pdf
                    const parts = href.split('/');
                    const fileType = parts[parts.length - 1];
                    filename = fileType + '.pdf';
                }
                
                // Create blob URL and trigger download
                const blobUrl = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = blobUrl;
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                link.remove();
                window.URL.revokeObjectURL(blobUrl);
                
                console.log('File downloaded:', filename);
            } catch (err) {
                console.error('Download error:', err);
                alert('Error downloading file: ' + err.message);
            }
        });
    },
    
    // Switch dashboard section
    switchSection(section) {
        // Hide all sections
        document.querySelectorAll('.admin-section').forEach(sec => {
            sec.style.display = 'none';
        });
        
        // Show selected section
        const selectedSection = document.getElementById(section);
        if (selectedSection) {
            selectedSection.style.display = 'block';
        }
        
        // Update active nav item
        document.querySelectorAll('.btn-admin-nav').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.target === section) {
                btn.classList.add('active');
            }
        });
        
        this.currentSection = section;
        
        // Load section-specific data
        this.loadSectionData(section);
    },
    
    // Load section-specific data
    async loadSectionData(section) {
        console.log('Loading data for section:', section); // Debug log

        const loaders = {
            'users': this.loadUsersData,
            'doctors': this.loadDoctorsData,
            'appointments': this.loadAppointmentsData,
            'analytics': this.loadAnalyticsData,
            'settings': this.loadSettingsData
        };

        const loader = loaders[section];
        if (loader) {
            console.log('Calling loader for section:', section); // Debug log
            await loader.call(this);
        }

        // Also load admin users when settings section is opened
        if (section === 'settings') {
            console.log('Loading admin users for settings section'); // Debug log
            await this.loadAdminUsers();
            // Force reload settings to ensure maintenance mode toggle is correct
            console.log('Reloading settings to ensure UI is in sync'); // Debug log
            await this.loadSettingsData();
        }
    },
    
    // Current filter state
    currentUserFilters: {
        page: 1,
        per_page: 20,
        user_type: '',
        is_active: '',
        search: ''
    },

    // Load users data
    async loadUsersData() {
        try {
            // Reset to first page when loading fresh data
            this.currentUserFilters.page = 1;
            const response = await AdminAuth.apiRequest('/admin/users?page=1&per_page=20');
            const data = await response.json();
            
            console.log('Users data received:', data); // Debug log
            
            if (data.success && data.data) {
                this.displayUsersTable(data.data.users);
                // Update pagination if needed
                if (data.data.pagination) {
                    this.updateUsersPagination(data.data.pagination);
                }
            } else {
                console.error('Invalid users response:', data);
                this.displayUsersTable([]);
            }
            
            // Setup filter event listeners if not already done
            this.setupUserFilters();
            
        } catch (error) {
            console.error('Failed to load users:', error);
            this.showNotification('Failed to load users: ' + error.message, 'error');
            this.displayUsersTable([]);
        }
    },
    
    // Display users table
    displayUsersTable(users) {
        const tbody = document.getElementById('users-table-body');
        if (!tbody) return;
        
        if (!users || users.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center py-4">
                        <p class="text-muted">No users found</p>
                    </td>
                </tr>
            `;
            return;
        }
        
        tbody.innerHTML = users.map((user, index) => `
            <tr>
                <td>${index + 1}</td>
                <td>${user.full_name || 'N/A'}</td>
                <td>${user.email}</td>
                <td>${user.phone || 'N/A'}</td>
                <td>
                    <span class="badge bg-${user.user_type === 'admin' ? 'danger' : user.user_type === 'doctor' ? 'info' : 'primary'}">
                        ${user.user_type}
                    </span>
                </td>
                <td>
                    <span class="badge bg-${user.is_active ? 'success' : 'secondary'}">
                        ${user.is_active ? 'Active' : 'Inactive'}
                    </span>
                </td>
                <td>${new Date(user.created_at).toLocaleDateString()}</td>
                <td>
                    <div class="btn-group" role="group">
                        <button class="btn btn-sm btn-outline-info" onclick="AdminDashboard.viewUser(${user.id}, '${user.full_name || user.email}')" title="View Details">
                            <i class="bi bi-eye"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-warning" onclick="AdminDashboard.changeUserPassword(${user.id}, '${user.full_name || user.email}')" title="Change Password">
                            <i class="bi bi-key"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-${user.is_active ? 'danger' : 'success'}" onclick="AdminDashboard.toggleUserStatus(${user.id})" title="${user.is_active ? 'Deactivate' : 'Activate'}">
                            <i class="bi bi-${user.is_active ? 'x-circle' : 'check-circle'}"></i>
                        </button>
                        ${user.user_type !== 'admin' ? `<button class="btn btn-sm btn-outline-danger" onclick="AdminDashboard.deleteUser(${user.id}, '${user.full_name || user.email}')" title="Delete User">
                            <i class="bi bi-trash"></i>
                        </button>` : ''}
                    </div>
                </td>
            </tr>
        `).join('');
    },
    
    // Update users pagination
    updateUsersPagination(pagination) {
        const paginationContainer = document.getElementById('users-pagination');
        if (!paginationContainer || !pagination) return;
        
        let html = '';
        
        // Previous button
        if (pagination.has_prev) {
            html += `<li class="page-item"><a class="page-link" href="#" onclick="AdminDashboard.loadUsersPage(${pagination.page - 1})">Previous</a></li>`;
        } else {
            html += `<li class="page-item disabled"><span class="page-link">Previous</span></li>`;
        }
        
        // Page numbers
        for (let i = 1; i <= pagination.pages; i++) {
            if (i === pagination.page) {
                html += `<li class="page-item active"><span class="page-link">${i}</span></li>`;
            } else {
                html += `<li class="page-item"><a class="page-link" href="#" onclick="AdminDashboard.loadUsersPage(${i})">${i}</a></li>`;
            }
        }
        
        // Next button
        if (pagination.has_next) {
            html += `<li class="page-item"><a class="page-link" href="#" onclick="AdminDashboard.loadUsersPage(${pagination.page + 1})">Next</a></li>`;
        } else {
            html += `<li class="page-item disabled"><span class="page-link">Next</span></li>`;
        }
        
        paginationContainer.innerHTML = html;
    },
    
    // Load specific users page
    async loadUsersPage(page = 1) {
        this.currentUserFilters.page = page;
        await this.loadFilteredUsers();
    },
    
    // Load users with current filters
    async loadFilteredUsers() {
        try {
            // Build query parameters
            const params = new URLSearchParams();
            params.append('page', this.currentUserFilters.page);
            params.append('per_page', this.currentUserFilters.per_page);
            
            if (this.currentUserFilters.user_type) {
                params.append('user_type', this.currentUserFilters.user_type);
            }
            
            if (this.currentUserFilters.is_active !== '') {
                params.append('status', this.currentUserFilters.is_active);
            }
            
            if (this.currentUserFilters.search) {
                params.append('search', this.currentUserFilters.search);
            }
            
            const response = await AdminAuth.apiRequest(`/admin/users?${params.toString()}`);
            const data = await response.json();
            
            console.log('Filtered users data:', data); // Debug log
            
            if (data.success && data.data) {
                this.displayUsersTable(data.data.users);
                if (data.data.pagination) {
                    this.updateUsersPagination(data.data.pagination);
                }
            } else {
                console.error('Invalid filtered users response:', data);
                this.displayUsersTable([]);
            }
        } catch (error) {
            console.error('Failed to load filtered users:', error);
            this.showNotification('Failed to load users: ' + error.message, 'error');
            this.displayUsersTable([]);
        }
    },
    
    // Setup user filters event listeners
    setupUserFilters() {
        // Avoid setting up multiple times
        if (this.filtersSetup) return;
        this.filtersSetup = true;
        
        // User type filters
        document.querySelectorAll('.user-filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                
                // Update active button
                document.querySelectorAll('.user-filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                // Update filter
                const filter = btn.getAttribute('data-filter');
                this.currentUserFilters.user_type = filter === 'all' ? '' : filter;
                this.currentUserFilters.page = 1; // Reset to first page
                
                this.loadFilteredUsers();
            });
        });
        
        // Status filters
        document.querySelectorAll('.status-filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                
                // Update active button
                document.querySelectorAll('.status-filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                // Update filter
                const status = btn.getAttribute('data-status');
                this.currentUserFilters.is_active = status;
                this.currentUserFilters.page = 1; // Reset to first page
                
                this.loadFilteredUsers();
            });
        });
        
        // Search input
        const searchInput = document.getElementById('user-search');
        if (searchInput) {
            let searchTimeout;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    this.currentUserFilters.search = e.target.value.trim();
                    this.currentUserFilters.page = 1; // Reset to first page
                    this.loadFilteredUsers();
                }, 500); // Debounce search
            });
        }
    },

    // Handle search
    handleSearch(query) {
        this.currentUserFilters.search = query;
        this.currentUserFilters.page = 1;
        this.loadFilteredUsers();
    },
    
    // Setup auto refresh
    setupAutoRefresh() {
        // Refresh dashboard data every 30 seconds
        setInterval(() => {
            if (this.currentSection === 'overview') {
                this.loadDashboardData();
            }
        }, 30000);
    },
    
    // Show notification
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 5000);
    },
    
    // View user details
    async viewUser(userId, userName) {
        try {
            const response = await AdminAuth.apiRequest(`/admin/users/${userId}`);
            const data = await response.json();

            if (data.success) {
                const user = data.data.user;

                // Helper function to render any field
                const renderField = (label, value) => {
                    if (value !== null && value !== undefined && value !== '') {
                        return `
                            <div class="row mt-2">
                                <div class="col-sm-4 fw-bold">${label}:</div>
                                <div class="col-sm-8">${value}</div>
                            </div>
                        `;
                    }
                    return '';
                };

                // Helper function to render document links
                const renderDocument = (label, path) => {
                    if (path) {
                        // For doctor users, route to backend download endpoint
                        let downloadUrl = path;
                        if (user.user_type === 'doctor') {
                            // Map label to file type for backend endpoint
                            const fileTypeMap = { 'License': 'license', 'Degree': 'degree', 'ID': 'id' };
                            const fileType = fileTypeMap[label] || label.toLowerCase();
                            downloadUrl = `${AdminAuth.API_BASE_URL}/admin/doctors/${user.id}/file/${fileType}`;
                        }
                        const filename = path.split('/').pop() || `${label.toLowerCase()}_document`;
                        return `
                            <div class="row mt-2">
                                <div class="col-sm-4 fw-bold">${label}:</div>
                                <div class="col-sm-8">
                                    <a href="${downloadUrl}" target="_blank" download="${filename}" class="btn btn-sm btn-outline-primary" style="cursor: pointer;">
                                        <i class="bi bi-file-earmark-pdf me-1"></i>View/Download
                                    </a>
                                </div>
                            </div>
                        `;
                    }
                    return '';
                };

                const modalHtml = `
                    <div class="modal fade" id="viewUserModal" tabindex="-1">
                        <div class="modal-dialog modal-lg">
                            <div class="modal-content">
                                <div class="modal-header">
                                    <h5 class="modal-title">User Details - ${user.full_name || user.email}</h5>
                                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                                </div>
                                <div class="modal-body">
                                    <div class="row">
                                        <div class="col-sm-4 fw-bold">Full Name:</div>
                                        <div class="col-sm-8">${user.full_name || 'N/A'}</div>
                                    </div>
                                    <div class="row mt-2">
                                        <div class="col-sm-4 fw-bold">Email:</div>
                                        <div class="col-sm-8">${user.email}</div>
                                    </div>
                                    <div class="row mt-2">
                                        <div class="col-sm-4 fw-bold">Phone:</div>
                                        <div class="col-sm-8">${user.phone || 'N/A'}</div>
                                    </div>
                                    <div class="row mt-2">
                                        <div class="col-sm-4 fw-bold">User Type:</div>
                                        <div class="col-sm-8">
                                            <span class="badge bg-${user.user_type === 'admin' ? 'danger' : user.user_type === 'doctor' ? 'info' : 'primary'}">
                                                ${user.user_type}
                                            </span>
                                        </div>
                                    </div>
                                    <div class="row mt-2">
                                        <div class="col-sm-4 fw-bold">Status:</div>
                                        <div class="col-sm-8">
                                            <span class="badge bg-${user.is_active ? 'success' : 'secondary'}">
                                                ${user.is_active ? 'Active' : 'Inactive'}
                                            </span>
                                        </div>
                                    </div>
                                    ${renderField('User ID', user.id)}
                                    <div class="row mt-2">
                                        <div class="col-sm-4 fw-bold">Registration Date:</div>
                                        <div class="col-sm-8">${new Date(user.created_at).toLocaleDateString()}</div>
                                    </div>
                                    ${user.last_login ? `<div class="row mt-2">
                                        <div class="col-sm-4 fw-bold">Last Login:</div>
                                        <div class="col-sm-8">${new Date(user.last_login).toLocaleString()}</div>
                                    </div>` : ''}

                                    ${user.profile ? `
                                        <hr>
                                        <h6>Profile Information:</h6>
                                        ${renderField('Date of Birth', user.profile.date_of_birth)}
                                        ${renderField('Age', user.profile.age)}
                                        ${renderField('Gender', user.profile.gender)}
                                        ${renderField('Address', user.profile.address)}
                                        ${renderField('City', user.profile.city)}
                                        ${renderField('State', user.profile.state)}
                                        ${renderField('Emergency Contact', user.profile.emergency_contact)}
                                        ${renderField('Blood Type', user.profile.blood_type)}
                                        ${renderField('Allergies', user.profile.allergies)}
                                        ${renderField('Chronic Conditions', user.profile.chronic_conditions)}
                                        ${renderField('Current Medications', user.profile.current_medications)}
                                        ${renderField('Medical History', user.profile.medical_history)}

                                        ${user.user_type === 'doctor' ? `
                                            <hr>
                                            <h6>Doctor Information:</h6>
                                            ${renderField('Specialization', user.profile.specialization)}
                                            ${renderField('License Number', user.profile.license_number)}
                                            ${renderField('Years of Experience', user.profile.years_of_experience)}
                                            ${renderField('Consultation Fee', user.profile.consultation_fee ? '$' + user.profile.consultation_fee : null)}
                                            ${renderField('Bio', user.profile.bio)}
                                            ${renderField('Education', user.profile.education)}
                                            ${renderField('Certifications', user.profile.certifications)}
                                            ${renderField('Languages', user.profile.languages)}
                                            ${renderField('Hospital Affiliations', user.profile.hospital_affiliations)}
                                            ${renderField('Clinic Address', user.profile.clinic_address)}
                                            ${renderField('Office Hours', user.profile.office_hours)}
                                            ${user.profile.is_verified !== undefined ? `
                                                <div class="row mt-2">
                                                    <div class="col-sm-4 fw-bold">Verification Status:</div>
                                                    <div class="col-sm-8">
                                                        <span class="badge bg-${user.profile.is_verified ? 'success' : 'warning'}">
                                                            ${user.profile.is_verified ? 'Verified' : 'Pending Verification'}
                                                        </span>
                                                    </div>
                                                </div>
                                            ` : ''}
                                            ${renderField('Verification Notes', user.profile.verification_notes)}
                                            ${user.profile.verified_at ? `
                                                <div class="row mt-2">
                                                    <div class="col-sm-4 fw-bold">Verified At:</div>
                                                    <div class="col-sm-8">${new Date(user.profile.verified_at).toLocaleString()}</div>
                                                </div>
                                            ` : ''}

                                            ${user.profile.document_paths || user.profile.license_document || user.profile.degree_document || user.profile.id_document ? `
                                                <hr>
                                                <h6>Uploaded Documents:</h6>
                                                ${user.profile.document_paths ? `
                                                    ${renderDocument('License Document', user.profile.document_paths.license_document)}
                                                    ${renderDocument('Degree Document', user.profile.document_paths.degree_document)}
                                                    ${renderDocument('ID Document', user.profile.document_paths.id_document)}
                                                ` : `
                                                    ${renderDocument('License Document', user.profile.license_document)}
                                                    ${renderDocument('Degree Document', user.profile.degree_document)}
                                                    ${renderDocument('ID Document', user.profile.id_document)}
                                                `}
                                            ` : ''}
                                        ` : ''}
                                    ` : ''}
                                </div>
                                <div class="modal-footer">
                                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                                </div>
                            </div>
                        </div>
                    </div>
                `;

                // Remove existing modal if present
                const existingModal = document.getElementById('viewUserModal');
                if (existingModal) {
                    existingModal.remove();
                }

                // Add modal to body
                document.body.insertAdjacentHTML('beforeend', modalHtml);

                // Show modal
                const modal = new bootstrap.Modal(document.getElementById('viewUserModal'));
                modal.show();

                // Clean up modal after hide
                document.getElementById('viewUserModal').addEventListener('hidden.bs.modal', function () {
                    this.remove();
                });

            } else {
                this.showNotification(data.message || 'Failed to load user details', 'error');
            }
        } catch (error) {
            console.error('View user error:', error);
            this.showNotification('Failed to load user details', 'error');
        }
    },
    
    // Change user password
    async changeUserPassword(userId, userName) {
        const modalHtml = `
            <div class="modal fade" id="changeUserPasswordModal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Change Password - ${userName}</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <form id="changeUserPasswordForm">
                            <div class="modal-body">
                                <div class="mb-3">
                                    <label for="newUserPassword" class="form-label">New Password</label>
                                    <input type="password" class="form-control" id="newUserPassword" required minlength="6">
                                    <div class="form-text">Password must be at least 6 characters long.</div>
                                </div>
                                <div class="mb-3">
                                    <label for="confirmUserPassword" class="form-label">Confirm Password</label>
                                    <input type="password" class="form-control" id="confirmUserPassword" required minlength="6">
                                </div>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                                <button type="submit" class="btn btn-primary">Change Password</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        `;
        
        // Remove existing modal if present
        const existingModal = document.getElementById('changeUserPasswordModal');
        if (existingModal) {
            existingModal.remove();
        }
        
        // Add modal to body
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('changeUserPasswordModal'));
        modal.show();
        
        // Handle form submission
        document.getElementById('changeUserPasswordForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const newPassword = document.getElementById('newUserPassword').value;
            const confirmPassword = document.getElementById('confirmUserPassword').value;
            
            if (newPassword !== confirmPassword) {
                this.showNotification('Passwords do not match', 'error');
                return;
            }
            
            try {
                const response = await AdminAuth.apiRequest(`/admin/users/${userId}/change-password`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        new_password: newPassword
                    })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    this.showNotification('Password changed successfully', 'success');
                    modal.hide();
                } else {
                    this.showNotification(data.message || 'Failed to change password', 'error');
                }
            } catch (error) {
                console.error('Change user password error:', error);
                this.showNotification('Failed to change password', 'error');
            }
        });
        
        // Clean up modal after hide
        document.getElementById('changeUserPasswordModal').addEventListener('hidden.bs.modal', function () {
            this.remove();
        });
    },
    
    // Delete user
    async deleteUser(userId, userName) {
        if (!confirm(`Are you sure you want to delete user "${userName}"? This action cannot be undone.`)) {
            return;
        }
        
        try {
            const response = await AdminAuth.apiRequest(`/admin/users/${userId}`, {
                method: 'DELETE'
            });
            const data = await response.json();
            
            if (data.success) {
                this.showNotification('User deleted successfully', 'success');
                // Reload users data with current filters
                this.loadFilteredUsers();
            } else {
                this.showNotification(data.message || 'Failed to delete user', 'error');
            }
        } catch (error) {
            console.error('Delete user error:', error);
            this.showNotification('Failed to delete user', 'error');
        }
    },
    
    // Toggle user status
    async toggleUserStatus(userId) {
        if (!confirm('Are you sure you want to change this user\'s status?')) {
            return;
        }
        
        try {
            const response = await AdminAuth.apiRequest(`/admin/users/${userId}/toggle-status`, {
                method: 'POST'
            });
            const data = await response.json();
            
            if (data.success) {
                this.showNotification('User status updated successfully', 'success');
                // Reload users data with current filters
                this.loadFilteredUsers();
            } else {
                this.showNotification(data.message || 'Failed to update user status', 'error');
            }
        } catch (error) {
            console.error('Toggle user status error:', error);
            this.showNotification('Failed to update user status', 'error');
        }
    },
    
    // Setup create admin form
    setupCreateAdminForm() {
        const form = document.getElementById('create-admin-form');
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.createAdminUser();
            });
        }
    },
    
    // Create admin user
    async createAdminUser() {
        const form = document.getElementById('create-admin-form');
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        
        try {
            // Show loading state
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Creating...';
            
            const formData = {
                full_name: document.getElementById('admin-full-name').value,
                email: document.getElementById('admin-email').value,
                password: document.getElementById('admin-password').value
            };

            const response = await AdminAuth.apiRequest('/admin/create-admin', {
                method: 'POST',
                body: JSON.stringify(formData)
            });

            const data = await response.json();

            if (response.ok && data.success) {
                this.showNotification('Admin user created successfully', 'success');
                form.reset();
                // Reload admin users table
                this.loadAdminUsers();
            } else {
                // Show specific validation error from backend
                const errorMsg = data.message || data.error || 'Failed to create admin user';
                this.showNotification(errorMsg, 'error');
                console.error('Create admin validation error:', data);
            }
        } catch (error) {
            console.error('Create admin error:', error);
            this.showNotification('Failed to create admin user: ' + error.message, 'error');
        } finally {
            // Reset button
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }
    },
    
    // Load appointments data
    async loadAppointmentsData() {
        try {
            const response = await AdminAuth.apiRequest('/admin/appointments?page=1&per_page=20');
            const data = await response.json();

            if (data.success && data.data) {
                // Store appointments for modal access
                this.currentAppointments = data.data.appointments || [];
                this.displayAppointmentsTable(data.data.appointments);
                // Update pagination if needed
                if (data.data.pagination) {
                    this.updateAppointmentsPagination(data.data.pagination);
                }
            } else {
                console.error('Invalid appointments response:', data);
                this.currentAppointments = [];
                this.displayAppointmentsTable([]);
            }

            // Setup filter event listeners if not already done
            this.setupAppointmentFilters();

        } catch (error) {
            console.error('Failed to load appointments:', error);
            this.showNotification('Failed to load appointments: ' + error.message, 'error');
            this.currentAppointments = [];
            this.displayAppointmentsTable([]);
        }
    },

    // Load settings data
    async loadSettingsData() {
        try {
            const response = await AdminAuth.apiRequest('/admin/settings');
            const data = await response.json();

            console.log('Settings data received:', data); // Debug log

            if (data.success && data.data) {
                // Populate all settings fields
                const settings = data.data.settings || data.data;

                console.log('Processing settings:', settings); // Debug log

                // Loop through all settings and populate form fields
                for (const key in settings) {
                    const element = document.getElementById(key);
                    if (element) {
                        const value = settings[key].value !== undefined ? settings[key].value : settings[key];

                        console.log(`Setting ${key} to ${value} (type: ${element.type})`); // Debug log

                        if (element.type === 'checkbox') {
                            // Handle Python boolean strings (True/False) and JavaScript booleans
                            element.checked = value === true || value === 'true' || value === 'True' || value === 1 || value === '1';
                            console.log(`  Checkbox ${key} checked: ${element.checked}`); // Debug log
                        } else {
                            element.value = value;
                        }
                    } else {
                        console.warn(`Element not found for setting: ${key}`); // Debug log
                    }
                }

                console.log('Settings loaded successfully');
                this.showNotification('Settings loaded successfully', 'success');
            } else {
                console.error('Invalid settings response:', data);
                this.showNotification('Invalid settings response', 'error');
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
            this.showNotification('Failed to load settings: ' + error.message, 'error');
        }
    },

    // Format doctor name to avoid duplicate Dr. prefix
    formatDoctorName(fullName) {
        if (!fullName) return 'Unknown Doctor';
        
        // If the name already starts with "Dr.", "Doctor", or Arabic "د." prefix, don't add another prefix
        if (fullName.toLowerCase().startsWith('dr.') || 
            fullName.toLowerCase().startsWith('doctor ') ||
            fullName.startsWith('د.') ||
            fullName.startsWith('دكتور ')) {
            return fullName;
        }
        
        // Otherwise, add "Dr." prefix
        return `Dr. ${fullName}`;
    },

    // Display appointments table
    displayAppointmentsTable(appointments) {
        const tbody = document.getElementById('appointments-table-body');
        if (!tbody) return;
        
        if (!appointments || appointments.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center py-4">
                        <p class="text-muted">No appointments found</p>
                    </td>
                </tr>
            `;
            return;
        }
        
        tbody.innerHTML = appointments.map(appointment => `
            <tr>
                <td>
                    <strong>${appointment.patient.name}</strong><br>
                    <small class="text-muted">${appointment.patient.email}</small>
                </td>
                <td>
                    <strong>${this.formatDoctorName(appointment.doctor.name)}</strong><br>
                    <small class="text-muted">${appointment.doctor.specialty}</small>
                </td>
                <td>
                    <div>${appointment.appointment_date_readable}</div>
                    <small class="text-muted">${appointment.appointment_type}</small>
                </td>
                <td>
                    <span class="badge ${this.getStatusBadgeClass(appointment.status)}">${appointment.status}</span>
                </td>
                <td>
                    <div class="btn-group btn-group-sm">
                        ${appointment.can_cancel && !['cancelled', 'completed'].includes(appointment.status) ? `
                            <button class="btn btn-warning" onclick="AdminDashboard.cancelAppointment(${appointment.id})" title="Cancel Appointment">
                                <i class="bi bi-x-circle"></i>
                            </button>
                        ` : ''}
                        ${appointment.can_delete && !['cancelled', 'completed'].includes(appointment.status) ? `
                            <button class="btn btn-danger" onclick="AdminDashboard.deleteAppointment(${appointment.id})" title="Delete Appointment">
                                <i class="bi bi-trash"></i>
                            </button>
                        ` : ''}
                        <button class="btn btn-info" onclick="AdminDashboard.viewAppointment(${appointment.id})" title="View Details">
                            <i class="bi bi-eye"></i>
                        </button>
                        ${['cancelled', 'completed'].includes(appointment.status) ? `
                            <span class="badge bg-secondary ms-1">View Only</span>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `).join('');
    },
    
    // Setup appointment filters
    setupAppointmentFilters() {
        // Filter buttons
        const filterButtons = document.querySelectorAll('.appointment-filter-btn');
        filterButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                // Remove active class from all buttons
                filterButtons.forEach(btn => btn.classList.remove('active'));
                // Add active class to clicked button
                e.target.classList.add('active');
                
                // Load appointments with filter
                const filter = e.target.dataset.filter;
                this.loadAppointmentsWithFilter(filter);
            });
        });
    },
    
    // Load appointments with filter
    async loadAppointmentsWithFilter(status) {
        try {
            const url = status === 'all' ? '/admin/appointments' : `/admin/appointments?status=${status}`;
            const response = await AdminAuth.apiRequest(url);
            const data = await response.json();
            
            if (data.success && data.data) {
                this.displayAppointmentsTable(data.data.appointments);
            } else {
                console.error('Invalid appointments response:', data);
                this.displayAppointmentsTable([]);
            }
            
        } catch (error) {
            console.error('Failed to filter appointments:', error);
            this.showNotification('Failed to filter appointments: ' + error.message, 'error');
        }
    },
    
    // Cancel appointment
    async cancelAppointment(appointmentId) {
        const reason = prompt('Enter cancellation reason (optional):') || 'Cancelled by admin';
        
        if (!confirm(`Cancel this appointment? Reason: ${reason}`)) {
            return;
        }
        
        try {
            const response = await AdminAuth.apiRequest(`/admin/appointments/${appointmentId}/cancel`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.showNotification('Appointment cancelled successfully', 'success');
                this.loadAppointmentsData(); // Refresh table
            } else {
                throw new Error(data.message || 'Failed to cancel appointment');
            }
            
        } catch (error) {
            console.error('Failed to cancel appointment:', error);
            this.showNotification('Failed to cancel appointment: ' + error.message, 'error');
        }
    },
    
    // Delete appointment
    async deleteAppointment(appointmentId) {
        if (!confirm('Delete this appointment permanently? This action cannot be undone.')) {
            return;
        }
        
        try {
            const response = await AdminAuth.apiRequest(`/admin/appointments/${appointmentId}`, {
                method: 'DELETE'
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.showNotification('Appointment deleted successfully', 'success');
                this.loadAppointmentsData(); // Refresh table
            } else {
                throw new Error(data.message || 'Failed to delete appointment');
            }
            
        } catch (error) {
            console.error('Failed to delete appointment:', error);
            this.showNotification('Failed to delete appointment: ' + error.message, 'error');
        }
    },
    
    // View appointment details
    async viewAppointment(appointmentId) {
        try {
            // Find the appointment from the current list
            const appointment = this.currentAppointments.find(apt => apt.id === appointmentId);

            if (!appointment) {
                this.showNotification('Appointment not found', 'error');
                return;
            }

            // Create HTML content for the modal
            const modalBody = document.getElementById('appointmentDetailsBody');
            modalBody.innerHTML = `
                <div class="container-fluid">
                    <div class="row mb-3">
                        <div class="col-md-6">
                            <h6 class="text-primary mb-2">
                                <i class="bi bi-person me-2"></i>Patient Information
                            </h6>
                            <p class="mb-1"><strong>Name:</strong> ${appointment.patient.name}</p>
                            <p class="mb-0"><strong>Email:</strong> ${appointment.patient.email}</p>
                        </div>
                        <div class="col-md-6">
                            <h6 class="text-primary mb-2">
                                <i class="bi bi-stethoscope me-2"></i>Doctor Information
                            </h6>
                            <p class="mb-1"><strong>Name:</strong> ${this.formatDoctorName(appointment.doctor.name)}</p>
                            <p class="mb-0"><strong>Specialty:</strong> ${appointment.doctor.specialty}</p>
                        </div>
                    </div>

                    <hr>

                    <div class="row mb-3">
                        <div class="col-md-6">
                            <h6 class="text-primary mb-2">
                                <i class="bi bi-calendar-event me-2"></i>Appointment Details
                            </h6>
                            <p class="mb-1"><strong>Date & Time:</strong> ${appointment.appointment_date_readable}</p>
                            <p class="mb-1"><strong>Type:</strong> ${appointment.appointment_type}</p>
                            <p class="mb-0">
                                <strong>Status:</strong>
                                <span class="badge ${this.getStatusBadgeClass(appointment.status)}">
                                    ${appointment.status}
                                </span>
                            </p>
                        </div>
                        <div class="col-md-6">
                            <h6 class="text-primary mb-2">
                                <i class="bi bi-info-circle me-2"></i>Additional Information
                            </h6>
                            <p class="mb-1"><strong>Appointment ID:</strong> #${appointment.id}</p>
                            ${appointment.notes ? `<p class="mb-0"><strong>Notes:</strong> ${appointment.notes}</p>` : ''}
                        </div>
                    </div>
                </div>
            `;

            // Show the modal
            const modalElement = document.getElementById('appointmentDetailsModal');
            const modal = new bootstrap.Modal(modalElement);
            modal.show();

        } catch (error) {
            console.error('Error displaying appointment details:', error);
            this.showNotification('Failed to display appointment details', 'error');
        }
    },
    
    // Get status badge class
    getStatusBadgeClass(status) {
        const badgeClasses = {
            'scheduled': 'bg-primary',
            'confirmed': 'bg-success',
            'in_progress': 'bg-warning',
            'completed': 'bg-success',
            'cancelled': 'bg-danger',
            'no_show': 'bg-secondary'
        };
        return badgeClasses[status] || 'bg-secondary';
    },
    
    // Update appointments pagination
    updateAppointmentsPagination(pagination) {
        // This function can be implemented similar to updateUsersPagination
        // For now, just log the pagination info
        console.log('Appointments pagination:', pagination);
    },
    
    // Load admin users
    async loadAdminUsers() {
        try {
            const response = await AdminAuth.apiRequest('/admin/users?user_type=admin&per_page=50');

            if (!response.ok) {
                console.error(`Admin users API returned ${response.status}: ${response.statusText}`);
                const errorText = await response.text();
                console.error('Error response:', errorText);
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            console.log('Admin users data received:', data);

            if (data.success && data.users) {
                // Store admin users for modal access
                this.currentAdminUsers = data.users || [];
                this.displayAdminUsersTable(data.users);
            } else {
                console.error('Admin users API returned unexpected structure:', data);
                this.currentAdminUsers = [];
                this.displayAdminUsersTable([]);
            }
        } catch (error) {
            console.error('Failed to load admin users:', error);
            this.currentAdminUsers = [];
            this.displayAdminUsersTable([]);
        }
    },
    
    // Display admin users table
    displayAdminUsersTable(adminUsers) {
        const tbody = document.getElementById('admin-users-table');
        if (!tbody) return;
        
        if (!adminUsers || adminUsers.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center py-3">
                        <p class="text-muted">No admin users found</p>
                    </td>
                </tr>
            `;
            return;
        }
        
        tbody.innerHTML = adminUsers.map(admin => `
            <tr>
                <td>${admin.full_name || 'N/A'}</td>
                <td>${admin.email}</td>
                <td>${admin.phone || 'N/A'}</td>
                <td>
                    <span class="badge bg-${admin.is_active ? 'success' : 'secondary'}">
                        ${admin.is_active ? 'Active' : 'Inactive'}
                    </span>
                </td>
                <td>${new Date(admin.created_at).toLocaleDateString()}</td>
                <td>
                    <button class="btn btn-sm btn-${admin.is_active ? 'danger' : 'success'} me-1" 
                            onclick="AdminDashboard.toggleUserStatus(${admin.id})" 
                            title="${admin.is_active ? 'Deactivate' : 'Activate'}">
                        <i class="bi bi-${admin.is_active ? 'x-circle' : 'check-circle'}"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    },
    
    // Export users data
    async exportUsers() {
        try {
            this.showNotification('Preparing export...', 'info');

            // Fetch all users (with current filters applied)
            const params = new URLSearchParams();
            params.append('per_page', 10000); // Get all users

            if (this.currentUserFilters.user_type) {
                params.append('user_type', this.currentUserFilters.user_type);
            }

            if (this.currentUserFilters.is_active !== '') {
                params.append('status', this.currentUserFilters.is_active);
            }

            if (this.currentUserFilters.search) {
                params.append('search', this.currentUserFilters.search);
            }

            const response = await AdminAuth.apiRequest(`/admin/users?${params.toString()}`);
            const data = await response.json();

            if (!data.success || !data.data || !data.data.users) {
                throw new Error('Failed to fetch users data');
            }

            const users = data.data.users;

            // Convert to CSV
            const csvHeaders = ['ID', 'Full Name', 'Email', 'Phone', 'User Type', 'Status', 'Registration Date'];
            const csvRows = users.map(user => [
                user.id,
                `"${(user.full_name || 'N/A').replace(/"/g, '""')}"`, // Escape quotes
                user.email,
                user.phone || 'N/A',
                user.user_type,
                user.is_active ? 'Active' : 'Inactive',
                new Date(user.created_at).toLocaleDateString()
            ]);

            // Build CSV content
            const csvContent = [
                csvHeaders.join(','),
                ...csvRows.map(row => row.join(','))
            ].join('\n');

            // Create blob and download
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);

            link.setAttribute('href', url);
            link.setAttribute('download', `sahatak_users_${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = 'hidden';

            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            this.showNotification(`Successfully exported ${users.length} users`, 'success');
        } catch (error) {
            console.error('Export users error:', error);
            this.showNotification('Failed to export users: ' + error.message, 'error');
        }
    },
    
    // Add doctor manually
    addDoctorManually() {
        console.log('Add doctor manually functionality - to be implemented');
        this.showNotification('Add doctor functionality will be implemented soon', 'info');
    },
    
    // Export appointments data
    exportAppointments() {
        console.log('Export appointments functionality - to be implemented');
        this.showNotification('Export appointments functionality will be implemented soon', 'info');
    },
    
    // Update analytics data and charts
    updateAnalytics(analytics) {
        // Update performance metrics
        if (analytics.system_performance) {
            const uptimeEl = document.getElementById('uptime-value');
            if (uptimeEl) uptimeEl.textContent = analytics.system_performance.uptime_percentage + '%';

            const responseEl = document.getElementById('response-time-value');
            if (responseEl) responseEl.textContent = analytics.system_performance.avg_response_time + 'ms';

            const errorEl = document.getElementById('error-rate-value');
            if (errorEl) errorEl.textContent = analytics.system_performance.error_rate + '%';

            // Update CPU and Memory usage
            const cpuEl = document.getElementById('cpuUsage');
            if (cpuEl) cpuEl.textContent = analytics.system_performance.cpu_usage_percent + '%';

            const memEl = document.getElementById('memUsage');
            if (memEl) memEl.textContent = analytics.system_performance.memory_usage_percent + '%';
        }
        
        // Update user activity metrics
        if (analytics.user_activity) {
            const activeUsersEl = document.getElementById('active-users-7d');
            if (activeUsersEl) activeUsersEl.textContent = analytics.user_activity.active_users_7d;
            
            const newUsers30dEl = document.getElementById('new-users-30d');
            if (newUsers30dEl) newUsers30dEl.textContent = analytics.user_activity.new_users_30d;
        }
        
        // Update appointment metrics
        if (analytics.appointment_metrics) {
            const appointments30dEl = document.getElementById('appointments-30d');
            if (appointments30dEl) appointments30dEl.textContent = analytics.appointment_metrics.appointments_30d;
            
            const completedEl = document.getElementById('completed-appointments');
            if (completedEl) completedEl.textContent = analytics.appointment_metrics.completed_appointments;
        }
        
        // Create charts
        this.createAnalyticsCharts(analytics);
    },
    
    // Create analytics charts
    createAnalyticsCharts(analytics) {
        // Doctor specialty distribution
        if (analytics.doctor_analytics && analytics.doctor_analytics.specialty_distribution) {
            this.createPieChart('specialtyDistributionChart', {
                labels: analytics.doctor_analytics.specialty_distribution.map(item => item.specialty || 'Not Specified'),
                data: analytics.doctor_analytics.specialty_distribution.map(item => item.count),
                title: 'Doctor Specialties'
            });
        }
        
        // Appointment status distribution
        if (analytics.appointment_metrics && analytics.appointment_metrics.appointment_status) {
            this.createDoughnutChart('appointmentStatusChart', {
                labels: analytics.appointment_metrics.appointment_status.map(item => item.status),
                data: analytics.appointment_metrics.appointment_status.map(item => item.count),
                title: 'Appointment Status'
            });
        }
    },
    
    // Create pie chart
    createPieChart(canvasId, config) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        
        // Destroy existing chart if it exists
        if (window[canvasId + 'Instance']) {
            window[canvasId + 'Instance'].destroy();
        }
        
        const colors = [
            'rgb(255, 99, 132)',
            'rgb(54, 162, 235)',
            'rgb(255, 205, 86)',
            'rgb(75, 192, 192)',
            'rgb(153, 102, 255)',
            'rgb(255, 159, 64)'
        ];
        
        window[canvasId + 'Instance'] = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: config.labels,
                datasets: [{
                    data: config.data,
                    backgroundColor: colors.slice(0, config.data.length)
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    },
    
    // Create doughnut chart
    createDoughnutChart(canvasId, config) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        
        // Destroy existing chart if it exists
        if (window[canvasId + 'Instance']) {
            window[canvasId + 'Instance'].destroy();
        }
        
        const colors = [
            'rgb(34, 197, 94)',   // Green for completed
            'rgb(234, 179, 8)',   // Yellow for pending
            'rgb(239, 68, 68)',   // Red for cancelled
            'rgb(59, 130, 246)',  // Blue for confirmed
            'rgb(168, 85, 247)'   // Purple for other
        ];
        
        window[canvasId + 'Instance'] = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: config.labels,
                datasets: [{
                    data: config.data,
                    backgroundColor: colors.slice(0, config.data.length)
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    },

    // Load admin users for the settings section
    async loadAdminUsers() {
        try {
            console.log('Loading admin users...');
            const response = await AdminAuth.apiRequest('/admin/users?user_type=admin');
            const data = await response.json();
            
            console.log('Admin users data received:', data);
            
            if (data.success && data.data && data.data.users) {
                this.displayAdminUsersTable(data.data.users);
            } else {
                throw new Error(data.message || 'Failed to load admin users');
            }
        } catch (error) {
            console.error('Failed to load admin users:', error);
            this.showNotification('Failed to load admin users', 'error');
        }
    },

    // Display admin users in table
    displayAdminUsersTable(adminUsers) {
        const tbody = document.getElementById('admin-users-table');
        if (!tbody) return;
        
        if (!adminUsers || adminUsers.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center py-4">
                        <i class="bi bi-person-x text-muted fs-1"></i>
                        <p class="text-muted mt-2">No admin users found</p>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = adminUsers.map(admin => `
            <tr>
                <td>${admin.full_name || 'N/A'}</td>
                <td>${admin.email}</td>
                <td>${admin.phone || 'N/A'}</td>
                <td>
                    <span class="badge bg-${admin.is_active ? 'success' : 'secondary'}">
                        ${admin.is_active ? 'Active' : 'Inactive'}
                    </span>
                </td>
                <td>${new Date(admin.created_at).toLocaleDateString()}</td>
                <td>
                    <button class="btn btn-sm btn-outline-info me-1" onclick="AdminDashboard.viewAdminDetails(${admin.id})" title="View Details">
                        <i class="bi bi-eye"></i>
                    </button>
                    ${admin.email !== 'admin' ? `
                        <button class="btn btn-sm btn-outline-secondary me-1" onclick="AdminDashboard.changeAdminPassword(${admin.id}, '${admin.full_name}')" title="Change Password">
                            <i class="bi bi-key"></i>
                        </button>
                    ` : ''}
                    ${admin.id !== this.getCurrentUserId() ? `
                        ${admin.email !== 'admin' ? `
                            <button class="btn btn-sm btn-outline-${admin.is_active ? 'warning' : 'success'} me-1" 
                                    onclick="AdminDashboard.toggleAdminStatus(${admin.id})" 
                                    title="${admin.is_active ? 'Deactivate' : 'Activate'}">
                                <i class="bi bi-${admin.is_active ? 'person-dash' : 'person-check'}"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-danger" onclick="AdminDashboard.deleteAdmin(${admin.id})" title="Delete Admin">
                                <i class="bi bi-trash"></i>
                            </button>
                        ` : '<span class="badge bg-warning">Master Admin</span>'}
                    ` : ''}
                </td>
            </tr>
        `).join('');
    },

    // Get current user ID to prevent self-deactivation
    getCurrentUserId() {
        try {
            const userData = JSON.parse(localStorage.getItem('adminUserData') || '{}');
            return userData.id || null;
        } catch {
            return null;
        }
    },

    // Change admin password
    async changeAdminPassword(adminId, adminName) {
        const newPassword = prompt(`Enter new password for ${adminName}:`);
        if (!newPassword) return;
        
        if (newPassword.length < 6) {
            alert('Password must be at least 6 characters long');
            return;
        }

        const confirmPassword = prompt('Confirm new password:');
        if (newPassword !== confirmPassword) {
            alert('Passwords do not match');
            return;
        }

        try {
            const response = await AdminAuth.apiRequest(`/admin/users/${adminId}/change-password`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ new_password: newPassword })
            });
            const data = await response.json();

            if (data.success) {
                this.showNotification(`Password changed successfully for ${adminName}`, 'success');
            } else {
                throw new Error(data.message || 'Failed to change password');
            }
        } catch (error) {
            console.error('Change password error:', error);
            this.showNotification('Failed to change password', 'error');
        }
    },

    // Delete admin
    async deleteAdmin(adminId) {
        if (!confirm('Are you sure you want to delete this admin? This action cannot be undone.')) {
            return;
        }

        try {
            const response = await AdminAuth.apiRequest(`/admin/users/${adminId}`, {
                method: 'DELETE'
            });
            const data = await response.json();

            if (data.success) {
                this.showNotification('Admin deleted successfully', 'success');
                this.loadAdminUsers(); // Refresh the list
            } else {
                throw new Error(data.message || 'Failed to delete admin');
            }
        } catch (error) {
            console.error('Delete admin error:', error);
            this.showNotification('Failed to delete admin', 'error');
        }
    },

    // Toggle admin status (activate/deactivate)
    async toggleAdminStatus(adminId) {
        try {
            const response = await AdminAuth.apiRequest(`/admin/users/${adminId}/toggle-status`, {
                method: 'PUT'
            });
            const data = await response.json();

            if (data.success) {
                this.showNotification('Admin status updated successfully', 'success');
                this.loadAdminUsers(); // Refresh the list
            } else {
                throw new Error(data.message || 'Failed to update admin status');
            }
        } catch (error) {
            console.error('Toggle status error:', error);
            this.showNotification('Failed to update admin status', 'error');
        }
    },

    // View admin details
    async viewAdminDetails(adminId) {
        try {
            // Find the admin from the current list
            const admin = this.currentAdminUsers.find(adm => adm.id === adminId);

            if (!admin) {
                this.showNotification('Admin not found', 'error');
                return;
            }

            // Create HTML content for the modal
            const modalBody = document.getElementById('adminDetailsBody');
            modalBody.innerHTML = `
                <div class="container-fluid">
                    <div class="row mb-3">
                        <div class="col-12">
                            <div class="text-center mb-3">
                                <i class="bi bi-person-circle text-info" style="font-size: 4rem;"></i>
                            </div>
                        </div>
                    </div>

                    <div class="row">
                        <div class="col-12">
                            <table class="table table-bordered">
                                <tbody>
                                    <tr>
                                        <th width="40%"><i class="bi bi-person me-2"></i>Full Name</th>
                                        <td>${admin.full_name || 'N/A'}</td>
                                    </tr>
                                    <tr>
                                        <th><i class="bi bi-envelope me-2"></i>Email</th>
                                        <td>${admin.email}</td>
                                    </tr>
                                    <tr>
                                        <th><i class="bi bi-phone me-2"></i>Phone</th>
                                        <td>${admin.phone || 'N/A'}</td>
                                    </tr>
                                    <tr>
                                        <th><i class="bi bi-toggle-on me-2"></i>Status</th>
                                        <td>
                                            <span class="badge bg-${admin.is_active ? 'success' : 'secondary'}">
                                                ${admin.is_active ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                    </tr>
                                    <tr>
                                        <th><i class="bi bi-calendar-plus me-2"></i>Created At</th>
                                        <td>${new Date(admin.created_at).toLocaleString()}</td>
                                    </tr>
                                    <tr>
                                        <th><i class="bi bi-hash me-2"></i>Admin ID</th>
                                        <td>#${admin.id}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;

            // Show the modal
            const modalElement = document.getElementById('adminDetailsModal');
            const modal = new bootstrap.Modal(modalElement);
            modal.show();

        } catch (error) {
            console.error('Error displaying admin details:', error);
            this.showNotification('Failed to display admin details', 'error');
        }
    },

    // Load pending doctor verifications
    async loadPendingVerifications() {
        try {
            console.log('Loading pending verifications...');
            const response = await AdminAuth.apiRequest('/admin/doctors/pending-verification');
            const data = await response.json();

            console.log('Pending verifications data received:', data);

            if (data.success && data.data && data.data.pending_doctors) {
                // Store pending doctors for modal access
                this.currentPendingDoctors = data.data.pending_doctors || [];
                this.displayPendingVerifications(data.data.pending_doctors);
            } else {
                this.currentPendingDoctors = [];
                throw new Error(data.message || 'Failed to load pending verifications');
            }
        } catch (error) {
            console.error('Failed to load pending verifications:', error);
            this.currentPendingDoctors = [];
            this.showNotification('Failed to load pending verifications', 'error');
        }
    },

    // Display pending verifications in table
    displayPendingVerifications(pendingDoctors) {
        const tbody = document.getElementById('pending-verifications');
        if (!tbody) return;
        
        if (!pendingDoctors || pendingDoctors.length === 0) {
            tbody.innerHTML = `
                <div class="col-12 text-center py-4">
                    <i class="bi bi-check-circle text-muted fs-1"></i>
                    <p class="text-muted mt-2">No doctors pending verification</p>
                </div>
            `;
            return;
        }

        tbody.innerHTML = pendingDoctors.map(doctor => `
            <div class="verification-card mb-3">
                <div class="card">
                    <div class="row g-0 align-items-center p-3">
                        <div class="col-md-8">
                            <h6 class="mb-1">${doctor.name || 'Unknown Doctor'}</h6>
                            <p class="text-muted mb-1">
                                <i class="bi bi-envelope me-1"></i>${doctor.email || 'No email'} | 
                                <i class="bi bi-stethoscope me-1"></i>${doctor.specialty || 'No specialty'} | 
                                <i class="bi bi-award me-1"></i>${doctor.years_of_experience || 0} years experience
                            </p>
                            <p class="text-muted mb-1">
                                <i class="bi bi-card-text me-1"></i>License: ${doctor.license_number || 'Not specified'}
                            </p>
                            <p class="text-muted small mb-0">
                                <i class="bi bi-clock me-1"></i>Submitted: 
                                <span class="text-muted">${this.formatDate(doctor.submitted_at)}</span>
                                | <span class="badge bg-info">${doctor.days_waiting} days waiting</span>
                            </p>
                        </div>
                        <div class="col-md-4 text-end">
                            <div class="d-flex flex-column gap-2">
                                <button class="btn btn-success btn-sm" onclick="AdminDashboard.approveDoctor(${doctor.id})" title="Approve">
                                    <i class="bi bi-check me-1"></i>Approve
                                </button>
                                <button class="btn btn-danger btn-sm" onclick="console.log('Reject button clicked for doctor ${doctor.id}'); AdminDashboard.rejectDoctor(${doctor.id})" title="Reject">
                                    <i class="bi bi-x me-1"></i>Reject
                                </button>
                                <button class="btn btn-outline-info btn-sm" onclick="AdminDashboard.viewDoctorDetails(${doctor.id})" title="View Details">
                                    <i class="bi bi-eye me-1"></i>Details
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    },

    // Helper to format date
    formatDate(dateString) {
        try {
            return new Date(dateString).toLocaleDateString();
        } catch {
            return 'Unknown';
        }
    },

    // Approve doctor
    async approveDoctor(doctorId) {
        if (!confirm('Are you sure you want to approve this doctor?')) return;

        try {
            const response = await AdminAuth.apiRequest(`/admin/doctors/${doctorId}/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    approved: true,
                    notes: 'Approved by admin'
                })
            });
            const data = await response.json();

            if (data.success) {
                this.showNotification('Doctor approved successfully', 'success');
                this.loadPendingVerifications(); // Refresh the list
            } else {
                throw new Error(data.message || 'Failed to approve doctor');
            }
        } catch (error) {
            console.error('Approve doctor error:', error);
            this.showNotification('Failed to approve doctor', 'error');
        }
    },

    // Reject doctor
    async rejectDoctor(doctorId) {
        let reason = prompt('Enter reason for rejection (required):');
        if (reason === null) return; // User cancelled
        
        // Keep asking until they provide a reason
        while (!reason || reason.trim() === '') {
            reason = prompt('Rejection reason is required. Please enter a reason:');
            if (reason === null) return; // User cancelled
        }

        // Show loading feedback
        const rejectBtn = document.querySelector(`button[onclick="AdminDashboard.rejectDoctor(${doctorId})"]`);
        const originalText = rejectBtn ? rejectBtn.textContent : '';
        if (rejectBtn) {
            rejectBtn.disabled = true;
            rejectBtn.textContent = 'Rejecting...';
        }

        try {
            console.log(`Rejecting doctor ${doctorId} with reason: ${reason}`);
            
            const response = await AdminAuth.apiRequest(`/admin/doctors/${doctorId}/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    approved: false,
                    notes: reason.trim()
                })
            });
            const data = await response.json();

            console.log('Reject response:', { status: response.status, data });

            if (data.success) {
                // Show enhanced success notification
                this.showNotification(`✅ Doctor rejected successfully. Reason: "${reason}". Doctor removed from pending list.`, 'success');
                
                // Add visual feedback by highlighting the removal
                const doctorRow = rejectBtn?.closest('tr');
                if (doctorRow) {
                    doctorRow.style.backgroundColor = '#ffebee';
                    doctorRow.style.transition = 'all 0.5s ease';
                    setTimeout(() => {
                        doctorRow.style.opacity = '0';
                        setTimeout(() => {
                            this.loadPendingVerifications(); // Refresh after animation
                        }, 500);
                    }, 1000);
                } else {
                    this.loadPendingVerifications(); // Fallback immediate refresh
                }
            } else {
                throw new Error(data.message || 'Failed to reject doctor');
            }
        } catch (error) {
            console.error('Reject doctor error:', error);
            this.showNotification(`❌ Failed to reject doctor: ${error.message}`, 'error');
            
            // Restore button state on error
            if (rejectBtn) {
                rejectBtn.disabled = false;
                rejectBtn.textContent = originalText;
            }
        }
    },

    // View doctor details
    async viewDoctorDetails(doctorId) {
        try {
            // Find the doctor from the current list
            const doctor = this.currentPendingDoctors.find(doc => doc.id === doctorId);

            if (!doctor) {
                this.showNotification('Doctor not found', 'error');
                return;
            }

            // Debug: Log doctor data to see what we have
            console.log('Doctor data:', doctor);
            console.log('Document paths:', doctor.document_paths);
            console.log('Documents submitted:', doctor.documents_submitted);

            // Helper function to create document link
            const createDocumentLink = (path, label) => {
                if (path) {
                    console.log(`Creating link for ${label}:`, path);
                    // Route to backend download endpoint using doctor ID
                    const fileTypeMap = { 'License': 'license', 'Degree': 'degree', 'ID': 'id' };
                    const fileType = fileTypeMap[label] || label.toLowerCase();
                    const downloadUrl = `${AdminAuth.API_BASE_URL}/admin/doctors/${doctor.id}/file/${fileType}`;
                    const filename = path.split('/').pop() || `${label.toLowerCase()}_document`;
                    return `
                        <a href="${downloadUrl}" target="_blank" download="${filename}" class="btn btn-sm btn-outline-primary me-2" style="cursor: pointer;">
                            <i class="bi bi-file-earmark-pdf me-1"></i>View/Download ${label}
                        </a>
                    `;
                }
                return `<span class="text-muted">Not uploaded</span>`;
            };

            // Create HTML content for the modal
            const modalBody = document.getElementById('doctorDetailsBody');
            modalBody.innerHTML = `
                <div class="container-fluid">
                    <div class="row mb-3">
                        <div class="col-12 text-center">
                            <i class="bi bi-stethoscope text-success" style="font-size: 4rem;"></i>
                            <h4 class="mt-2">${doctor.name || 'Unknown Doctor'}</h4>
                            <span class="badge bg-info">${doctor.specialty || 'No specialty'}</span>
                        </div>
                    </div>

                    <hr>

                    <div class="row mb-3">
                        <div class="col-md-6">
                            <div class="card h-100">
                                <div class="card-header bg-light">
                                    <strong><i class="bi bi-person-lines-fill me-2"></i>Personal Information</strong>
                                </div>
                                <div class="card-body">
                                    <p class="mb-2"><strong>Email:</strong><br>${doctor.email || 'Not specified'}</p>
                                    <p class="mb-2"><strong>Phone:</strong><br>${doctor.phone || 'Not specified'}</p>
                                    <p class="mb-2"><strong>Years of Experience:</strong><br>${doctor.years_of_experience || 0} years</p>
                                    <p class="mb-0"><strong>License Number:</strong><br>${doctor.license_number || 'Not specified'}</p>
                                </div>
                            </div>
                        </div>

                        <div class="col-md-6">
                            <div class="card h-100">
                                <div class="card-header bg-light">
                                    <strong><i class="bi bi-file-earmark-text me-2"></i>Verification Status</strong>
                                </div>
                                <div class="card-body">
                                    <p class="mb-2"><strong>Submitted:</strong><br>${this.formatDate(doctor.submitted_at)}</p>
                                    <p class="mb-2">
                                        <strong>Waiting Time:</strong><br>
                                        <span class="badge bg-${doctor.days_waiting > 7 ? 'danger' : 'info'}">${doctor.days_waiting} days</span>
                                    </p>
                                    <p class="mb-0"><strong>Doctor ID:</strong><br>#${doctor.id}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    ${doctor.bio ? `
                    <div class="row mb-3">
                        <div class="col-12">
                            <div class="card">
                                <div class="card-header bg-light">
                                    <strong><i class="bi bi-card-text me-2"></i>Biography</strong>
                                </div>
                                <div class="card-body">
                                    <p class="mb-0">${doctor.bio}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    ` : ''}

                    <div class="row mb-3">
                        <div class="col-12">
                            <div class="card border-primary">
                                <div class="card-header bg-primary text-white">
                                    <strong><i class="bi bi-files me-2"></i>Uploaded Documents for Verification</strong>
                                </div>
                                <div class="card-body">
                                    <div class="mb-3 p-3 border rounded">
                                        <div class="d-flex justify-content-between align-items-center">
                                            <div>
                                                <i class="bi bi-file-earmark-text text-primary me-2"></i>
                                                <strong>License Document:</strong>
                                            </div>
                                            <div>
                                                ${doctor.document_paths?.license_document ?
                                                    createDocumentLink(doctor.document_paths.license_document, 'License') :
                                                    '<span class="badge bg-warning text-dark"><i class="bi bi-exclamation-triangle me-1"></i>Not uploaded</span>'}
                                            </div>
                                        </div>
                                    </div>
                                    <div class="mb-3 p-3 border rounded">
                                        <div class="d-flex justify-content-between align-items-center">
                                            <div>
                                                <i class="bi bi-mortarboard text-primary me-2"></i>
                                                <strong>Degree Document:</strong>
                                            </div>
                                            <div>
                                                ${doctor.document_paths?.degree_document ?
                                                    createDocumentLink(doctor.document_paths.degree_document, 'Degree') :
                                                    '<span class="badge bg-warning text-dark"><i class="bi bi-exclamation-triangle me-1"></i>Not uploaded</span>'}
                                            </div>
                                        </div>
                                    </div>
                                    <div class="mb-0 p-3 border rounded">
                                        <div class="d-flex justify-content-between align-items-center">
                                            <div>
                                                <i class="bi bi-card-heading text-primary me-2"></i>
                                                <strong>ID Document:</strong>
                                            </div>
                                            <div>
                                                ${doctor.document_paths?.id_document ?
                                                    createDocumentLink(doctor.document_paths.id_document, 'ID') :
                                                    '<span class="badge bg-warning text-dark"><i class="bi bi-exclamation-triangle me-1"></i>Not uploaded</span>'}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="row">
                        <div class="col-12">
                            <div class="alert alert-${doctor.days_waiting > 7 ? 'danger' : 'warning'}">
                                <i class="bi bi-exclamation-triangle me-2"></i>
                                <strong>Action Required:</strong> Please review all documents and information carefully before approving or rejecting this verification request.
                                ${doctor.days_waiting > 7 ? '<br><strong>Note:</strong> This request has been pending for more than 7 days.' : ''}
                            </div>
                        </div>
                    </div>
                </div>
            `;

            // Show the modal
            const modalElement = document.getElementById('doctorDetailsModal');
            const modal = new bootstrap.Modal(modalElement);
            modal.show();

        } catch (error) {
            console.error('Error displaying doctor details:', error);
            this.showNotification('Failed to display doctor details', 'error');
        }
    }
};

// System Settings Manager
const SystemSettings = {
    // Save all settings
    async saveAllSettings() {
        try {
            // Find all elements with data-setting attribute
            const settingElements = document.querySelectorAll('[data-setting]');
            const settings = {};

            // Collect all settings values
            settingElements.forEach(element => {
                const key = element.getAttribute('data-setting');
                let value;

                if (element.type === 'checkbox') {
                    value = element.checked;
                } else if (element.type === 'number') {
                    const numValue = parseFloat(element.value);
                    // Skip empty or invalid number fields
                    if (isNaN(numValue) || element.value === '') {
                        return;
                    }
                    value = numValue;
                } else {
                    value = element.value;
                    // Skip empty text fields
                    if (!value || value.trim() === '') {
                        return;
                    }
                }

                settings[key] = value;
            });

            console.log('Saving settings:', settings);
            console.log('Total settings count:', Object.keys(settings).length);
            console.log('Settings keys:', Object.keys(settings));

            // Send settings to backend
            const response = await AdminAuth.apiRequest('/admin/settings', {
                method: 'PUT',
                body: JSON.stringify(settings)
            });

            const data = await response.json();

            if (data.success) {
                AdminDashboard.showNotification('Settings saved successfully', 'success');
            } else {
                console.error('Settings save failed:', data);
                const errorMsg = data.message || 'Failed to save settings';
                const details = data.details ? '\n' + JSON.stringify(data.details) : '';
                AdminDashboard.showNotification(errorMsg + details, 'error');
            }
        } catch (error) {
            console.error('Save settings error:', error);
            AdminDashboard.showNotification('Failed to save settings: ' + error.message, 'error');
        }
    }
};

// Export for use in HTML pages
window.AdminAuth = AdminAuth;
window.AdminDashboard = AdminDashboard;
window.SystemSettings = SystemSettings;
