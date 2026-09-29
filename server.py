#!/usr/bin/env python3
"""Compatibility entry point for starting the Django development server."""
import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

if __name__ == "__main__":
    from django.core.management import execute_from_command_line

    port = os.environ.get("NEXO_PORT", "8000")
    execute_from_command_line(["manage.py", "runserver", f"0.0.0.0:{port}"])
