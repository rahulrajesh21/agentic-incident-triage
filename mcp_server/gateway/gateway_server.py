from fastmcp import FastMCP
from fastmcp.server import create_proxy
import os


TELEMETRY_URL = os.getenv("TELEMETRY_MCP_URL", "http://127.0.0.1:8001/mcp")
GIT_URL = os.getenv("GIT_MCP_URL", "http://127.0.0.1:8002/mcp")
RUNBOOK_URL = os.getenv("RUNBOOK_MCP_URL", "http://127.0.0.1:8003/mcp")

gateway = FastMCP("tracegate-readonly-gateway",
                  instructions=(
                    "Read-only incident investigation gateway exposing telemetry, git history, "
                    "and operational runbooks. Write/remediation actions are intentionally excluded."
                  )
                )


gateway.mount(create_proxy(TELEMETRY_URL),namespace="telemetry")
gateway.mount(create_proxy(GIT_URL),namespace="git")
gateway.mount(create_proxy(RUNBOOK_URL),namespace="runbook")




if __name__ == "__main__":
    gateway.run(transport="streamable-http",host="0.0.0.0",port=8010)