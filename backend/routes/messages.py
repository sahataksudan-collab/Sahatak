from flask import Blueprint, request, current_app, jsonify
from flask_login import current_user
from sqlalchemy import or_, and_, desc, text
from datetime import datetime, timedelta
from models import db, Conversation, Message, MessageAttachment, User, Patient, Doctor
from utils.responses import APIResponse, ErrorCodes
from utils.validators import validate_text_field_length
from utils.logging_config import app_logger, log_user_action
from utils.db_optimize import cached_query, invalidate_user_cache
from services.websocket_service import emit_new_message, emit_message_status_update, emit_notification
from routes.notifications import queue_notification
from routes.auth import api_login_required

messages_bp = Blueprint('messages', __name__)


@messages_bp.route('/conversations', methods=['GET'])
@api_login_required
def get_conversations():
    """Get user's conversations"""
    try:
        page = int(request.args.get('page', 1))
        per_page = min(int(request.args.get('per_page', 20)), 50)  # Max 50 per page
        
        
        # Get conversations based on user type
        if current_user.user_type == 'patient':
            if not current_user.patient_profile:
                return APIResponse.validation_error(
                    field='user_profile',
                    message='Patient profile not found. Please contact support.'
                )
            conversations = Conversation.query.filter_by(
                patient_id=current_user.patient_profile.id,
                status='active'
            ).order_by(desc(Conversation.last_message_at)).paginate(
                page=page, per_page=per_page, error_out=False
            )
        elif current_user.user_type == 'doctor':
            if not current_user.doctor_profile:
                return APIResponse.validation_error(
                    field='user_profile',
                    message='Doctor profile not found. Please complete your doctor registration.'
                )
            conversations = Conversation.query.filter_by(
                doctor_id=current_user.doctor_profile.id,
                status='active'
            ).order_by(desc(Conversation.last_message_at)).paginate(
                page=page, per_page=per_page, error_out=False
            )
        else:
            return APIResponse.forbidden(message='Invalid user type for messaging')
        
        conversations_data = []
        for conv in conversations.items:
            conv_dict = conv.to_dict(include_messages=False)
            # Add unread count specific to current user
            conv_dict['unread_count'] = conv.get_unread_count(current_user.id)
            conversations_data.append(conv_dict)
        
        return APIResponse.success(
            data={
                'conversations': conversations_data,
                'pagination': {
                    'page': conversations.page,
                    'per_page': conversations.per_page,
                    'total': conversations.total,
                    'pages': conversations.pages,
                    'has_next': conversations.has_next,
                    'has_prev': conversations.has_prev
                }
            },
            message='Conversations retrieved successfully'
        )
        
    except Exception as e:
        app_logger.error(f"Get conversations error: {str(e)}")
        return APIResponse.internal_error(message='Failed to get conversations')


@messages_bp.route('/conversations/<int:conversation_id>', methods=['GET'])
@api_login_required
def get_conversation_details(conversation_id):
    """Get conversation details with messages"""
    try:
            
        page = int(request.args.get('page', 1))
        per_page = min(int(request.args.get('per_page', 50)), 100)  # Max 100 messages per page
        
        # Get conversation and verify user access
        conversation = Conversation.query.get(conversation_id)
        if not conversation:
            return APIResponse.not_found(message='Conversation not found')
        
        # Check if user has access to this conversation
        if current_user.user_type == 'patient':
            if conversation.patient_id != current_user.patient_profile.id:
                return APIResponse.forbidden(message='Access denied to this conversation')
        elif current_user.user_type == 'doctor':
            if conversation.doctor_id != current_user.doctor_profile.id:
                return APIResponse.forbidden(message='Access denied to this conversation')
        else:
            return APIResponse.forbidden(message='Invalid user type for messaging')
        
        # Get messages with pagination
        messages = conversation.messages.paginate(
            page=page, per_page=per_page, error_out=False
        )
        
        # Mark messages as read for current user
        unread_count = conversation.mark_messages_read(current_user.id)
        
        conversation_data = conversation.to_dict(include_messages=False)
        conversation_data['messages'] = [msg.to_dict() for msg in messages.items]
        conversation_data['pagination'] = {
            'page': messages.page,
            'per_page': messages.per_page,
            'total': messages.total,
            'pages': messages.pages,
            'has_next': messages.has_next,
            'has_prev': messages.has_prev
        }
        
        # Log action if messages were marked as read
        if unread_count > 0:
            log_user_action(
                current_user.id,
                'messages_read',
                {'conversation_id': conversation_id, 'messages_read': unread_count},
                request
            )
        
        return APIResponse.success(
            data=conversation_data,
            message='Conversation details retrieved successfully'
        )
        
    except Exception as e:
        app_logger.error(f"Get conversation details error: {str(e)}")
        return APIResponse.internal_error(message='Failed to get conversation details')


