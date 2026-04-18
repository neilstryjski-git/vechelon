-- W78: Add suspended status to account_status enum
-- State machine: initiated → affiliated → suspended → archived
-- Suspended members are automatically excluded from portal RLS (policies check = 'affiliated')

ALTER TYPE public.account_status ADD VALUE IF NOT EXISTS 'suspended' AFTER 'affiliated';
