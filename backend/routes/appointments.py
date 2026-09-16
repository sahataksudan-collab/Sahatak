from flask import Blueprint, request, current_app
from flask_login import current_user
from models import db, Appointment, Doctor, Patient, User
from datetime import datetime, timedelta
from sqlalchemy import and_, or_
from sqlalchemy.orm import joinedload
from utils.responses import APIResponse, ErrorCodes
from utils.validators import validate_date, validate_appointment_type, validate_text_field_length
from utils.logging_config import app_logger, log_user_action
from utils.db_optimize import OptimizedQueries, QueryOptimizer, invalidate_appointment_cache, cached_query
from services.email_service import send_appointment_confirmation
from routes.auth import api_login_required

appointments_bp = Blueprint('appointments', __name__)

@appointments_bp.route('/doctors', methods=['GET'])
@api_login_required
def get_available_doctors():
    """Get list of available doctors for appointment booking"""
    try:
        # Get query parameters
        specialty = request.args.get('specialty')
        page = int(request.args.get('page', 1))
        per_page = min(int(request.args.get('per_page', 20)), 100)
        
        # Base query: verified and active doctors
        query = Doctor.query.filter_by(is_verified=True).join(User, Doctor.user_id == User.id).filter_by(is_active=True)
        
        # Filter by specialty if provided
        if specialty:
            query = query.filter(Doctor.specialty.ilike(f'%{specialty}%'))
        
        # Get paginated results
        paginated_doctors = query.order_by(Doctor.id.desc()).paginate(
            page=page, per_page=per_page, error_out=False
        )
        
        # Format doctor data
        doctors_data = []
        for doctor in paginated_doctors.items:
            try:
                doctor_data = {
                    'id': doctor.id,
                    'user': {
                        'full_name': doctor.user.full_name
                    },
                    'specialty': doctor.specialty,
                    'years_of_experience': doctor.years_of_experience,
                    'consultation_fee': doctor.consultation_fee,
                    'is_volunteer': doctor.consultation_fee == 0,
                    'is_verified': doctor.is_verified,
                    'rating': 4.5  # Default rating since we may not have this column
                }
                doctors_data.append(doctor_data)
            except Exception as doc_error:
                app_logger.error(f"Error formatting doctor {doctor.id}: {str(doc_error)}")
                continue
        
        return APIResponse.success(
            data={
                'doctors': doctors_data,
                'pagination': {
                    'page': page,
                    'per_page': per_page,
                    'total': paginated_doctors.total,
                    'pages': paginated_doctors.pages,
                    'has_next': paginated_doctors.has_next,
                    'has_prev': paginated_doctors.has_prev
                }
            },
            message='Available doctors retrieved successfully'
        )
        
    except Exception as e:
        import traceback
        app_logger.error(f"Get available doctors error: {str(e)}")
        app_logger.error(f"Full traceback: {traceback.format_exc()}")
        return APIResponse.internal_error(message='Failed to get available doctors')

@appointments_bp.route('/', methods=['GET'])
@api_login_required
def get_appointments():
    """Get user's appointments with optimized queries"""
    try:
        app_logger.info(f"Getting appointments for user {current_user.id}, type: {current_user.user_type}")

        # Check for patient_id filter (only for doctors)
        patient_id_filter = request.args.get('patient_id', type=int)

        # Get appointments based on user type using optimized queries
        if current_user.user_type == 'patient':
            if not current_user.patient_profile:
                app_logger.error(f"Patient profile not found for user {current_user.id}")
                return APIResponse.not_found(message='Patient profile not found')
            appointments = OptimizedQueries.get_patient_appointments(current_user.patient_profile.id)
        elif current_user.user_type == 'doctor':
            if not current_user.doctor_profile:
                app_logger.error(f"Doctor profile not found for user {current_user.id}")
                return APIResponse.not_found(message='Doctor profile not found')
            app_logger.info(f"Getting appointments for doctor {current_user.doctor_profile.id}")
            appointments = OptimizedQueries.get_doctor_appointments(current_user.doctor_profile.id)
            app_logger.info(f"Found {len(appointments)} appointments for doctor")

            # Filter by patient_id if provided
            if patient_id_filter:
                appointments = [apt for apt in appointments if apt.patient_id == patient_id_filter]
                app_logger.info(f"Filtered to {len(appointments)} appointments for patient {patient_id_filter}")
        else:
            return APIResponse.validation_error(field='user_type', message='Invalid user type')
        
        # Add patient and doctor names to each appointment
        appointments_data = []
        for appointment in appointments:
            apt_dict = appointment.to_dict()
            
            # Add doctor name
            if appointment.doctor and appointment.doctor.user:
                apt_dict['doctor_name'] = appointment.doctor.user.full_name
            else:
                apt_dict['doctor_name'] = 'Unknown Doctor'
            
            # Add patient name
            if appointment.patient and appointment.patient.user:
                apt_dict['patient_name'] = appointment.patient.user.full_name
            else:
                apt_dict['patient_name'] = 'Unknown Patient' if appointment.patient_id else 'Blocked Slot'
            
            appointments_data.append(apt_dict)
        
        return APIResponse.success(
            data={'appointments': appointments_data},
            message='Appointments retrieved successfully'
        )
        
    except Exception as e:
        app_logger.error(f"Get appointments error: {str(e)}")
        return APIResponse.internal_error(message='Failed to get appointments')

