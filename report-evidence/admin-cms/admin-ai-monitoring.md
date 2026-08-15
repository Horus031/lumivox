# Admin AI Monitoring Evidence

## Purpose

Admin AI monitoring was added to help administrators observe how the AI and RAG features are used across Lumivox.

## Features Implemented

- Admin-only AI monitoring dashboard
- RAG session list
- RAG session detail page
- RAG message inspection
- Context mode monitoring
- Prompt variant monitoring
- Top-k usage monitoring
- Latency monitoring
- Empty-source RAG answer detection
- Document processing health summary

## AI Observability Metrics

The dashboard monitors:

- Total RAG sessions
- Total RAG messages
- General AI usage
- Document RAG usage
- Grounded rule prompt usage
- No-rule prompt usage
- Top-k 3/5/7 usage
- Average latency
- Maximum latency
- Assistant answers with sources
- Document RAG answers without sources
- Processed, failed, pending, and unsupported documents

## Operational Value

This enables administrators to identify AI quality issues, failed document processing, high-latency responses, and RAG answers that may require review.

## Security

AI monitoring is protected by admin-only server-side access checks and secured database RPC functions.