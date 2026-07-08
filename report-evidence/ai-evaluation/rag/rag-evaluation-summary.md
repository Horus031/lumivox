# RAG Evaluation Summary

## 1. Overview

The RAG Study Assistant was evaluated using selected processed learning documents. The evaluation compared general AI mode, RAG with no strict prompt rule, and RAG with grounded prompt rules. Different odd-number top-k settings were tested: 3, 5, and 7.

## 2. Key Findings

- General AI mode was useful for broad study questions but did not use uploaded document context.
- RAG answers were more specific when the selected document contained relevant information.
- The grounded prompt rule reduced unsupported claims compared with the no-rule prompt.
- Top-k 3 was faster but sometimes missed supporting context.
- Top-k 5 provided the best balance between answer quality and latency.
- Top-k 7 provided more context but sometimes introduced less relevant chunks.

## 3. Selected Production Configuration

The selected production configuration is:

- Context mode: document_rag when user selects documents
- Top-k: 5
- Prompt variant: grounded_rule

## 4. Rationale

Top-k 5 with grounded_rule was selected because it provides enough retrieved context for useful answers while avoiding excessive context noise and maintaining acceptable response latency.