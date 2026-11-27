import os
import io
import re
import time
from dataclasses import dataclass
from uuid import uuid4
from dotenv import load_dotenv

load_dotenv()

from google import genai
from google.genai import types
from pypdf import PdfReader
from app.clients.supabase_client import get_supabase_client
from app.core.config import settings
from app.security.rag_dispatch import before_rag_dispatch, rag_dispatch_authorization, require_rag_dispatch_authorization
from app.security.rag_privacy import sanitize_rag_text
from app.services.rag_conversation_store import RagConversationError, _call_rpc


LEARNING_DOCUMENT_BUCKET = "learning-documents"


@dataclass
class LearningDocument:
    id: str
    owner_id: str
    file_name: str
    file_path: str
    mime_type: str


def _get_supabase_admin():
    return get_supabase_client()


def _configure_gemini():
    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY must be configured.")

    return genai.Client(api_key=settings.gemini_api_key)


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
    if settings.rag_privacy_filter_enabled:
        text = sanitize_rag_text(text, target="provider")
    require_rag_dispatch_authorization()
    client = _configure_gemini()
    before_rag_dispatch(text)

    model_name = settings.gemini_embedding_model

    result = client.models.embed_content(
        model=model_name,
        contents=text,
        config=types.EmbedContentConfig(
            output_dimensionality=768,
            http_options=types.HttpOptions(retry_options=types.HttpRetryOptions(attempts=1)),
        )
    )
    
    
    [embedding] = result.embeddings
    embedding_length = len(embedding.values)
    
    if not embedding:
        raise RuntimeError("Gemini did not return an embedding.")

    if embedding_length != 768:
        raise RuntimeError(
            f"Embedding dimension mismatch. Expected 768, got {embedding_length}. "
            "Update the document_chunks.embedding vector dimension if you choose another embedding model."
        )

    return embedding.values


def _to_pgvector_literal(values: list[float]) -> str:
    return "[" + ",".join(str(float(value)) for value in values) + "]"


def process_learning_document(
    document_id: str,
    user_id: str,
) -> dict:
    started_at = time.perf_counter()
    supabase = _get_supabase_admin()
    identity = {"p_document_id": document_id, "p_user_id": user_id, "p_operation_id": str(uuid4())}
    document = LearningDocument(**_call_rpc(supabase, "rag_begin_document_processing", identity))

    def authorize_dispatch() -> None:
        if _call_rpc(supabase, "rag_assert_document_processing", identity) is not True:
            raise RagConversationError("RAG_PERSISTENCE_UNAVAILABLE", 503)

    def finish(status: str, *, preview: str | None = None, rows: list[dict] | None = None) -> int:
        count = _call_rpc(supabase, "rag_finish_document_processing", {
            **identity, "p_status": status, "p_preview": preview, "p_chunks": rows,
        })
        if type(count) is not int:
            raise RagConversationError("RAG_PERSISTENCE_UNAVAILABLE", 503)
        return count

    try:
        file_bytes = supabase.storage.from_(LEARNING_DOCUMENT_BUCKET).download(document.file_path)
        extracted_text = _extract_text(file_bytes, document.mime_type, document.file_name)
        chunk_size = int(os.getenv("RAG_CHUNK_SIZE_CHARS", "1800"))
        overlap = int(os.getenv("RAG_CHUNK_OVERLAP_CHARS", "250"))
        max_chunks = int(os.getenv("RAG_MAX_CHUNKS_PER_DOCUMENT", "80"))
        chunks = _chunk_text(extracted_text, chunk_size=chunk_size, overlap=overlap, max_chunks=max_chunks)
        if not chunks:
            finish("failed", preview="")
            return {
                "document_id": document.id, "status": "failed", "chunk_count": 0,
                "message": ("Text extraction succeeded, but no chunks were created."
                            if extracted_text else "No extractable text was found in this document."),
            }

        rows = []
        with rag_dispatch_authorization(authorize_dispatch):
            for index, chunk in enumerate(chunks):
                embedding = _generate_embedding(chunk)
                rows.append({
                    "chunk_index": index, "content": chunk, "token_estimate": _estimate_tokens(chunk),
                    "embedding": _to_pgvector_literal(embedding), "embedding_model": settings.gemini_embedding_model,
                    "metadata": {
                        "file_name": document.file_name, "mime_type": document.mime_type,
                        "chunk_size_chars": chunk_size, "chunk_overlap_chars": overlap,
                    },
                })
        chunk_count = finish("completed", preview=extracted_text, rows=rows)
        latency_ms = int((time.perf_counter() - started_at) * 1000)
        return {
            "document_id": document.id, "status": "completed", "chunk_count": chunk_count,
            "message": f"Document processed successfully in {latency_ms}ms.",
        }
    except RagConversationError:
        raise
    except ValueError as error:
        unsupported = "Unsupported file type" in str(error)
        status = "unsupported" if unsupported else "failed"
        finish(status)
        return {
            "document_id": document.id, "status": status, "chunk_count": 0,
            "message": "RAG_UNSUPPORTED_DOCUMENT" if unsupported else "RAG_INVALID_DOCUMENT",
        }
    except Exception:
        # A deleted or superseded operation must not update the replacement job.
        try:
            finish("failed")
        except RagConversationError:
            pass
        raise RuntimeError("RAG_DOCUMENT_PROCESSING_FAILED") from None
