# Final RAG Configuration Decision

## Purpose

This document summarises the final RAG configuration decision for Lumivox based on retrieval-level benchmarking and answer-quality evaluation.

## Production RAG Architecture

Lumivox uses a traditional vector-based RAG pipeline:

```text
Learning Document
→ Text Extraction
→ Chunking
→ Gemini Embedding
→ pgvector Similarity Search
→ Retrieved Context
→ LLM Answer Generation
```

The embedding strategy uses Gemini embeddings with 768-dimensional vectors. The answer generation layer supports an LLM provider fallback strategy. Gemini can be used as the primary provider, while Groq-based chat and structured models can be used when Gemini quota is limited.

## Baseline Configuration

The original baseline was:

```text
chunk_size = 1800 characters
overlap = 250 characters
embedding_dimension = 768
top_k = 5
prompt_variant = grounded_rule
```

## Configurations Evaluated

| Config               | Chunk Size | Overlap | Embedding Dimension | Purpose                     |
| -------------------- | ---------: | ------: | ------------------: | --------------------------- |
| A0_baseline          |       1800 |     250 |                 768 | Current baseline            |
| A1_smaller_chunk     |       1200 |     250 |                 768 | Smaller chunks              |
| A2_larger_chunk      |       2400 |     250 |                 768 | Larger chunks               |
| A3_smaller_overlap   |       1800 |     100 |                 768 | Smaller overlap             |
| A4_larger_overlap    |       1800 |     400 |                 768 | Larger overlap              |
| A5_smaller_dimension |       1800 |     250 |                 384 | Smaller embedding dimension |
| A6_larger_dimension  |       1800 |     250 |                1536 | Larger embedding dimension  |


## Retrieval Benchmark Summary
All configurations achieved strong retrieval performance on the expanded evaluation dataset:

```text
Recall@5 = 1.0
MRR@5 = 1.0
Keyword hit rate = 1.0
```
This means all tested configurations were able to retrieve the expected source documents within the top 5 retrieved chunks.

However, the configurations differed in efficiency:

| Config               | Total Chunks | Estimated Vector Storage | Document Embedding Time |
| -------------------- | -----------: | -----------------------: | ----------------------: |
| A0_baseline          |           22 |                0.0645 MB |                  20.73s |
| A1_smaller_chunk     |           33 |                0.0967 MB |                  29.77s |
| A2_larger_chunk      |           16 |                0.0469 MB |                  13.52s |
| A3_smaller_overlap   |           21 |                0.0615 MB |                  17.56s |
| A4_larger_overlap    |           22 |                0.0645 MB |                  25.83s |
| A5_smaller_dimension |           22 |                0.0322 MB |                  22.06s |
| A6_larger_dimension  |           22 |                0.1289 MB |                  20.06s |


## Answer Quality Evaluation Summary

The answer-quality evaluation measured:

- Answer relevance
- Groundedness
- Completeness
- Citation quality
- Hallucination risk
- Answer latency

| Config             | Answer Relevance | Groundedness | Completeness | Citation Quality | Hallucination Risk | Overall Quality |
| ------------------ | ---------------: | -----------: | -----------: | ---------------: | -----------------: | --------------: |
| A0_baseline        |           4.7143 |       5.0000 |       4.7143 |           4.7143 |             1.0000 |          4.8286 |
| A1_smaller_chunk   |           5.0000 |       5.0000 |       5.0000 |           5.0000 |             1.0000 |          5.0000 |
| A2_larger_chunk    |           4.7333 |       5.0000 |       4.7333 |           4.7333 |             1.0000 |          4.8400 |
| A3_smaller_overlap |           5.0000 |       5.0000 |       4.9333 |           5.0000 |             1.0000 |          4.9867 |
| A4_larger_overlap  |           5.0000 |       5.0000 |       5.0000 |           5.0000 |             1.0000 |          5.0000 |

A5 and A6 were excluded from the answer-quality decision because their judge scores were not successfully recorded in the summary output. They were still useful for retrieval-level and storage-efficiency comparison.

## Final Selected Configuration

The selected production configuration is:

```text
chunk_size = 1800 characters
overlap = 400 characters
embedding_dimension = 768
top_k = 5
prompt_variant = grounded_rule
```

This corresponds to:

```text
A4_larger_overlap
```

## Justification

A4 was selected because it achieved the strongest answer-quality result while preserving most of the baseline system characteristics.

Compared with A1, A4 avoids increasing the number of chunks from 22 to 33. This keeps the vector index smaller and reduces document-processing overhead.

Compared with A0, A4 improves the answer-quality score from 4.8286 to 5.0000 in this evaluation. The main cost is a larger overlap, which can slightly increase duplicated context and processing time, but it does not increase the number of chunks or vector storage in the tested dataset.

Embedding Dimension Decision

The production system keeps the 768-dimensional embedding configuration.

Although 384-dimensional embeddings reduced estimated vector storage, changing the production embedding dimension would require database and retrieval pipeline changes. The 1536-dimensional configuration increased storage cost without retrieval-level improvement in this dataset.

Therefore, 768 dimensions were kept as the best balance between compatibility, retrieval quality, storage cost, and implementation stability.

## LLM Provider Note

The embedding layer continues to use Gemini embeddings. The answer generation layer supports a provider fallback strategy using Groq-based chat and structured models when Gemini quota is limited. This improves operational reliability without changing the vector retrieval design.

## Final Decision

Lumivox will use traditional vector RAG with the following final configuration:

```text
RAG_CHUNK_SIZE_CHARS = 1800
RAG_CHUNK_OVERLAP_CHARS = 400
Embedding dimension = 768
Top-k = 5
Prompt variant = grounded_rule
```

This configuration is selected as the best balance between answer quality, groundedness, hallucination control, implementation stability, and production efficiency.