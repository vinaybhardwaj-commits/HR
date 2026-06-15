-- Merge duplicate HOD records for Chandrika (15 Jun 2026, requested by V).
-- Her team was split across two appraiser records: id 17 "Dr Chandrika" (the link
-- she actually uses, 3 already scored) and id 1 "Chandrika Kambam" (duplicate she
-- never opened, 4 unscored). Consolidate onto id 17 (keeps her active link + work),
-- then RENAME id 17 to "Chandrika Kambam" and retire id 1. Idempotent + guarded.

-- 1) Move all of id 1's appraisals to id 17
UPDATE appraisal SET appraiser_id = 17 WHERE appraiser_id = 1;

-- 2) Move per-cycle assignments
UPDATE assignment SET appraiser_id = 17 WHERE appraiser_id = 1;

-- 3) Re-point employees whose default HOD is id 1
UPDATE employee SET default_appraiser_id = 17 WHERE default_appraiser_id = 1;

-- 4) Revoke id 1's unused HOD link
UPDATE token SET revoked = true WHERE role = 'hod' AND holder_type = 'appraiser' AND holder_id = 1;

-- 5) Deactivate the duplicate (guarded by its name)
UPDATE appraiser SET active = false WHERE id = 1 AND full_name = 'Chandrika Kambam';

-- 6) Rename the kept record to the proper full name (guarded by its current name)
UPDATE appraiser SET full_name = 'Chandrika Kambam' WHERE id = 17 AND full_name = 'Dr Chandrika';

-- 7) Audit
INSERT INTO audit_log (actor_type, actor_label, action, appraisal_id, meta)
VALUES ('admin', 'vinay.bhardwaj@even.in', 'appraiser_merge', NULL,
  jsonb_build_object('from_id', 1, 'into_id', 17, 'kept_name', 'Chandrika Kambam',
    'reason', 'duplicate HOD records; team was split; consolidated onto the link she was actively using'));
