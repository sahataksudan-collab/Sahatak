from flask import Blueprint, request, current_app, jsonify
from flask_login import current_user
from routes.auth import api_login_required
from models import db, Patient, Doctor, User
from utils.responses import success_response, error_response
from utils.validators import validate_json_data
from utils.logging_config import app_logger
from services.notification_service import send_registration_confirmation_notification, send_appointment_notification, send_doctor_notification
from services.email_service import EmailService

notifications_bp = Blueprint('notifications', __name__, url_prefix='/notifications')

@notifications_bp.route('/preferences', methods=['GET'])
@api_login_required
def get_notification_preferences():
    """Get user's notification preferences"""
    try:
        profile = current_user.get_profile()
        if not profile:
            return error_response('Profile not found', 404)
        
        if current_user.user_type == 'patient':
            preferences = {
                'preferred_contact_method': profile.preferred_contact_method,
                'notification_preferences': profile.notification_preferences or {},
                'phone': profile.phone,
                'email': current_user.email
            }
        elif current_user.user_type == 'doctor':
            preferences = {
                'patient_notification_method': profile.patient_notification_method,
                'notification_settings': profile.notification_settings or {},
                'phone': profile.phone,
                'email': current_user.email
            }
        else:
            return error_response('Invalid user type', 400)
        
        return success_response('Notification preferences retrieved', preferences)
        
    except Exception as e:
        app_logger.error(f"Error getting notification preferences: {str(e)}")
        return error_response('Failed to get notification preferences', 500)

@notifications_bp.route('/preferences', methods=['PUT'])
@api_login_required
def update_notification_preferences():
    """Update user's notification preferences"""
    try:
        data = request.get_json()
        if not data:
            return error_response('No data provided', 400)
        
        profile = current_user.get_profile()
        if not profile:
            return error_response('Profile not found', 404)
        
        if current_user.user_type == 'patient':
            # Validate patient notification preferences
            valid_methods = ['email']
            if 'preferred_contact_method' in data:
                if data['preferred_contact_method'] not in valid_methods:
                    return error_response('Invalid contact method', 400)
                profile.preferred_contact_method = data['preferred_contact_method']
            
            if 'notification_preferences' in data:
                # Validate notification preferences structure
                prefs = data['notification_preferences']
                if not isinstance(prefs, dict):
                    return error_response('Invalid notification preferences format', 400)
                
                # Set default preferences if not provided
                default_prefs = {
                    'appointment_reminders': True,
                    'appointment_confirmations': True,
                    'prescription_notifications': True,
                    'health_tips': False,
                    'marketing': False
                }
                
                # Merge with provided preferences
                merged_prefs = {**default_prefs, **prefs}
                profile.notification_preferences = merged_prefs
                
        elif current_user.user_type == 'doctor':
            # Validate doctor notification preferences
            valid_methods = ['email']
            if 'patient_notification_method' in data:
                if data['patient_notification_method'] not in valid_methods:
                    return error_response('Invalid notification method', 400)
                profile.patient_notification_method = data['patient_notification_method']
            
            if 'notification_settings' in data:
                # Validate notification settings structure
                settings = data['notification_settings']
                if not isinstance(settings, dict):
                    return error_response('Invalid notification settings format', 400)
                
                # Set default settings if not provided
                default_settings = {
                    'new_appointment_alerts': True,
                    'patient_messages': True,
                    'reminder_alerts': True,
                    'system_notifications': True,
                    'marketing': False
                }
                
                # Merge with provided settings
                merged_settings = {**default_settings, **settings}
                profile.notification_settings = merged_settings
        
        else:
            return error_response('Invalid user type', 400)
        
        # Save changes to database
        db.session.commit()
        
        app_logger.info(f"Updated notification preferences for user {current_user.id}")
        return success_response('Notification preferences updated successfully')
        
    except Exception as e:
        db.session.rollback()
        app_logger.error(f"Error updating notification preferences: {str(e)}")
        return error_response('Failed to update notification preferences', 500)

