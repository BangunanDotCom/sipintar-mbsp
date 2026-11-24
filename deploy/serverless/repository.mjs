// Lab-only proof. The hypothetical principal must come from trusted server-side
// authentication. The Worker deliberately does not import this file.
export async function readPersonalDraft(db, principal, draftId) {
  const row = await db.prepare(`
    SELECT d.id, d.version, d.status
      FROM stl_lab_drafts d
      JOIN stl_lab_accounts a ON a.id = d.owner_id AND a.active = 1
     WHERE d.id = ? AND d.owner_id = ?
       AND a.role = 'PEMOHON'
  `).bind(draftId, principal.userId).first();
  return row ?? null;
}

export async function requestCorrection(db, principal, draftId, version, key) {
  if (principal.mfaVerified !== true || !Number.isSafeInteger(version) || version < 1 ||
      typeof key !== "string" || !/^[a-z0-9-]{1,64}$/.test(key)) return null;
  const scope = `EXISTS (
      SELECT 1 FROM stl_lab_accounts a
       WHERE a.id = ? AND a.active = 1 AND a.role = 'PIC_KAWASAN'
         AND a.district = d.district AND a.id <> d.owner_id
    )`;
  const transition = db.prepare(`
    UPDATE stl_lab_drafts AS d
       SET status = 'CORRECTION_REQUESTED', version = version + 1,
           transition_actor = ?, transition_key = ?
     WHERE d.id = ? AND d.version = ? AND d.status = 'SUBMITTED'
       AND ${scope}
       AND NOT EXISTS (SELECT 1 FROM stl_lab_audit WHERE actor_id = ? AND request_key = ?)
  `).bind(principal.userId, key, draftId, version, principal.userId, principal.userId, key);
  const receipt = db.prepare(`
    SELECT a.draft_id, a.next_version, a.action
      FROM stl_lab_audit a JOIN stl_lab_drafts d ON d.id = a.draft_id
     WHERE a.actor_id = ? AND a.request_key = ? AND a.draft_id = ? AND a.previous_version = ?
       AND ${scope}
  `).bind(principal.userId, key, draftId, version, principal.userId);
  const [, result] = await db.batch([transition, receipt]);
  return result.results[0] ?? null;
}
