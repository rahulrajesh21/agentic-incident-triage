import hashlib
import re
from pathlib import Path
from dotenv import load_dotenv
from langchain_community.document_loaders import DirectoryLoader, TextLoader
from langchain_core.documents import Document
from langchain_pinecone import PineconeEmbeddings, PineconeVectorStore
from langchain_text_splitters import MarkdownHeaderTextSplitter

load_dotenv()

BASE_DIR = Path(__file__).resolve().parents[2]
RUNBOOK_DIR = BASE_DIR / "sandbox" / "runbooks"


def load_files() -> list[Document]:
    loader = DirectoryLoader(
        path=str(RUNBOOK_DIR),
        glob="**/*.md",
        loader_cls=TextLoader,
        loader_kwargs={"encoding": "utf-8"},
    )
    return loader.load()


def format_markdown() -> list[Document]:
    docs = load_files()

    splitter = MarkdownHeaderTextSplitter(
        headers_to_split_on=[
            ("#", "Header 1"),
            ("##", "Header 2"),
            ("###", "Header 3"),
        ],
        strip_headers=False,
    )

    all_chunks: list[Document] = []
    for doc in docs:
        raw = doc.page_content
        filename = Path(doc.metadata.get("source", "unknown.md")).name

        # Extract file-level metadata so every section chunk inherits it
        updated_match = re.search(r"^updated:\s*(.+)$", raw, re.MULTILINE)
        status_match = re.search(r"^status:\s*(.+)$", raw, re.MULTILINE)
        updated_at = updated_match.group(1).strip() if updated_match else "unknown"
        status = status_match.group(1).strip() if status_match else "unknown"

        chunks = splitter.split_text(raw)
        for chunk in chunks:
            section = (
                chunk.metadata.get("Header 2")
                or chunk.metadata.get("Header 1")
                or chunk.metadata.get("Header 3")
            )
            # Skip the top metadata-only block that has no heading
            if not section:
                continue

            slug = section.strip().lower().replace(" ", "-")
            chunk.metadata = {
                **doc.metadata,
                **chunk.metadata,
                "doc_id": filename,
                "section": section,
                "reference_id": f"{filename}#{slug}",
                "updated_at": updated_at,
                "status": status,
                "document_type": "runbook",
            }
            all_chunks.append(chunk)

    return all_chunks


def ingest_runbooks() -> None:
    chunks = format_markdown()
    if not chunks:
        print("No markdown chunks found.")
        return

    vector_store = PineconeVectorStore(
        index_name="runbook",
        embedding=PineconeEmbeddings(model="llama-text-embed-v2"),
    )

    # Use reference_id for stable IDs so editing a runbook updates the vector in place
    ids = [
        hashlib.sha256(c.metadata["reference_id"].encode()).hexdigest()[:24]
        for c in chunks
    ]

    vector_store.add_documents(documents=chunks, ids=ids)
    print(f"Upserted {len(chunks)} chunks into Pinecone 'runbook' index.")


if __name__ == "__main__":
    ingest_runbooks()