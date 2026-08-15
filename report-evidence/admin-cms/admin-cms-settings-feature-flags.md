# Admin CMS Settings and Feature Flags Evidence

## Purpose

Admin CMS settings were added to allow administrators to control platform-level features and defaults without changing application code.

## Features Implemented

- Admin-only CMS settings page
- Global leaderboard feature flag
- Group leaderboard feature flag
- Default RAG top-k setting
- Default RAG prompt variant setting
- Weekly challenge default focus target
- Weekly challenge default task target
- Maintenance mode flag

## Security

CMS settings can only be viewed and updated by users with `profiles.role = admin`. Updates are performed through secured database RPC functions with validation.

## Operational Value

This allows the Lumivox platform to be configured safely during production use, testing, demonstrations, and maintenance windows.

## Example Controls

- Temporarily disable public leaderboard
- Adjust RAG retrieval depth
- Switch RAG prompt strategy
- Set default weekly challenge targets