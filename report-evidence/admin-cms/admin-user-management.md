# Admin User Management Evidence

## Purpose

Admin user management was added to allow platform administrators to monitor user accounts, review learning activity, and manage platform-level access settings.

## Features Implemented

- Admin-only user list
- User search by name, email, or user id
- User detail page
- Role management
- Leaderboard visibility management
- User activity summary

## Security Controls

- Only users with `profiles.role = admin` can access admin user management.
- Role updates are performed through secured database RPC functions.
- The system prevents removing the last remaining admin.

## Privacy Controls

- User emails are available only inside the admin CMS.
- Public leaderboard continues to use display names/full names and does not expose email addresses.