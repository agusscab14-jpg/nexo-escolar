from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("core", "0002_tenant_row_security")]

    operations = [
        migrations.AddField(
            model_name="school",
            name="theme",
            field=models.CharField(
                choices=[
                    ("forest", "Bosque"),
                    ("ocean", "Océano"),
                    ("violet", "Violeta"),
                    ("terracotta", "Terracota"),
                ],
                default="forest",
                max_length=24,
            ),
        ),
    ]
