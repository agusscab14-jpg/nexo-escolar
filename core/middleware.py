from django.db import connection, transaction
from .models import Membership, School


class SchoolContextMiddleware:
    """Resolve the active school from the authenticated server-side session."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.active_school = None
        request.school_membership = None
        with transaction.atomic():
            user = getattr(request, "user", None)
            if user and user.is_authenticated:
                requested_id = request.session.get("active_school_id")
                membership = None
                school = None
                if requested_id:
                    school = School.objects.filter(pk=requested_id, state__in=(School.State.TRIAL, School.State.ACTIVE)).first()
                    if school and not user.is_superuser:
                        membership = Membership.objects.filter(user=user, school=school, is_active=True).first()
                        if not membership:
                            school = None
                if school is None and not user.is_superuser:
                    membership = Membership.objects.filter(user=user, is_active=True, school__state__in=(School.State.TRIAL, School.State.ACTIVE)).select_related("school").order_by("school__name").first()
                    if membership:
                        school = membership.school
                        request.session["active_school_id"] = school.pk
                if school:
                    request.active_school = school
                    request.school_membership = membership
                    if connection.vendor == "postgresql":
                        with connection.cursor() as cursor:
                            cursor.execute("SELECT set_config('app.current_school_id', %s, true)", [str(school.pk)])
                elif connection.vendor == "postgresql":
                    with connection.cursor() as cursor:
                        cursor.execute("SELECT set_config('app.current_school_id', '', true)")
            elif connection.vendor == "postgresql":
                with connection.cursor() as cursor:
                    cursor.execute("SELECT set_config('app.current_school_id', '', true)")
            response = self.get_response(request)
            # Views return JSON errors instead of raising; roll back any partial work and
            # clear a transaction marked broken by a caught database exception.
            if response.status_code >= 400:
                transaction.set_rollback(True)
        return response
