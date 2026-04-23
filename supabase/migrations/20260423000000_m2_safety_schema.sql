-- M2 Safety Schema: Add Emergency Contact Fields
-- Fulfills Pillar II Section 4.2 and MVE Phase II Task 1

-- 1. Add emergency contact columns to accounts table
ALTER TABLE public.accounts 
ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT,
ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT;

-- 2. Ensure RLS allows users to update their own emergency info
-- The existing 'Users can update own profile' policy on accounts 
-- should already cover these new columns if it's defined as 
-- FOR UPDATE USING (auth.uid() = id) without column restrictions.

-- 3. Update the handle_new_user trigger/function if necessary 
-- (Not required here as these fields should be populated by the user in the Profile UI)
