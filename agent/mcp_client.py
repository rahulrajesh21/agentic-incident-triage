import json
import os
from typing import Any

from fastmcp import Client
from langchain_core.tools import BaseTool, StructuredTool

GATEWAY_MCP_URL = os.getenv("GATEWAY_MCP_URL", "http://127.0.0.1:8010/mcp")
REMEDIATION_MCP_URL = os.getenv("REMEDIATION_MCP_URL", "http://127.0.0.1:8004/mcp")

ALLOWED_WRITE_TOOLS = {"escalate_incident", "trigger_rollback"}


def _format_call_result(result: Any) -> str:
    """Extract clean text/JSON string from a FastMCP CallToolResult."""
    structured = getattr(result, "structured_content", None)
    if structured is not None:
        return json.dumps(structured, default=str)

    blocks = getattr(result, "content", None) or []
    parts: list[str] = []
    for block in blocks:
        text = getattr(block, "text", None)
        parts.append(text if text is not None else str(block))
    if parts:
        return "\n".join(parts)

    data = getattr(result, "data", None)
    if data is not None:
        return json.dumps(data, default=str) if isinstance(data, (dict, list)) else str(data)
    return str(result)


def _to_langchain_tool(mcp_tool: Any) -> BaseTool:
    """Wrap a read-only MCP tool definition as a LangChain StructuredTool via FastMCP Client."""
    tool_name: str = mcp_tool.name
    description: str = mcp_tool.description or f"Read-only MCP tool '{tool_name}'."
    schema: dict[str, Any] = getattr(mcp_tool, "input_schema", None) or {
        "type": "object",
        "properties": {},
    }

    async def _invoke(**kwargs: Any) -> str:
        async with Client(GATEWAY_MCP_URL) as client:
            result = await client.call_tool(tool_name, kwargs, raise_on_error=False)
        formatted = _format_call_result(result)
        if getattr(result, "is_error", False):
            return f"TOOL_ERROR ({tool_name}): {formatted}"
        return formatted

    return StructuredTool.from_function(
        coroutine=_invoke,
        name=tool_name,
        description=description,
        args_schema=schema,
    )


async def load_tools() -> list[BaseTool]:
    """Load read-only tools from the Gateway (:8010) and reject any leaked write tools."""
    async with Client(GATEWAY_MCP_URL) as client:
        mcp_tools = await client.list_tools()

    leaked_tools = [
        tool.name
        for tool in mcp_tools
        if any(forbidden in tool.name for forbidden in ALLOWED_WRITE_TOOLS)
    ]
    if leaked_tools:
        raise RuntimeError(
            f"Security boundary violated: write tools exposed on read-only gateway: {leaked_tools}"
        )

    return [_to_langchain_tool(tool) for tool in mcp_tools]


load_readonly_tools = load_tools


async def call_remediation_tool(
    tool_name: str,
    arguments: dict[str, Any],
) -> dict[str, Any]:
    """Deterministically invoke a write-gated tool on Remediation MCP (:8004)."""
    if tool_name not in ALLOWED_WRITE_TOOLS:
        raise ValueError(f"Unsupported remediation tool: {tool_name}")

    if not str(arguments.get("approved_by", "")).strip():
        raise ValueError("Refusing write call without non-empty 'approved_by'.")

    if not str(arguments.get("idempotency_key", "")).strip():
        raise ValueError("Refusing write call without non-empty 'idempotency_key'.")

    async with Client(REMEDIATION_MCP_URL) as client:
        result = await client.call_tool(tool_name, arguments)

    if getattr(result, "structured_content", None) is not None:
        return result.structured_content
    if getattr(result, "data", None) is not None:
        return result.data
    return {"raw_result": str(result)}
