import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Two fixes that block PPPoE/SSTP end-user authentication when MikroTik uses
 * MS-CHAP (the default in our generated script):
 *
 * 1. Backfill: existing users created with username-only auth had only
 *    Auth-Type=Accept in radcheck — fine for PAP, fatal for MS-CHAP. Insert
 *    a Cleartext-Password = username for every such user so MS-CHAP can match.
 *
 * 2. Widen narrow VARCHAR columns to TEXT — the legacy FreeRADIUS schema in
 *    this Neon DB has VARCHAR(64)/VARCHAR(32) on radpostauth/radacct columns,
 *    which truncates when MikroTik sends long values (e.g. nas-port-id with
 *    circuit-id, long encrypted User-Password). The official upstream schema
 *    uses TEXT for these columns — match that.
 */
export class FreeradiusFixMschapAndTextCols1715000000017 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {

    // ── 1) Backfill Cleartext-Password for username-only users ─────────────
    // Insert one row per user that has Auth-Type=Accept but no Cleartext-Password.
    await runner.query(`
      INSERT INTO radcheck (username, attribute, op, value, tenant_id)
      SELECT rc.username, 'Cleartext-Password', ':=', rc.username, rc.tenant_id
      FROM radcheck rc
      WHERE rc.attribute = 'Auth-Type' AND rc.value = 'Accept'
        AND NOT EXISTS (
          SELECT 1 FROM radcheck rc2
          WHERE rc2.username = rc.username
            AND COALESCE(rc2.tenant_id, 0) = COALESCE(rc.tenant_id, 0)
            AND rc2.attribute = 'Cleartext-Password'
        )
    `);
    // Drop the Auth-Type=Accept rows now that Cleartext-Password covers auth.
    await runner.query(`
      DELETE FROM radcheck
      WHERE attribute = 'Auth-Type' AND value = 'Accept'
        AND username IN (
          SELECT username FROM radcheck WHERE attribute = 'Cleartext-Password'
        )
    `);

    // ── 2) Widen columns that FreeRADIUS writes large values into ──────────
    const widen = async (table: string, col: string) => {
      await runner.query(`ALTER TABLE ${table} ALTER COLUMN ${col} TYPE TEXT`);
    };
    // radpostauth — captures every auth attempt with the password attempt + reply
    await widen('radpostauth', 'username');
    await widen('radpostauth', 'pass');
    await widen('radpostauth', 'reply');
    // radacct — accounting receives long NAS-Port-Id (circuit-id) and IDs
    await widen('radacct', 'acctsessionid');
    await widen('radacct', 'acctuniqueid');
    await widen('radacct', 'username');
    await widen('radacct', 'nasportid');
    await widen('radacct', 'nasporttype');
    await widen('radacct', 'acctauthentic');
    await widen('radacct', 'calledstationid');
    await widen('radacct', 'callingstationid');
    await widen('radacct', 'acctterminatecause');
    await widen('radacct', 'servicetype');
    await widen('radacct', 'framedprotocol');
    await widen('radacct', 'connectinfo_start');
    await widen('radacct', 'connectinfo_stop');
    await widen('radacct', 'class');
    await widen('radacct', 'realm');
    // radcheck / radreply — keep flexible too
    await widen('radcheck', 'username');
    await widen('radcheck', 'attribute');
    await widen('radcheck', 'value');
    await widen('radreply', 'username');
    await widen('radreply', 'attribute');
    await widen('radreply', 'value');
  }

  async down(_runner: QueryRunner): Promise<void> {
    // No-op: shrinking back to VARCHAR(N) would risk data loss.
  }
}