@appointments_bp.route('/', methods=['POST'])
@api_login_required
def create_appointment():
    """Create new appointment (patients only)"""
    from utils.validators import validate_json_payload, validate_id_parameter, validate_enum_field, handle_api_errors
    
    try:
        if current_user.user_type != 'patient':
            return APIResponse.forbidden(message='Only patients can book appointments')
        
        # Get patient profile (medical history completion is now optional)
        patient = current_user.get_profile()
        if not patient:
            return APIResponse.error(message='Patient profile not found')
        
        # Medical history is now optional - patients can complete it anytime later
        # if not patient.medical_history_completed:
        #     return APIResponse.error(
        #         message='Please complete your medical history before booking an appointment',
        #         status_code=428,  # Precondition Required
        #         error_code='MEDICAL_HISTORY_REQUIRED',
        #         details={'redirect': '/medical/patient/medical-history-form.html'}
        #     )
        
        data = request.get_json()
        
        # Validate JSON payload structure
        required_fields = ['doctor_id', 'appointment_date', 'appointment_type']
        optional_fields = ['notes', 'reason_for_visit', 'symptoms']
        validation = validate_json_payload(data, required_fields, optional_fields)
        
        if not validation['valid']:
            return APIResponse.validation_error(
                field=validation.get('missing_fields', validation.get('unexpected_fields', 'data')),
                message=validation['message']
            )
        
        # Validate doctor_id
        doctor_validation = validate_id_parameter(data['doctor_id'], 'doctor_id')
        if not doctor_validation['valid']:
            return APIResponse.validation_error(
                field='doctor_id',
                message=doctor_validation['message']
            )
        
        # Validate appointment_type
        allowed_types = ['video', 'audio', 'chat']
        type_validation = validate_enum_field(data['appointment_type'], allowed_types, 'appointment_type')
        if not type_validation['valid']:
            return APIResponse.validation_error(
                field='appointment_type',
                message=type_validation['message']
            )
        
        # Validate doctor exists and is verified
        doctor = Doctor.query.filter_by(id=data['doctor_id'], is_verified=True).join(User, Doctor.user_id == User.id).filter(User.is_active == True).first()
        if not doctor:
            return APIResponse.validation_error(
                field='doctor_id',
                message='Doctor not found or not available'
            )
        
        # Validate appointment type
        appointment_type_validation = validate_appointment_type(data['appointment_type'])
        if not appointment_type_validation['valid']:
            return APIResponse.validation_error(
                field='appointment_type',
                message=appointment_type_validation['message']
            )
        
        # Validate text fields for length and content
        text_validations = [
            ('reason_for_visit', data.get('reason_for_visit', ''), 500, 0),
            ('symptoms', data.get('symptoms', ''), 1000, 0)
        ]
        
        for field_name, value, max_len, min_len in text_validations:
            if value:  # Only validate if field has content
                validation = validate_text_field_length(value, field_name, max_len, min_len)
                if not validation['valid']:
                    return APIResponse.validation_error(
                        field=field_name,
                        message=validation['message']
                    )
        
        # Parse and validate appointment date
        try:
            appointment_date = datetime.fromisoformat(data['appointment_date'])
        except ValueError:
            return APIResponse.validation_error(
                field='appointment_date',
                message='Invalid appointment date format'
            )
        
        # Check if appointment is in the future
        if appointment_date <= datetime.now():
            return APIResponse.validation_error(
                field='appointment_date',
                message='Appointment must be scheduled in the future'
            )
        
        # Use database transaction with SELECT FOR UPDATE to prevent race conditions
        try:
            # Lock and check availability atomically (Flask-SQLAlchemy manages transactions automatically)
            existing_appointment = Appointment.query.filter(
                and_(
                    Appointment.doctor_id == data['doctor_id'],
                    Appointment.appointment_date == appointment_date,
                    Appointment.status.in_(['scheduled', 'confirmed', 'in_progress', 'blocked'])
                )
            ).with_for_update().first()
            
            if existing_appointment:
                db.session.rollback()
                # Log double booking attempt for security monitoring
                log_user_action(
                    current_user.id,
                    'double_booking_attempt',
                    {
                        'doctor_id': data['doctor_id'],
                        'appointment_date': appointment_date.isoformat(),
                        'existing_appointment_id': existing_appointment.id,
                        'existing_status': existing_appointment.status
                    },
                    request
                )
                if existing_appointment.status == 'blocked':
                    return APIResponse.conflict(
                        message='This time slot is blocked by the doctor'
                    )
                else:
                    return APIResponse.conflict(
                        message='This time slot is already booked'
                    )
            
            # Create appointment with consultation fee from doctor profile
            appointment = Appointment(
                patient_id=current_user.patient_profile.id,
                doctor_id=data['doctor_id'],
                appointment_date=appointment_date,
                appointment_type=data['appointment_type'],
                reason_for_visit=data.get('reason_for_visit'),
                symptoms=data.get('symptoms'),
                consultation_fee=doctor.consultation_fee  # Auto-populate fee from doctor
            )
            
            db.session.add(appointment)
            db.session.commit()  # Commit the transaction
            
            # No caching - real-time data for medical appointments
            
        except Exception as e:
            db.session.rollback()
            app_logger.error(f"Error creating appointment: {str(e)}")
            return APIResponse.internal_error(message='Failed to create appointment')
        
        # Log successful appointment creation
        log_user_action(
            current_user.id,
            'appointment_created',
            {
                'appointment_id': appointment.id,
                'doctor_id': data['doctor_id'],
                'appointment_type': data['appointment_type'],
                'appointment_date': appointment_date.isoformat()
            },
            request
        )
        
        app_logger.info(f"Appointment created: ID {appointment.id} by patient {current_user.id}")
        
        # Send appointment confirmation emails to BOTH the patient and the doctor.
        # The send is synchronous (the same proven-working Flask-Mail path used by
        # support/registration emails). Booking NEVER fails because of an email
        # problem - every failure is logged loudly with traceback.
        try:
            import traceback
            
            patient_email = current_user.email if current_user.email else None
            doctor_email = doctor.user.email if doctor.user and doctor.user.email else None
            patient_language = getattr(current_user, 'language_preference', 'ar') or 'ar'
            doctor_language = getattr(doctor.user, 'language_preference', 'ar') if doctor.user else 'ar'
            
            # Localized readable date/time strings for the email templates
            _AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
                          'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
            _AR_DAYS = ['الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد']
            _TYPE_LABELS = {
                'en': {'video': 'Video consultation', 'audio': 'Audio consultation', 'chat': 'Chat consultation'},
                'ar': {'video': 'استشارة مرئية', 'audio': 'استشارة صوتية', 'chat': 'استشارة نصية'}
            }
            
            # English readable date: "Monday, 15 September 2026"
            en_date_readable = appointment_date.strftime('%A, %d %B %Y')
            # Arabic readable date: "الثلاثاء، 15 سبتمبر 2026"
            ar_date_readable = f"{_AR_DAYS[appointment_date.weekday()]}، {appointment_date.strftime('%d')} {_AR_MONTHS[appointment_date.month - 1]} {appointment_date.strftime('%Y')}"
            # 12-hour time: "03:30 PM" / "03:30 م"
            en_time_readable = appointment_date.strftime('%I:%M %p').lstrip('0')
            ar_time_readable = en_time_readable.replace('AM', 'ص').replace('PM', 'م')
            
            base_email_data = {
                **appointment.to_dict(),
                'doctor_name': doctor.user.full_name,
                'patient_name': current_user.full_name,
                'doctor_specialty': getattr(doctor, 'specialty', None),
                'appointment_date': appointment_date.strftime('%Y-%m-%d'),
                'appointment_time': appointment_date.strftime('%H:%M'),
                'appointment_date_readable': en_date_readable,
                'appointment_time_readable': en_time_readable,
                'appointment_type': data['appointment_type'],
                'appointment_id': appointment.id,
                'status': appointment.status
            }
            
            # Build per-recipient payloads (patient + doctor), then send each one.
            # Every send failure is logged with the real exception and traceback.
            email_payloads = []
            if patient_email:
                email_payloads.append({
                    'recipient_email': patient_email,
                    'recipient_role': 'patient',
                    'language': patient_language,
                    'email_data': {
                        **base_email_data,
                        'recipient_role': 'patient',
                        'appointment_date_readable': en_date_readable if patient_language == 'en' else ar_date_readable,
                        'appointment_time_readable': en_time_readable if patient_language == 'en' else ar_time_readable,
                        'appointment_type_label': _TYPE_LABELS[patient_language].get(data['appointment_type'], data['appointment_type'])
                    }
                })
            if doctor_email:
                email_payloads.append({
                    'recipient_email': doctor_email,
                    'recipient_role': 'doctor',
                    'language': doctor_language or 'ar',
                    'email_data': {
                        **base_email_data,
                        'recipient_role': 'doctor',
                        'appointment_date_readable': en_date_readable if (doctor_language or 'ar') == 'en' else ar_date_readable,
                        'appointment_time_readable': en_time_readable if (doctor_language or 'ar') == 'en' else ar_time_readable,
                        'appointment_type_label': _TYPE_LABELS[doctor_language or 'ar'].get(data['appointment_type'], data['appointment_type'])
                    }
                })
            
            if email_payloads:
                for payload in email_payloads:
                    recipient_email = payload['recipient_email']
                    recipient_role = payload['recipient_role']
                    try:
                        email_sent = send_appointment_confirmation(
                            recipient_email=recipient_email,
                            appointment_data=payload['email_data'],
                            language=payload['language'] or 'ar'
                        )
                        if email_sent:
                            app_logger.info(
                                f"Appointment confirmation email sent to {recipient_role} "
                                f"{recipient_email} (appointment {appointment.id})"
                            )
                        else:
                            app_logger.warning(
                                f"Appointment confirmation email FAILED for {recipient_role} "
                                f"{recipient_email} (appointment {appointment.id}) - "
                                f"see email service log above for the specific reason"
                            )
                    except Exception as email_error:
                        # Log the REAL error + traceback instead of swallowing it silently
                        app_logger.error(
                            f"Appointment confirmation email error for {recipient_role} "
                            f"{recipient_email} (appointment {appointment.id}): {email_error}"
                        )
                        app_logger.error(f"Email traceback: {traceback.format_exc()}")
            else:
                app_logger.info(
                    "No email address available for patient or doctor "
                    f"(appointment {appointment.id}), skipping confirmation emails"
                )
        
        except Exception as e:
            import traceback
            # Don't fail the appointment creation if email fails - but log loudly
            app_logger.error(f"Error sending appointment confirmation emails: {str(e)}")
            app_logger.error(f"Email block traceback: {traceback.format_exc()}")
        
        return APIResponse.success(
            data={'appointment': appointment.to_dict()},
            message='Appointment created successfully',
            status_code=201
        )
        
    except Exception as e:
        db.session.rollback()
        app_logger.error(f"Create appointment error: {str(e)}")
        return APIResponse.internal_error(message='Failed to create appointment')