@messages_bp.route('/conversations', methods=['POST'])
@api_login_required
def start_conversation():
    """Start a new conversation"""
    try:
        data = request.get_json()
        app_logger.info(f"Start conversation request data: {data}")
        app_logger.info(f"Current user: {current_user.user_type} (ID: {current_user.id})")
        
        # Validate required fields
        if not data.get('recipient_id'):
            return APIResponse.validation_error(
                field='recipient_id',
                message='Recipient ID is required'
            )
        
        recipient_id = data['recipient_id']
        recipient_type = data.get('recipient_type', 'user')  # Can be 'user' or 'patient'
        subject = data.get('subject', 'Medical Consultation')
        appointment_id = data.get('appointment_id')
        
        # Handle different recipient ID types
        if current_user.user_type == 'doctor' and recipient_type == 'patient':
            # Doctor starting conversation with patient - recipient_id is patient profile ID
            app_logger.info(f"Doctor initiating conversation with patient profile ID: {recipient_id}")
            from models import Patient
            patient = Patient.query.get(recipient_id)
            app_logger.info(f"Patient query result: {patient}")
            if not patient:
                app_logger.error(f"Patient not found with profile ID: {recipient_id}")
                # Cheap diagnostic instead of loading the entire patients table
                app_logger.info(f"Total patients in DB: {Patient.query.count()}")
                return APIResponse.not_found(message='Patient not found')
            recipient = patient.user
            app_logger.info(f"Patient's user: {recipient}")
            if not recipient:
                app_logger.error(f"Patient user not found for patient profile ID: {recipient_id}")
                return APIResponse.not_found(message='Patient user not found')
            app_logger.info(f"Found patient user: {recipient.email} (ID: {recipient.id})")
        else:
            # Standard case - recipient_id is user ID
            recipient = User.query.get(recipient_id)
            if not recipient:
                app_logger.error(f"Recipient not found with user ID: {recipient_id}")
                return APIResponse.not_found(message='Recipient not found')
        
        # Determine patient and doctor IDs
        if current_user.user_type == 'patient':
            if recipient.user_type != 'doctor':
                return APIResponse.validation_error(
                    field='recipient_id',
                    message='Patients can only message doctors'
                )
            patient_id = current_user.patient_profile.id
            doctor_id = recipient.doctor_profile.id
        elif current_user.user_type == 'doctor':
            if recipient.user_type != 'patient':
                return APIResponse.validation_error(
                    field='recipient_id',
                    message='Doctors can only message patients'
                )
            patient_id = recipient.patient_profile.id
            doctor_id = current_user.doctor_profile.id
        else:
            return APIResponse.forbidden(message='Invalid user type for messaging')
        
        # Check if conversation already exists
        conversation = Conversation.get_or_create_conversation(
            patient_id=patient_id,
            doctor_id=doctor_id,
            appointment_id=appointment_id,
            subject=subject
        )
        
        # Log action
        log_user_action(
            current_user.id,
            'conversation_started',
            {'conversation_id': conversation.id, 'recipient_id': recipient_id},
            request
        )
        
        conversation_data = conversation.to_dict(include_messages=False)
        app_logger.info(f"Conversation created successfully: {conversation_data}")
        
        return APIResponse.success(
            data={'conversation': conversation_data},
            message='Conversation started successfully'
        )
        
    except Exception as e:
        import traceback
        app_logger.error(f"Start conversation error: {str(e)}")
        app_logger.error(f"Traceback: {traceback.format_exc()}")
        return APIResponse.internal_error(message='Failed to start conversation')


