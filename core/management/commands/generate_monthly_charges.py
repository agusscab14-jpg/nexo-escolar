from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from core.views import generate_monthly_charges


class Command(BaseCommand):
    help = "Generate current-month subscription charges once per active school; safe to run daily."

    def handle(self, *args, **options):
        first_day = timezone.localdate().replace(day=1)
        with transaction.atomic():
            result = generate_monthly_charges(first_day)
        self.stdout.write(f"{result['month']}: {result['created']} created, {result['existing']} existing")
