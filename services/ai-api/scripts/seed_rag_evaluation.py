"""Seed or clean one disposable Phase 6E corpus in local Supabase."""

import argparse
import json
from pathlib import Path
from uuid import UUID, uuid5

from app.clients.supabase_client import get_supabase_client
from app.core.config import settings
from app.services.rag_document_processing_service import LEARNING_DOCUMENT_BUCKET, process_learning_document
from evaluation.rag_dataset import load_frozen_dataset, sha256
from evaluation.rag_environment import configure_isolated_environment, validate_run_id


EVAL_NAMESPACE = UUID("4523ff6a-f886-438c-8ac9-c804487a5244")


def run_uuid(corpus_id, label):
    return str(uuid5(EVAL_NAMESPACE, f"{corpus_id}/{label}"))


def email_for(corpus_id, label):
    return f"rag-eval-{corpus_id}-{label}@example.invalid"


def append_record(file, state):
    file.seek(0)
    json.dump(state, file, indent=2, ensure_ascii=False)
    file.truncate()
    file.flush()


def seed(db, dataset, run_id, output):
    root = dataset.parent
    _, frozen = load_frozen_dataset(dataset)
    existing = next((bucket for bucket in db.storage.list_buckets() if bucket.id == LEARNING_DOCUMENT_BUCKET), None)
    if existing is None:
        db.storage.create_bucket(LEARNING_DOCUMENT_BUCKET, options={"public": False})
    elif existing.public:
        raise ValueError("Evaluation requires a private learning document bucket")
    bucket = db.storage.from_(LEARNING_DOCUMENT_BUCKET)
    state = {
        "run_id": run_id, "target": settings.supabase_url, "corpus_version": frozen["corpus_version"],
        "freeze_sha256": sha256(root / "manifest.json"), "embedding_model": settings.gemini_embedding_model,
        "embedding_dimensions": 768, "complete": False, "users": {}, "documents": {}, "storage_paths": [],
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("x", encoding="utf-8") as file:
        append_record(file, state)
        for label in ("owner", "distractor"):
            user = db.auth.admin.create_user({"email": email_for(run_id, label), "email_confirm": True}).user
            state["users"][label] = str(user.id)
            append_record(file, state)
            db.table("goals").insert({
                "id": run_uuid(run_id, f"goal/{label}"), "user_id": str(user.id),
                "title": "Synthetic RAG evaluation", "goal_type": "short_term",
            }).execute()

        for key, document in frozen["documents"].items():
            ingest_document(db, bucket, state, file, key, (root / document["path"]).read_bytes(),
                            document["evidence"], "owner")
        ingest_document(
            db, bucket, state, file, "unauthorized_distractor",
            b"Private fictional LX-204 review worksheet. Marker EVAL_PRIVATE_DISTRACTOR.",
            {}, "distractor",
        )
        state["complete"] = True
        append_record(file, state)


def ingest_document(db, bucket, state, file, key, payload, evidence, label):
    run_id = state["run_id"]
    user_id = state["users"][label]
    document_id = run_uuid(run_id, f"document/{key}")
    filename = f"{key}.txt"
    path = f"{user_id}/rag-eval-{run_id}/{filename}"
    state["storage_paths"].append(path)
    append_record(file, state)
    bucket.upload(path, payload, {"content-type": "text/plain"})
    db.table("learning_documents").insert({
        "id": document_id, "owner_id": user_id, "goal_id": run_uuid(run_id, f"goal/{label}"),
        "file_name": filename, "file_path": path, "mime_type": "text/plain", "file_size_bytes": len(payload),
    }).execute()
    result = process_learning_document(document_id, user_id)
    if result["status"] != "completed":
        raise RuntimeError("Synthetic document ingestion failed")
    chunks = db.table("document_chunks").select("id,content").eq("document_id", document_id).execute().data
    mapped = {name: [str(chunk["id"]) for chunk in chunks if passage in chunk["content"]]
              for name, passage in evidence.items()}
    if not all(mapped.values()) or not chunks:
        raise ValueError(f"Synthetic passage was lost during chunking: {key}")
    # This control is selected and readable, with no searchable vectors.
    if key == "no_matching_evidence":
        db.table("document_chunks").update({"embedding": None}).eq("document_id", document_id).execute()
    state["documents"][key] = {
        "document_id": document_id, "evidence": mapped, "chunk_count": len(chunks), "owner": label,
    }
    append_record(file, state)


def verify_identity(db, run_id, label, user_id):
    user_id = str(UUID(user_id))
    user = db.auth.admin.get_user_by_id(user_id).user
    if user.email != email_for(run_id, label):
        raise ValueError("Corpus owner does not belong to the specified evaluation run")


def cleanup(db, state, run_id):
    if state["target"] != settings.supabase_url or state["run_id"] != run_id:
        raise ValueError("Run or target differs from the original seed")
    for label, user_id in state["users"].items():
        verify_identity(db, run_id, label, user_id)
    prefixes = tuple(f"{user_id}/rag-eval-{run_id}/" for user_id in state["users"].values())
    paths = state["storage_paths"]
    if any(not path.startswith(prefixes) or "/" in path.split("/", 2)[-1] for path in paths):
        raise ValueError("Manifest contains storage outside its evaluation run")
    if paths:
        db.storage.from_(LEARNING_DOCUMENT_BUCKET).remove(paths)
    for user_id in state["users"].values():
        db.auth.admin.delete_user(user_id)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=("seed", "cleanup"))
    parser.add_argument("--dataset", type=Path, default=Path("evaluation/comparative_v1/quality_cases.jsonl"))
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--corpus-manifest", type=Path, required=True)
    args = parser.parse_args()
    validate_run_id(args.run_id)
    configure_isolated_environment(embedding=args.operation == "seed")
    db = get_supabase_client()
    if args.operation == "cleanup":
        cleanup(db, json.loads(args.corpus_manifest.read_text(encoding="utf-8")), args.run_id)
    else:
        settings.rag_privacy_filter_enabled = True
        seed(db, args.dataset, args.run_id, args.corpus_manifest)


if __name__ == "__main__":
    main()
