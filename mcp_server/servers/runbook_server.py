import asyncio
from dotenv import load_dotenv
from fastmcp import FastMCP
from langchain_community.retrievers.bm25 import BM25Retriever
from langchain_pinecone import PineconeEmbeddings, PineconeVectorStore

from mcp_server.servers.runbook_ingest import format_markdown
# from mcp_server.chaos import maybe_inject_chaos  # uncomment when ready

load_dotenv()

vector_store = PineconeVectorStore(
    index_name="runbook",
    embedding=PineconeEmbeddings(model="llama-text-embed-v2"),
)

# Fixed: classmethod call (no parentheses after BM25Retriever)
bm25_retriever = BM25Retriever.from_documents(
    documents=format_markdown(),
    k=4,
)

mcp = FastMCP("runbook-mcp")


async def reciprocal_rank_fusion(query: str, top_k: int = 4) -> list[dict]:
    keyword_docs, dense_docs = await asyncio.gather(
        bm25_retriever.ainvoke(input=query),
        vector_store.asimilarity_search(query=query, k=4),
    )

    scores: dict[str, float] = {}
    document_map = {}

    for results in (keyword_docs, dense_docs):
        for rank, doc in enumerate(results, start=1):
            doc_id = doc.metadata.get("reference_id") or doc.page_content

            if doc_id not in scores:
                scores[doc_id] = 0.0
                document_map[doc_id] = doc

            scores[doc_id] += 1.0 / (60 + rank)

    # Fixed: scores.keys() with parentheses
    ranked_ids = sorted(
        scores.keys(),
        key=lambda doc_id: scores[doc_id],
        reverse=True,
    )[:top_k]

    # Convert LangChain Documents into JSON-serializable dicts for FastMCP
    return [
        {
            "content": document_map[doc_id].page_content,
            "metadata": document_map[doc_id].metadata,
            "rrf_score": round(scores[doc_id], 4),
        }
        for doc_id in ranked_ids
    ]


@mcp.tool(annotations={"readOnlyHint": True, "destructiveHint": False})
async def search_runbooks(query: str, top_k: int = 4) -> dict:
    """Hybrid BM25 + Pinecone search over operational runbooks."""
    # await maybe_inject_chaos("runbook")
    results = await reciprocal_rank_fusion(query=query, top_k=min(max(top_k, 1), 8))
    return {"query": query, "count": len(results), "results": results}


if __name__ == "__main__":
    mcp.run(transport="streamable-http", host="0.0.0.0", port=8003)