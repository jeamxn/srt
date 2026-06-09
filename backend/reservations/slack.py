"""Slack 알림 유틸.

bot token(xoxb-)으로 chat.postMessage 를 호출한다.
환경변수가 없으면 조용히 무시한다(로컬 개발 편의).
"""
from __future__ import annotations

import json
import logging
import urllib.request
import urllib.error
import urllib.parse

from django.conf import settings

logger = logging.getLogger(__name__)

SLACK_POST_API = "https://slack.com/api/chat.postMessage"
SLACK_USERS_API = "https://slack.com/api/users.list"


def list_slack_users() -> list[dict]:
    """Slack 워크스페이스 멤버 목록을 반환한다.

    봇/삭제된 계정은 제외하고, 실제 사람 계정만 [{id, name, avatar}] 형태로
    돌려준다. 토큰이 없으면 빈 목록.
    """
    token = getattr(settings, "SLACK_BOT_TOKEN", "")
    if not token:
        return []
    users: list[dict] = []
    cursor = ""
    try:
        for _ in range(10):  # 페이지네이션 안전 상한
            url = SLACK_USERS_API + "?limit=200"
            if cursor:
                url += f"&cursor={urllib.parse.quote(cursor)}"
            req = urllib.request.Request(
                url,
                headers={"Authorization": f"Bearer {token}"},
                method="GET",
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                body = json.loads(resp.read().decode("utf-8"))
            if not body.get("ok"):
                logger.warning("Slack users.list error: %s", body.get("error"))
                break
            for m in body.get("members", []):
                if m.get("deleted") or m.get("is_bot") or m.get("id") == "USLACKBOT":
                    continue
                profile = m.get("profile", {})
                display = (
                    profile.get("display_name")
                    or profile.get("real_name")
                    or m.get("name", "")
                )
                avatar = (
                    profile.get("image_72")
                    or profile.get("image_48")
                    or profile.get("image_192")
                    or ""
                )
                users.append(
                    {"id": m.get("id"), "name": display, "avatar": avatar}
                )
            cursor = (body.get("response_metadata") or {}).get("next_cursor", "")
            if not cursor:
                break
    except (urllib.error.URLError, TimeoutError, ValueError) as e:
        logger.warning("Slack users.list 실패: %s", e)
    users.sort(key=lambda u: u["name"].lower())
    return users


def send_slack(
    text: str, mention_channel: bool = False, mention_user: str = ""
) -> bool:
    """Slack 채널로 메시지를 보낸다.

    Args:
        text: 보낼 메시지 본문
        mention_channel: True 면 맨 앞에 <!channel> 멘션을 붙인다.
        mention_user: Slack user id. 주어지면 맨 앞에 <@id> 멘션을 붙인다.

    Returns:
        성공 여부 (설정 누락/실패 시 False)
    """
    token = getattr(settings, "SLACK_BOT_TOKEN", "")
    channel = getattr(settings, "SLACK_CHANNEL_ID", "")
    if not token or not channel:
        return False

    if mention_user:
        text = f"<@{mention_user}> {text}"
    elif mention_channel:
        text = f"<!channel> {text}"

    payload = json.dumps(
        {
            "channel": channel,
            "text": text,
            # <!channel> 링크가 실제 멘션으로 동작하도록
            "link_names": True,
        }
    ).encode("utf-8")

    req = urllib.request.Request(
        SLACK_POST_API,
        data=payload,
        headers={
            "Content-Type": "application/json; charset=utf-8",
            "Authorization": f"Bearer {token}",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = json.loads(resp.read().decode("utf-8"))
            if not body.get("ok"):
                logger.warning("Slack API error: %s", body.get("error"))
                return False
            return True
    except (urllib.error.URLError, TimeoutError, ValueError) as e:
        logger.warning("Slack 전송 실패: %s", e)
        return False
