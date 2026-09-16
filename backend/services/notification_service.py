from typing import Dict, Any, Optional, List
from utils.logging_config import app_logger
from .email_service import send_registration_confirmation_email, send_appointment_reminder, send_appointment_confirmation, send_appointment_cancellation


class NotificationService:
    """
    Unified notification service for handling both email and SMS notifications
    Following established patterns from the Sahatak codebase
    
    Designed for low bandwidth areas with minimal templates
    """
    
    def __init__(self):
        pass
    
    def send_registration_confirmation(
        self, 
        user_data: Dict[str, Any], 
        preferred_method: str = 'email',
        language: str = 'ar'
    ) -> bool:
        """
        Send registration confirmation via email
        
        Args:
            user_data: User registration details (must include email)
            preferred_method: 'email' (kept for compatibility)
            language: Language preference ('ar' or 'en')
            
        Returns:
            bool: True if notification sent successfully
        """
        try:
            email = user_data.get('email')
            if email:
                email_success = send_registration_confirmation_email(email, user_data, language)
                if email_success:
                    app_logger.info(f"Registration confirmation email sent to {email}")
                return email_success
            else:
                app_logger.warning("Email registration confirmation requested but no email provided")
                return False
            
        except Exception as e:
            app_logger.error(f"Registration confirmation notification error: {str(e)}")
            return False
    
    def send_appointment_notification(
        self, 
        appointment_data: Dict[str, Any],
        notification_type: str,  # 'confirmation', 'reminder', 'cancellation'
        preferred_method: str = 'email',
        language: str = 'ar',
        reminder_type: str = '24h'  # Only used for reminders
    ) -> bool:
        """
        Send appointment notifications via email
        
        Args:
            appointment_data: Appointment details (must include patient email)
            notification_type: 'confirmation', 'reminder', 'cancellation'
            preferred_method: 'email' (kept for compatibility)
            language: Language preference ('ar' or 'en')
            reminder_type: Type of reminder ('24h', '1h', 'now') - only for reminders
            
        Returns:
            bool: True if notification sent successfully
        """
        try:
            # Get recipient contact info
            recipient_email = appointment_data.get('patient_email') or appointment_data.get('email')
            
            if recipient_email:
                email_success = self._send_appointment_email(
                    recipient_email, appointment_data, notification_type, language, reminder_type
                )
                return email_success
            else:
                app_logger.warning(f"No email provided for appointment {notification_type}")
                return False
            
        except Exception as e:
            app_logger.error(f"Appointment notification error: {str(e)}")
            return False
    
    def _send_appointment_email(
        self, 
        recipient_email: str, 
        appointment_data: Dict[str, Any], 
        notification_type: str, 
        language: str,
        reminder_type: str
    ) -> bool:
        """Send appointment email based on type"""
        try:
            if notification_type == 'confirmation':
                return send_appointment_confirmation(recipient_email, appointment_data, language)
            elif notification_type == 'reminder':
                return send_appointment_reminder(recipient_email, appointment_data, language, reminder_type)
            elif notification_type == 'cancellation':
                return send_appointment_cancellation(recipient_email, appointment_data, language)
            else:
                app_logger.error(f"Unknown email notification type: {notification_type}")
                return False
                
        except Exception as e:
            app_logger.error(f"Appointment email error: {str(e)}")
            return False
    
    
    def send_doctor_notification(
        self,
        doctor_data: Dict[str, Any],
        patient_data: Dict[str, Any],
        message_content: Dict[str, Any],
        preferred_method: str = 'email',
        language: str = 'ar'
    ) -> bool:
        """
        Send notifications from doctors to patients via email
        
        Args:
            doctor_data: Doctor information
            patient_data: Patient information (must include email)
            message_content: Message details and content
            preferred_method: 'email' (kept for compatibility)
            language: Language preference ('ar' or 'en')
            
        Returns:
            bool: True if notification sent successfully
        """
        try:
            # This is a placeholder for doctor-to-patient communications
            # Can be expanded based on specific requirements
            
            message_data = {
                **message_content,
                'doctor_name': doctor_data.get('full_name', 'الطبيب'),
                'patient_name': patient_data.get('full_name', 'المريض'),
                'language': language
            }
            
            email = patient_data.get('email')
            if email:
                # For now, log the message - can be extended with custom templates
                app_logger.info(f"Doctor message email to {email}: {message_content.get('subject', 'No subject')}")
                return True
            else:
                app_logger.warning("Doctor notification requested but no patient email provided")
                return False
            
        except Exception as e:
            app_logger.error(f"Doctor notification error: {str(e)}")
            return False