@appointments_bp.route('/<int:appointment_id>', methods=['GET'])
@api_login_required
def get_appointment(appointment_id):
    """Get specific appointment details"""
    try:
        appointment = Appointment.query.get_or_404(appointment_id)
        
        # Check if user has access to this appointment
        if current_user.user_type == 'patient' and appointment.patient_id != current_user.patient_profile.id:
            return APIResponse.forbidden(message='Access denied')
        elif current_user.user_type == 'doctor' and appointment.doctor_id != current_user.doctor_profile.id:
            return APIResponse.forbidden(message='Access denied')
        
        return APIResponse.success(
            data={'appointment': appointment.to_dict()},
            message='Appointment details retrieved successfully'
        )
        
    except Exception as e:
        app_logger.error(f"Get appointment error: {str(e)}")
        return APIResponse.internal_error(message='Failed to get appointment')

@appointments_bp.route('/doctors/<int:doctor_id>/availability', methods=['GET'])
@api_login_required
def get_doctor_availability(doctor_id):
    """Get available time slots for a specific doctor"""
    try:
        # Validate doctor exists and is active
        doctor = Doctor.query.filter_by(id=doctor_id, is_verified=True).join(User, Doctor.user_id == User.id).filter(User.is_active == True).first()
        if not doctor:
            return APIResponse.not_found(message='Doctor not found')
        
        # Get date parameter (default to today)
        date_str = request.args.get('date')
        if date_str:
            date_validation = validate_date(date_str)
            if not date_validation['valid']:
                return APIResponse.validation_error(
                    field='date',
                    message=date_validation['message']
                )
            target_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        else:
            target_date = datetime.now().date()
        
        # Don't allow booking in the past
        if target_date < datetime.now().date():
            return APIResponse.validation_error(
                field='date',
                message='Cannot book appointments in the past'
            )
        
        # Get doctor's available hours (default 9 AM to 5 PM if not set)
        available_hours = doctor.available_hours or {
            'monday': {'start': '09:00', 'end': '17:00'},
            'tuesday': {'start': '09:00', 'end': '17:00'},
            'wednesday': {'start': '09:00', 'end': '17:00'},
            'thursday': {'start': '09:00', 'end': '17:00'},
            'sunday': {'start': '09:00', 'end': '17:00'}
        }
        
        # Get day of week
        day_name = target_date.strftime('%A').lower()
        
        if day_name not in available_hours:
            return APIResponse.success(
                data={'available_slots': []},
                message=f'Doctor is not available on {day_name.capitalize()}'
            )
        
        day_schedule = available_hours[day_name]
        
        # Check if the day is enabled
        if not day_schedule.get('enabled', True):
            return APIResponse.success(
                data={'available_slots': []},
                message=f'Doctor is not available on {day_name.capitalize()}'
            )
        start_time = datetime.strptime(day_schedule['start'], '%H:%M').time()
        end_time = datetime.strptime(day_schedule['end'], '%H:%M').time()
        
        # Generate 30-minute time slots
        slots = []
        current_time = datetime.combine(target_date, start_time)
        end_datetime = datetime.combine(target_date, end_time)
        
        while current_time < end_datetime:
            slot_end = current_time + timedelta(minutes=30)
            if slot_end <= end_datetime:
                slots.append({
                    'start': current_time.strftime('%H:%M'),
                    'end': slot_end.strftime('%H:%M'),
                    'datetime': current_time.isoformat()
                })
            current_time = slot_end
        
        # Check for existing appointments and blocked slots
        existing_appointments = Appointment.query.filter(
            and_(
                Appointment.doctor_id == doctor_id,
                Appointment.appointment_date >= datetime.combine(target_date, start_time),
                Appointment.appointment_date < datetime.combine(target_date + timedelta(days=1), datetime.min.time()),
                Appointment.status.in_(['scheduled', 'confirmed', 'in_progress', 'blocked'])
            )
        ).all()
        
        booked_times = set()
        for appointment in existing_appointments:
            booked_times.add(appointment.appointment_date.strftime('%H:%M'))
        
        # Update slot availability
        for slot in slots:
            slot['available'] = slot['start'] not in booked_times
        
        return APIResponse.success(
            data={
                'date': target_date.isoformat(),
                'doctor_id': doctor_id,
                'doctor_name': doctor.user.get_full_name(),
                'available_slots': slots
            },
            message='Available time slots retrieved successfully'
        )
        
    except Exception as e:
        app_logger.error(f"Get doctor availability error: {str(e)}")
        return APIResponse.internal_error(message='Failed to get doctor availability')

@appointments_bp.route('/<int:appointment_id>/cancel', methods=['PUT'])
@api_login_required
def cancel_appointment(appointment_id):
    """Cancel an appointment (patients only)"""
    try:
        if current_user.user_type != 'patient':
            return APIResponse.forbidden(message='Only patients can cancel appointments')
        
        appointment = Appointment.query.get(appointment_id)
        if not appointment:
            return APIResponse.not_found(resource='Appointment', resource_id=appointment_id)
        
        # Check if user owns this appointment
        if appointment.patient_id != current_user.patient_profile.id:
            return APIResponse.forbidden(message='Access denied')
        
        # Check if appointment can be cancelled
        if appointment.status in ['completed', 'cancelled']:
            return APIResponse.validation_error(
                field='status',
                message=f'Cannot cancel appointment that is already {appointment.status}'
            )
        
        # Check if appointment is in the near future (allow cancellation up to 1 hour before)
        if appointment.appointment_date <= datetime.now() + timedelta(hours=1):
            return APIResponse.validation_error(
                field='appointment_date',
                message='Cannot cancel appointments less than 1 hour before scheduled time'
            )
        
        data = request.get_json() or {}
        
        # Update appointment status
        old_status = appointment.status
        appointment.status = 'cancelled'
        appointment.notes = data.get('cancellation_reason', appointment.notes)
        appointment.updated_at = datetime.utcnow()
        
        db.session.commit()
        
        # No caching - real-time data
        
        # Log the cancellation
        log_user_action(
            current_user.id,
            'appointment_cancelled',
            {
                'appointment_id': appointment_id,
                'old_status': old_status,
                'cancellation_reason': data.get('cancellation_reason')
            },
            request
        )
        
        app_logger.info(f"Appointment {appointment_id} cancelled by patient {current_user.id}")
        
        return APIResponse.success(
            data={'appointment': appointment.to_dict()},
            message='Appointment cancelled successfully'
        )
        
    except Exception as e:
        db.session.rollback()
        app_logger.error(f"Cancel appointment error: {str(e)}")
        return APIResponse.internal_error(message='Failed to cancel appointment')

