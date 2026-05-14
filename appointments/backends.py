"""Allow login with email or username."""

from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend


class EmailOrUsernameBackend(ModelBackend):
    def authenticate(self, request, username=None, password=None, **kwargs):
        if username is None or password is None:
            return None
        User = get_user_model()
        user = None
        if "@" in username:
            user = User.objects.filter(email__iexact=username.strip()).first()
        else:
            user = User.objects.filter(username__iexact=username.strip()).first()
        if user is not None and user.check_password(password):
            return user
        return None