@notifications_bp.route('/test/registration', methods=['POST'])
@api_login_required
def test_registration_notification():
    """Test registration confirmation notification (development/testing only)"""
    try:
        if not current_app.config.get('TESTING', False):
            return error_response('This endpoint is only available in testing mode', 403)
        
        data = request.get_json()
        required_fields = ['email', 'full_name']
        
        validation_result = validate_json_data(data, required_fields)
        if not validation_result['valid']:
            return error_response(validation_result['message'], 400)
        
        profile = current_user.get_profile()
        preferred_method = data.get('preferred_method', 'email')
        if profile and hasattr(profile, 'preferred_contact_method'):
            preferred_method = profile.preferred_contact_method
        
        language = current_user.language_preference or 'ar'
        
        success = send_registration_confirmation_notification(
            data, 
            preferred_method, 
            language
        )
        
        if success:
            return success_response('Test registration notification sent successfully')
        else:
            return error_response('Failed to send test notification', 500)
            
    except Exception as e:
        app_logger.error(f"Error sending test registration notification: {str(e)}")
        return error_response('Failed to send test notification', 500)

@notifications_bp.route('/test/appointment', methods=['POST'])
@api_login_required
def test_appointment_notification():
    """Test appointment notification (development/testing only)"""
    try:
        if not current_app.config.get('TESTING', False):
            return error_response('This endpoint is only available in testing mode', 403)
        
        data = request.get_json()
        required_fields = ['notification_type', 'doctor_name', 'appointment_date', 'appointment_time']
        
        validation_result = validate_json_data(data, required_fields)
        if not validation_result['valid']:
            return error_response(validation_result['message'], 400)
        
        if data['notification_type'] not in ['confirmation', 'reminder', 'cancellation']:
            return error_response('Invalid notification type', 400)
        
        profile = current_user.get_profile()
        if not profile:
            return error_response('Profile not found', 404)
        
        # Prepare appointment data
        appointment_data = {
            'patient_email': current_user.email,
            'patient_phone': profile.phone,
            'doctor_name': data['doctor_name'],
            'appointment_date': data['appointment_date'],
            'appointment_time': data['appointment_time'],
            'appointment_type': data.get('appointment_type', 'video')
        }
        
        preferred_method = data.get('preferred_method', 'email')
        if hasattr(profile, 'preferred_contact_method'):
            preferred_method = profile.preferred_contact_method
        
        language = current_user.language_preference or 'ar'
        reminder_type = data.get('reminder_type', '24h')
        
        success = send_appointment_notification(
            appointment_data,
            data['notification_type'],
            preferred_method,
            language,
            reminder_type
        )
        
        if success:
            return success_response('Test appointment notification sent successfully')
        else:
            return error_response('Failed to send test notification', 500)
            
    except Exception as e:
        app_logger.error(f"Error sending test appointment notification: {str(e)}")
        return error_response('Failed to send test notification', 500)

@notifications_bp.route('/settings/defaults', methods=['GET'])
@api_login_required
def get_default_settings():
    """Get default notification settings for user type"""
    try:
        if current_user.user_type == 'patient':
            defaults = {
                'preferred_contact_method': 'email',
                'notification_preferences': {
                    'appointment_reminders': True,
                    'appointment_confirmations': True,
                    'prescription_notifications': True,
                    'health_tips': False,
                    'marketing': False
                }
            }
        elif current_user.user_type == 'doctor':
            defaults = {
                'patient_notification_method': 'email',
                'notification_settings': {
                    'new_appointment_alerts': True,
                    'patient_messages': True,
                    'reminder_alerts': True,
                    'system_notifications': True,
                    'marketing': False
                }
            }
        else:
            return error_response('Invalid user type', 400)
        
        return success_response('Default settings retrieved', defaults)
        
    except Exception as e:
        app_logger.error(f"Error getting default settings: {str(e)}")
        return error_response('Failed to get default settings', 500)

def queue_notification(user_id, title, message, notification_type='info', send_email=False):
    """Queue a notification for a user (stub for compatibility)"""
    try:
        app_logger.info(f"Notification queued for user {user_id}: {title}")
        # Note: Using simple logging for notifications - can be enhanced with queuing system
        return True
    except Exception as e:
        app_logger.error(f"Error queuing notification: {str(e)}")
        return False

def send_email(to_email, subject, body):
    """Send email using EmailService (compatibility wrapper)"""
    try:
        # Use the initialized singleton instance instead of creating a new one
        from services.email_service import email_service
        return email_service.send_custom_email(to_email, subject, body)
    except Exception as e:
        app_logger.error(f"Error sending email: {str(e)}")
        return False


