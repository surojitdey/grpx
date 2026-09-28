"""
Pytest configuration for the API test suite.

Tests always run against their own database (see ``DATABASES['default']['TEST']``
in ``config/settings.py``). Connection details for that database can be kept out
of the development ``.env`` in a sibling ``.env.test`` file, which is only read
for pytest runs. Real environment variables always win over the file.
"""

import os
from pathlib import Path

import environ
import pytest

TEST_ENV_FILE = Path(__file__).resolve().parent / '.env.test'

# TEST settings key -> environment variable that overrides it.
TEST_DB_ENV_VARS = {
    'NAME': 'TEST_DB_NAME',
    'USER': 'TEST_DB_USER',
    'PASSWORD': 'TEST_DB_PASSWORD',
    'HOST': 'TEST_DB_HOST',
    'PORT': 'TEST_DB_PORT',
}


@pytest.fixture(scope='session')
def django_db_modify_db_settings(
    django_db_modify_db_settings_parallel_suffix,
):
    """Point the test run at the test database before it is created."""
    if TEST_ENV_FILE.is_file():
        environ.Env.read_env(str(TEST_ENV_FILE), overwrite=False)

    from django.conf import settings

    test_db = settings.DATABASES['default']['TEST']
    for key, env_var in TEST_DB_ENV_VARS.items():
        value = os.environ.get(env_var)
        if value:
            test_db[key] = value
