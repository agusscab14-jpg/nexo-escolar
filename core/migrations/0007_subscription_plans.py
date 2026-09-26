from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0006_family_feature_row_security"),
    ]

    operations = [
        migrations.RenameField(
            model_name="platformbillingsettings",
            old_name="monthly_amount_ars",
            new_name="basic_monthly_amount_ars",
        ),
        migrations.AddField(
            model_name="platformbillingsettings",
            name="pro_monthly_amount_ars",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=12),
        ),
        migrations.AddField(
            model_name="platformpricechange",
            name="plan",
            field=models.CharField(choices=[("basic", "Básico"), ("pro", "Pro")], default="basic", max_length=12),
        ),
        migrations.AlterField(
            model_name="platformpricechange",
            name="effective_on",
            field=models.DateField(),
        ),
        migrations.AddConstraint(
            model_name="platformpricechange",
            constraint=models.UniqueConstraint(fields=("plan", "effective_on"), name="unique_plan_price_change_date"),
        ),
        migrations.AddField(
            model_name="schoolsubscription",
            name="plan",
            field=models.CharField(choices=[("basic", "Básico"), ("pro", "Pro")], default="basic", max_length=12),
        ),
        migrations.AddField(
            model_name="schoolsubscription",
            name="pending_plan",
            field=models.CharField(blank=True, choices=[("basic", "Básico"), ("pro", "Pro")], max_length=12, null=True),
        ),
        migrations.AddField(
            model_name="schoolsubscription",
            name="plan_change_effective_on",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="subscriptioncharge",
            name="plan",
            field=models.CharField(choices=[("basic", "Básico"), ("pro", "Pro")], default="basic", max_length=12),
        ),
    ]
