"""LLM adapter — the effect edge. AsyncOpenAI against any OpenAI-compatible endpoint (DeepSeek by
default via LLM_BASE_URL); errors mapped into the Result channel. Implements LLMClient. Provider-
neutral: swap the base URL for any compatible model."""

from __future__ import annotations

import json
from typing import Any

from openai import AsyncOpenAI, OpenAIError
from returns.result import Failure, Result, Success

from orchestrator.domain.agent import LLMTurn, ToolCall


class DeepSeekClient:
    def __init__(self, base_url: str, api_key: str, model: str) -> None:
        self._client = AsyncOpenAI(base_url=base_url, api_key=api_key)
        self._model = model

    async def generate(
        self, messages: list[dict[str, Any]], tools: list[dict[str, Any]]
    ) -> Result[LLMTurn, str]:
        try:
            resp = await self._client.chat.completions.create(
                model=self._model,
                messages=messages,  # type: ignore[arg-type]
                tools=tools or None,  # type: ignore[arg-type]
            )
        except OpenAIError as exc:
            return Failure(f"deepseek generate: {exc}")

        message = resp.choices[0].message
        calls: list[ToolCall] = []
        for tc in message.tool_calls or []:
            fn = getattr(tc, "function", None)
            if fn is None:  # custom (non-function) tool calls — not used here
                continue
            try:
                args = json.loads(fn.arguments or "{}")
            except json.JSONDecodeError:
                args = {}
            calls.append(ToolCall(id=tc.id, name=fn.name, arguments=args))

        return Success(
            LLMTurn(
                content=message.content,
                tool_calls=tuple(calls),
                assistant_message=message.model_dump(exclude_none=True),
            )
        )
