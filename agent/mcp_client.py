import os
from typing import Any

from langchain.tools import BaseTool
from langchain_mcp_adapters.client import MultiServerMCPClient
from fastmcp import Client

GATEWAY_MCP_URL = os.getenv("GATEWAY_MCP_URL", "http://127.0.0.1:8010/mcp")
REMEDIATION_MCP_URL = os.getenv("REMEDIATION_MCP_URL", "http://127.0.0.1:8004/mcp")

ALLOWED_WRITE_TOOLS = {"escalate_incident","trigger_rollback"}


async def load_tools() -> list[BaseTool]:
    client = MultiServerMCPClient(
        {
            "tracegate-readonly-gateway": {
                "transport": "streamable_http",
                "url": GATEWAY_MCP_URL,
            }
        }
    )
    tools = await client.get_tools()
    leaked_tools = [
        tool.name
        for tool in tools
        if any(forbidden in tool.name for forbidden in ALLOWED_WRITE_TOOLS)
    ]

    if leaked_tools:
        raise RuntimeError(
            f"Security boundary violated: write tools exposed on read-only gateway: {leaked_tools}"
        )
    return tools


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
