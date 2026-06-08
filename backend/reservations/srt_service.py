"""SRTrain 라이브러리를 감싸는 서비스 레이어.

뷰/태스크가 SRTrain 의 내부 객체를 직접 다루지 않고,
이 모듈을 통해서만 검색/예약을 수행하도록 한다.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from SRT import SRT
from SRT.constants import STATION_CODE
from SRT.seat_type import SeatType
from SRT.errors import (
    SRTError,
    SRTLoginError,
    SRTResponseError,
    SRTDuplicateError,
)

# 사용 가능한 역 목록 (프론트 드롭다운용)
STATIONS = list(STATION_CODE.keys())

SEAT_TYPE_MAP = {
    "GENERAL_FIRST": SeatType.GENERAL_FIRST,
    "GENERAL_ONLY": SeatType.GENERAL_ONLY,
    "SPECIAL_FIRST": SeatType.SPECIAL_FIRST,
    "SPECIAL_ONLY": SeatType.SPECIAL_ONLY,
}


class SRTServiceError(Exception):
    """서비스 레이어 공통 예외."""


class SRTAuthError(SRTServiceError):
    """로그인 실패."""


class SRTSoldOut(SRTServiceError):
    """예약 시도했으나 자리 없음 (재시도 대상)."""


@dataclass
class TrainDTO:
    """프론트로 내려보낼 열차 정보."""

    train_number: str
    train_name: str
    dep_station_name: str
    arr_station_name: str
    dep_date: str
    dep_time: str
    arr_date: str
    arr_time: str
    general_seat_state: str
    special_seat_state: str
    general_available: bool
    special_available: bool

    @classmethod
    def from_train(cls, t) -> "TrainDTO":
        return cls(
            train_number=t.train_number,
            train_name=t.train_name,
            dep_station_name=t.dep_station_name,
            arr_station_name=t.arr_station_name,
            dep_date=t.dep_date,
            dep_time=t.dep_time,
            arr_date=t.arr_date,
            arr_time=t.arr_time,
            general_seat_state=t.general_seat_state,
            special_seat_state=t.special_seat_state,
            general_available=t.general_seat_available(),
            special_available=t.special_seat_available(),
        )

    def to_dict(self) -> dict:
        return self.__dict__.copy()


def get_client(srt_id: str, srt_pw: str) -> SRT:
    """로그인된 SRT 클라이언트를 반환한다."""
    try:
        return SRT(srt_id, srt_pw)
    except SRTLoginError as e:
        raise SRTAuthError(f"SRT 로그인 실패: {e}") from e
    except SRTError as e:
        raise SRTServiceError(str(e)) from e


def search_trains(
    srt_id: str,
    srt_pw: str,
    dep: str,
    arr: str,
    date: str,
    time: str = "000000",
    available_only: bool = False,
) -> list[dict]:
    """열차 검색. available_only=False 로 매진 열차도 함께 보여준다."""
    if dep not in STATION_CODE:
        raise SRTServiceError(f"알 수 없는 출발역: {dep}")
    if arr not in STATION_CODE:
        raise SRTServiceError(f"알 수 없는 도착역: {arr}")

    client = get_client(srt_id, srt_pw)
    try:
        trains = client.search_train(
            dep, arr, date, time, available_only=available_only
        )
    except SRTError as e:
        raise SRTServiceError(f"열차 검색 실패: {e}") from e

    return [TrainDTO.from_train(t).to_dict() for t in trains]


def _find_train(
    client: SRT,
    dep: str,
    arr: str,
    date: str,
    time: str,
    train_number: str,
):
    """예약 시점에 동일 조건으로 재검색하여 대상 열차 객체를 찾는다.

    SRTTrain 객체는 직렬화가 까다로워 DB 에 저장하지 않고,
    예약 시도마다 (열차번호 기준으로) 재검색하여 최신 객체를 얻는다.
    """
    trains = client.search_train(dep, arr, date, time, available_only=False)
    for t in trains:
        if t.train_number == train_number:
            return t
    return None


def try_reserve(
    srt_id: str,
    srt_pw: str,
    dep: str,
    arr: str,
    date: str,
    time: str,
    train_number: str,
    seat_type: str = "GENERAL_FIRST",
) -> dict:
    """예약을 1회 시도한다.

    - 성공 시 예약 정보 dict 반환
    - 자리 없으면 SRTSoldOut 발생 (호출측에서 재시도)
    - 인증 오류 등은 SRTServiceError 계열 발생
    """
    seat = SEAT_TYPE_MAP.get(seat_type, SeatType.GENERAL_FIRST)
    client = get_client(srt_id, srt_pw)

    target = _find_train(client, dep, arr, date, time, train_number)
    if target is None:
        raise SRTSoldOut(f"열차({train_number})를 찾을 수 없습니다 (운행 종료/변경).")

    # 좌석 가용성 사전 체크
    want_general = seat_type in ("GENERAL_FIRST", "GENERAL_ONLY")
    want_special = seat_type in ("SPECIAL_FIRST", "SPECIAL_ONLY")
    has_seat = False
    if want_general and target.general_seat_available():
        has_seat = True
    if want_special and target.special_seat_available():
        has_seat = True
    # *_FIRST 는 둘 중 하나라도 있으면 시도
    if seat_type in ("GENERAL_FIRST", "SPECIAL_FIRST"):
        has_seat = target.seat_available()

    if not has_seat:
        raise SRTSoldOut("선택한 좌석 종류에 빈 자리가 없습니다.")

    try:
        reservation = client.reserve(target, special_seat=seat)
    except SRTDuplicateError as e:
        # 이미 예약된 건 — 성공으로 간주하고 메시지 전달
        raise SRTServiceError(f"이미 예약된 열차입니다: {e}") from e
    except SRTResponseError as e:
        # 매진/순간적 좌석 소진 등은 재시도 대상
        raise SRTSoldOut(f"예약 시도 실패(재시도 대상): {e}") from e
    except SRTError as e:
        raise SRTServiceError(f"예약 실패: {e}") from e

    return {
        "reservation_number": reservation.reservation_number,
        "total_cost": reservation.total_cost,
        "seat_count": reservation.seat_count,
        "train_name": reservation.train_name,
        "dep_station_name": reservation.dep_station_name,
        "arr_station_name": reservation.arr_station_name,
        "dep_date": reservation.dep_date,
        "dep_time": reservation.dep_time,
        "arr_time": reservation.arr_time,
        "payment_date": reservation.payment_date,
        "payment_time": reservation.payment_time,
        "summary": str(reservation),
    }


def verify_login(srt_id: str, srt_pw: str) -> bool:
    """자격증명 검증용. 로그인 성공 여부만 반환."""
    get_client(srt_id, srt_pw)
    return True
