from django.urls import path

from . import views

urlpatterns = [
    path("stations/", views.stations, name="stations"),
    path("login-check/", views.login_check, name="login-check"),
    path("search/", views.search, name="search"),
    path("reserve/", views.reserve, name="reserve"),
    path("jobs/", views.job_list, name="job-list"),
    path("jobs/<int:job_id>/", views.job_detail, name="job-detail"),
    path("jobs/<int:job_id>/cancel/", views.job_cancel, name="job-cancel"),
]
