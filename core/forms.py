from django.contrib.auth import get_user_model
from django.contrib.auth.forms import PasswordResetForm
from django.core.exceptions import ValidationError


class NexoPasswordResetForm(PasswordResetForm):
    def clean_email(self):
        # PasswordResetForm validates the EmailField itself but does not define
        # clean_email(); read the already-cleaned field value directly.
        email = self.cleaned_data["email"]
        user_model = get_user_model()
        email_field = user_model.get_email_field_name()
        account_exists = user_model._default_manager.filter(
            **{f"{email_field}__iexact": email}
        ).exists()

        if not account_exists:
            raise ValidationError(
                "Ese correo no está registrado en la base de datos de Nexo Escolar. "
                "Revisá que esté bien escrito e intentá nuevamente."
            )

        if not any(self.get_users(email)):
            raise ValidationError(
                "La cuenta está registrada, pero no está habilitada para recuperar "
                "la contraseña desde aquí. Contactá a la administración de tu escuela."
            )

        return email
