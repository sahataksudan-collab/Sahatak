from flask import current_app, render_template
from flask_mail import Mail, Message
from datetime import datetime
from typing import Optional, Dict, Any
import os
from utils.logging_config import app_logger


def _logo_url() -> str:
    """Publicly-reachable logo URL for email headers (configurable via LOGO_URL)."""
    return current_app.config.get(
        'LOGO_URL',
        os.getenv('LOGO_URL', 'https://sahataksudan-collab.github.io/Sahatak/frontend/assets/images/icons/apple-touch-icon.png'),
    )

class EmailService:
    """
    Email service for sending appointment reminders and notifications
    Following established patterns from the Sahatak codebase
    """
    
    def __init__(self, app=None):
        self.mail = None
        if app:
            self.init_app(app)
    
    def init_app(self, app):
        """Initialize email service with Flask app"""
        try:
            # Configure Flask-Mail using existing .env variables
            app.config.setdefault('MAIL_SERVER', os.getenv('MAIL_SERVER', 'smtp.gmail.com'))
            app.config.setdefault('MAIL_PORT', int(os.getenv('MAIL_PORT', 587)))
            app.config.setdefault('MAIL_USE_TLS', True)
            app.config.setdefault('MAIL_USE_SSL', False)
            app.config.setdefault('MAIL_USERNAME', os.getenv('MAIL_USERNAME'))  # sahatak.sudan@gmail.com
            app.config.setdefault('MAIL_PASSWORD', os.getenv('MAIL_PASSWORD'))
            app.config.setdefault('MAIL_DEFAULT_SENDER', os.getenv('MAIL_DEFAULT_SENDER', os.getenv('MAIL_USERNAME')))
            
            # Log configuration details for debugging (without exposing sensitive data)
            app_logger.info(f"Email config - Server: {app.config.get('MAIL_SERVER')} Port: {app.config.get('MAIL_PORT')}")
            app_logger.info(f"Email config - Username: {app.config.get('MAIL_USERNAME')} TLS: {app.config.get('MAIL_USE_TLS')}")
            
            self.mail = Mail(app)
            app_logger.info("Email service initialized successfully")
            
        except ImportError as ie:
            app_logger.error(f"Flask-Mail not installed: {str(ie)} - Please install with: pip install Flask-Mail")
            self.mail = None
        except Exception as e:
            app_logger.error(f"Failed to initialize email service: {str(e)}")
            self.mail = None
    
    def is_configured(self) -> bool:
        """Check if email service is properly configured"""
        if self.mail is None:
            app_logger.error("Email service not initialized - Mail object is None")
            return False
        
        if not current_app.config.get('MAIL_USERNAME'):
            app_logger.error("Email service not configured - MAIL_USERNAME is missing")
            return False
        
        if not current_app.config.get('MAIL_PASSWORD'):
            app_logger.error("Email service not configured - MAIL_PASSWORD is missing")
            return False
        
        # Log successful configuration (but don't expose sensitive data)
        app_logger.info(f"Email service configured with username: {current_app.config.get('MAIL_USERNAME')}")
        return True
    
    def send_appointment_reminder(
        self, 
        recipient_email: str, 
        appointment_data: Dict[str, Any], 
        language: str = 'ar',
        reminder_type: str = '24h'
    ) -> bool:
        """
        Send appointment reminder email
        
        Args:
            recipient_email: Email address to send to
            appointment_data: Appointment details
            language: Language preference ('ar' or 'en')
            reminder_type: Type of reminder ('24h', '1h', 'now')
            
        Returns:
            bool: True if sent successfully, False otherwise
        """
        try:
            if not self.is_configured():
                app_logger.warning("Email service not configured, skipping email")
                return False
            
            # Prepare email data
            subject = self._get_reminder_subject(reminder_type, language)
            template_name = f'email/{language}/appointment_reminder.html'
            
            # Enhanced appointment data for template
            template_data = {
                **appointment_data,
                'reminder_type': reminder_type,
                'language': language,
                'app_name': 'صحتك' if language == 'ar' else 'Sahatak',
                'current_year': datetime.now().year
            }
            
            # Create and send message
            msg = Message(
                subject=subject,
                recipients=[recipient_email],
                html=render_template(template_name,
                    logo_url=_logo_url(), **template_data),
                sender=current_app.config['MAIL_DEFAULT_SENDER']
            )
            
            self.mail.send(msg)
            app_logger.info(f"Appointment reminder email sent to {recipient_email}")
            return True
            
        except Exception as e:
            app_logger.error(f"Failed to send appointment reminder email to {recipient_email}: {str(e)}")
            return False
    
    def send_appointment_confirmation(
        self, 
        recipient_email: str, 
        appointment_data: Dict[str, Any], 
        language: str = 'ar'
    ) -> bool:
        """
        Send appointment confirmation email
        
        Args:
            recipient_email: Email address to send to
            appointment_data: Appointment details
            language: Language preference ('ar' or 'en')
            
        Returns:
            bool: True if sent successfully, False otherwise
        """
        try:
            if not self.is_configured():
                app_logger.warning("Email service not configured, skipping email")
                return False
            
            subject = 'تأكيد موعد الطبيب' if language == 'ar' else 'Appointment Confirmation'
            template_name = f'email/{language}/appointment_confirmation.html'
            
            template_data = {
                **appointment_data,
                'language': language,
                'app_name': 'صحتك' if language == 'ar' else 'Sahatak',
                'current_year': datetime.now().year
            }
            
            msg = Message(
                subject=subject,
                recipients=[recipient_email],
                html=render_template(template_name,
                    logo_url=_logo_url(), **template_data),
                sender=current_app.config['MAIL_DEFAULT_SENDER']
            )
            
            self.mail.send(msg)
            app_logger.info(f"Appointment confirmation email sent to {recipient_email}")
            return True
            
        except Exception as e:
            app_logger.error(f"Failed to send appointment confirmation email to {recipient_email}: {str(e)}")
            return False
    
    def send_appointment_cancellation(
        self, 
        recipient_email: str, 
        appointment_data: Dict[str, Any], 
        language: str = 'ar'
    ) -> bool:
        """
        Send appointment cancellation email
        
        Args:
            recipient_email: Email address to send to
            appointment_data: Appointment details
            language: Language preference ('ar' or 'en')
            
        Returns:
            bool: True if sent successfully, False otherwise
        """
        try:
            if not self.is_configured():
                app_logger.warning("Email service not configured, skipping email")
                return False
            
            subject = 'إلغاء موعد الطبيب' if language == 'ar' else 'Appointment Cancellation'
            template_name = f'email/{language}/appointment_cancellation.html'
            
            template_data = {
                **appointment_data,
                'language': language,
                'app_name': 'صحتك' if language == 'ar' else 'Sahatak',
                'current_year': datetime.now().year
            }
            
            msg = Message(
                subject=subject,
                recipients=[recipient_email],
                html=render_template(template_name,
                    logo_url=_logo_url(), **template_data),
                sender=current_app.config['MAIL_DEFAULT_SENDER']
            )
            
            self.mail.send(msg)
            app_logger.info(f"Appointment cancellation email sent to {recipient_email}")
            return True
            
        except Exception as e:
            app_logger.error(f"Failed to send appointment cancellation email to {recipient_email}: {str(e)}")
            return False

    def send_prescription_notification(
        self,
        recipient_email: str,
        prescription_data: Dict[str, Any],
        language: str = 'ar'
    ) -> bool:
        """
        Send prescription notification email to patient

        Args:
            recipient_email: Email address to send to
            prescription_data: Prescription details
            language: Language preference ('ar' or 'en')

        Returns:
            bool: True if sent successfully, False otherwise
        """
        try:
            if not self.is_configured():
                app_logger.warning("Email service not configured, skipping email")
                return False

            subject = 'وصفة طبية جديدة' if language == 'ar' else 'New Prescription'
            template_name = f'email/{language}/prescription_notification.html'

            template_data = {
                **prescription_data,
                'language': language,
                'app_name': 'صحتك' if language == 'ar' else 'Sahatak',
                'current_year': datetime.now().year
            }

            msg = Message(
                subject=subject,
                recipients=[recipient_email],
                html=render_template(template_name,
                    logo_url=_logo_url(), **template_data),
                sender=current_app.config['MAIL_DEFAULT_SENDER']
            )

            self.mail.send(msg)
            app_logger.info(f"Prescription notification email sent to {recipient_email}")
            return True

        except Exception as e:
            app_logger.error(f"Failed to send prescription notification email to {recipient_email}: {str(e)}")
            return False

    def send_registration_confirmation(
        self, 
        recipient_email: str, 
        user_data: Dict[str, Any], 
        language: str = 'ar'
    ) -> bool:
        """
        Send registration confirmation email
        
        Args:
            recipient_email: Email address to send to
            user_data: User registration details
            language: Language preference ('ar' or 'en')
            
        Returns:
            bool: True if sent successfully, False otherwise
        """
        try:
            if not self.is_configured():
                app_logger.warning("Email service not configured, skipping email")
                return False
            
            subject = 'أهلاً بك في صحتك' if language == 'ar' else 'Welcome to Sahatak'
            template_name = f'email/{language}/registration_confirmation.html'
            
            template_data = {
                **user_data,
                'language': language,
                'app_name': 'صحتك' if language == 'ar' else 'Sahatak',
                'current_year': datetime.now().year
            }
            
            msg = Message(
                subject=subject,
                recipients=[recipient_email],
                html=render_template(template_name,
                    logo_url=_logo_url(), **template_data),
                sender=current_app.config['MAIL_DEFAULT_SENDER']
            )
            
            self.mail.send(msg)
            app_logger.info(f"Registration confirmation email sent to {recipient_email}")
            return True
            
        except Exception as e:
            app_logger.error(f"Failed to send registration confirmation email to {recipient_email}: {str(e)}")
            return False
    
    def send_email_confirmation(
        self, 
        recipient_email: str, 
        user_data: Dict[str, Any], 
        language: str = 'ar'
    ) -> bool:
        """
        Send email confirmation email with verification link
        
        Args:
            recipient_email: Email address to send to
            user_data: User registration details including verification_token
            language: Language preference ('ar' or 'en')
            
        Returns:
            bool: True if sent successfully, False otherwise
        """
        try:
            if not self.is_configured():
                app_logger.warning("Email service not configured, skipping email")
                return False
            
            subject = 'تأكيد البريد الإلكتروني - صحتك' if language == 'ar' else 'Email Confirmation - Sahatak'
            template_name = f'email/{language}/email_confirmation.html'
            
            # Create verification URL
            verification_url = f"{current_app.config.get('FRONTEND_URL', 'https://sahataksudan-collab.github.io/Sahatak')}/frontend/pages/verify-email.html?token={user_data['verification_token']}"
            
            template_data = {
                **user_data,
                'verification_url': verification_url,
                'language': language,
                'app_name': 'صحتك' if language == 'ar' else 'Sahatak',
                'current_year': datetime.now().year
            }
            
            msg = Message(
                subject=subject,
                recipients=[recipient_email],
                html=render_template(template_name,
                    logo_url=_logo_url(), **template_data),
                sender=current_app.config['MAIL_DEFAULT_SENDER']
            )
            
            # Add retry mechanism for network issues
            max_retries = 3
            for attempt in range(max_retries):
                try:
                    self.mail.send(msg)
                    app_logger.info(f"Email confirmation sent to {recipient_email}")
                    return True
                except OSError as network_error:
                    if attempt < max_retries - 1:
                        app_logger.warning(f"Network error sending to {recipient_email}, attempt {attempt + 1}/{max_retries}: {str(network_error)}")
                        import time
                        time.sleep(2)  # Wait 2 seconds before retry
                        continue
                    else:
                        raise network_error
            
        except Exception as e:
            # Log detailed error information for debugging
            error_type = type(e).__name__
            if 'auth' in str(e).lower() or 'password' in str(e).lower():
                app_logger.error(f"Email authentication failed for {recipient_email}: {error_type} - Check MAIL_USERNAME and MAIL_PASSWORD")
            elif 'smtp' in str(e).lower():
                app_logger.error(f"SMTP error sending email to {recipient_email}: {error_type} - {str(e)}")
            elif 'template' in str(e).lower():
                app_logger.error(f"Email template error for {recipient_email}: {error_type} - Check template file exists")
            else:
                app_logger.error(f"Failed to send email confirmation to {recipient_email}: {error_type} - {str(e)}")
            return False
    
    def send_password_reset(
        self,
        recipient_email: str,
        user_data: Dict[str, Any],
        language: str = 'ar'
    ) -> bool:
        """
        Send password reset email

        Args:
            recipient_email: Email address to send to
            user_data: User details including reset_token
            language: Language preference ('ar' or 'en')

        Returns:
            bool: True if sent successfully, False otherwise
        """
        try:
            if not self.is_configured():
                app_logger.warning("Email service not configured, skipping email")
                return False

            subject = 'إعادة تعيين كلمة المرور - صحتك' if language == 'ar' else 'Password Reset - Sahatak'
            template_name = f'email/{language}/password_reset.html'

            # Create reset URL
            reset_url = f"{current_app.config.get('FRONTEND_URL', 'https://sahataksudan-collab.github.io/Sahatak')}/frontend/pages/reset-password.html?token={user_data['reset_token']}"

            template_data = {
                **user_data,
                'reset_url': reset_url,
                'language': language,
                'app_name': 'صحتك' if language == 'ar' else 'Sahatak',
                'current_year': datetime.now().year
            }

            msg = Message(
                subject=subject,
                recipients=[recipient_email],
                html=render_template(template_name,
                    logo_url=_logo_url(), **template_data),
                sender=current_app.config['MAIL_DEFAULT_SENDER']
            )

            # Add retry mechanism for network issues
            max_retries = 3
            for attempt in range(max_retries):
                try:
                    self.mail.send(msg)
                    app_logger.info(f"Password reset email sent to {recipient_email}")
                    return True
                except OSError as network_error:
                    if attempt < max_retries - 1:
                        app_logger.warning(f"Network error sending to {recipient_email}, attempt {attempt + 1}/{max_retries}: {str(network_error)}")
                        import time
                        time.sleep(2)  # Wait 2 seconds before retry
                        continue
                    else:
                        raise network_error

        except Exception as e:
            app_logger.error(f"Failed to send password reset email to {recipient_email}: {str(e)}")
            return False

    def send_doctor_joined_video(
        self,
        recipient_email: str,
        appointment_data: Dict[str, Any],
        language: str = 'ar'
    ) -> bool:
        """
        Send a "your doctor has joined the video consultation" email to the
        patient. Visual sibling of appointment_confirmation (same base layout,
        header, logo and detail-card styling — no new visual style).

        Args:
            recipient_email: Patient email address
            appointment_data: Details (doctor_name, patient_name,
                doctor_specialty, appointment_date(_readable),
                appointment_time_readable, join_url)
            language: Language preference ('ar' or 'en')

        Returns:
            bool: True if sent successfully, False otherwise
        """
        try:
            if not self.is_configured():
                app_logger.warning("Email service not configured, skipping email")
                return False

            doctor_name = appointment_data.get('doctor_name', '')
            if language == 'ar':
                subject = f'{doctor_name} انضم إلى استشارتك المرئية'
            else:
                subject = f'{doctor_name} has joined your video consultation'
            template_name = f'email/{language}/doctor_joined_video.html'

            template_data = {
                **appointment_data,
                'language': language,
                'app_name': 'صحتك' if language == 'ar' else 'Sahatak',
                'current_year': datetime.now().year
            }

            msg = Message(
                subject=subject,
                recipients=[recipient_email],
                html=render_template(template_name,
                    logo_url=_logo_url(), **template_data),
                sender=current_app.config['MAIL_DEFAULT_SENDER']
            )

            self.mail.send(msg)
            app_logger.info(f"Doctor-joined-video email sent to {recipient_email}")
            return True

        except Exception as e:
            app_logger.error(f"Failed to send doctor-joined-video email to {recipient_email}: {str(e)}")
            return False

    def send_custom_email(self, recipient_email: str, subject: str, body: str) -> bool:
        """Send a custom email with provided subject and body"""
        try:
            if not self.is_configured():
                return False

            msg = Message(
                subject=subject,
                recipients=[recipient_email],
                body=body,
                sender=current_app.config['MAIL_DEFAULT_SENDER']
            )

            self.mail.send(msg)
            app_logger.info(f"Custom email sent to {recipient_email}")
            return True

        except Exception as e:
            app_logger.error(f"Failed to send custom email to {recipient_email}: {str(e)}")
            return False
    
    def _get_reminder_subject(self, reminder_type: str, language: str) -> str:
        """Get email subject based on reminder type and language"""
        subjects = {
            'ar': {
                '24h': 'تذكير: موعد الطبيب غداً',
                '1h': 'تذكير: موعد الطبيب خلال ساعة',
                'now': 'تذكير: موعد الطبيب الآن'
            },
            'en': {
                '24h': 'Reminder: Your medical appointment tomorrow',
                '1h': 'Reminder: Your medical appointment in 1 hour',
                'now': 'Reminder: Your medical appointment is now'
            }
        }
        
        return subjects.get(language, subjects['ar']).get(reminder_type, 'Appointment Reminder')