@appointments_bp.route('/<int:appointment_id>/reschedule', methods=['PUT'])
@api_login_required
def reschedule_appointment(appointment_id):
    """Reschedule an appointment (patients only)"""
    try:
        if current_user.user_type != 'patient':
            return APIResponse.forbidden(message='Only patients can reschedule appointments')
        
        appointment = Appointment.query.get(appointment_id)
        if not appointment:
            return APIResponse.not_found(resource='Appointment', resource_id=appointment_id)
        
        # Check if user owns this appointment
        if appointment.patient_id != current_user.patient_profile.id:
            return APIResponse.forbidden(message='Access denied')
        
        # Check if appointment can be rescheduled
        if appointment.status in ['completed', 'cancelled', 'in_progress']:
            return APIResponse.validation_error(
                field='status',
                message=f'Cannot reschedule appointment that is {appointment.status}'
            )
        
        data = request.get_json()
        if not data.get('new_appointment_date'):
            return APIResponse.validation_error(
                field='new_appointment_date',
                message='New appointment date is required'
            )
        
        # Parse and validate new appointment date
        try:
            new_appointment_date = datetime.fromisoformat(data['new_appointment_date'])
        except ValueError:
            return APIResponse.validation_error(
                field='new_appointment_date',
                message='Invalid appointment date format'
            )
        
        # Check if new appointment is in the future
        if new_appointment_date <= datetime.now():
            return APIResponse.validation_error(
                field='new_appointment_date',
                message='New appointment must be scheduled in the future'
            )
        
        # Check if new time slot is available (including blocked slots)
        existing_appointment = Appointment.query.filter(
            and_(
                Appointment.doctor_id == appointment.doctor_id,
                Appointment.appointment_date == new_appointment_date,
                Appointment.status.in_(['scheduled', 'confirmed', 'in_progress', 'blocked']),
                Appointment.id != appointment_id  # Exclude current appointment
            )
        ).first()
        
        if existing_appointment:
            if existing_appointment.status == 'blocked':
                return APIResponse.conflict(
                    message='The new time slot is blocked by the doctor'
                )
            else:
                return APIResponse.conflict(
                    message='The new time slot is already booked'
                )
        
        # Update appointment
        old_date = appointment.appointment_date
        appointment.appointment_date = new_appointment_date
        appointment.status = 'scheduled'  # Reset to scheduled after reschedule
        appointment.notes = data.get('reschedule_reason', appointment.notes)
        appointment.updated_at = datetime.utcnow()
        
        db.session.commit()
        
        # No caching - real-time data
        
        # Log the reschedule
        log_user_action(
            current_user.id,
            'appointment_rescheduled',
            {
                'appointment_id': appointment_id,
                'old_date': old_date.isoformat(),
                'new_date': new_appointment_date.isoformat(),
                'reschedule_reason': data.get('reschedule_reason')
            },
            request
        )
        
        app_logger.info(f"Appointment {appointment_id} rescheduled by patient {current_user.id}")
        
        return APIResponse.success(
            data={'appointment': appointment.to_dict()},
            message='Appointment rescheduled successfully'
        )
        
    except Exception as e:
        db.session.rollback()
        app_logger.error(f"Reschedule appointment error: {str(e)}")
        return APIResponse.internal_error(message='Failed to reschedule appointment')


@appointments_bp.route('/patients', methods=['GET'])
@api_login_required
def get_doctor_patients():
    """Get list of patients for a doctor"""
    try:
        # Check if the current user is a doctor
        if current_user.user_type != 'doctor':
            return APIResponse.forbidden(message='Only doctors can access patient list')
        
        # Get doctor record
        doctor = Doctor.query.filter_by(user_id=current_user.id).first()
        if not doctor:
            return APIResponse.not_found(message='Doctor profile not found')
        
        # Get unique patients from appointments
        patients_query = db.session.query(Patient).join(
            Appointment, Patient.id == Appointment.patient_id
        ).filter(
            Appointment.doctor_id == doctor.id,
            Appointment.status.in_(['completed', 'scheduled', 'confirmed'])
        ).distinct()
        
        patients = patients_query.all()
        
        # Format patient data
        patients_data = []
        for patient in patients:
            # Get last appointment date for this patient with this doctor
            last_appointment = Appointment.query.filter_by(
                doctor_id=doctor.id,
                patient_id=patient.id
            ).order_by(Appointment.appointment_date.desc()).first()
            
            patient_data = {
                'id': patient.id,
                'patient_id': f'PAT-{patient.id:06d}',  # Generate display ID like PAT-000001
                'full_name': patient.user.full_name if patient.user else 'Unknown',
                'age': patient.age if patient.age else None,
                'phone': patient.phone if patient.phone else None,
                'gender': patient.gender if patient.gender else None,
                'last_appointment_date': last_appointment.appointment_date.isoformat() if last_appointment else None
            }
            patients_data.append(patient_data)
        
        return APIResponse.success(
            data=patients_data,
            message='Patients retrieved successfully'
        )
        
    except Exception as e:
        app_logger.error(f"Error getting doctor patients: {str(e)}")
        return APIResponse.internal_error(message='Failed to retrieve patients')


@appointments_bp.route('/stats', methods=['GET'])
@api_login_required
def get_doctor_stats():
    """Get statistics for doctor dashboard"""
    try:
        # Check if the current user is a doctor
        if current_user.user_type != 'doctor':
            return APIResponse.forbidden(message='Only doctors can access statistics')
        
        # Get doctor record
        doctor = Doctor.query.filter_by(user_id=current_user.id).first()
        if not doctor:
            return APIResponse.not_found(message='Doctor profile not found')
        
        # Calculate statistics
        today = datetime.now().date()
        
        # Total unique patients
        total_patients = db.session.query(Patient).join(
            Appointment, Patient.id == Appointment.patient_id
        ).filter(
            Appointment.doctor_id == doctor.id,
            Appointment.status.in_(['completed', 'scheduled', 'confirmed'])
        ).distinct().count()
        
        # Appointments today
        appointments_today = Appointment.query.filter(
            Appointment.doctor_id == doctor.id,
            db.func.date(Appointment.appointment_date) == today,
            Appointment.status.in_(['scheduled', 'confirmed', 'in_progress'])
        ).count()
        
        # Total consultations completed
        consultations_completed = Appointment.query.filter(
            Appointment.doctor_id == doctor.id,
            Appointment.status == 'completed'
        ).count()
        
        stats = {
            'total_patients': total_patients,
            'appointments_today': appointments_today,
            'consultations_completed': consultations_completed
        }
        
        return APIResponse.success(
            data=stats,
            message='Statistics retrieved successfully'
        )
        
    except Exception as e:
        app_logger.error(f"Error getting doctor stats: {str(e)}")
        return APIResponse.internal_error(message='Failed to retrieve statistics')


