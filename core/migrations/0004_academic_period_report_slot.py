from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("core", "0003_school_theme")]

    operations = [
        migrations.AddField(
            model_name="academicperiod",
            name="report_slot",
            field=models.CharField(
                choices=[
                    ("auto", "Automático por orden y nombre"),
                    ("report_1", "1° informe"),
                    ("report_2", "2° informe"),
                    ("report_3", "3° informe"),
                    ("extended", "Período extendido"),
                    ("final", "Informe final"),
                ],
                default="auto",
                max_length=16,
            ),
        ),
    ]
