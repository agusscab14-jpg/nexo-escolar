from django.db import migrations


TENANT_TABLES = ("core_schoolevent", "core_noticeread")


def enable_row_security(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    with schema_editor.connection.cursor() as cursor:
        for table in TENANT_TABLES:
            cursor.execute(f'ALTER TABLE "{table}" ENABLE ROW LEVEL SECURITY')
            cursor.execute(f'ALTER TABLE "{table}" FORCE ROW LEVEL SECURITY')
            cursor.execute(
                f'''CREATE POLICY "school_scope_{table}" ON "{table}"
                    USING ("school_id" = NULLIF(current_setting('app.current_school_id', true), '')::bigint)
                    WITH CHECK ("school_id" = NULLIF(current_setting('app.current_school_id', true), '')::bigint)'''
            )


def disable_row_security(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    with schema_editor.connection.cursor() as cursor:
        for table in reversed(TENANT_TABLES):
            cursor.execute(f'DROP POLICY IF EXISTS "school_scope_{table}" ON "{table}"')
            cursor.execute(f'ALTER TABLE "{table}" NO FORCE ROW LEVEL SECURITY')
            cursor.execute(f'ALTER TABLE "{table}" DISABLE ROW LEVEL SECURITY')


class Migration(migrations.Migration):
    dependencies = [("core", "0005_subscriptions_family_calendar")]
    operations = [migrations.RunPython(enable_row_security, disable_row_security)]
