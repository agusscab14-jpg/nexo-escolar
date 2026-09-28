from django.core.management.base import BaseCommand
from django.utils import timezone

from core.models import SchoolSignupRequest


class Command(BaseCommand):
    help = "Elimina solicitudes públicas de alta de escuela que ya vencieron."

    def handle(self, *args, **options):
        deleted, _ = SchoolSignupRequest.objects.filter(expires_at__lte=timezone.now()).delete()
        self.stdout.write(self.style.SUCCESS(f"Solicitudes vencidas eliminadas: {deleted}"))
