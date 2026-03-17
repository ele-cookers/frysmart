-- ============================================================
-- FrySmart — Schema Migration: Add & rename assessment columns
-- Run this once in Supabase Dashboard > SQL Editor
-- Safe to re-run — all blocks use IF EXISTS / IF NOT EXISTS guards
-- ============================================================

-- Step 1 — Add columns under their original names if they don't exist yet.
--          (Covers the case of setting up a brand-new database.)
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name='venues' and column_name='insight_tpm_performance') then
    alter table venues add column insight_tpm_performance text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='venues' and column_name='insight_temp_observations') then
    alter table venues add column insight_temp_observations text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='venues' and column_name='insight_food_quality') then
    alter table venues add column insight_food_quality text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='venues' and column_name='insight_oil_management') then
    alter table venues add column insight_oil_management text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='venues' and column_name='insight_oil_longevity') then
    alter table venues add column insight_oil_longevity text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='venues' and column_name='insight_recommendations') then
    alter table venues add column insight_recommendations text;
  end if;
end $$;

-- Step 2 — Rename all three misleading columns.
--          Order matters: free up insight_oil_longevity first (→ insight_engagement),
--          then reuse that name for insight_tpm_performance (→ insight_oil_longevity).
do $$
begin
  -- insight_oil_longevity → insight_engagement  (stores Feedback & Engagement, not oil longevity)
  if exists (select 1 from information_schema.columns where table_name='venues' and column_name='insight_oil_longevity') then
    alter table venues rename column insight_oil_longevity to insight_engagement;
  end if;
  -- insight_tpm_performance → insight_oil_longevity  (stores Oil Longevity section data)
  if exists (select 1 from information_schema.columns where table_name='venues' and column_name='insight_tpm_performance') then
    alter table venues rename column insight_tpm_performance to insight_oil_longevity;
  end if;
  -- insight_oil_management → insight_training  (stores Training & Education, not oil management)
  if exists (select 1 from information_schema.columns where table_name='venues' and column_name='insight_oil_management') then
    alter table venues rename column insight_oil_management to insight_training;
  end if;
end $$;

-- ============================================================
-- Final column layout for venues assessment fields:
--
--   insight_oil_longevity     — Section 1: Oil Longevity
--                               { tpmPerformance, lifespanVsCompetitor, topUpFreqVsCompetitor }
--   insight_temp_observations — Section 2: Temperature Control
--                               { setVsActual, calibrationNeeded }
--   insight_food_quality      — Section 3: Food Quality
--                               { tasteAndTexture, colourAndAppearance }
--   insight_training          — Section 4: Training & Education
--                               { trainingProvided, topicsCovered: string[] }
--   insight_engagement        — Section 5: Feedback & Engagement
--                               { chefFeedback, staffEngagement }
--   insight_recommendations   — Sections 6+7: Value Demonstrated + Next Steps
--                               { costSavings, qualityGains, operationalEfficiency,
--                                 interestedInTesto, interestedInFrySmart, bdmNotes }
-- ============================================================
