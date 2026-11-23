"""Turn Nemotron's text tool calls into structured tool calls for CrewAI.

When the inference endpoint runs without a tool-call parser, Nemotron writes tool
calls into the reply text:

    <tool_call>
    <function=get_product_info>
    <parameter=topic>
    savings
    </parameter>
    </function>
    </tool_call>

and `tool_calls` is empty, so CrewAI never runs the tool. This interceptor rewrites
such replies into the standard `tool_calls` shape. Replies that already have
structured tool calls, or no `<tool_call>` text, pass through unchanged. Once the
endpoint parses tool calls itself, this has nothing to do.
"""

from __future__ import annotations

import json
import re
import uuid
from typing import Any

import httpx
from crewai.llms.hooks import BaseInterceptor

_CALL = re.compile(r"<tool_call>\s*(.*?)\s*(?:</tool_call>|$)", re.DOTALL)
_FUNCTION = re.compile(r"<function=([^>\s]+)>(.*?)(?:</function>|$)", re.DOTALL)
_PARAMETER = re.compile(r"<parameter=([^>\s]+)>\s*(.*?)\s*</parameter>", re.DOTALL)
_DROP_HEADERS = {"content-length", "content-encoding", "transfer-encoding"}


def _value(raw: str) -> Any:
    if raw[:1] in "[{":
        try:
            return json.loads(raw)
        except ValueError:
            pass
    return raw


def parse_tool_calls(content: str) -> tuple[str, list[dict[str, Any]]]:
    """Split reply text into the text before the first call and the parsed calls."""
    calls: list[dict[str, Any]] = []
    for block in _CALL.findall(content):
        function = _FUNCTION.search(block)
        if not function:
            continue
        arguments = {name: _value(raw) for name, raw in _PARAMETER.findall(function.group(2))}
        calls.append({
            "id": f"call_{uuid.uuid4().hex[:24]}",
            "type": "function",
            "function": {"name": function.group(1), "arguments": json.dumps(arguments)},
        })
    text = content.split("<tool_call>", 1)[0].strip() if calls else content
    return text, calls


def _rewrite(body: bytes) -> bytes | None:
    try:
        payload = json.loads(body)
        choice = payload["choices"][0]
        message = choice["message"]
    except (ValueError, KeyError, IndexError, TypeError):
        return None
    content = message.get("content") or ""
    if message.get("tool_calls") or "<tool_call>" not in content:
        return None
    text, calls = parse_tool_calls(content)
    if not calls:
        return None
    message["content"] = text or None
    message["tool_calls"] = calls
    choice["finish_reason"] = "tool_calls"
    return json.dumps(payload).encode()


def _replace(response: httpx.Response, body: bytes) -> httpx.Response:
    # Transport-level responses have no request yet; the client attaches it.
    headers = [(key, value) for key, value in response.headers.items() if key.lower() not in _DROP_HEADERS]
    return httpx.Response(response.status_code, headers=headers, content=body, extensions=response.extensions)


def _applies(response: httpx.Response) -> bool:
    return response.status_code == 200 and "application/json" in response.headers.get("content-type", "")


class NemotronToolCallInterceptor(BaseInterceptor[httpx.Request, httpx.Response]):
    def on_outbound(self, message: httpx.Request) -> httpx.Request:
        return message

    def on_inbound(self, message: httpx.Response) -> httpx.Response:
        if not _applies(message):
            return message
        body = message.read()
        rewritten = _rewrite(body)
        return _replace(message, rewritten if rewritten is not None else body)

    async def aon_outbound(self, message: httpx.Request) -> httpx.Request:
        return message

    async def aon_inbound(self, message: httpx.Response) -> httpx.Response:
        if not _applies(message):
            return message
        body = await message.aread()
        rewritten = _rewrite(body)
        return _replace(message, rewritten if rewritten is not None else body)