# Create singleton instance
email_service = EmailService()

def send_appointment_reminder(recipient_email: str, appointment_data: Dict[str, Any], language: str = 'ar', reminder_type: str = '24h') -> bool:
    """Convenience function for sending appointment reminders"""
    return email_service.send_appointment_reminder(recipient_email, appointment_data, language, reminder_type)

def send_appointment_confirmation(recipient_email: str, appointment_data: Dict[str, Any], language: str = 'ar') -> bool:
    """Convenience function for sending appointment confirmations"""
    return email_service.send_appointment_confirmation(recipient_email, appointment_data, language)

def send_appointment_cancellation(recipient_email: str, appointment_data: Dict[str, Any], language: str = 'ar') -> bool:
    """Convenience function for sending appointment cancellations"""
    return email_service.send_appointment_cancellation(recipient_email, appointment_data, language)

def send_registration_confirmation_email(recipient_email: str, user_data: Dict[str, Any], language: str = 'ar') -> bool:
    """Convenience function for sending registration confirmation emails"""
    return email_service.send_registration_confirmation(recipient_email, user_data, language)

def send_password_reset_email(recipient_email: str, user_data: Dict[str, Any], language: str = 'ar') -> bool:
    """Convenience function for sending password reset emails"""
    return email_service.send_password_reset(recipient_email, user_data, language)

def send_prescription_notification(recipient_email: str, prescription_data: Dict[str, Any], language: str = 'ar') -> bool:
    """Convenience function for sending prescription notification emails"""
    return email_service.send_prescription_notification(recipient_email, prescription_data, language)

def send_doctor_joined_video_email(recipient_email: str, appointment_data: Dict[str, Any], language: str = 'ar') -> bool:
    """Convenience function for the doctor-joined-video notification email"""
    return email_service.send_doctor_joined_video(recipient_email, appointment_data, language)