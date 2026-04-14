-- supabase/migrations/2026-04-14_add_is_broadcast_vip.sql

ALTER TABLE communities
  ADD COLUMN is_broadcast_vip boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN communities.is_broadcast_vip IS
  'Platform-admin-toggleable flag. When true, this community bypasses broadcast quota and billing checks.';
