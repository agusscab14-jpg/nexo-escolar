from django.conf import settings
from django.shortcuts import redirect, render
from django.views.decorators.csrf import ensure_csrf_cookie


@ensure_csrf_cookie
def home(request):
    if request.user.is_authenticated and request.user.is_superuser:
        return redirect("platform_admin")
    return render(request, "core/landing.html")


@ensure_csrf_cookie
def login(request):
    return render(request, "core/index.html", {"demo_mode": settings.DEMO_MODE})
