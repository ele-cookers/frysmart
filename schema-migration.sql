-- ============================================================
-- FrySmart — Schema Migration: Add & rename assessment columns
-- Run this once in Supabase Dashboard > SQL Editor
-- ============================================================

-- Step 1 — Add the 6 assessment columns to venues (if they don't exist yet).
--          These were added manually and are not in the original schema file.
--          Using DO blocks so the script is safe to re-run.
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

-- Step 2 — Rename the two misleading columns.
--          insight_oil_longevity  → insight_engagement  (stores Feedback & Engagement section)
--          insight_oil_management → insight_training     (stores Training & Education section)
--
--          NOTE: rename insight_oil_longevity FIRST to free the name before we use it elsewhere.
do $$
begin
  if exists (select 1 from information_schema.columns where table_name='venues' and column_name='insight_oil_longevity') then
    alter table venues rename column insight_oil_longevity to insight_engagement;
  end if;
  if exists (select 1 from information_schema.columns where table_name='venues' and column_name='insight_oil_management') then
    alter table venues rename column insight_oil_management to insight_training;
  end if;
end $$;

-- ============================================================
-- Final column layout for venues assessment fields:
--
--   insight_tpm_performance   — Section 1: Oil Longevity
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
