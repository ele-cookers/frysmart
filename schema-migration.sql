-- Migration: Per-venue TPM thresholds and recording config
-- Run each statement separately in Supabase SQL editor

ALTER TABLE venues ADD COLUMN IF NOT EXISTS tpm_warning_threshold int;

ALTER TABLE venues ADD COLUMN IF NOT EXISTS tpm_critical_threshold int;

ALTER TABLE venues ADD COLUMN IF NOT EXISTS recording_config jsonb;

ALTER TABLE venues
  ALTER COLUMN recording_config
  SET DEFAULT '{"freshFill":true,"topUp":true,"temperatures":true,"filtering":true,"foodType":true,"notes":true}'::jsonb;

UPDATE venues
  SET recording_config = '{"freshFill":true,"topUp":true,"temperatures":true,"filtering":true,"foodType":true,"notes":true}'::jsonb
  WHERE recording_config IS NULL;
