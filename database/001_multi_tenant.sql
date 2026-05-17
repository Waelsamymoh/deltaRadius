-- ============================================================
-- Multi-Tenant Migration for FreeRADIUS + RadiusManager
-- Strategy: NAS-based tenant resolution for FreeRADIUS,
--           RLS for NestJS app layer (radius_app user)
-- ============================================================

-- ─── Tenants ────────────────────────────────────────────────
CREATE TABLE tenants (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(255) NOT NULL UNIQUE,
    realm       VARCHAR(255) UNIQUE,         -- e.g. "isp1.example.com"
    description TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Add tenant_id to every RADIUS table ────────────────────
ALTER TABLE nas           ADD COLUMN tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE radcheck       ADD COLUMN tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE radreply       ADD COLUMN tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE radgroupcheck  ADD COLUMN tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE radgroupreply  ADD COLUMN tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE radusergroup   ADD COLUMN tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE radpostauth    ADD COLUMN tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL;
ALTER TABLE radacct        ADD COLUMN tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL;

-- ─── Indexes ────────────────────────────────────────────────
CREATE INDEX idx_nas_tenant           ON nas          (tenant_id);
CREATE INDEX idx_radcheck_tenant      ON radcheck     (tenant_id);
CREATE INDEX idx_radreply_tenant      ON radreply     (tenant_id);
CREATE INDEX idx_radgroupcheck_tenant ON radgroupcheck(tenant_id);
CREATE INDEX idx_radgroupreply_tenant ON radgroupreply(tenant_id);
CREATE INDEX idx_radusergroup_tenant  ON radusergroup (tenant_id);
CREATE INDEX idx_radpostauth_tenant   ON radpostauth  (tenant_id);
CREATE INDEX idx_radacct_tenant       ON radacct      (tenant_id);

-- ─── Row Level Security ─────────────────────────────────────
ALTER TABLE tenants        ENABLE ROW LEVEL SECURITY;
ALTER TABLE nas            ENABLE ROW LEVEL SECURITY;
ALTER TABLE radcheck       ENABLE ROW LEVEL SECURITY;
ALTER TABLE radreply       ENABLE ROW LEVEL SECURITY;
ALTER TABLE radgroupcheck  ENABLE ROW LEVEL SECURITY;
ALTER TABLE radgroupreply  ENABLE ROW LEVEL SECURITY;
ALTER TABLE radusergroup   ENABLE ROW LEVEL SECURITY;
ALTER TABLE radpostauth    ENABLE ROW LEVEL SECURITY;
ALTER TABLE radacct        ENABLE ROW LEVEL SECURITY;

-- RLS policies scoped to app.current_tenant_id (set per-request by NestJS)
-- The radius_app user sees only rows for the current tenant

CREATE POLICY tenant_isolation ON tenants
    FOR ALL USING (id = current_setting('app.current_tenant_id', true)::INTEGER);

CREATE POLICY tenant_isolation ON nas
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::INTEGER);

CREATE POLICY tenant_isolation ON radcheck
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::INTEGER);

CREATE POLICY tenant_isolation ON radreply
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::INTEGER);

CREATE POLICY tenant_isolation ON radgroupcheck
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::INTEGER);

CREATE POLICY tenant_isolation ON radgroupreply
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::INTEGER);

CREATE POLICY tenant_isolation ON radusergroup
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::INTEGER);

CREATE POLICY tenant_isolation ON radpostauth
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::INTEGER);

CREATE POLICY tenant_isolation ON radacct
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::INTEGER);

-- ─── FreeRADIUS user: bypass RLS (uses explicit WHERE tenant_id) ─
ALTER USER radius BYPASSRLS;

-- ─── NestJS app user: subject to RLS ────────────────────────
CREATE USER radius_app WITH PASSWORD 'radius_app_pass';
GRANT CONNECT ON DATABASE radius TO radius_app;
GRANT USAGE ON SCHEMA public TO radius_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO radius_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO radius_app;
