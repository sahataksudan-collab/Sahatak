"""Regression test: "Doctor joined the video call" notification (email + in-app).
Run from backend/:  python tests/test_doctor_joined_notification.py

Covers:
  1. Doctor joining (POST /api/appointments/<id>/video/join) fires exactly ONE
     in-app NotificationQueue row + exactly ONE email attempt.
  2. A second join signal for the same appointment does NOT re-fire (idempotency).
  3. A patient join does NOT fire the notification.
  4. GET /api/notifications returns the mobile-contract bare array with the
     right item shape (type 'appointment', read flag, actionScreen).
  5. PUT /notifications/<id>/read marks it read (pending -> sent).
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ['DATABASE_URL'] = 'sqlite:///doctor_joined_test.db'
os.environ['FLASK_ENV'] = 'development'

_TEST_DB = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        'instance', 'doctor_joined_test.db')
if os.path.exists(_TEST_DB):
    os.remove(_TEST_DB)

from datetime import datetime, timedelta
from app import app
from models import db, User, Patient, Doctor, Appointment, NotificationQueue

with app.app_context():
    db.create_all()

    if not User.query.filter_by(email='doc@test.local').first():
        doc_user = User(email='doc@test.local', full_name='Dr. Test Doctor', user_type='doctor',
                        is_active=True, is_verified=True, language_preference='ar')
        doc_user.set_password('TestPass123!')
        pat_user = User(email='pat@test.local', full_name='Test Patient', user_type='patient',
                        is_active=True, is_verified=True, language_preference='ar')
        pat_user.set_password('TestPass123!')
        db.session.add_all([doc_user, pat_user])
        db.session.commit()

        doctor = Doctor(user_id=doc_user.id, phone='+249900000001', license_number='LIC-TEST-1',
                        specialty='Cardiology', years_of_experience=5, participation_type='volunteer',
                        rating=0.0, total_reviews=0, is_verified=True, verification_status='approved')
        patient = Patient(user_id=pat_user.id, phone='+249900000002', age=30, gender='male')
        db.session.add_all([doctor, patient])
        db.session.commit()

        appt = Appointment(patient_id=patient.id, doctor_id=doctor.id,
                           appointment_date=datetime.utcnow() + timedelta(hours=1),
                           appointment_type='video', status='scheduled')
        db.session.add(appt)
        db.session.commit()

        TEST = {'appt_id': appt.id, 'doc_id': doc_user.id, 'pat_id': pat_user.id}

# Stub the SMTP send so tests never touch the network; count invocations.
email_calls = []
from services.email_service import email_service as _email_singleton
def _fake_send(recipient_email, appointment_data, language='ar'):
    email_calls.append({'to': recipient_email, 'lang': language,
                        'join_url': appointment_data.get('join_url')})
    return True
_email_singleton.send_doctor_joined_video = _fake_send

client = app.test_client()

# Login as the DOCTOR
r = client.post('/api/auth/login', json={'login_identifier': 'doc@test.local', 'password': 'TestPass123!'})
print('DOCTOR LOGIN:', r.status_code)
assert r.status_code == 200, f'doctor login failed: {r.get_json()}'

# Ensure the session exists (normally set by video/start) so /video/join proceeds
with app.app_context():
    appt = Appointment.query.get(TEST['appt_id'])
    appt.session_id = 'sahatak-test-room-1'
    appt.session_status = 'waiting'
    db.session.commit()

APPT_ID = TEST['appt_id']

# 1) First doctor join -> 1 notification + 1 email
r = client.post(f"/api/appointments/{APPT_ID}/video/join")
print('DOCTOR JOIN #1:', r.status_code)
assert r.status_code == 200, f'join failed: {r.get_json()}'
assert len(email_calls) == 1, f'expected 1 email call, got {len(email_calls)}'
assert email_calls[0]['to'] == 'pat@test.local'
assert 'video-consultation.html?appointmentId=' in email_calls[0]['join_url']

with app.app_context():
    rows = NotificationQueue.query.filter_by(notification_type='in_app', template_name='doctor_joined_video').all()
    assert len(rows) == 1, f'expected 1 in_app notification, got {len(rows)}'
    assert rows[0].recipient_id == TEST['pat_id']
    assert rows[0].priority == 'high'
    assert rows[0].template_data['appointment_id'] == APPT_ID
    assert rows[0].status == 'pending'  # unread
    NOTIF_ID = rows[0].id

# 2) Second doctor join (reconnect) -> still 1 notification, still 1 email
r = client.post(f"/api/appointments/{APPT_ID}/video/join")
print('DOCTOR JOIN #2 (duplicate):', r.status_code)
assert r.status_code == 200
assert len(email_calls) == 1, f'email re-fired on duplicate join! ({len(email_calls)})'
with app.app_context():
    rows = NotificationQueue.query.filter_by(notification_type='in_app', template_name='doctor_joined_video').all()
    assert len(rows) == 1, 'duplicate notification created!'

# 3) Patient join -> must NOT fire anything
r = client.post('/api/auth/login', json={'login_identifier': 'pat@test.local', 'password': 'TestPass123!'})
print('PATIENT LOGIN:', r.status_code)
assert r.status_code == 200
r = client.post(f"/api/appointments/{APPT_ID}/video/join")
print('PATIENT JOIN:', r.status_code)
assert len(email_calls) == 1, 'patient join fired the notification!'

# 4) GET /api/notifications as patient -> bare array with correct item shape
r = client.get('/api/notifications')
print('GET /api/notifications:', r.status_code, r.get_json())
assert r.status_code == 200
items = r.get_json()
assert isinstance(items, list) and len(items) == 1, f'expected bare array with 1 item, got {items}'
item = items[0]
assert item['id'] == str(NOTIF_ID)
assert item['type'] == 'appointment'
assert item['read'] is False
assert item['actionScreen'] == 'video_consultation'
assert item['titleAr'] and item['messageAr'], 'bilingual fields missing'

# 5) Mark read -> status pending -> sent, GET reflects read=True
r = client.put(f'/api/notifications/{NOTIF_ID}/read')
print('PUT read:', r.status_code)
assert r.status_code == 200
with app.app_context():
    row = NotificationQueue.query.get(NOTIF_ID)
    assert row.status == 'sent', f'expected sent, got {row.status}'
r = client.get('/api/notifications')
assert r.get_json()[0]['read'] is True

# 6) Mark-all read endpoint responds 200
r = client.put('/api/notifications/read-all')
print('PUT read-all:', r.status_code)
assert r.status_code == 200

print('ALL DOCTOR-JOINED NOTIFICATION TESTS PASSED')