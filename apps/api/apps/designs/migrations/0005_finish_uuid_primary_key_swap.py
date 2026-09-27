"""Finish the integer -> UUID primary key swap on the design tables.

Migration 0004 rewrote the integer `id`/`design_id` columns as UUIDs by adding
new columns and renaming them into place. That leaves two problems behind:

1. The original integer columns (`old_id`, `old_design_id`) are still present
   and NOT NULL, so every insert that does not populate them fails.
2. Because PostgreSQL keeps indexes and constraints attached to a renamed
   column, the indexes and `unique_together` constraints generated for the
   original integer columns ended up on `old_*` instead of the new UUID
   columns. Dropping the legacy columns therefore also drops those indexes.

This migration removes the legacy columns and recreates the indexes and
uniqueness constraints against the UUID columns, using the names Django
expects so the database matches the model state.
"""

import uuid

from django.db import migrations, models

DROP_LEGACY_COLUMNS_SQL = """
ALTER TABLE designs DROP COLUMN IF EXISTS old_id;
ALTER TABLE design_versions DROP COLUMN IF EXISTS old_id;
ALTER TABLE design_versions DROP COLUMN IF EXISTS old_design_id;
ALTER TABLE export_jobs DROP COLUMN IF EXISTS old_design_id;
ALTER TABLE asset_usage DROP COLUMN IF EXISTS old_design_id;
ALTER TABLE design_shares DROP COLUMN IF EXISTS old_design_id;
"""

RECREATE_INDEXES_SQL = """
CREATE INDEX IF NOT EXISTS design_versions_design_id_d57bc6d8
    ON design_versions (design_id);
CREATE INDEX IF NOT EXISTS design_vers_design__30022a_idx
    ON design_versions (design_id, version_number);
ALTER TABLE design_versions
    ADD CONSTRAINT design_versions_design_id_version_number_c2a3f527_uniq
    UNIQUE (design_id, version_number);

CREATE INDEX IF NOT EXISTS export_jobs_design_id_f88eaefc
    ON export_jobs (design_id);

CREATE INDEX IF NOT EXISTS asset_usage_design_id_3c4e39c7
    ON asset_usage (design_id);
ALTER TABLE asset_usage
    ADD CONSTRAINT asset_usage_asset_id_design_id_61e451b9_uniq
    UNIQUE (asset_id, design_id);

CREATE INDEX IF NOT EXISTS design_shares_design_id_1c9b4a2c
    ON design_shares (design_id);
ALTER TABLE design_shares
    ADD CONSTRAINT design_shares_design_id_token_365ce0bc_uniq
    UNIQUE (design_id, token);
"""


class Migration(migrations.Migration):

    dependencies = [
        ("designs", "0004_alter_designpage_unique_together_and_more"),
    ]

    operations = [
        migrations.RunSQL(
            sql=DROP_LEGACY_COLUMNS_SQL,
            reverse_sql=migrations.RunSQL.noop,
        ),
        migrations.RunSQL(
            sql=RECREATE_INDEXES_SQL,
            reverse_sql=migrations.RunSQL.noop,
        ),
        # The columns are already UUIDs in the database (0004 converted them
        # with raw SQL), so only the migration state needs updating.
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AlterField(
                    model_name="design",
                    name="id",
                    field=models.UUIDField(
                        default=uuid.uuid4, editable=False, primary_key=True, serialize=False
                    ),
                ),
                migrations.AlterField(
                    model_name="designversion",
                    name="id",
                    field=models.UUIDField(
                        default=uuid.uuid4, editable=False, primary_key=True, serialize=False
                    ),
                ),
            ],
            database_operations=[],
        ),
    ]
