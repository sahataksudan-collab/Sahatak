from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from flask_cors import CORS
from flask_mail import Mail
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, timedelta
import os
import signal
import sys
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Handle SIGPIPE on Unix-like systems (not available on Windows)
if hasattr(signal, 'SIGPIPE'):
    signal.signal(signal.SIGPIPE, signal.SIG_DFL)

# Initialize Flask app
app = Flask(__name__)

# Load configuration
env = os.getenv('FLASK_ENV', 'development')
if env == 'production':
    from config import ProductionConfig
    app.config.from_object(ProductionConfig)
elif env == 'testing':
    from config import TestingConfig
    app.config.from_object(TestingConfig)
else:
    from config import DevelopmentConfig
    app.config.from_object(DevelopmentConfig)

# Override with environment variables if they exist
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', app.config['SECRET_KEY'])
# DB URI: use the same builder as config.py so the password is URL-encoded
# (component vars DB_USER/DB_PASSWORD/DB_HOST/DB_NAME preferred; falls back
# to DATABASE_URL). Do not override with the raw DATABASE_URL, which breaks
# when the password contains @ : / # ? % characters (MySQL error 1045).
from config import build_database_uri
app.config['SQLALCHEMY_DATABASE_URI'] = build_database_uri()
app.config['FRONTEND_URL'] = os.getenv('FRONTEND_URL', 'https://hello-50.github.io/Sahatak')

# Explicit session cookie configuration for cross-origin support
app.config['SESSION_COOKIE_SECURE'] = False  # Allow HTTP for development/testing
app.config['SESSION_COOKIE_HTTPONLY'] = False  # Allow JavaScript access
app.config['SESSION_COOKIE_SAMESITE'] = None  # Allow cross-origin requests
app.config['SESSION_COOKIE_DOMAIN'] = None  # Don't restrict domain
app.config['REMEMBER_COOKIE_SECURE'] = False
app.config['REMEMBER_COOKIE_HTTPONLY'] = False
app.config['REMEMBER_COOKIE_SAMESITE'] = None
app.config['REMEMBER_COOKIE_DOMAIN'] = None

# Setup logging first (before other imports)
from utils.logging_config import SahatakLogger
SahatakLogger.setup_logging(app, log_level=os.getenv('LOG_LEVEL', 'INFO'))

from utils.logging_config import app_logger
app_logger.info("Starting Sahatak Telemedicine Platform API")

# Initialize extensions
from models import db
db.init_app(app)

login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'auth.login'
login_manager.login_message = 'Please log in to access this page.'
login_manager.login_message_category = 'info'

# Initialize notification services
from services.email_service import email_service
email_service.init_app(app)
app_logger.info("Email notification service initialized")

# Initialize WebSocket service
from services.websocket_service import init_socketio
socketio = init_socketio(app)
app_logger.info("WebSocket service initialized")

# Initialize database optimization
from utils.db_optimize import init_db_optimization
init_db_optimization(app)

# Configure CORS for cross-origin cookies
CORS(app, 
     origins=[
         'http://localhost:3000', 
         'http://127.0.0.1:3000', 
         'http://localhost:5500',
         'http://127.0.0.1:5500',
         'http://localhost:8000', 
         'http://127.0.0.1:8000',
         'https://hello-50.github.io',
         'https://hello-50.github.io/Sahatak',
         'https://hello-50.github.io/Sahatak/frontend'
     ],
     allow_headers=['Content-Type', 'Authorization', 'Accept-Language', 'X-Requested-With', 'x-timestamp'],
     methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
     supports_credentials=True,
     expose_headers=['Set-Cookie'],
     max_age=3600)

# Import models after db initialization
from models import User, Doctor, Patient, Appointment, Prescription, MedicalHistoryUpdate

# Import and register error handlers
from utils.error_handlers import register_error_handlers, register_custom_error_handlers
register_error_handlers(app)
register_custom_error_handlers(app)

# Import and register health check routes
from utils.health_check import create_health_routes
create_health_routes(app)

