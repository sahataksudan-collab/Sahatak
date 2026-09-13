"""Regression test: Python-type -> setting_types enum mapping in PUT /api/admin/settings.
Run from backend/:  python tests/test_settings_types.py
Guards against the enum crash ('bool' is not among the defined enum values) for ALL
four rule types used in setting_rules: bool->boolean, int->integer, str->string, float->json."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ['DATABASE_URL'] = 'sqlite:///maintenance_test.db'
os.environ['FLASK_ENV'] = 'development'

from app import app
from models import db, User, SystemSettings

with app.app_context():
    db.create_all()
    if not User.query.filter_by(email='admin@test.local').first():
        u = User(email='admin@test.local', full_name='Test Admin', user_type='admin',
                 is_active=True, is_verified=True)
        u.set_password('TestPass123!')
        db.session.add(u)
        db.session.commit()

client = app.test_client()
r = client.post('/api/auth/login', json={'login_identifier': 'admin@test.local', 'password': 'TestPass123!'})
print('LOGIN:', r.status_code)
assert r.status_code == 200, 'login failed'

# one save per rule type used in setting_rules (routes/admin.py)
payload = {
    'email_notifications_enabled': False,   # bool  -> 'boolean'
    'password_min_length': 10,              # int   -> 'integer'
    'default_language': 'en',               # str   -> 'string'
    'platform_commission_percent': 12.5,    # float -> 'json'
}
r = client.put('/api/admin/settings', json=payload, content_type='application/json')
print('PUT settings (all 4 types):', r.status_code, r.get_json())
assert r.status_code == 200, f'setting save FAILED: {r.get_json()}'

# verify persisted enum type per key
r = client.get('/api/admin/settings')
settings = r.get_json()['data']['settings']
for key, expected in [('email_notifications_enabled', 'boolean'),
                      ('password_min_length', 'integer'),
                      ('default_language', 'string'),
                      ('platform_commission_percent', 'json')]:
    actual = settings[key]['data_type']
    print(f'  {key}: data_type={actual} value={settings[key]["value"]!r}')
    assert actual == expected, f'{key}: expected enum {expected!r}, got {actual!r}'

# verify typed read-back through the ORM (SystemSettings.get_typed_value)
with app.app_context():
    checks = [
        ('email_notifications_enabled', False, bool),
        ('password_min_length', 10, int),
        ('default_language', 'en', str),
        ('platform_commission_percent', 12.5, float),
    ]
    for key, expected, pytype in checks:
        val = SystemSettings.get_setting(key)
        print(f'  ORM read-back {key} = {val!r} (type: {type(val).__name__})')
        assert isinstance(val, pytype) and val == expected, \
            f'{key}: expected {pytype.__name__} {expected!r}, got {val!r} ({type(val).__name__})'

print('ALL FOUR TYPE-CASE ASSERTIONS PASSED (bool->boolean, int->integer, str->string, float->json)')
