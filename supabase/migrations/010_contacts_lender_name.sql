-- Add lender_name column to contacts table.
-- The frontend and agent templates reference contacts.lender_name
-- (e.g. {{contact.lender_name}}) but the column was never created.
-- This migration adds it.

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS lender_name text;

COMMENT ON COLUMN contacts.lender_name IS 'Mortgage lender name — used in voice agent scripts via {{contact.lender_name}}';
