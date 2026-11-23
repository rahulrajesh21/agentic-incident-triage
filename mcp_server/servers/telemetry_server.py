from fastmcp import FastMCP
import sqlite3
import os
mcp = FastMCP("telemetry-mcp")

DB_PATH = os.getenv("TELEMETRY_DB", "sandbox/telemetry.db")

LEVEL_ORDER ={
    "INFO":0,
    "WARN":1,
    "ERROR":2,
    "CRITICAL":3
}

def query(sql:str,params:tuple=())->list[dict]:
    con = sqlite3.connect(f"file:{DB_PATH}?mode=ro",uri=True)
    con.row_factory = sqlite3.Row

    try:
        return [dict(r) for r in con.execute(sql,params).fetchall()]
    finally:
        con.close()


@mcp.tool()
def list_services():
    rows = query("SELECT DISTINCT service FROM metrics ORDER BY service ")
    return [r["service"] for r in rows]

@mcp.tool()
def search_logs(
        service_name:str,
        min_level:str = "ERROR",
        start_time:str="",
        end_time:str="",
        limit:int = 20,
)->list[dict]:

    level = LEVEL_ORDER.get(min_level,2)
    allowed_level = [ k for k,v in LEVEL_ORDER.items() if v >= level]
    rows = query(f"SELECT message,level,strack_trace FROM logs WHERE service = ? and level IN ({level}) AND timestamp >= ? AND timestamp <= ? ORDER BY timestamp LIMIT ?",tuple(service_name,start_time,end_time,limit))

    return rows

@mcp.tool
def get_trace(trace_id:str)->list[str]:
    return query(f"SELECT service,timestamp,level,message,stacl_trace FROM logs WHERE trace_id = ? ORDER BY timestamp",tuple(trace_id))


@mcp.tool
def get_metrices(service_name:str,
                 start_time:str="",
                 end_time:str=""
                 )->list[dict]:
    rows = query("SELECT timestamp,error_rate_pct,p95_latency_ms,db_pool_used,db_pool_max FROM metrics WHERE service=? AND time ORDER BY timestamp >= ? AND timestamp <= ?",tuple(service_name,start_time,end_time))
    return rows

@mcp.tool()
def detect_anomaly(service: str, error_rate_jump_pct: float = 5.0) -> dict:
    """Compare the first and latest metrics of a service and say if it got worse."""
    rows = query(
        "SELECT * FROM metrics WHERE service = ? ORDER BY timestamp", (service,)
    )
    if len(rows) < 2:
        return {"service": service, "anomaly": False, "reason": "not enough data"}

    before, after = rows[0], rows[-1]
    jump = after["error_rate_pct"] - before["error_rate_pct"]
    pool_full = after["db_pool_used"] >= after["db_pool_max"]
    return {
        "service": service,
        "anomaly": jump >= error_rate_jump_pct,
        "error_rate_before": before["error_rate_pct"],
        "error_rate_after": after["error_rate_pct"],
        "latency_before_ms": before["p95_latency_ms"],
        "latency_after_ms": after["p95_latency_ms"],
        "db_pool_exhausted": pool_full,
        "window": [before["timestamp"], after["timestamp"]],
    }


if __name__ == "__main__":
    mcp.run(transport="streamable-http")