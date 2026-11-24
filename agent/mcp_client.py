import os
import sys
import types
from typing import Any

# Compatibility bridge for langchain-mcp-adapters on mcp 2.x
try:
    import mcp.shared.context as _mcp_ctx
    if not hasattr(_mcp_ctx, "RequestContext"):
        _mcp_ctx.RequestContext = object
    if "mcp.shared.session" not in sys.modules:
        _sess_mod = types.ModuleType("mcp.shared.session")
        _sess_mod.ProgressFnT = object
        sys.modules["mcp.shared.session"] = _sess_mod

    import fastmcp.tools

    mcp_fastmcp = types.ModuleType("mcp.server.fastmcp")
    mcp_fastmcp_tools = types.ModuleType("mcp.server.fastmcp.tools")
    mcp_fastmcp_tools.Tool = fastmcp.tools.Tool
    mcp_fastmcp_utils = types.ModuleType("mcp.server.fastmcp.utilities.func_metadata")
    mcp_fastmcp_utils.ArgModelBase = type("ArgModelBase", (), {})
    mcp_fastmcp_utils.FuncMetadata = type("FuncMetadata", (), {})

    sys.modules["mcp.server.fastmcp"] = mcp_fastmcp
    sys.modules["mcp.server.fastmcp.tools"] = mcp_fastmcp_tools
    sys.modules["mcp.server.fastmcp.utilities"] = types.ModuleType("mcp.server.fastmcp.utilities")
    sys.modules["mcp.server.fastmcp.utilities.func_metadata"] = mcp_fastmcp_utils
except Exception:
    pass

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
