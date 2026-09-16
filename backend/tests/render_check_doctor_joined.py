"""Quick render check: doctor_joined_video templates extend the shared base layout."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ['DATABASE_URL'] = 'sqlite:///render_check.db'
from flask import render_template
from app import app

with app.app_context():
    data = dict(doctor_name='Dr. Sara Ahmed', patient_name='Ali Hassan',
                doctor_specialty='Cardiology', appointment_date='2026-09-16',
                appointment_date_readable='Wednesday, 16 September 2026',
                appointment_time_readable='03:30 PM',
                join_url='https://x/pages/appointments/video-consultation.html?appointmentId=7')
    ref = render_template('email/en/appointment_confirmation.html', logo_url='https://logo',
                          app_name='Sahatak', current_year=2026, recipient_role='patient', **data)
    for lang in ['en', 'ar']:
        html = render_template(f'email/{lang}/doctor_joined_video.html', logo_url='https://logo',
                               app_name='Sahatak', current_year=2026, **data)
        has_logo = '<img src="https://logo"' in html
        has_cta = 'appointmentId=7' in html
        has_footer = ('information purposes' in html) if lang == 'en' else ('الطوارئ' in html)
        same_skeleton = ('<table role="presentation" width="600"' in ref) == ('<table role="presentation" width="600"' in html)
        print(f'{lang}: renders OK, len={len(html)}, logo_img={has_logo}, cta_link={has_cta}, footer={has_footer}, base_600_table={same_skeleton}')
        assert has_logo and has_cta and has_footer and same_skeleton
print('RENDER CHECK PASSED')