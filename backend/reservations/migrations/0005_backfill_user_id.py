from django.db import migrations


def backfill_user_id(apps, schema_editor):
    """기존(소유자 없는) 예약 작업을 회원번호 2288275161 로 귀속."""
    ReservationJob = apps.get_model("reservations", "ReservationJob")
    ReservationJob.objects.filter(user_id="").update(user_id="2288275161")


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("reservations", "0004_authtoken_reservationjob_user_id"),
    ]

    operations = [
        migrations.RunPython(backfill_user_id, noop),
    ]