@appointments_bp.route('/waiting', methods=['GET'])
@api_login_required
def get_waiting_patients():
    """Get list of waiting patients for today"""
    try:
        # Check if the current user is a doctor
        if current_user.user_type != 'doctor':
            return APIResponse.forbidden(message='Only doctors can access waiting patients')
        
        # Get doctor record
        doctor = Doctor.query.filter_by(user_id=current_user.id).first()
        if not doctor:
            return APIResponse.not_found(message='Doctor profile not found')
        
        # Get today's appointments that are scheduled or confirmed
        today = datetime.now().date()
        waiting_appointments = Appointment.query.filter(
            Appointment.doctor_id == doctor.id,
            db.func.date(Appointment.appointment_date) == today,
            Appointment.status.in_(['scheduled', 'confirmed'])
        ).order_by(Appointment.appointment_date).all()
        
        # Format waiting patients data
        waiting_patients = []
        for appointment in waiting_appointments:
            patient = appointment.patient
            if not patient:
                continue  # Skip appointments without patient data
            
            patient_data = {
                'id': appointment.id,
                'patient_id': patient.id,  # Patient model uses 'id', not 'patient_id'
                'full_name': patient.user.full_name if patient and patient.user and patient.user.full_name else 'Unknown Patient',
                'appointment_time': appointment.appointment_date.strftime('%H:%M'),
                'appointment_type': appointment.appointment_type,
                'status': appointment.status
            }
            waiting_patients.append(patient_data)
        
        return APIResponse.success(
            data=waiting_patients,
            message='Waiting patients retrieved successfully'
        )
        
    except Exception as e:
        import traceback
        app_logger.error(f"Error getting waiting patients: {str(e)}")
        app_logger.error(f"Traceback: {traceback.format_exc()}")
        return APIResponse.internal_error(message=f'Failed to retrieve waiting patients: {str(e)}')


@appointments_bp.route('/activity', methods=['GET'])
@api_login_required
def get_recent_activity():
    """Get recent activity for doctor dashboard"""
    try:
        # Check if the current user is a doctor
        if current_user.user_type != 'doctor':
            return APIResponse.forbidden(message='Only doctors can access activity')
        
        # Get doctor record
        doctor = Doctor.query.filter_by(user_id=current_user.id).first()
        if not doctor:
            return APIResponse.not_found(message='Doctor profile not found')
        
        # Get recent appointments (last 7 days)
        seven_days_ago = datetime.now() - timedelta(days=7)
        recent_appointments = Appointment.query.filter(
            Appointment.doctor_id == doctor.id,
            Appointment.updated_at >= seven_days_ago
        ).order_by(Appointment.updated_at.desc()).limit(10).all()
        
        # Format activity data
        activity = []
        for appointment in recent_appointments:
            patient = appointment.patient
            activity_item = {
                'id': appointment.id,
                'type': 'appointment',
                'patient_name': patient.user.full_name if patient.user else 'Unknown',
                'appointment_date': appointment.appointment_date.isoformat(),
                'status': appointment.status,
                'appointment_type': appointment.appointment_type,
                'updated_at': appointment.updated_at.isoformat()
            }
            activity.append(activity_item)
        
        return APIResponse.success(
            data=activity,
            message='Recent activity retrieved successfully'
        )
        
    except Exception as e:
        app_logger.error(f"Error getting recent activity: {str(e)}")
        return APIResponse.internal_error(message='Failed to retrieve recent activity')


# ============================================================================
# VIDEO CONSULTATION ENDPOINTS
# ============================================================================

@appointments_bp.route('/<int:appointment_id>/video/start', methods=['POST'])
@api_login_required
def start_video_session(appointment_id):
    """Start a video consultation session (doctors only)"""
    try:
        # Only doctors can start sessions
        if current_user.user_type != 'doctor':
            return APIResponse.forbidden(message='Only doctors can start video sessions')
        
        # Get appointment with eager loading
        appointment = Appointment.query.options(
            joinedload(Appointment.doctor),
            joinedload(Appointment.patient)
        ).filter_by(id=appointment_id).first()
        
        if not appointment:
            return APIResponse.not_found(message='Appointment not found')
        
        # Verify doctor owns this appointment
        if appointment.doctor.user_id != current_user.id:
            return APIResponse.forbidden(message='You are not authorized for this appointment')
        
        # Check appointment status - allow in_progress for rejoining sessions
        if appointment.status not in ['scheduled', 'confirmed', 'in_progress']:
            return APIResponse.validation_error(
                field='status',
                message=f'Cannot start video session for {appointment.status} appointment'
            )
        
        # Doctors can start sessions anytime - no timing validation needed
        from services.video_conf_service import VideoConferenceService
        
        # Generate room name if not exists
        if not appointment.session_id:
            appointment.session_id = VideoConferenceService.generate_room_name(appointment_id)
        
        # Generate JWT token for doctor (moderator)
        jwt_token = VideoConferenceService.generate_jwt_token(
            room_name=appointment.session_id,
            user_id=current_user.id,
            user_name=current_user.full_name,
            user_email=current_user.email,
            is_moderator=True,
            app_id=current_app.config.get('JITSI_APP_ID'),
            app_secret=current_app.config.get('JITSI_APP_SECRET')
        )
        
        # Get Jitsi configuration
        config = VideoConferenceService.get_jitsi_config(
            language=current_user.language_preference or 'en'
        )
        interface_config = VideoConferenceService.get_interface_config()
        
        # DEBUG: Log before updating status
        app_logger.info(f"🚀 START VIDEO - Appointment {appointment_id} BEFORE: status={appointment.status}, session_status={appointment.session_status}, session_started_at={appointment.session_started_at}")

        # Update appointment session status and start time
        old_session_status = appointment.session_status
        appointment.session_status = 'waiting'
        appointment.status = 'in_progress'
        # Always set session_started_at when doctor starts video (critical for patient UI)
        if not appointment.session_started_at or old_session_status == 'ended':
            appointment.session_started_at = datetime.utcnow()
            app_logger.info(f"🔄 START VIDEO - Updated session_started_at to {appointment.session_started_at}")
        else:
            app_logger.info(f"⚠️ START VIDEO - Keeping old session_started_at: {appointment.session_started_at}")

        db.session.commit()

        # DEBUG: Log after commit
        app_logger.info(f"✅ START VIDEO - Appointment {appointment_id} AFTER COMMIT: status={appointment.status}, session_status={appointment.session_status}, session_started_at={appointment.session_started_at}")
        
        # No caching - real-time data
        
        # Log session event
        VideoConferenceService.log_session_event(
            appointment_id=appointment_id,
            event_type='start',
            user_id=current_user.id,
            details={'room_name': appointment.session_id}
        )
        
        # Format response
        response = VideoConferenceService.format_session_response(
            room_name=appointment.session_id,
            jwt_token=jwt_token,
            jitsi_domain=current_app.config.get('JITSI_DOMAIN', 'meet.jit.si'),
            participant_role='moderator',
            config=config,
            interface_config=interface_config
        )
        
        return APIResponse.success(
            data=response,
            message='Video session started successfully'
        )
        
    except Exception as e:
        db.session.rollback()
        app_logger.error(f"Start video session error: {str(e)}")
        return APIResponse.internal_error(message='Failed to start video session')


