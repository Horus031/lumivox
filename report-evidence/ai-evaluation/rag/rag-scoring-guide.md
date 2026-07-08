# RAG Scoring Guide

Each metric is scored from 1 to 5.

## 1. Relevance

| Score | Description |
|---:|---|
| 1 | Mostly unrelated to the question |
| 2 | Slightly related but misses the main intent |
| 3 | Answers part of the question |
| 4 | Mostly answers the question |
| 5 | Directly and fully answers the question |

## 2. Groundedness

| Score | Description |
|---:|---|
| 1 | Mostly unsupported by document context |
| 2 | Contains several unsupported claims |
| 3 | Partially supported by retrieved context |
| 4 | Mostly supported by retrieved context |
| 5 | Fully grounded in retrieved document context |

## 3. Clarity

| Score | Description |
|---:|---|
| 1 | Confusing or hard to follow |
| 2 | Somewhat unclear |
| 3 | Understandable but could be clearer |
| 4 | Clear and well structured |
| 5 | Very clear, concise, and student-friendly |

## 4. Completeness

| Score | Description |
|---:|---|
| 1 | Missing most key points |
| 2 | Covers only a small part |
| 3 | Covers the basic points |
| 4 | Covers most important points |
| 5 | Covers all important points needed for the question |

## 5. Hallucination Safety

| Score | Description |
|---:|---|
| 1 | Contains many unsupported or invented claims |
| 2 | Contains noticeable unsupported claims |
| 3 | Some claims are not clearly supported |
| 4 | Mostly avoids unsupported claims |
| 5 | Avoids unsupported claims and clearly limits itself to context |

## 6. Usefulness

| Score | Description |
|---:|---|
| 1 | Not useful for studying |
| 2 | Slightly useful |
| 3 | Moderately useful |
| 4 | Useful |
| 5 | Very useful and actionable |