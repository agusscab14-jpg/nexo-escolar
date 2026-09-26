from django.db import migrations


TENANT_TABLES = (
    "core_student", "core_studentguardian", "core_course", "core_subject",
    "core_academicplan", "core_planyear", "core_plansubject", "core_section",
    "core_enrollment", "core_academicperiod", "core_gradingscale", "core_offering",
    "core_teacherassignment", "core_attendance", "core_grade", "core_book",
    "core_loan", "core_lostitem", "core_claim", "core_notice", "core_audit",
    "core_importbatch",
)


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
    dependencies = [("core", "0001_initial")]
    operations = [migrations.RunPython(enable_row_security, disable_row_security)]
