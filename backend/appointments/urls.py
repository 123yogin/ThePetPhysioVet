from django.conf import settings
from django.urls import path

from . import views

urlpatterns = [
    path("", views.home, name="home"),
    path("login/", views.login_view, name="login"),
    path("signup/", views.signup_view, name="signup"),
    path("logout/", views.logout_view, name="logout"),
    path("dashboard/", views.dashboard, name="dashboard"),
    path("patients/", views.patient_list, name="patient_list"),
    path("patients/add/", views.patient_create, name="patient_create"),
    path("appointments/create/", views.create_appointment, name="create_appointment"),
    path("appointments/<int:pk>/share/", views.share_appointment, name="share_appointment"),
    path("appointments/", views.appointment_list, name="appointment_list"),
    path("appointments/<int:pk>/reschedule/", views.reschedule_appointment, name="reschedule_appointment"),
    path("appointments/<int:pk>/complete/", views.mark_complete, name="mark_complete"),
]

# Parity-only shell route: registered ONLY when PARITY_MODE is set, so it never
# exists in production. Renders app_base with an empty content block and no
# active nav item, mirroring the React shell route for a 1:1 shell diff.
if getattr(settings, "PARITY_MODE", False):
    urlpatterns += [
        path("__parity__/shell/", views.parity_shell, name="parity_shell"),
    ]
