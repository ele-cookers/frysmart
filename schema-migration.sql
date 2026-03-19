-- Migration: Per-venue TPM thresholds and recording config
-- Run in Supabase SQL editor

ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS tpm_warning_threshold int,
  ADD COLUMN IF NOT EXISTS tpm_critical_threshold int,
  ADD COLUMN IF NOT EXISTS recording_config jsonb DEFAULT '{"freshFill":true,"topUp":true,"temperatures":true,"filtering":true,"foodType":true,"notes":true}'::jsonb;