@appointments_bp.route('/<int:appointment_id>/video/join', methods=['POST'])
@api_login_required
def join_video_session(appointment_id):
    """Join a video consultation session (patients and doctors)"""
    try:
        # Get appointment
        appointment = Appointment.query.options(
            joinedload(Appointment.doctor),
            joinedload(Appointment.patient)
        ).filter_by(id=appointment_id).first()
        
        if not appointment:
            return APIResponse.not_found(message='Appointment not found')
        
        # Verify user is participant in this appointment
        is_doctor = (current_user.user_type == 'doctor' and 
                    appointment.doctor.user_id == current_user.id)
        is_patient = (current_user.user_type == 'patient' and 
                     appointment.patient.user_id == current_user.id)
        
        if not (is_doctor or is_patient):
            return APIResponse.forbidden(message='You are not authorized for this appointment')
        
        # Check if session is active
        if not appointment.session_id:
            return APIResponse.validation_error(field='session', message='Video session has not been started yet')
        
        if appointment.session_status in ['ended', 'failed']:
            return APIResponse.validation_error(field='session_status', message='Video session has ended')
        
        # Skip timing validation - patients can join anytime the session is active
        # This allows patients to join whenever they see the "Join Consultation" button
        from services.video_conf_service import VideoConferenceService
        
        # Generate JWT token
        jwt_token = VideoConferenceService.generate_jwt_token(
            room_name=appointment.session_id,
            user_id=current_user.id,
            user_name=current_user.full_name,
            user_email=current_user.email,
            is_moderator=is_doctor,  # Doctors are moderators
            app_id=current_app.config.get('JITSI_APP_ID'),
            app_secret=current_app.config.get('JITSI_APP_SECRET')
        )
        
        # Get Jitsi configuration
        config = VideoConferenceService.get_jitsi_config(
            language=current_user.language_preference or 'en'
        )
        interface_config = VideoConferenceService.get_interface_config()
        
        # Update session status if needed
        if appointment.session_status == 'waiting':
            appointment.session_status = 'connecting'
        
        db.session.commit()
        
        # Log session event
        VideoConferenceService.log_session_event(
            appointment_id=appointment_id,
            event_type='join',
            user_id=current_user.id,
            details={'user_type': current_user.user_type}
        )
        
        # ── "Doctor joined the video call" patient notification ─────────────
        # The doctor's client (web dashboard/page) calls /video/join the moment
        # it enters the Jitsi room — this is the backend-visible join event for
        # BOTH surfaces. Idempotent: fires at most once per appointment
        # (see notify_patient_doctor_joined). Never affects the join response.
        if is_doctor and appointment.patient and appointment.patient.user:
            try:
                from services.notification_service import notify_patient_doctor_joined
                notify_patient_doctor_joined(
                    appointment=appointment,
                    doctor_user=current_user,
                    patient_user=appointment.patient.user,
                )
            except Exception as notify_error:
                app_logger.error(
                    f"Doctor-joined notification error (appointment {appointment_id}): {notify_error}"
                )
        
        # Format response
        participant_role = 'moderator' if is_doctor else 'participant'
        response = VideoConferenceService.format_session_response(
            room_name=appointment.session_id,
            jwt_token=jwt_token,
            jitsi_domain=current_app.config.get('JITSI_DOMAIN', 'meet.jit.si'),
            participant_role=participant_role,
            config=config,
            interface_config=interface_config
        )
        
        return APIResponse.success(
            data=response,
            message='Joined video session successfully'
        )
        
    except Exception as e:
        db.session.rollback()
        app_logger.error(f"Join video session error: {str(e)}")
        return APIResponse.internal_error(message='Failed to join video session')


@appointments_bp.route('/<int:appointment_id>/video/end', methods=['POST'])
@api_login_required
def end_video_session(appointment_id):
    """End a video consultation session"""
    try:
        # Get appointment
        appointment = Appointment.query.options(
            joinedload(Appointment.doctor),
            joinedload(Appointment.patient)
        ).filter_by(id=appointment_id).first()
        
        if not appointment:
            return APIResponse.not_found(message='Appointment not found')
        
        # Verify user is participant
        is_doctor = (current_user.user_type == 'doctor' and 
                    appointment.doctor.user_id == current_user.id)
        is_patient = (current_user.user_type == 'patient' and 
                     appointment.patient.user_id == current_user.id)
        
        if not (is_doctor or is_patient):
            return APIResponse.forbidden(message='You are not authorized for this appointment')
        
        # Calculate session duration if started
        session_duration = None
        if appointment.session_started_at:
            duration_delta = datetime.utcnow() - appointment.session_started_at
            session_duration = int(duration_delta.total_seconds())

        # DEBUG: Log end request
        app_logger.info(f"🛑 END VIDEO REQUEST - Appointment {appointment_id}, user_type={current_user.user_type}, session_duration={session_duration}s, current_status={appointment.session_status}")

        # Prevent premature session end (network issues, accidental page close)
        # Only mark as ended if session has been running for at least 30 seconds
        if session_duration and session_duration < 30:
            app_logger.warning(f"⛔ END VIDEO BLOCKED - Appointment {appointment_id} (only {session_duration}s, likely network issue/spurious event)")
            return APIResponse.success(
                data={'session_status': appointment.session_status, 'ignored': True},
                message='Session end ignored - too soon after start'
            )

        # Update appointment
        appointment.session_status = 'ended'
        appointment.session_ended_at = datetime.utcnow()
        appointment.session_duration = session_duration

        app_logger.info(f"✅ END VIDEO - Appointment {appointment_id} marked as ended after {session_duration}s")
        
        # When video session ends, keep status as 'in_progress'
        # The appointment stays in_progress until doctor explicitly completes from dashboard
        # This allows doctor to restart video if needed or complete consultation with notes
        if appointment.status == 'scheduled':
            # If it was scheduled and video started/ended, mark as in_progress
            appointment.status = 'in_progress'
        # If already in_progress, keep it as in_progress (don't change status)
        
        # IMPORTANT: /video/end should NOT mark appointment as completed
        # Doctor must use /complete endpoint from dashboard after adding notes
        
        db.session.commit()
        
        # Log session event
        from services.video_conf_service import VideoConferenceService
        VideoConferenceService.log_session_event(
            appointment_id=appointment_id,
            event_type='end',
            user_id=current_user.id,
            details={
                'user_type': current_user.user_type,
                'session_duration': session_duration
            }
        )
        
        return APIResponse.success(
            data={
                'session_duration': session_duration,
                'session_ended_at': appointment.session_ended_at.isoformat()
            },
            message='Video session ended successfully'
        )
        
    except Exception as e:
        db.session.rollback()
        app_logger.error(f"End video session error: {str(e)}")
        return APIResponse.internal_error(message='Failed to end video session')