# Import and register API routes
from routes.auth import auth_bp
from routes.users import users_bp
from routes.appointments import appointments_bp
from routes.availability import availability_bp
from routes.ehr import ehr_bp
from routes.medical import medical_bp
from routes.ai_assessment import ai_bp
from routes.notifications import notifications_bp
from routes.prescriptions import prescriptions_bp
from routes.medical_history import medical_history_bp
from routes.user_settings import user_settings_bp
from routes.admin import admin_bp
from routes.doctor_verification import doctor_verification_bp
from routes.messages import messages_bp
from routes.contact import contact_bp
from routes.support import support_bp
from routes.calendar_sync import calendar_sync_bp

# Register blueprints with logging
app_logger.info("Registering API blueprints")
app.register_blueprint(auth_bp, url_prefix='/api/auth')
app.register_blueprint(users_bp, url_prefix='/api/users')
app.register_blueprint(appointments_bp, url_prefix='/api/appointments')
app.register_blueprint(availability_bp, url_prefix='/api/availability')
app.register_blueprint(ehr_bp, url_prefix='/api/ehr')
app.register_blueprint(medical_bp, url_prefix='/api/medical')
app.register_blueprint(ai_bp, url_prefix='/api/ai')
app.register_blueprint(notifications_bp, url_prefix='/api/notifications')
app.register_blueprint(prescriptions_bp, url_prefix='/api/prescriptions')
app.register_blueprint(medical_history_bp, url_prefix='/api/medical-history')
app.register_blueprint(user_settings_bp, url_prefix='/api/user-settings')
app.register_blueprint(admin_bp, url_prefix='/api/admin')
app.register_blueprint(doctor_verification_bp, url_prefix='/api/doctor-verification')
app.register_blueprint(messages_bp, url_prefix='/api/messages')
app.register_blueprint(contact_bp, url_prefix='/api/contact')
app.register_blueprint(support_bp, url_prefix='/api/support')
app.register_blueprint(calendar_sync_bp, url_prefix='/api/calendar-sync')

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# Add request logging middleware
from utils.logging_config import log_api_request
from utils.settings_manager import SettingsManager

@app.before_request
def check_maintenance_mode():
    """Check if maintenance mode is enabled and block non-admin users"""
    # Always allow CORS preflight requests (OPTIONS)
    if request.method == 'OPTIONS':
        return None

    # Skip maintenance check for admin endpoints, auth endpoints, static files, and health check
    excluded_paths = ['/api/admin/', '/api/auth/login', '/api/auth/me', '/static/', '/health']
    if any(request.path.startswith(path) for path in excluded_paths):
        return None

    # Check if maintenance mode is enabled
    maintenance_mode = SettingsManager.get_setting('maintenance_mode', False, 'boolean')

    # Debug logging
    print(f"🔧 Maintenance check - Path: {request.path}, Mode: {maintenance_mode}, Type: {type(maintenance_mode)}")

    if maintenance_mode:
        # Allow admins to access during maintenance
        if hasattr(current_user, 'user_type') and current_user.is_authenticated and current_user.user_type == 'admin':
            return None

        # Block all other users
        return APIResponse.error(
            message='System is currently under maintenance. Please try again later.',
            status_code=503,
            error_code='MAINTENANCE_MODE'
        )

    return None

@app.before_request
def log_request_info():
    """Log API requests for monitoring"""
    if request.path.startswith('/api/'):
        user_id = None
        if hasattr(current_user, 'id') and current_user.is_authenticated:
            user_id = current_user.id
        log_api_request(request, user_id=user_id)

@app.after_request
def log_response_info(response):
    """Log API responses"""
    if request.path.startswith('/api/'):
        user_id = None
        if hasattr(current_user, 'id') and current_user.is_authenticated:
            user_id = current_user.id
        log_api_request(request, response_status=response.status_code, user_id=user_id)
    return response

# Import standardized response utility
from utils.responses import APIResponse

@app.route('/')
def index():
    """Root endpoint with API information"""
    return APIResponse.success(
        data={
            'service': 'Sahatak Telemedicine Platform API',
            'version': '1.3.0',
            'environment': app.config.get('FLASK_ENV', 'production'),
            'documentation': '/api/docs',
            'health_check': '/health',
            'supported_languages': ['ar', 'en']
        },
        message='Welcome to Sahatak Telemedicine Platform'
    )

