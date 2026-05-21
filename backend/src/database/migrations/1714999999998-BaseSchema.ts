import { MigrationInterface, QueryRunner } from 'typeorm';

export class BaseSchema1714999999998 implements MigrationInterface {
  name = 'BaseSchema1714999999998';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── FreeRADIUS core tables ────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS nas (
        id          SERIAL PRIMARY KEY,
        nasname     VARCHAR(128) NOT NULL,
        shortname   VARCHAR(32),
        type        VARCHAR(30) DEFAULT 'other',
        ports       INTEGER,
        secret      VARCHAR(60) NOT NULL DEFAULT 'secret',
        server      VARCHAR(64),
        community   VARCHAR(50),
        description VARCHAR(200)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS radcheck (
        id        SERIAL PRIMARY KEY,
        username  VARCHAR(64) NOT NULL DEFAULT '',
        attribute VARCHAR(64) NOT NULL DEFAULT '',
        op        VARCHAR(2)  NOT NULL DEFAULT '==',
        value     VARCHAR(253) NOT NULL DEFAULT ''
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS radcheck_username ON radcheck (username)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS radreply (
        id        SERIAL PRIMARY KEY,
        username  VARCHAR(64) NOT NULL DEFAULT '',
        attribute VARCHAR(64) NOT NULL DEFAULT '',
        op        VARCHAR(2)  NOT NULL DEFAULT '=',
        value     VARCHAR(253) NOT NULL DEFAULT ''
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS radreply_username ON radreply (username)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS radgroupcheck (
        id        SERIAL PRIMARY KEY,
        groupname VARCHAR(64) NOT NULL DEFAULT '',
        attribute VARCHAR(64) NOT NULL DEFAULT '',
        op        VARCHAR(2)  NOT NULL DEFAULT '==',
        value     VARCHAR(253) NOT NULL DEFAULT ''
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS radgroupcheck_groupname ON radgroupcheck (groupname)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS radgroupreply (
        id        SERIAL PRIMARY KEY,
        groupname VARCHAR(64) NOT NULL DEFAULT '',
        attribute VARCHAR(64) NOT NULL DEFAULT '',
        op        VARCHAR(2)  NOT NULL DEFAULT '=',
        value     VARCHAR(253) NOT NULL DEFAULT ''
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS radgroupreply_groupname ON radgroupreply (groupname)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS radusergroup (
        id        SERIAL PRIMARY KEY,
        username  VARCHAR(64) NOT NULL DEFAULT '',
        groupname VARCHAR(64) NOT NULL DEFAULT '',
        priority  INTEGER NOT NULL DEFAULT 1
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS radusergroup_username ON radusergroup (username)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS radpostauth (
        id       SERIAL PRIMARY KEY,
        username VARCHAR(64) NOT NULL DEFAULT '',
        pass     VARCHAR(64) NOT NULL DEFAULT '',
        reply    VARCHAR(32) NOT NULL DEFAULT '',
        authdate TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS radpostauth_username ON radpostauth (username)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS radacct (
        radacctid          BIGSERIAL PRIMARY KEY,
        acctsessionid      VARCHAR(64)  NOT NULL DEFAULT '',
        acctuniqueid       VARCHAR(32)  NOT NULL UNIQUE DEFAULT '',
        username           VARCHAR(64),
        realm              VARCHAR(64),
        nasipaddress       INET         NOT NULL,
        nasportid          VARCHAR(15),
        nasporttype        VARCHAR(32),
        acctstarttime      TIMESTAMPTZ,
        acctupdatetime     TIMESTAMPTZ,
        acctstoptime       TIMESTAMPTZ,
        acctsessiontime    BIGINT,
        acctauthentic      VARCHAR(32),
        connectinfo_start  VARCHAR(50),
        connectinfo_stop   VARCHAR(50),
        acctinputoctets    BIGINT,
        acctoutputoctets   BIGINT,
        calledstationid    VARCHAR(50),
        callingstationid   VARCHAR(50),
        acctterminatecause VARCHAR(32),
        servicetype        VARCHAR(32),
        framedprotocol     VARCHAR(32),
        framedipaddress    INET
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS radacct_username      ON radacct (username)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS radacct_nasipaddress  ON radacct (nasipaddress)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS radacct_acctsessionid ON radacct (acctsessionid)`);

    // ── Plans table ───────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS plans (
        id                              SERIAL PRIMARY KEY,
        tenant_id                       INTEGER,
        name                            VARCHAR(100) NOT NULL,
        description                     VARCHAR(255),
        download_mbps                   NUMERIC(10,2),
        upload_mbps                     NUMERIC(10,2),
        session_timeout_min             INTEGER,
        download_limit_gb               NUMERIC(10,2),
        upload_limit_gb                 NUMERIC(10,2),
        total_limit_gb                  NUMERIC(10,2),
        burst_download_mbps             NUMERIC(10,2),
        burst_upload_mbps               NUMERIC(10,2),
        burst_threshold_download_mbps   NUMERIC(10,2),
        burst_threshold_upload_mbps     NUMERIC(10,2),
        burst_time_seconds              INTEGER,
        framed_pool                     VARCHAR(100),
        quota_action                    VARCHAR(20) NOT NULL DEFAULT 'none',
        fallback_plan_id                INTEGER,
        created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_plans_tenant ON plans (tenant_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS plans`);
    await queryRunner.query(`DROP TABLE IF EXISTS radacct`);
    await queryRunner.query(`DROP TABLE IF EXISTS radpostauth`);
    await queryRunner.query(`DROP TABLE IF EXISTS radusergroup`);
    await queryRunner.query(`DROP TABLE IF EXISTS radgroupreply`);
    await queryRunner.query(`DROP TABLE IF EXISTS radgroupcheck`);
    await queryRunner.query(`DROP TABLE IF EXISTS radreply`);
    await queryRunner.query(`DROP TABLE IF EXISTS radcheck`);
    await queryRunner.query(`DROP TABLE IF EXISTS nas`);
  }
}