@messages_bp.route('/conversations/<int:conversation_id>/messages', methods=['POST'])
@api_login_required
def send_message(conversation_id):
    """Send a message in a conversation"""
    try:
        data = request.get_json()
        
        # Validate required fields
        if not data.get('content'):
            return APIResponse.validation_error(
                field='content',
                message='Message content is required'
            )
        
        content = data['content'].strip()
        message_type = data.get('message_type', 'text')
        is_urgent = data.get('is_urgent', False)
        appointment_id = data.get('appointment_id')
        
        # Validate message content length
        validation = validate_text_field_length(content, 'content', 5000, 1)
        if not validation['valid']:
            return APIResponse.validation_error(
                field='content',
                message=validation['message']
            )
        
        # Get conversation and verify access
        conversation = Conversation.query.get(conversation_id)
        if not conversation:
            return APIResponse.not_found(message='Conversation not found')
        
        # Determine recipient
        if current_user.user_type == 'patient':
            if conversation.patient_id != current_user.patient_profile.id:
                return APIResponse.forbidden(message='Access denied to this conversation')
            recipient_id = conversation.doctor.user_id
        elif current_user.user_type == 'doctor':
            if conversation.doctor_id != current_user.doctor_profile.id:
                return APIResponse.forbidden(message='Access denied to this conversation')
            recipient_id = conversation.patient.user_id
        else:
            return APIResponse.forbidden(message='Invalid user type for messaging')
        
        # Create message
        message = Message.create_message(
            conversation_id=conversation_id,
            sender_id=current_user.id,
            recipient_id=recipient_id,
            content=content,
            message_type=message_type,
            is_urgent=is_urgent,
            message_metadata=data.get('metadata'),
            appointment_id=appointment_id
        )
        
        # Log action
        log_user_action(
            current_user.id,
            'message_sent',
            {
                'conversation_id': conversation_id,
                'message_id': message.id,
                'is_urgent': is_urgent
            },
            request
        )
        
        # Emit real-time message via WebSocket
        message_data = message.to_dict()
        emit_new_message(conversation_id, message_data, current_user.id)
        
        # Emit real-time notification to recipient
        notification_data = {
            'type': 'new_message',
            'title': f'New message from {current_user.full_name}',
            'message': content[:100] + ('...' if len(content) > 100 else ''),
            'conversation_id': conversation_id,
            'sender_id': current_user.id,
            'sender_name': current_user.full_name,
            'is_urgent': is_urgent,
            'timestamp': datetime.utcnow().isoformat()
        }
        emit_notification(recipient_id, notification_data)
        
        # Queue in-app notification
        queue_notification(
            user_id=recipient_id,
            title=f'New message from {current_user.full_name}',
            message=content[:200] + ('...' if len(content) > 200 else ''),
            notification_type='message',
            send_email=False  # Don't send email for regular messages
        )
        
        return APIResponse.success(
            data=message_data,
            message='Message sent successfully'
        )
        
    except Exception as e:
        app_logger.error(f"Send message error: {str(e)}")
        return APIResponse.internal_error(message='Failed to send message')


@messages_bp.route('/messages/<int:message_id>/read', methods=['PUT'])
@api_login_required
def mark_message_read(message_id):
    """Mark a specific message as read"""
    try:
        message = Message.query.get(message_id)
        if not message:
            return APIResponse.not_found(message='Message not found')
        
        # Verify user can mark this message as read (must be recipient)
        if message.recipient_id != current_user.id:
            return APIResponse.forbidden(message='Cannot mark message as read')
        
        message.mark_as_read()
        
        # Emit message status update via WebSocket
        emit_message_status_update(
            message.conversation_id,
            message_id,
            'read',
            current_user.id
        )
        
        return APIResponse.success(
            data={'message_id': message_id, 'read_at': message.read_at.isoformat()},
            message='Message marked as read'
        )
        
    except Exception as e:
        app_logger.error(f"Mark message read error: {str(e)}")
        return APIResponse.internal_error(message='Failed to mark message as read')