@appointments_bp.route('/<int:appointment_id>/complete', methods=['POST'])
@api_login_required
def complete_appointment(appointment_id):
    """Complete appointment consultation"""
    try:
        # Get appointment
        appointment = Appointment.query.filter_by(id=appointment_id).first()
        
        if not appointment:
            return APIResponse.not_found(message='Appointment not found')
        
        # Check permissions (only doctor can complete appointment)
        # Get the doctor record for the current user
        from models import Doctor
        current_doctor = Doctor.query.filter_by(user_id=current_user.id).first() if current_user.user_type == 'doctor' else None
        
        app_logger.info(f"Complete appointment check - User type: {current_user.user_type}, User ID: {current_user.id}, Doctor ID: {current_doctor.id if current_doctor else None}, Appointment doctor ID: {appointment.doctor_id}")
        
        if current_user.user_type != 'doctor' or not current_doctor or appointment.doctor_id != current_doctor.id:
            app_logger.warning(f"Authorization failed - User {current_user.id} ({current_user.user_type}) with doctor ID {current_doctor.id if current_doctor else 'None'} trying to complete appointment for doctor {appointment.doctor_id}")
            return APIResponse.forbidden(message='Only the assigned doctor can complete this appointment')
        
        # Check if appointment can be completed
        if appointment.status == 'completed':
            return APIResponse.conflict(message='Appointment already completed')
        
        if appointment.status not in ['scheduled', 'in_progress']:
            return APIResponse.error(message='Appointment cannot be completed in its current state', status_code=400)
        
        # Complete the appointment
        appointment.status = 'completed'
        appointment.completed_at = datetime.utcnow()
        appointment.completion_method = 'manual'  # Mark as manually completed
        
        # Add debug logging
        app_logger.info(f"Appointment {appointment_id} marked as completed by doctor {current_user.id}")
        
        db.session.commit()
        
        # No caching - real-time data
        
        # Log completion activity
        from services.video_conf_service import VideoConferenceService
        VideoConferenceService.log_session_event(
            appointment_id=appointment_id,
            event_type='complete',
            user_id=current_user.id,
            details={
                'user_type': current_user.user_type,
                'completed_at': appointment.completed_at.isoformat()
            }
        )
        
        return APIResponse.success(
            data={
                'status': appointment.status,
                'completed_at': appointment.completed_at.isoformat()
            },
            message='Appointment completed successfully'
        )
        
    except Exception as e:
        db.session.rollback()
        app_logger.error(f"Complete appointment error: {str(e)}")
        return APIResponse.internal_error(message='Failed to complete appointment')


@appointments_bp.route('/<int:appointment_id>/video/status', methods=['GET'])
@api_login_required
def get_video_session_status(appointment_id):
    """Get current video session status"""
    try:
        # Get appointment
        appointment = Appointment.query.filter_by(id=appointment_id).first()
        
        if not appointment:
            return APIResponse.not_found(message='Appointment not found')
        
        # Verify user is participant
        is_authorized = False
        if current_user.user_type == 'doctor':
            doctor = Doctor.query.filter_by(user_id=current_user.id).first()
            is_authorized = doctor and appointment.doctor_id == doctor.id
        elif current_user.user_type == 'patient':
            patient = Patient.query.filter_by(user_id=current_user.id).first()
            is_authorized = patient and appointment.patient_id == patient.id
        
        if not is_authorized:
            return APIResponse.forbidden(message='You are not authorized for this appointment')
        
        # Check if session can be started
        from services.video_conf_service import VideoConferenceService
        
        # Doctors can always rejoin in_progress sessions
        if current_user.user_type == 'doctor' and appointment.status == 'in_progress':
            can_start = True
            timing_message = "Doctor can rejoin in-progress session"
        else:
            # Apply timing validation for other cases
            can_start, timing_message = VideoConferenceService.validate_session_timing(
                appointment.appointment_date,
                current_app.config.get('JITSI_SESSION_BUFFER_MINUTES', 15)
            )
        
        return APIResponse.success(
            data={
                'session_id': appointment.session_id,
                'session_status': appointment.session_status,
                'appointment_status': appointment.status,
                'can_start': can_start,
                'timing_message': timing_message,
                'session_started_at': appointment.session_started_at.isoformat() if appointment.session_started_at else None,
                'session_duration': appointment.session_duration
            },
            message='Session status retrieved successfully'
        )
        
    except BrokenPipeError:
        # Client disconnected before response was sent - common with polling
        app_logger.debug(f"Client disconnected during video status check for appointment {appointment_id}")
        return None  # Silent fail for broken pipe
    except IOError as e:
        if 'write error' in str(e).lower() or 'broken pipe' in str(e).lower():
            # SIGPIPE or similar write error - client disconnected
            app_logger.debug(f"Client disconnected during video status check for appointment {appointment_id}")
            return None  # Silent fail
        app_logger.error(f"IO error in get video session status: {str(e)}")
        return APIResponse.internal_error(message='Failed to get session status')
    except Exception as e:
        app_logger.error(f"Get video session status error: {str(e)}")
        return APIResponse.internal_error(message='Failed to get session status')


@appointments_bp.route('/<int:appointment_id>/video/heartbeat', methods=['POST'])
@api_login_required
def video_session_heartbeat(appointment_id):
    """Keep video session alive with heartbeat"""
    try:
        # Get appointment
        appointment = Appointment.query.options(
            joinedload(Appointment.doctor),
            joinedload(Appointment.patient)
        ).filter_by(id=appointment_id).first()
        
        if not appointment:
            return APIResponse.not_found(message='Appointment not found')
        
        # Verify user is participant
        is_doctor = (current_user.user_type == 'doctor' and 
                    appointment.doctor.user_id == current_user.id)
        is_patient = (current_user.user_type == 'patient' and 
                     appointment.patient.user_id == current_user.id)
        
        if not (is_doctor or is_patient):
            return APIResponse.forbidden(message='You are not authorized for this appointment')
        
        # Check if session is still active
        if appointment.session_status in ['ended', 'failed']:
            return APIResponse.validation_error(
                field='session_status',
                message='Video session has ended'
            )
        
        # Update session status if connecting
        if appointment.session_status == 'connecting':
            appointment.session_status = 'connected'
        
        db.session.commit()
        
        return APIResponse.success(
            data={
                'session_status': appointment.session_status,
                'active': appointment.session_status not in ['ended', 'failed', 'timeout'],
                'heartbeat_updated': True
            },
            message='Heartbeat received'
        )
        
    except Exception as e:
        app_logger.error(f"Video heartbeat error: {str(e)}")
        return APIResponse.internal_error(message='Heartbeat failed')


@appointments_bp.route('/<int:appointment_id>/video/analytics', methods=['POST'])
@api_login_required
def video_analytics_event(appointment_id):
    """Log video session analytics event"""
    try:
        # Get appointment
        appointment = Appointment.query.filter_by(id=appointment_id).first()
        
        if not appointment:
            return APIResponse.not_found(message='Appointment not found')
        
        # Verify user is participant
        is_doctor = (current_user.user_type == 'doctor' and 
                    appointment.doctor and appointment.doctor.user_id == current_user.id)
        is_patient = (current_user.user_type == 'patient' and 
                     appointment.patient and appointment.patient.user_id == current_user.id)
        
        if not (is_doctor or is_patient):
            return APIResponse.forbidden(message='You are not authorized for this appointment')
        
        # Get event data from request
        data = request.get_json() or {}
        
        # Log the analytics event
        app_logger.info(
            f"Video Analytics Event - Appointment: {appointment_id}, "
            f"User: {current_user.id} ({current_user.user_type}), "
            f"Event: {data.get('type', 'unknown')}, "
            f"Data: {data.get('data', {})}"
        )
        
        return APIResponse.success(
            data={'logged': True},
            message='Analytics event logged'
        )
        
    except Exception as e:
        app_logger.error(f"Video analytics error: {str(e)}")
        return APIResponse.internal_error(message='Failed to log analytics event')


