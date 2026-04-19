-- Fix rotation_order on phone_numbers so round-robin picks different numbers.
-- Context: all three pool rows currently have rotation_order = 0, which collapses
-- the ORDER BY to a stable first row (+12722194909, now spam-flagged).
-- This staggers the numbers so the known-good ones come first.
--
-- Run this manually in the Supabase SQL Editor. Do NOT execute via app code.

UPDATE phone_numbers SET rotation_order = 0
  WHERE id = 'e70938b4-44b6-4793-b2f8-d5f8fb5480f7';  -- +17196421726 first

UPDATE phone_numbers SET rotation_order = 1
  WHERE id = 'b574badd-c8e7-471e-873e-f48f6a3acc41';  -- +14255481585 second

UPDATE phone_numbers SET rotation_order = 2
  WHERE id = '586a02a9-7bf7-45c6-94da-0ad5cf4b7bd1';  -- +12722194909 last (spam-flagged)
