# RAG Study Assistant Evaluation Plan

## 1. Purpose

This evaluation measures the quality of the Lumivox RAG Study Assistant when answering questions with and without selected document context.

The evaluation focuses on two variables:

1. Top-k retrieved chunks: 3, 5, and 7
2. Prompt variant: no strict rule and grounded rule

## 2. Evaluation Questions

The evaluation answers the following questions:

- Does document-grounded RAG produce more relevant answers than general AI?
- Does a grounded prompt rule reduce unsupported claims?
- Which top-k value provides the best balance between context coverage, quality, and latency?
- Is top-k = 5 a suitable production default?

## 3. Test Conditions

| Condition | Description |
|---|---|
| General AI | No document selected |
| RAG top-k 3 no_rule | Selected document, top-k 3, no strict grounding |
| RAG top-k 5 no_rule | Selected document, top-k 5, no strict grounding |
| RAG top-k 7 no_rule | Selected document, top-k 7, no strict grounding |
| RAG top-k 3 grounded_rule | Selected document, top-k 3, strict grounding |
| RAG top-k 5 grounded_rule | Selected document, top-k 5, strict grounding |
| RAG top-k 7 grounded_rule | Selected document, top-k 7, strict grounding |

## 4. Evaluation Metrics

Each answer is scored from 1 to 5.

| Metric | Meaning |
|---|---|
| Relevance | How well the answer addresses the question |
| Groundedness | How well the answer is supported by selected document context |
| Clarity | How understandable the answer is for a student |
| Completeness | Whether the answer covers the necessary key points |
| Hallucination Safety | Whether the answer avoids unsupported claims |
| Usefulness | How helpful the answer is for study |

## 5. Recommended Production Default

The expected production default is:

- top-k = 5
- prompt_variant = grounded_rule

This is expected to balance latency, answer quality, and context coverage.