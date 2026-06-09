from django.urls import path

from . import views

urlpatterns = [
    path("stations/", views.stations, name="stations"),
    path("slack-users/", views.slack_users, name="slack-users"),
    path("prefs/", views.prefs, name="prefs"),
    path("login-check/", views.login_check, name="login-check"),
    path("search/", views.search, name="search"),
    path("reserve/", views.reserve, name="reserve"),
    path("jobs/", views.job_list, name="job-list"),
    path("jobs/pause-all/", views.jobs_pause_all, name="jobs-pause-all"),
    path("jobs/resume-all/", views.jobs_resume_all, name="jobs-resume-all"),
    path("jobs/set-interval-all/", views.jobs_set_interval_all, name="jobs-set-interval-all"),
    path("jobs/<int:job_id>/", views.job_detail, name="job-detail"),
    path("jobs/<int:job_id>/start/", views.job_start, name="job-start"),
    path("jobs/<int:job_id>/cancel/", views.job_cancel, name="job-cancel"),
    path("jobs/<int:job_id>/pause/", views.job_pause, name="job-pause"),
    path("jobs/<int:job_id>/resume/", views.job_resume, name="job-resume"),
]
