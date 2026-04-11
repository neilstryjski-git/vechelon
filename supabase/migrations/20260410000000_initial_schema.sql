-- VEcheLOn Initial Schema
-- Based on Pillar II: The Specs (v1.3.0)

-- ENUMS
CREATE TYPE account_role AS ENUM ('admin', 'member', 'guest');
CREATE TYPE account_status AS ENUM ('initiated', 'affiliated', 'archived', 'deleted');
CREATE TYPE ride_type AS ENUM ('scheduled', 'adhoc');
CREATE TYPE ride_status AS ENUM ('created', 'active', 'saved');
CREATE TYPE ride_participant_role AS ENUM ('member', 'captain', 'support', 'guest');
CREATE TYPE ride_participant_status AS ENUM ('rsvpd', 'active', 'stopped', 'inactive', 'dark', 'purged');
CREATE TYPE ai_provider AS ENUM ('gemini', 'openai', 'anthropic');
CREATE TYPE enrollment_mode AS ENUM ('open', 'manual');

-- 1. tenants
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    primary_color TEXT NOT NULL,
    accent_color TEXT NOT NULL,
    logo_url TEXT,
    ai_api_key TEXT, -- Should be encrypted/protected
    ai_provider ai_provider DEFAULT 'gemini',
    enrollment_mode enrollment_mode DEFAULT 'open',
    stopped_threshold_mins INTEGER DEFAULT 2,
    inactive_threshold_mins INTEGER DEFAULT 5,
    dark_threshold_mins INTEGER DEFAULT 15,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. accounts
CREATE TABLE accounts (
    id UUID PRIMARY KEY REFERENCES auth.users(id), -- Links to Supabase Auth
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    name TEXT,
    role account_role NOT NULL DEFAULT 'member',
    status account_status NOT NULL DEFAULT 'initiated',
    session_cookie_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. rides
CREATE TABLE rides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    series_id UUID, -- Links recurring instances
    name TEXT NOT NULL,
    type ride_type NOT NULL,
    status ride_status NOT NULL DEFAULT 'created',
    start_coords POINT NOT NULL,
    start_label TEXT,
    finish_coords POINT,
    finish_label TEXT,
    gpx_path TEXT,
    scheduled_start TIMESTAMP WITH TIME ZONE,
    actual_start TIMESTAMP WITH TIME ZONE,
    actual_end TIMESTAMP WITH TIME ZONE,
    auto_closed BOOLEAN DEFAULT FALSE,
    qr_code TEXT NOT NULL,
    group_id UUID, -- Post-MVP sub-group
    created_by UUID NOT NULL REFERENCES accounts(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. ride_support
CREATE TABLE ride_support (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES accounts(id),
    vehicle_description TEXT,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. waypoints
CREATE TABLE waypoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
    coords POINT NOT NULL,
    label TEXT,
    order_index INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. route_library
CREATE TABLE route_library (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    distance_km FLOAT,
    elevation_gain_m INTEGER,
    created_by UUID NOT NULL REFERENCES accounts(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. ride_participants
CREATE TABLE ride_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
    account_id UUID REFERENCES accounts(id),
    session_cookie_id TEXT,
    display_name TEXT,
    phone TEXT,
    role ride_participant_role NOT NULL DEFAULT 'guest',
    status ride_participant_status NOT NULL DEFAULT 'rsvpd',
    beacon_active BOOLEAN DEFAULT FALSE,
    last_lat FLOAT,
    last_long FLOAT,
    last_ping TIMESTAMP WITH TIME ZONE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    group_id UUID
);

-- 8. ride_summaries
CREATE TABLE ride_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
    pre_ride_summary TEXT,
    post_ride_summary TEXT,
    weather_data JSONB,
    participant_count INTEGER NOT NULL DEFAULT 0,
    auto_closed BOOLEAN DEFAULT FALSE,
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ROW LEVEL SECURITY (RLS) policies
-- Basic isolation by tenant_id

-- Enable RLS on all tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE rides ENABLE ROW LEVEL SECURITY;
ALTER TABLE ride_support ENABLE ROW LEVEL SECURITY;
ALTER TABLE waypoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE ride_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE ride_summaries ENABLE ROW LEVEL SECURITY;

-- Tenants policy: users can see their own tenant config
-- For MVP, we assume users are associated with one tenant
CREATE POLICY tenant_isolation_policy ON tenants
    FOR SELECT USING (
        id IN (SELECT tenant_id FROM accounts WHERE id = auth.uid())
    );

-- Accounts policy: users can see other accounts in the same tenant
CREATE POLICY account_tenant_isolation ON accounts
    FOR ALL USING (tenant_id = (SELECT tenant_id FROM accounts WHERE id = auth.uid()));

-- Rides policy
CREATE POLICY ride_tenant_isolation ON rides
    FOR ALL USING (tenant_id = (SELECT tenant_id FROM accounts WHERE id = auth.uid()));

-- Ride Participants policy
-- Rule: Captain/SAG see all, Participants see Captain/SAG only
CREATE POLICY ride_participants_visibility ON ride_participants
    FOR SELECT USING (
        -- User is Captain/SAG
        (SELECT role FROM ride_participants WHERE ride_id = ride_participants.ride_id AND account_id = auth.uid()) IN ('captain', 'support')
        OR
        -- Target is Captain/SAG
        role IN ('captain', 'support')
        OR
        -- Target is Self
        account_id = auth.uid()
    );

-- Other tables follow basic tenant isolation
CREATE POLICY waypoints_isolation ON waypoints
    FOR ALL USING (ride_id IN (SELECT id FROM rides));

CREATE POLICY support_isolation ON ride_support
    FOR ALL USING (ride_id IN (SELECT id FROM rides));

CREATE POLICY route_library_isolation ON route_library
    FOR ALL USING (tenant_id = (SELECT tenant_id FROM accounts WHERE id = auth.uid()));

CREATE POLICY summaries_isolation ON ride_summaries
    FOR ALL USING (ride_id IN (SELECT id FROM rides));
