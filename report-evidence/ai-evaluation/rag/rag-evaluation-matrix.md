# RAG Evaluation Matrix

## Test Document

| Field | Value |
|---|---|
| Document name |  |
| Document type |  |
| Number of chunks |  |
| Embedding model | text-embedding-004 |
| Generation model |  |
| Evaluator |  |
| Date |  |

---

## Test Question 1

**Question:**  
`Paste question here`

| Condition | Top-k | Prompt Variant | Sources Retrieved | Latency (ms) | Relevance (1-5) | Groundedness (1-5) | Clarity (1-5) | Completeness (1-5) | Hallucination Safety (1-5) | Usefulness (1-5) | Notes |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| General AI | N/A | N/A | 0 |  |  |  |  |  |  |  |  |
| RAG | 3 | no_rule | 3 | 3749 | 4 | 4 | 3 | 3 | 4 | 4 |  |
| RAG | 5 | no_rule | 5 | 3914 | 4 | 4 | 4 | 4 | 5 | 4 |  |
| RAG | 7 | no_rule | 7 | 4046 | 5 | 5 | 5 | 5 | 5 | 5 |  |
| RAG | 3 | grounded_rule | 3 | 3256 | 4 | 4 | 3 | 3 | 4 | 4 |  |
| RAG | 5 | grounded_rule | 5 | 3740 | 4 | 4 | 4 | 4 | 5 | 4 |  |
| RAG | 7 | grounded_rule | 7 | 4011 | 5 | 5 | 5 | 5 | 5 | 5 |  |

### Interpretation

Write a short interpretation here.

---

## Test Question 2

**Question:**  
`Paste question here`

| Condition | Top-k | Prompt Variant | Sources Retrieved | Latency (ms) | Relevance (1-5) | Groundedness (1-5) | Clarity (1-5) | Completeness (1-5) | Hallucination Safety (1-5) | Usefulness (1-5) | Notes |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| General AI | N/A | N/A | 0 |  |  |  |  |  |  |  |  |
| RAG | 3 | no_rule |  |  |  |  |  |  |  |  |  |
| RAG | 5 | no_rule |  |  |  |  |  |  |  |  |  |
| RAG | 7 | no_rule |  |  |  |  |  |  |  |  |  |
| RAG | 3 | grounded_rule |  |  |  |  |  |  |  |  |  |
| RAG | 5 | grounded_rule |  |  |  |  |  |  |  |  |  |
| RAG | 7 | grounded_rule |  |  |  |  |  |  |  |  |  |

### Interpretation

Write a short interpretation here.

---

## Test Question 3: Out-of-context Question

**Question:**  
`Ask something not covered by the selected document`

| Condition | Top-k | Prompt Variant | Sources Retrieved | Latency (ms) | Relevance (1-5) | Groundedness (1-5) | Clarity (1-5) | Completeness (1-5) | Hallucination Safety (1-5) | Usefulness (1-5) | Notes |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| General AI | N/A | N/A | 0 |  |  |  |  |  |  |  |  |
| RAG | 5 | no_rule |  |  |  |  |  |  |  |  |  |
| RAG | 5 | grounded_rule |  |  |  |  |  |  |  |  |  |

### Interpretation

The grounded rule should be safer because it should refuse or limit the answer when the selected documents do not contain enough information.