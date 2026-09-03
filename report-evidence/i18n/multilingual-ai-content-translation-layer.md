# Multilingual AI Content Translation Layer

## Purpose

Lumivox supports English and Vietnamese user interface routes. However, AI-generated content is dynamic and stored in the database. Static i18n files cannot translate this content automatically.

This feature adds a translation cache layer for AI-generated content.

## Problem

The UI can switch between English and Vietnamese, but existing AI-generated content may have been created in only one language. Without a translation layer, users may see English AI content while using the Vietnamese interface.

## Strategy

The system uses a hybrid strategy:

```text
New AI content:
Generate directly in the user's selected locale.

Existing or mismatched AI content:
Translate once and cache the translated result.
```