@appointments_bp.route('/<int:appointment_id>/video/analytics/summary', methods=['POST'])
@api_login_required
def video_analytics_summary(appointment_id):
    """Log video session analytics summary"""
    try:
        # Get appointment
        appointment = Appointment.query.filter_by(id=appointment_id).first()
        
        if not appointment:
            return APIResponse.not_found(message='Appointment not found')
        
        # Verify user is participant
        is_doctor = (current_user.user_type == 'doctor' and 
                    appointment.doctor and appointment.doctor.user_id == current_user.id)
        is_patient = (current_user.user_type == 'patient' and 
                     appointment.patient and appointment.patient.user_id == current_user.id)
        
        if not (is_doctor or is_patient):
            return APIResponse.forbidden(message='You are not authorized for this appointment')
        
        # Get summary data from request
        data = request.get_json() or {}
        session_summary = data.get('session_summary', {})
        user_type = data.get('user_type', current_user.user_type)
        
        # Log comprehensive session summary
        app_logger.info(
            f"Video Session Summary - Appointment: {appointment_id}, "
            f"User: {current_user.id} ({user_type}), "
            f"Duration: {session_summary.get('duration', 0)}ms, "
            f"Events: {len(session_summary.get('connectionEvents', []))}, "
            f"Quality Samples: {len(session_summary.get('qualityMetrics', []))}"
        )
        
        return APIResponse.success(
            data={'logged': True},
            message='Analytics summary logged'
        )
        
    except Exception as e:
        app_logger.error(f"Video analytics summary error: {str(e)}")
        return APIResponse.internal_error(message='Failed to log analytics summary')


@appointments_bp.route('/<int:appointment_id>/video/disconnect', methods=['POST'])
@api_login_required
def handle_video_disconnect(appointment_id):
    """Handle unexpected video session disconnect (browser close, network issue, etc.)"""
    try:
        # Get appointment
        appointment = Appointment.query.filter_by(id=appointment_id).first()
        
        if not appointment:
            return APIResponse.not_found(message='Appointment not found')
        
        # Verify user is participant
        is_doctor = (current_user.user_type == 'doctor' and 
                    appointment.doctor and 
                    appointment.doctor.user_id == current_user.id)
        is_patient = (current_user.user_type == 'patient' and 
                     appointment.patient and 
                     appointment.patient.user_id == current_user.id)
        
        if not (is_doctor or is_patient):
            return APIResponse.forbidden(message='You are not authorized for this appointment')
        
        # If doctor disconnects unexpectedly, keep appointment in_progress for immediate completion access
        # But clear session details so doctor can restart video or complete consultation
        if is_doctor and appointment.status == 'in_progress':
            # Only mark as ended if session actually started (not just a connection timeout)
            # Check if session has been running for at least 30 seconds to avoid premature "ended" status
            session_duration = 0
            if appointment.session_started_at:
                session_duration = (datetime.utcnow() - appointment.session_started_at).total_seconds()

            if session_duration > 30:
                # Real disconnect after session was active
                appointment.session_status = 'ended'
                appointment.session_ended_at = datetime.utcnow()
                appointment.session_id = None  # Clear session ID to generate new one if restarting
                app_logger.info(f"Doctor disconnected from appointment {appointment_id} after {session_duration}s, session ended")
            else:
                # Premature disconnect (network issue, page didn't load) - keep session as 'waiting'
                # This allows patient to still see "Join" button
                app_logger.info(f"Doctor had connection issue for appointment {appointment_id} (only {session_duration}s), keeping session active")
        
        # If patient disconnects, just update session status but keep appointment in progress
        elif is_patient and appointment.status == 'in_progress':
            appointment.session_status = 'patient_disconnected'
            app_logger.info(f"Patient disconnected from appointment {appointment_id}")
        
        db.session.commit()
        
        # Log disconnect event
        from services.video_conf_service import VideoConferenceService
        VideoConferenceService.log_session_event(
            appointment_id=appointment_id,
            event_type='disconnect',
            user_id=current_user.id,
            details={
                'user_type': current_user.user_type,
                'reason': 'unexpected_disconnect'
            }
        )
        
        return APIResponse.success(
            data={
                'appointment_status': appointment.status,
                'session_status': appointment.session_status
            },
            message='Disconnect handled successfully'
        )
        
    except Exception as e:
        db.session.rollback()
        app_logger.error(f"Handle video disconnect error: {str(e)}")
        return APIResponse.internal_error(message='Failed to handle disconnect')


@appointments_bp.route('/<int:appointment_id>/video/config', methods=['GET'])
def get_video_config(appointment_id):
    """
    Get Jitsi configuration for video consultation (public endpoint)
    
    This endpoint loads all Jitsi configuration from environment variables
    to ensure consistent settings between backend and frontend.
    No authentication required for public video consultation access.
    """
    try:
        # Get appointment to verify it exists
        appointment = Appointment.query.filter_by(id=appointment_id).first()
        
        if not appointment:
            return APIResponse.not_found(message='Appointment not found')
        
        from services.video_conf_service import VideoConferenceService
        import os
        
        # Get language from query parameter or default to 'en'
        language = request.args.get('lang', 'en')
        
        # Get Jitsi configuration from environment
        config = VideoConferenceService.get_jitsi_config(language)
        interface_config = VideoConferenceService.get_interface_config()
        
        # Get domain and other settings from environment
        jitsi_domain = os.getenv('JITSI_DOMAIN', 'meet.jit.si')
        app_id = os.getenv('JITSI_APP_ID', '')
        
        response_data = {
            'jitsi_domain': jitsi_domain,
            'app_id': app_id,
            'config': config,
            'interface_config': interface_config,
            'room_prefix': os.getenv('JITSI_ROOM_PREFIX', 'sahatak_consultation_'),
            'max_duration_minutes': int(os.getenv('VIDEO_CALL_MAX_DURATION_MINUTES', '60')),
            'features': {
                'recording_enabled': os.getenv('VIDEO_CALL_RECORDING_ENABLED', 'false').lower() == 'true',
                'lobby_enabled': os.getenv('VIDEO_CALL_LOBBY_ENABLED', 'false').lower() == 'true',
                'password_protection': os.getenv('VIDEO_CALL_PASSWORD_PROTECTED', 'false').lower() == 'true',
                'guest_access': os.getenv('JITSI_GUEST_ACCESS_ENABLED', 'true').lower() == 'true',
                'moderator_rights_required': os.getenv('JITSI_MODERATOR_RIGHTS_REQUIRED', 'false').lower() == 'true',
                'e2ee_enabled': os.getenv('JITSI_ENABLE_E2EE', 'true').lower() == 'true',
                'chat_enabled': os.getenv('JITSI_ENABLE_CHAT', 'true').lower() == 'true',
                'screen_sharing_enabled': os.getenv('JITSI_ENABLE_SCREEN_SHARING', 'true').lower() == 'true',
                'audio_only_mode': os.getenv('JITSI_ENABLE_AUDIO_ONLY_MODE', 'true').lower() == 'true'
            }
        }
        
        return APIResponse.success(
            data=response_data,
            message='Video configuration retrieved successfully'
        )
        
    except Exception as e:
        app_logger.error(f"Get video config error: {str(e)}")
        return APIResponse.internal_error(message='Failed to get video configuration')