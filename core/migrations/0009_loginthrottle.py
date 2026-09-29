from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("core", "0008_schoolsignuprequest")]

    operations = [
        migrations.CreateModel(
            name="LoginThrottle",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("key_digest", models.CharField(max_length=64, unique=True)),
                ("attempts", models.PositiveSmallIntegerField(default=0)),
                ("window_started_at", models.DateTimeField()),
            ],
            options={
                "indexes": [
                    models.Index(fields=["window_started_at"], name="core_login_window_idx"),
                ],
            },
        ),
    ]
