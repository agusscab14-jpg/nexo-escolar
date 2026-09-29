from django.db import migrations, models


def configure_launch_prices(apps, schema_editor):
    Billing = apps.get_model("core", "PlatformBillingSettings")
    Billing.objects.using(schema_editor.connection.alias).filter(pk=1, basic_monthly_amount_ars=7000,
        pro_monthly_amount_ars=12000, onboarding_amount_ars=2000).update(
        basic_monthly_amount_ars=15000, pro_monthly_amount_ars=20000,
        onboarding_amount_ars=0, basic_renewal_amount_ars=50000,
        pro_renewal_amount_ars=80000)


class Migration(migrations.Migration):
    dependencies = [("core", "0009_loginthrottle")]
    operations = [
        migrations.AddField(model_name="platformbillingsettings", name="basic_renewal_amount_ars",
            field=models.DecimalField(decimal_places=2, default=50000, max_digits=12)),
        migrations.AddField(model_name="platformbillingsettings", name="pro_renewal_amount_ars",
            field=models.DecimalField(decimal_places=2, default=80000, max_digits=12)),
        migrations.AddField(model_name="schoolsignuprequest", name="renewal_quote_ars",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=12)),
        migrations.AddField(model_name="schoolsignuprequest", name="renewal_on",
            field=models.DateField(blank=True, null=True)),
        migrations.AddField(model_name="schoolsubscription", name="renewal_monthly_amount_ars",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
        migrations.AddField(model_name="schoolsubscription", name="pending_renewal_monthly_amount_ars",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
        migrations.AddField(model_name="schoolsubscription", name="promo_ends_on",
            field=models.DateField(blank=True, null=True)),
        migrations.RunPython(configure_launch_prices, migrations.RunPython.noop),
    ]
