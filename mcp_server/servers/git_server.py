import re
import subprocess
from pathlib import Path
from fastmcp import FastMCP
from fastmcp.exceptions import ToolError

mcp = FastMCP("git-mcp")

BASE_DIR = Path(__file__).resolve().parents[2]
REPO_DIR = BASE_DIR / "sandbox" / "mock_repo"
SHA_PATTERN = re.compile(r"^[0-9a-f]{7,40}$")


def run_git(args: list[str]) -> str:
    """Run a git command inside sandbox/mock_repo and return its stdout."""
    result = subprocess.run(
        ["git", "-C", str(REPO_DIR), *args],
        capture_output=True,
        text=True,
        timeout=5,
        check=False,
    )
    if result.returncode != 0:
        raise ToolError(f"Git error: {result.stderr.strip()}")
    return result.stdout


@mcp.tool(annotations={"readOnlyHint": True, "destructiveHint": False})
async def get_recent_commits(service_path: str = "", limit: int = 10) -> dict:
    """List recent commits (SHA, date, author, message), optionally filtered by service folder."""
    args = ["log", f"-n{min(max(limit, 1), 25)}", "--pretty=format:%h|%aI|%an|%s"]
    if service_path.strip():
        args.extend(["--", service_path.strip()])

    output = run_git(args)
    commits = []
    for line in output.splitlines():
        sha, date_iso, author, message = line.split("|", 3)
        commits.append({
            "sha": sha,
            "date": date_iso,
            "author": author,
            "message": message,
        })

    return {"count": len(commits), "commits": commits}


@mcp.tool(annotations={"readOnlyHint": True, "destructiveHint": False})
async def get_commit_diff(sha: str) -> dict:
    """Show the code diff for a specific commit SHA."""
    clean_sha = sha.strip().lower()
    if not SHA_PATTERN.match(clean_sha):
        raise ToolError(f"Invalid SHA: {sha}")

    diff = run_git(["show", "--stat", "--patch", clean_sha])
    return {
        "sha": clean_sha,
        "truncated": len(diff) > 4000,
        "diff": diff[:4000],
    }


if __name__ == "__main__":
    mcp.run(transport="streamable-http", host="0.0.0.0", port=8002)