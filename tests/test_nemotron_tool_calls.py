from __future__ import annotations

import json

import httpx

from src.llm.nemotron_tool_calls import NemotronToolCallInterceptor, parse_tool_calls

TEXT_CALL = "\n<tool_call>\n<function=get_product_info>\n<parameter=topic>\nbranch hours\n</parameter>\n</function>\n</tool_call>\n"


def _response(message: dict) -> httpx.Response:
    body = {"choices": [{"index": 0, "finish_reason": "stop", "message": {"role": "assistant", **message}}]}
    return httpx.Response(200, json=body)


def test_parses_text_tool_call() -> None:
    text, calls = parse_tool_calls("Let me check." + TEXT_CALL)
    assert text == "Let me check."
    assert calls[0]["function"]["name"] == "get_product_info"
    assert json.loads(calls[0]["function"]["arguments"]) == {"topic": "branch hours"}


def test_rewrites_reply_into_tool_calls() -> None:
    out = NemotronToolCallInterceptor().on_inbound(_response({"content": TEXT_CALL, "tool_calls": []}))
    choice = out.json()["choices"][0]
    assert choice["finish_reason"] == "tool_calls"
    assert choice["message"]["content"] is None
    assert choice["message"]["tool_calls"][0]["function"]["name"] == "get_product_info"


def test_leaves_normal_replies_alone() -> None:
    out = NemotronToolCallInterceptor().on_inbound(_response({"content": "We open at 9am.", "tool_calls": []}))
    assert out.json()["choices"][0]["message"] == {"role": "assistant", "content": "We open at 9am.", "tool_calls": []}
