import os
import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def populate_asset_metadata(apps, schema_editor):
    Asset = apps.get_model('assets', 'Asset')
    AssetUsage = apps.get_model('assets', 'AssetUsage')
    database = schema_editor.connection.alias

    for asset in Asset.objects.using(database).all().iterator():
        asset_uuid = uuid.uuid4()
        filename = os.path.basename(asset.storage_key)[:255]
        asset.uuid_id = asset_uuid
        asset.filename = filename
        asset.original_filename = (asset.name or filename)[:255]
        asset.size = asset.file_size
        asset.status = 'READY'
        asset.save(
            using=database,
            update_fields=[
                'uuid_id',
                'filename',
                'original_filename',
                'size',
                'status',
            ],
        )
        AssetUsage.objects.using(database).filter(
            asset_id=asset.pk
        ).update(asset_uuid=asset_uuid)


def restore_asset_usage(apps, schema_editor):
    AssetUsage = apps.get_model('assets', 'AssetUsage')
    database = schema_editor.connection.alias

    for usage in AssetUsage.objects.using(database).all().iterator():
        if usage.asset_uuid:
            usage.asset_id = usage.asset_uuid
            usage.save(using=database, update_fields=['asset'])


class Migration(migrations.Migration):

    dependencies = [
        ('assets', '0003_remove_asset_url'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='asset',
            name='uuid_id',
            field=models.UUIDField(editable=False, null=True),
        ),
        migrations.AddField(
            model_name='asset',
            name='filename',
            field=models.CharField(max_length=255, null=True),
        ),
        migrations.AddField(
            model_name='asset',
            name='original_filename',
            field=models.CharField(max_length=255, null=True),
        ),
        migrations.AddField(
            model_name='asset',
            name='size',
            field=models.BigIntegerField(null=True),
        ),
        migrations.AddField(
            model_name='asset',
            name='thumbnail_key',
            field=models.CharField(blank=True, default='', max_length=255),
        ),
        migrations.AddField(
            model_name='asset',
            name='status',
            field=models.CharField(
                choices=[
                    ('PENDING', 'Pending'),
                    ('PROCESSING', 'Processing'),
                    ('READY', 'Ready'),
                    ('FAILED', 'Failed'),
                    ('DELETED', 'Deleted'),
                ],
                default='READY',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='assetusage',
            name='asset_uuid',
            field=models.UUIDField(null=True),
        ),
        migrations.RunPython(
            populate_asset_metadata,
            migrations.RunPython.noop,
        ),
        migrations.AlterUniqueTogether(
            name='assetusage',
            unique_together=set(),
        ),
        migrations.RemoveField(
            model_name='assetusage',
            name='asset',
        ),
        migrations.RemoveField(
            model_name='asset',
            name='id',
        ),
        migrations.RenameField(
            model_name='asset',
            old_name='uuid_id',
            new_name='id',
        ),
        migrations.AlterField(
            model_name='asset',
            name='id',
            field=models.UUIDField(
                default=uuid.uuid4,
                editable=False,
                primary_key=True,
                serialize=False,
            ),
        ),
        migrations.AddField(
            model_name='assetusage',
            name='asset',
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='usage',
                to='assets.asset',
            ),
        ),
        migrations.RunPython(
            restore_asset_usage,
            migrations.RunPython.noop,
        ),
        migrations.AlterField(
            model_name='assetusage',
            name='asset',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='usage',
                to='assets.asset',
            ),
        ),
        migrations.RemoveField(
            model_name='assetusage',
            name='asset_uuid',
        ),
        migrations.AlterField(
            model_name='asset',
            name='filename',
            field=models.CharField(max_length=255),
        ),
        migrations.AlterField(
            model_name='asset',
            name='original_filename',
            field=models.CharField(max_length=255),
        ),
        migrations.AlterField(
            model_name='asset',
            name='size',
            field=models.BigIntegerField(),
        ),
        migrations.AlterField(
            model_name='asset',
            name='status',
            field=models.CharField(
                choices=[
                    ('PENDING', 'Pending'),
                    ('PROCESSING', 'Processing'),
                    ('READY', 'Ready'),
                    ('FAILED', 'Failed'),
                    ('DELETED', 'Deleted'),
                ],
                default='PENDING',
                max_length=20,
            ),
        ),
        migrations.RemoveField(
            model_name='asset',
            name='name',
        ),
        migrations.RemoveField(
            model_name='asset',
            name='asset_type',
        ),
        migrations.RemoveField(
            model_name='asset',
            name='thumbnail_url',
        ),
        migrations.RemoveField(
            model_name='asset',
            name='file_size',
        ),
        migrations.AlterUniqueTogether(
            name='assetusage',
            unique_together={('asset', 'design')},
        ),
    ]
