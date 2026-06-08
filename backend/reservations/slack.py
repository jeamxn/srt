"""Slack 알림 유틸.

bot token(xoxb-)으로 chat.postMessage 를 호출한다.
환경변수가 없으면 조용히 무시한다(로컬 개발 편의).
"""
from __future__ import annotations

import json
import logging
import urllib.request
import urllib.error

from django.conf import settings

logger = logging.getLogger(__name__)

SLACK_API = "https://slack.com/api/chat.postMessage"


def send_slack(text: str, mention_channel: bool = False) -> bool:
    """Slack 채널로 메시지를 보낸다.

    Args:
        text: 보낼 메시지 본문
        mention_channel: True 면 맨 앞에 <!channel> 멘션을 붙인다.

    Returns:
        성공 여부 (설정 누락/실패 시 False)
    """
    token = getattr(settings, "SLACK_BOT_TOKEN", "")
    channel = getattr(settings, "SLACK_CHANNEL_ID", "")
    if not token or not channel:
        return False

    if mention_channel:
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
        SLACK_API,
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
