"""Password reset must not reveal whether an email has an account."""

from django.contrib.auth.forms import PasswordResetForm as NexoPasswordResetForm