# ============================================================================
# In-app notification read endpoints
# ============================================================================
# Server half of the existing client contract (sahatak-mobile
# src/api/notifications.ts): GET /notifications returns a BARE JSON array of
# NotificationItem-shaped objects, PUT /notifications/<id>/read and
# PUT /notifications/read-all mark items read. Storage is the existing
# NotificationQueue model (notification_type='in_app'); read state maps onto
# the existing status enum: 'pending' = unread, 'sent' = read.

def _relative_time_strings(created_at):
    """Human-readable relative timestamp (EN/AR) for the mobile notification card."""
    from datetime import datetime as _dt
    delta_seconds = max(0, int((_dt.utcnow() - created_at).total_seconds()))
    minutes = delta_seconds // 60
    hours = delta_seconds // 3600
    days = delta_seconds // 86400
    if minutes < 1:
        return ('Just now', 'الآن')
    if minutes < 60:
        return (f'{minutes} mins ago' if minutes > 1 else '1 min ago',
                f'منذ {minutes} دقيقة' if minutes > 1 else 'منذ دقيقة')
    if hours < 24:
        return (f'{hours} hours ago' if hours > 1 else '1 hour ago',
                f'منذ {hours} ساعة' if hours > 1 else 'منذ ساعة')
    return (f'{days} days ago' if days > 1 else '1 day ago',
            f'منذ {days} يوم' if days > 1 else 'منذ يوم')


def _notification_to_mobile_item(n):
    """Map a NotificationQueue in_app row to the mobile NotificationItem shape."""
    data = n.template_data or {}
    title_en = data.get('title_en') or n.title
    title_ar = data.get('title_ar') or n.title
    message_en = data.get('message_en') or n.message
    message_ar = data.get('message_ar') or n.message
    rel_en, rel_ar = _relative_time_strings(n.created_at)
    item = {
        'id': str(n.id),
        'title': title_en,
        'titleAr': title_ar,
        'message': message_en,
        'messageAr': message_ar,
        'timestamp': rel_en,
        'timestampAr': rel_ar,
        'type': data.get('notif_type') or 'appointment',
        'read': n.status == 'sent',
    }
    action_screen = data.get('action_screen')
    if action_screen:
        item['actionScreen'] = action_screen
    return item


@notifications_bp.route('', methods=['GET'])
@api_login_required
def list_in_app_notifications():
    """List the current user's in-app notifications (bare array — mobile contract)."""
    try:
        from models import NotificationQueue
        rows = NotificationQueue.query.filter_by(
            recipient_type='user',
            recipient_id=current_user.id,
            notification_type='in_app',
        ).order_by(NotificationQueue.created_at.desc()).limit(50).all()
        return jsonify([_notification_to_mobile_item(n) for n in rows])
    except Exception as e:
        app_logger.error(f"Error listing in-app notifications: {str(e)}")
        return jsonify([])


@notifications_bp.route('/<int:notification_id>/read', methods=['PUT'])
@api_login_required
def mark_in_app_notification_read(notification_id):
    """Mark one of the current user's in-app notifications as read."""
    try:
        from models import db, NotificationQueue
        row = NotificationQueue.query.filter_by(
            id=notification_id,
            recipient_type='user',
            recipient_id=current_user.id,
            notification_type='in_app',
        ).first()
        if not row:
            return error_response('Notification not found', 404)
        if row.status != 'sent':
            row.mark_as_sent()
        else:
            db.session.commit()
        return success_response('Notification marked as read')
    except Exception as e:
        db.session.rollback()
        app_logger.error(f"Error marking notification {notification_id} read: {str(e)}")
        return error_response('Failed to mark notification as read', 500)


@notifications_bp.route('/read-all', methods=['PUT'])
@api_login_required
def mark_all_in_app_notifications_read():
    """Mark all of the current user's in-app notifications as read."""
    try:
        from models import db, NotificationQueue
        from datetime import datetime as _dt
        now = _dt.utcnow()
        rows = NotificationQueue.query.filter_by(
            recipient_type='user',
            recipient_id=current_user.id,
            notification_type='in_app',
            status='pending',
        ).all()
        for row in rows:
            row.status = 'sent'
            row.sent_at = now
        db.session.commit()
        return success_response('All notifications marked as read')
    except Exception as e:
        db.session.rollback()
        app_logger.error(f"Error marking all notifications read: {str(e)}")
        return error_response('Failed to mark all notifications as read', 500)