@messages_bp.route('/messages/search', methods=['GET'])
@api_login_required
def search_messages():
    """Search messages"""
    try:
        query = request.args.get('q', '').strip()
        if not query or len(query) < 2:
            return APIResponse.validation_error(
                field='q',
                message='Search query must be at least 2 characters'
            )
        
        conversation_id = request.args.get('conversation_id')
        page = int(request.args.get('page', 1))
        per_page = min(int(request.args.get('per_page', 20)), 50)
        
        # Build search query
        search_filter = Message.content.contains(query)
        
        # Filter by user's accessible conversations
        if current_user.user_type == 'patient':
            conversation_filter = Conversation.patient_id == current_user.patient_profile.id
        elif current_user.user_type == 'doctor':
            conversation_filter = Conversation.doctor_id == current_user.doctor_profile.id
        else:
            return APIResponse.forbidden(message='Invalid user type for messaging')
        
        # Build query
        messages_query = Message.query.join(Conversation).filter(
            and_(search_filter, conversation_filter)
        )
        
        # Filter by specific conversation if provided
        if conversation_id:
            messages_query = messages_query.filter(Message.conversation_id == conversation_id)
        
        # Execute search with pagination
        messages = messages_query.order_by(desc(Message.created_at)).paginate(
            page=page, per_page=per_page, error_out=False
        )
        
        messages_data = [msg.to_dict() for msg in messages.items]
        
        return APIResponse.success(
            data={
                'messages': messages_data,
                'search_query': query,
                'pagination': {
                    'page': messages.page,
                    'per_page': messages.per_page,
                    'total': messages.total,
                    'pages': messages.pages,
                    'has_next': messages.has_next,
                    'has_prev': messages.has_prev
                }
            },
            message=f'Found {messages.total} messages'
        )
        
    except Exception as e:
        app_logger.error(f"Search messages error: {str(e)}")
        return APIResponse.internal_error(message='Failed to search messages')


@messages_bp.route('/messages/unread-count', methods=['GET'])
@api_login_required
def get_unread_count():
    """Get unread message count for current user"""
    try:
        # Get conversations for current user
        if current_user.user_type == 'patient':
            conversations = Conversation.query.filter_by(
                patient_id=current_user.patient_profile.id,
                status='active'
            ).all()
        elif current_user.user_type == 'doctor':
            conversations = Conversation.query.filter_by(
                doctor_id=current_user.doctor_profile.id,
                status='active'
            ).all()
        else:
            return APIResponse.forbidden(message='Invalid user type for messaging')
        
        total_unread = 0
        conversations_with_unread = []
        
        for conv in conversations:
            unread_count = conv.get_unread_count(current_user.id)
            total_unread += unread_count
            
            if unread_count > 0:
                conversations_with_unread.append({
                    'conversation_id': conv.id,
                    'unread_count': unread_count,
                    'last_message_at': conv.last_message_at.isoformat() if conv.last_message_at else None
                })
        
        return APIResponse.success(
            data={
                'total_unread': total_unread,
                'conversations_with_unread': conversations_with_unread
            },
            message='Unread count retrieved successfully'
        )
        
    except Exception as e:
        app_logger.error(f"Get unread count error: {str(e)}")
        return APIResponse.internal_error(message='Failed to get unread count')


@messages_bp.route('/conversations/<int:conversation_id>/archive', methods=['PUT'])
@api_login_required
def archive_conversation(conversation_id):
    """Archive a conversation"""
    try:
        conversation = Conversation.query.get(conversation_id)
        if not conversation:
            return APIResponse.not_found(message='Conversation not found')
        
        # Verify user has access to this conversation
        if current_user.user_type == 'patient':
            if conversation.patient_id != current_user.patient_profile.id:
                return APIResponse.forbidden(message='Access denied to this conversation')
        elif current_user.user_type == 'doctor':
            if conversation.doctor_id != current_user.doctor_profile.id:
                return APIResponse.forbidden(message='Access denied to this conversation')
        else:
            return APIResponse.forbidden(message='Invalid user type for messaging')
        
        conversation.status = 'archived'
        conversation.updated_at = datetime.utcnow()
        db.session.commit()
        
        # Log action
        log_user_action(
            current_user.id,
            'conversation_archived',
            {'conversation_id': conversation_id},
            request
        )
        
        return APIResponse.success(
            data={'conversation_id': conversation_id, 'status': 'archived'},
            message='Conversation archived successfully'
        )
        
    except Exception as e:
        app_logger.error(f"Archive conversation error: {str(e)}")
        return APIResponse.internal_error(message='Failed to archive conversation')