@app.route('/api')
def api_info():
    """API information endpoint"""
    return APIResponse.success(
        data={
            'version': '1.3.0',
            'endpoints': {
                'authentication': {
                    'base': '/api/auth',
                    'routes': [
                        'POST /api/auth/register - User registration',
                        'POST /api/auth/login - User login',
                        'POST /api/auth/logout - User logout',
                        'GET /api/auth/me - Get current user info',
                        'POST /api/auth/change-password - Change password',
                        'POST /api/auth/update-language - Update language preference',
                        'GET /api/auth/verify-email - Verify email address',
                        'POST /api/auth/resend-verification - Resend verification email'
                    ]
                },
                'users': {
                    'base': '/api/users',
                    'routes': [
                        'GET /api/users/profile - Get user profile',
                        'PUT /api/users/profile - Update user profile',
                        'GET /api/users/doctors - List all doctors',
                        'GET /api/users/doctors/{id} - Get doctor details',
                        'GET /api/users/specialties - Get medical specialties',
                        'POST /api/users/deactivate - Deactivate user account'
                    ]
                },
                'appointments': {
                    'base': '/api/appointments',
                    'routes': [
                        'GET /api/appointments/doctors - List available doctors',
                        'GET /api/appointments/ - Get user appointments',
                        'POST /api/appointments/ - Create new appointment',
                        'GET /api/appointments/{id} - Get appointment details',
                        'GET /api/appointments/doctors/{id}/availability - Get doctor availability',
                        'PUT /api/appointments/{id}/cancel - Cancel appointment',
                        'PUT /api/appointments/{id}/reschedule - Reschedule appointment'
                    ]
                },
                'availability': {
                    'base': '/api/availability',
                    'routes': [
                        'GET /api/availability/schedule - Get doctor schedule',
                        'PUT /api/availability/schedule - Update doctor schedule',
                        'GET /api/availability/calendar - Get calendar view',
                        'POST /api/availability/block-time - Block time slots',
                        'DELETE /api/availability/unblock-time/{id} - Unblock time slot'
                    ]
                },
                'ehr': {
                    'base': '/api/ehr',
                    'routes': [
                        'GET /api/ehr/patients/search - Search for patients',
                        'GET /api/ehr/patient/{id} - Get patient EHR',
                        'POST /api/ehr/diagnoses - Add diagnosis',
                        'PUT /api/ehr/diagnoses/{id} - Update diagnosis',
                        'POST /api/ehr/vital-signs - Add vital signs',
                        'GET /api/ehr/vital-signs/patient/{id} - Get patient vital signs',
                        'GET /api/ehr/diagnoses/patient/{id} - Get patient diagnoses'
                    ]
                },
                'medical': {
                    'base': '/api/medical',
                    'routes': [
                        'GET /api/medical/records - Get medical records',
                        'GET /api/medical/prescriptions - Get prescriptions'
                    ]
                },
                'medical_history': {
                    'base': '/api/medical-history',
                    'routes': [
                        'GET /api/medical-history/patient/{id} - Get patient medical history',
                        'POST /api/medical-history/complete - Complete medical history',
                        'PUT /api/medical-history/update - Update medical history',
                        'GET /api/medical-history/check-completion - Check completion status',
                        'GET /api/medical-history/updates/{id} - Get history updates',
                        'GET /api/medical-history/appointment-prompt/{id} - Get appointment prompts'
                    ]
                },
                'prescriptions': {
                    'base': '/api/prescriptions',
                    'routes': [
                        'GET /api/prescriptions/ - Get prescriptions',
                        'GET /api/prescriptions/{id} - Get prescription details',
                        'POST /api/prescriptions/ - Create new prescription',
                        'PUT /api/prescriptions/{id} - Update prescription',
                        'PUT /api/prescriptions/{id}/status - Update prescription status',
                        'GET /api/prescriptions/patient/{id} - Get patient prescriptions',
                        'GET /api/prescriptions/stats - Get prescription statistics'
                    ]
                },
                'notifications': {
                    'base': '/api/notifications',
                    'routes': [
                        'GET /api/notifications/preferences - Get notification preferences',
                        'PUT /api/notifications/preferences - Update notification preferences',
                        'POST /api/notifications/test/registration - Test registration notification',
                        'POST /api/notifications/test/appointment - Test appointment notification',
                        'GET /api/notifications/settings/defaults - Get default settings'
                    ]
                },
                'user_settings': {
                    'base': '/api/user-settings',
                    'routes': [
                        'GET /api/user-settings/doctor/participation - Get doctor participation settings',
                        'PUT /api/user-settings/doctor/participation - Update doctor participation',
                        'POST /api/user-settings/doctor/switch-to-volunteer - Switch to volunteer mode',
                        'POST /api/user-settings/doctor/switch-to-paid - Switch to paid mode',
                        'PUT /api/user-settings/doctor/notification-settings - Update notification settings',
                        'GET /api/user-settings/patient/preferences - Get patient preferences',
                        'PUT /api/user-settings/patient/preferences - Update patient preferences',
                        'GET /api/user-settings/profile - Get user profile settings',
                        'PUT /api/user-settings/language - Update language preference',
                        'PUT /api/user-settings/password - Change password',
                        'GET /api/user-settings/summary - Get settings summary'
                    ]
                },
                'ai_assessment': {
                    'base': '/api/ai',
                    'routes': [
                        'POST /api/ai/assessment - Perform AI health assessment'
                    ]
                },
                'admin': {
                    'base': '/api/admin',
                    'routes': [
                        'GET /api/admin/users - List all users',
                        'GET /api/admin/users/{id} - Get user details',
                        'POST /api/admin/users/{id}/toggle-status - Toggle user status',
                        'GET /api/admin/doctors/pending-verification - Get pending doctor verifications',
                        'POST /api/admin/doctors/{id}/verify - Verify doctor',
                        'POST /api/admin/doctors - Create doctor account',
                        'GET /api/admin/settings - Get platform settings',
                        'PUT /api/admin/settings - Update platform settings',
                        'GET /api/admin/health/detailed - Get detailed health status',
                        'GET /api/admin/analytics/dashboard - Get analytics dashboard',
                        'POST /api/admin/notifications/broadcast - Broadcast notification',
                        'GET /api/admin/audit-logs - Get audit logs',
                        'GET /api/admin/audit-logs/{id} - Get specific audit log',
                        'POST /api/admin/create-admin - Create admin user',
                        'POST /api/admin/init-first-admin - Initialize first admin'
                    ]
                }
            },
            'health_checks': {
                'basic': '/health',
                'detailed': '/health/detailed',
                'database': '/health/database'
            },
            'features': [
                'User authentication and authorization',
                'Patient and doctor registration',
                'Appointment booking and management',
                'Electronic Health Records (EHR)',
                'Medical history tracking',
                'Prescription management',
                'AI-powered health assessments',
                'Real-time notifications (Email/SMS)',
                'Multi-language support (Arabic/English)',
                'Admin dashboard and analytics',
                'Doctor availability management',
                'Comprehensive audit logging'
            ],
            'technologies': {
                'framework': 'Flask 2.3.3',
                'database': 'SQLAlchemy with SQLite/MySQL',
                'authentication': 'Flask-Login with bcrypt',
                'notifications': 'Email (SMTP) and SMS integration',
                'cors': 'Flask-CORS for cross-origin requests',
                'logging': 'Structured JSON logging',
                'validation': 'Custom validation system'
            }
        },
        message='Sahatak API v1.3.0'
    )

@app.route('/init-db', methods=['POST'])
def init_database():
    """Initialize database tables - for deployment purposes"""
    try:
        db.create_all()
        return jsonify({
            'success': True,
            'message': 'Database tables created successfully'
        })
    except Exception as e:
        app_logger.error(f"Database initialization error: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Database initialization failed: {str(e)}'
        }), 500

if __name__ == '__main__':
    try:
        with app.app_context():
            app_logger.info("Creating database tables if they don't exist")
            db.create_all()
            app_logger.info("Database initialization complete")
        
        # Set start time for health checks
        app._start_time = datetime.utcnow().timestamp()
        
        # Start the application with SocketIO
        port = int(os.getenv('PORT', 5000))
        debug = os.getenv('FLASK_ENV') == 'development'
        
        app_logger.info(f"Starting Sahatak API server with WebSocket support on port {port} (debug={debug})")
        socketio.run(app, debug=debug, host='0.0.0.0', port=port)
        
    except Exception as e:
        app_logger.error(f"Failed to start application: {str(e)}")
        raise