# Create singleton instance
notification_service = NotificationService()

# Convenience functions
def send_registration_confirmation_notification(user_data: Dict[str, Any], preferred_method: str = 'email', language: str = 'ar') -> bool:
    """Send registration confirmation via preferred method"""
    return notification_service.send_registration_confirmation(user_data, preferred_method, language)

def send_appointment_notification(appointment_data: Dict[str, Any], notification_type: str, preferred_method: str = 'email', language: str = 'ar', reminder_type: str = '24h') -> bool:
    """Send appointment notification via preferred method"""
    return notification_service.send_appointment_notification(appointment_data, notification_type, preferred_method, language, reminder_type)

def send_doctor_notification(doctor_data: Dict[str, Any], patient_data: Dict[str, Any], message_content: Dict[str, Any], preferred_method: str = 'email', language: str = 'ar') -> bool:
    """Send doctor-to-patient notification via preferred method"""
    return notification_service.send_doctor_notification(doctor_data, patient_data, message_content, preferred_method, language)


# ============================================================================
# "Doctor joined the video call" notification (email + in-app)
# ============================================================================

# Template-name key used both as the email template selector and as the
# IDEMPOTENCY MARKER: exactly one 'in_app' NotificationQueue row per
# (patient, appointment) pair with this template_name gates the whole
# notification (email + in-app), so reconnects/refreshes never re-fire it.
DOCTOR_JOINED_TEMPLATE = 'doctor_joined_video'


def _find_doctor_joined_notification(recipient_id: int, appointment_id: int):
    """Return the existing marker notification for this patient+appointment, or None."""
    from models import NotificationQueue
    rows = NotificationQueue.query.filter_by(
        recipient_type='user',
        recipient_id=recipient_id,
        notification_type='in_app',
        template_name=DOCTOR_JOINED_TEMPLATE,
    ).all()
    for row in rows:
        data = row.template_data or {}
        if data.get('appointment_id') == appointment_id:
            return row
    return None


def _doctor_joined_email_payload(appointment, doctor_user, patient_user, language: str) -> Dict[str, Any]:
    """Build the localized email/queue content for the doctor-joined event."""
    from flask import current_app

    appointment_date = appointment.appointment_date
    doctor_name = (doctor_user.full_name if doctor_user else '') or ''
    patient_name = (patient_user.full_name if patient_user else '') or ''
    specialty = None
    try:
        specialty = appointment.doctor.specialty
    except Exception:
        specialty = None

    _AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
                  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
    _AR_DAYS = ['الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد']

    en_date_readable = appointment_date.strftime('%A, %d %B %Y')
    ar_date_readable = (f"{_AR_DAYS[appointment_date.weekday()]}، "
                        f"{appointment_date.strftime('%d')} {_AR_MONTHS[appointment_date.month - 1]} "
                        f"{appointment_date.strftime('%Y')}")
    en_time_readable = appointment_date.strftime('%I:%M %p').lstrip('0')
    ar_time_readable = en_time_readable.replace('AM', 'ص').replace('PM', 'م')

    frontend_base = current_app.config.get(
        'FRONTEND_BASE_URL', 'https://sahataksudan-collab.github.io/Sahatak/frontend'
    ).rstrip('/')
    join_url = (f"{frontend_base}/pages/appointments/video-consultation.html"
                f"?appointmentId={appointment.id}")

    _dr_prefix_en, _dr_prefix_ar = 'Dr. ', 'د. '
    _doc_en = doctor_name if doctor_name.startswith(('Dr. ', 'Dr.', 'د.')) else _dr_prefix_en + doctor_name
    _doc_ar = doctor_name if doctor_name.startswith(('د.', 'Dr.', 'Dr. ')) else _dr_prefix_ar + doctor_name

    return {
        'doctor_name': _doc_en if language == 'en' else _doc_ar,
        'patient_name': patient_name,
        'doctor_specialty': specialty,
        'appointment_id': appointment.id,
        'appointment_date': appointment_date.strftime('%Y-%m-%d'),
        'appointment_time': appointment_date.strftime('%H:%M'),
        'appointment_date_readable': ar_date_readable if language == 'ar' else en_date_readable,
        'appointment_time_readable': ar_time_readable if language == 'ar' else en_time_readable,
        'join_url': join_url,
        'title_en': f'{_doc_en} joined the video call',
        'title_ar': f'{_doc_ar} انضم إلى المكالمة المرئية',
        'message_en': (f'Your doctor has joined the video consultation. '
                       f'The room is open now — please join the call.'),
        'message_ar': (f'انضم طبيبك إلى الاستشارة المرئية. غرفة الاستشارة مفتوحة الآن — '
                       f'يُرجى الانضمام إلى المكالمة.'),
    }


