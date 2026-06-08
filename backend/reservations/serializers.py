from rest_framework import serializers

from .models import ReservationJob


class ReservationJobSerializer(serializers.ModelSerializer):
    """작업 조회용. 비밀번호는 절대 내보내지 않는다."""

    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = ReservationJob
        fields = [
            "id",
            "dep",
            "arr",
            "date",
            "time",
            "train_number",
            "train_label",
            "seat_type",
            "status",
            "status_display",
            "attempts",
            "last_message",
            "reservation_number",
            "result",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class SearchRequestSerializer(serializers.Serializer):
    srt_id = serializers.CharField()
    srt_pw = serializers.CharField()
    dep = serializers.CharField()
    arr = serializers.CharField()
    date = serializers.CharField(help_text="yyyyMMdd")
    time = serializers.CharField(required=False, default="000000")


class ReserveRequestSerializer(serializers.Serializer):
    srt_id = serializers.CharField()
    srt_pw = serializers.CharField()
    dep = serializers.CharField()
    arr = serializers.CharField()
    date = serializers.CharField(help_text="yyyyMMdd")
    time = serializers.CharField(required=False, default="000000")
    train_number = serializers.CharField()
    train_label = serializers.CharField(required=False, default="")
    seat_type = serializers.ChoiceField(
        choices=[
            "GENERAL_FIRST",
            "GENERAL_ONLY",
            "SPECIAL_FIRST",
            "SPECIAL_ONLY",
        ],
        required=False,
        default="GENERAL_FIRST",
    )