@messages_bp.route('/quick-templates', methods=['GET'])
@api_login_required
def get_quick_templates():
    """Get quick message templates based on user type"""
    try:
        if current_user.user_type == 'patient':
            templates = [
                {
                    'id': 'appointment_request',
                    'title': 'Request Appointment',
                    'content': 'Hello Doctor, I would like to schedule an appointment. When would be a good time?',
                    'category': 'appointment'
                },
                {
                    'id': 'prescription_refill',
                    'title': 'Prescription Refill',
                    'content': 'Hello Doctor, I need a refill for my current prescription. Could you please help?',
                    'category': 'prescription'
                },
                {
                    'id': 'symptoms_update',
                    'title': 'Symptoms Update',
                    'content': 'Hello Doctor, I wanted to update you on my symptoms: ',
                    'category': 'medical'
                },
                {
                    'id': 'urgent_concern',
                    'title': 'Urgent Concern',
                    'content': 'Hello Doctor, I have an urgent medical concern and need your advice.',
                    'category': 'urgent'
                }
            ]
        elif current_user.user_type == 'doctor':
            templates = [
                {
                    'id': 'appointment_followup',
                    'title': 'Appointment Follow-up',
                    'content': 'Hello, I hope you are feeling better after our consultation. Please let me know if you have any questions.',
                    'category': 'followup'
                },
                {
                    'id': 'test_results',
                    'title': 'Test Results',
                    'content': 'Hello, your test results are ready. I will review them with you during our next appointment.',
                    'category': 'medical'
                },
                {
                    'id': 'medication_reminder',
                    'title': 'Medication Reminder',
                    'content': 'Hello, this is a reminder to take your prescribed medication as directed.',
                    'category': 'prescription'
                },
                {
                    'id': 'general_checkup',
                    'title': 'General Check-up',
                    'content': 'Hello, how are you feeling today? Please let me know if you have any concerns.',
                    'category': 'general'
                }
            ]
        else:
            return APIResponse.forbidden(message='Invalid user type for messaging')
        
        return APIResponse.success(
            data={'templates': templates},
            message='Quick templates retrieved successfully'
        )
        
    except Exception as e:
        app_logger.error(f"Get quick templates error: {str(e)}")
        return APIResponse.internal_error(message='Failed to get quick templates')


@messages_bp.route('/conversations/appointment/<int:appointment_id>', methods=['POST'])
@api_login_required
def create_appointment_conversation(appointment_id):
    """Create or get conversation for a specific appointment"""
    try:
        # Import here to avoid circular imports
        from models import Appointment
        
        # Get the appointment
        appointment = Appointment.query.get(appointment_id)
        if not appointment:
            return APIResponse.not_found(message='Appointment not found')
        
        # Verify user has access to this appointment
        if current_user.user_type == 'patient':
            if appointment.patient_id != current_user.patient_profile.id:
                return APIResponse.forbidden(message='Access denied to this appointment')
        elif current_user.user_type == 'doctor':
            if appointment.doctor_id != current_user.doctor_profile.id:
                return APIResponse.forbidden(message='Access denied to this appointment')
        else:
            return APIResponse.forbidden(message='Invalid user type for messaging')
        
        # Check if conversation already exists for this appointment
        conversation = Conversation.query.filter_by(
            patient_id=appointment.patient_id,
            doctor_id=appointment.doctor_id,
            appointment_id=appointment_id,
            status='active'
        ).first()
        
        if not conversation:
            # Create new conversation linked to appointment
            conversation = Conversation.get_or_create_conversation(
                patient_id=appointment.patient_id,
                doctor_id=appointment.doctor_id,
                appointment_id=appointment_id,
                subject=f"Appointment Discussion - {appointment.appointment_date.strftime('%B %d, %Y')}"
            )
            
            # Create initial system message
            initial_message = f"Conversation started for appointment on {appointment.appointment_date.strftime('%B %d, %Y at %I:%M %p')}"
            if appointment.reason_for_visit:
                initial_message += f"\nReason: {appointment.reason_for_visit}"
            
            Message.create_message(
                conversation_id=conversation.id,
                sender_id=current_user.id,
                recipient_id=appointment.doctor.user_id if current_user.user_type == 'patient' else appointment.patient.user_id,
                content=initial_message,
                message_type='text',
                is_system_message=True,
                appointment_id=appointment_id
            )
        
        # Log action
        log_user_action(
            current_user.id,
            'appointment_conversation_created',
            {'conversation_id': conversation.id, 'appointment_id': appointment_id},
            request
        )
        
        return APIResponse.success(
            data={
                'conversation': conversation.to_dict(include_messages=True),
                'appointment': appointment.to_dict()
            },
            message='Appointment conversation created successfully'
        )
        
    except Exception as e:
        app_logger.error(f"Create appointment conversation error: {str(e)}")
        return APIResponse.internal_error(message='Failed to create appointment conversation')