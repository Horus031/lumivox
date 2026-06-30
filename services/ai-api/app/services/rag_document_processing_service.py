import os
import io
import re
import time
from dataclasses import dataclass
from typing import Any
from dotenv import load_dotenv

load_dotenv()

from google import genai
from google.genai import types
from pypdf import PdfReader
from supabase import create_client


LEARNING_DOCUMENT_BUCKET = "learning-documents"


@dataclass
class LearningDocument:
    id: str
    owner_id: str
    file_name: str
    file_path: str
    mime_type: str


def _get_supabase_admin():
    supabase_url = os.getenv("SUPABASE_URL")
    service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        
    if not supabase_url or not service_role_key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured."
        )

    return create_client(supabase_url, service_role_key)


def _configure_gemini():
    api_key = os.getenv("GEMINI_API_KEY")

    if not api_key:
        raise RuntimeError("GEMINI_API_KEY must be configured.")

    return genai.Client(api_key=api_key)


def _clean_text(text: str) -> str:
    text = text.replace("\x00", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _extract_text_from_pdf(file_bytes: bytes) -> str:
    reader = PdfReader(io.BytesIO(file_bytes))
    pages: list[str] = []

    for page in reader.pages:
        page_text = page.extract_text() or ""
        if page_text.strip():
            pages.append(page_text)

    return _clean_text("\n\n".join(pages))


def _extract_text_from_plain_file(file_bytes: bytes) -> str:
    try:
        return _clean_text(file_bytes.decode("utf-8"))
    except UnicodeDecodeError:
        return _clean_text(file_bytes.decode("latin-1", errors="ignore"))


def _extract_text(file_bytes: bytes, mime_type: str, file_name: str) -> str:
    lowered_name = file_name.lower()

    if mime_type == "application/pdf" or lowered_name.endswith(".pdf"):
        return _extract_text_from_pdf(file_bytes)

    if (
        mime_type in {"text/plain", "text/markdown"}
        or lowered_name.endswith(".txt")
        or lowered_name.endswith(".md")
    ):
        return _extract_text_from_plain_file(file_bytes)

    raise ValueError(
        "Unsupported file type for text extraction. Only PDF, TXT and Markdown are supported in this version."
    )


def _chunk_text(
    text: str,
    chunk_size: int,
    overlap: int,
    max_chunks: int,
) -> list[str]:
    cleaned = _clean_text(text)

    if not cleaned:
        return []

    if chunk_size <= 0:
        chunk_size = 1800

    if overlap < 0:
        overlap = 0

    if overlap >= chunk_size:
        overlap = max(0, chunk_size // 5)

    chunks: list[str] = []
    start = 0
    text_length = len(cleaned)

    while start < text_length and len(chunks) < max_chunks:
        end = min(start + chunk_size, text_length)
        chunk = cleaned[start:end].strip()

        if chunk:
            chunks.append(chunk)

        if end >= text_length:
            break

        start = end - overlap

    return chunks


def _estimate_tokens(text: str) -> int:
    # Rough estimate: English/Vietnamese mixed text often averages around 3–4 chars/token.
    return max(1, len(text) // 4)


def _generate_embedding(text: str) -> list[float]:
    client = _configure_gemini()

    model_name = os.getenv("GEMINI_EMBEDDING_MODEL", "gemini-embedding-001")

    result = client.models.embed_content(
        model=model_name,
        contents=text,
        config=types.EmbedContentConfig(output_dimensionality=768)
    )
    
    
    [embedding] = result.embeddings
    embedding_length = len(embedding.values)
    
    if not embedding:
        raise RuntimeError("Gemini did not return an embedding.")

    if embedding_length != 768:
        raise RuntimeError(
            f"Embedding dimension mismatch. Expected 768, got {len(embedding_length)}. "
            "Update the document_chunks.embedding vector dimension if you choose another embedding model."
        )

    return embedding.values


def _to_pgvector_literal(values: list[float]) -> str:
    return "[" + ",".join(str(float(value)) for value in values) + "]"


def _fetch_document(
    supabase: Any,
    document_id: str,
    user_id: str,
) -> LearningDocument:
    response = (
        supabase.table("learning_documents")
        .select("id,owner_id,file_name,file_path,mime_type")
        .eq("id", document_id)
        .single()
        .execute()
    )

    document = response.data

    if not document:
        raise ValueError("Document not found.")

    if document["owner_id"] != user_id:
        raise PermissionError("Only the document owner can process this document.")

    return LearningDocument(
        id=document["id"],
        owner_id=document["owner_id"],
        file_name=document["file_name"],
        file_path=document["file_path"],
        mime_type=document["mime_type"],
    )


def _update_document_status(
    supabase: Any,
    document_id: str,
    status: str,
    preview: str | None = None,
) -> None:
    payload: dict[str, Any] = {
        "extracted_text_status": status,
    }

    if preview is not None:
        payload["extracted_text_preview"] = preview[:1200]

    supabase.table("learning_documents").update(payload).eq(
        "id",
        document_id,
    ).execute()


def process_learning_document(
    document_id: str,
    user_id: str,
) -> dict[str, Any]:
    started_at = time.perf_counter()

    supabase = _get_supabase_admin()

    document = _fetch_document(
        supabase=supabase,
        document_id=document_id,
        user_id=user_id,
    )

    _update_document_status(
        supabase=supabase,
        document_id=document.id,
        status="processing",
    )

    try:
        file_bytes = supabase.storage.from_(LEARNING_DOCUMENT_BUCKET).download(
            document.file_path
        )

        extracted_text = _extract_text(
            file_bytes=file_bytes,
            mime_type=document.mime_type,
            file_name=document.file_name,
        )

        if not extracted_text:
            _update_document_status(
                supabase=supabase,
                document_id=document.id,
                status="failed",
                preview="",
            )

            return {
                "document_id": document.id,
                "status": "failed",
                "chunk_count": 0,
                "message": "No extractable text was found in this document.",
            }

        chunk_size = int(os.getenv("RAG_CHUNK_SIZE_CHARS", "1800"))
        overlap = int(os.getenv("RAG_CHUNK_OVERLAP_CHARS", "250"))
        max_chunks = int(os.getenv("RAG_MAX_CHUNKS_PER_DOCUMENT", "80"))

        chunks = _chunk_text(
            text=extracted_text,
            chunk_size=chunk_size,
            overlap=overlap,
            max_chunks=max_chunks,
        )

        if not chunks:
            _update_document_status(
                supabase=supabase,
                document_id=document.id,
                status="failed",
                preview=extracted_text,
            )

            return {
                "document_id": document.id,
                "status": "failed",
                "chunk_count": 0,
                "message": "Text extraction succeeded, but no chunks were created.",
            }

        # Re-processing should replace old chunks for the same document.
        supabase.table("document_chunks").delete().eq(
            "document_id",
            document.id,
        ).execute()

        embedding_model = os.getenv("GEMINI_EMBEDDING_MODEL", "text-embedding-004")

        rows: list[dict[str, Any]] = []

        for index, chunk in enumerate(chunks):
            embedding = _generate_embedding(chunk)

            rows.append(
                {
                    "document_id": document.id,
                    "owner_id": document.owner_id,
                    "chunk_index": index,
                    "content": chunk,
                    "content_char_count": len(chunk),
                    "token_estimate": _estimate_tokens(chunk),
                    "embedding": _to_pgvector_literal(embedding),
                    "embedding_model": embedding_model,
                    "status": "embedded",
                    "metadata": {
                        "file_name": document.file_name,
                        "mime_type": document.mime_type,
                        "chunk_size_chars": chunk_size,
                        "chunk_overlap_chars": overlap,
                    },
                }
            )

        # Insert in small batches to avoid payload size issues.
        batch_size = 20

        for start in range(0, len(rows), batch_size):
            batch = rows[start : start + batch_size]
            supabase.table("document_chunks").insert(batch).execute()

        _update_document_status(
            supabase=supabase,
            document_id=document.id,
            status="completed",
            preview=extracted_text,
        )

        latency_ms = int((time.perf_counter() - started_at) * 1000)

        return {
            "document_id": document.id,
            "status": "completed",
            "chunk_count": len(rows),
            "message": f"Document processed successfully in {latency_ms}ms.",
        }

    except ValueError as error:
        message = str(error)

        unsupported = "Unsupported file type" in message

        _update_document_status(
            supabase=supabase,
            document_id=document.id,
            status="unsupported" if unsupported else "failed",
        )

        return {
            "document_id": document.id,
            "status": "unsupported" if unsupported else "failed",
            "chunk_count": 0,
            "message": message,
        }

    except Exception as error:
        _update_document_status(
            supabase=supabase,
            document_id=document.id,
            status="failed",
        )

        raise RuntimeError(f"Failed to process learning document: {error}") from error