from django.contrib import admin

from .models import ReservationJob


@admin.register(ReservationJob)
class ReservationJobAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "status",
        "dep",
        "arr",
        "date",
        "train_number",
        "attempts",
        "reservation_number",
        "created_at",
    )
    list_filter = ("status",)
    search_fields = ("srt_id", "reservation_number", "train_number")
    readonly_fields = ("created_at", "updated_at")
