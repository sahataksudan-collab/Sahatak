"""Regression test: full maintenance-mode cycle (SQLite e2e, backend/tests/).
Run from backend/:  python tests/test_maintenance_cycle.py
Exercises: login -> PUT settings(maintenance_mode) -> GET a normal endpoint
(expect 503 MAINTENANCE_MODE) -> toggle off -> GET again (expect non-503)."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ['DATABASE_URL'] = 'sqlite:///maintenance_test.db'
os.environ['FLASK_ENV'] = 'development'

from app import app
from models import db, User

with app.app_context():
    db.create_all()
    if not User.query.filter_by(email='admin@test.local').first():
        u = User(email='admin@test.local', full_name='Test Admin', user_type='admin',
                 is_active=True, is_verified=True)
        u.set_password('TestPass123!')
        db.session.add(u)
        db.session.commit()
    print('DB ready at', app.config['SQLALCHEMY_DATABASE_URI'])

client = app.test_client()

# second, cookie-less client = anonymous/normal user (no admin bypass during maintenance)
anon = app.test_client()

r = client.post('/api/auth/login', json={'login_identifier': 'admin@test.local', 'password': 'TestPass123!'})
print('LOGIN:', r.status_code)
assert r.status_code == 200, 'login failed'

# baseline: normal endpoint reachable while maintenance OFF
r = client.get('/api/users/doctors')
print('BASELINE GET /api/users/doctors (maintenance off):', r.status_code)
assert r.status_code == 200, 'baseline GET failed'

# toggle ON via the same endpoint the admin dashboard now calls
r = client.put('/api/admin/settings', json={'maintenance_mode': True}, content_type='application/json')
print('PUT settings maintenance_mode=True:', r.status_code, r.get_json())
assert r.status_code == 200, f'PUT maintenance_mode=True FAILED: {r.get_json()}'

# admin bypass: /api/admin/ excluded from the check, so admin can still use the toggle
r = client.put('/api/admin/settings', json={'maintenance_mode': True}, content_type='application/json')
print('PUT while maintenance ON (admin excluded):', r.status_code)
assert r.status_code == 200, 'admin toggle during maintenance FAILED'

# anonymous/normal user is blocked with 503 MAINTENANCE_MODE
r = anon.get('/api/users/doctors')
body = r.get_json(silent=True) or {}
print('ANON GET /api/users/doctors (maintenance ON):', r.status_code, 'error_code=', body.get('error_code'))
assert r.status_code == 503 and body.get('error_code') == 'MAINTENANCE_MODE', 'maintenance block FAILED'

# toggle OFF (admin still allowed: /api/admin/ excluded from the check)
r = client.put('/api/admin/settings', json={'maintenance_mode': False}, content_type='application/json')
print('PUT settings maintenance_mode=False:', r.status_code, r.get_json())
assert r.status_code == 200, f'PUT maintenance_mode=False FAILED: {r.get_json()}'

# anonymous/normal access restored (401 unauthorized is fine — the point is no 503 block)
r = anon.get('/api/users/doctors')
print('ANON GET /api/users/doctors (maintenance OFF again):', r.status_code)
assert r.status_code != 503, 'normal access NOT restored'

# verify persisted value reads back correctly
r = client.get('/api/admin/settings')
val = r.get_json()['data']['settings']['maintenance_mode']
print('GET /api/admin/settings maintenance_mode =', val)
assert val['data_type'] == 'boolean' and str(val['value']).lower() == 'false'

print('ALL MAINTENANCE-MODE CYCLE ASSERTIONS PASSED')