def notify_patient_doctor_joined(appointment, doctor_user, patient_user) -> Dict[str, Any]:
    """
    Fire-once-per-appointment hook: called when the doctor's client signals a
    video join. Sends the patient an email (patient's language, existing
    Flask-Mail mechanism + existing MAIL_DEFAULT_SENDER) and creates a
    high-priority in-app NotificationQueue row.

    IDEMPOTENCY: the created 'in_app' NotificationQueue row (template_name
    'doctor_joined_video', template_data.appointment_id) acts as the marker —
    a second join signal for the same appointment is a no-op. This avoids any
    schema change (no new column needed).

    Never raises: every failure is logged and returned; the caller's join
    response must not be affected by notification problems.
    """
    result = {'email_sent': False, 'notification_created': False, 'duplicate': False}

    try:
        from models import db, NotificationQueue
        from services.email_service import email_service

        patient_user_id = patient_user.id
        existing = _find_doctor_joined_notification(patient_user_id, appointment.id)
        if existing:
            app_logger.info(
                f"Doctor-joined notification already sent for appointment "
                f"{appointment.id} (notification {existing.id}) — skipping duplicate"
            )
            result['duplicate'] = True
            return result

        language = getattr(patient_user, 'language_preference', 'ar') or 'ar'
        content = _doctor_joined_email_payload(appointment, doctor_user, patient_user, language)

        # 1) Create the marker row FIRST (commit) so concurrent/rapid duplicate
        #    join signals have the smallest possible race window.
        notification = NotificationQueue.create_notification(
            recipient_type='user',
            recipient_id=patient_user_id,
            notification_type='in_app',
            priority='high',
            title=content['title_en'],
            message=content['message_en'],
            template_name=DOCTOR_JOINED_TEMPLATE,
            template_data={
                'appointment_id': appointment.id,
                'kind': DOCTOR_JOINED_TEMPLATE,
                'notif_type': 'appointment',
                'action_screen': 'video_consultation',
                'title_en': content['title_en'],
                'title_ar': content['title_ar'],
                'message_en': content['message_en'],
                'message_ar': content['message_ar'],
                'join_url': content['join_url'],
            }
        )
        result['notification_created'] = True

        # 2) Then attempt the email (in-app notification must never depend on SMTP).
        email_sent = False
        if patient_user.email:
            email_sent = email_service.send_doctor_joined_video(
                recipient_email=patient_user.email,
                appointment_data=content,
                language=language,
            )
        else:
            app_logger.warning(
                f"Doctor-joined email skipped: patient for appointment "
                f"{appointment.id} has no email address"
            )
        result['email_sent'] = email_sent

        # Record the email outcome on the marker row for observability.
        notification.template_data = {**notification.template_data, 'email_sent': email_sent}
        db.session.commit()

        app_logger.info(
            f"Doctor-joined notification processed for appointment {appointment.id}: "
            f"email_sent={email_sent}, notification_id={notification.id}"
        )
        return result

    except Exception as e:
        try:
            from models import db
            db.session.rollback()
        except Exception:
            pass
        app_logger.error(f"Doctor-joined notification error: {str(e)}")
        result['error'] = str(e)
        return result