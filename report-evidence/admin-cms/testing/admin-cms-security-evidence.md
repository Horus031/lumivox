# Admin CMS Security Evidence

## Purpose

This document explains how the Lumivox Admin CMS protects administrative functionality and sensitive platform operations.

## Admin Role Model

The system uses `profiles.role` to distinguish normal users from administrators.

```text
profiles.role
├── user
└── admin