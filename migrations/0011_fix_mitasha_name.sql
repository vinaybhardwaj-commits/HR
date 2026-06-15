-- Display-name correction (15 Jun 2026, requested by V): HOD appraiser record
-- id 13 was mis-spelled "Mitsha Signh"; correct to "Mitasha Singh". This changes
-- ONLY the displayed name (board, queues, reports, PDF, WhatsApp greeting). Her
-- personal link (token hash) and team assignments key on the appraiser id, NOT the
-- name, so nothing about her link or workflow changes. Guarded + idempotent.

UPDATE appraiser SET full_name = 'Mitasha Singh'
WHERE id = 13 AND full_name = 'Mitsha Signh';

INSERT INTO audit_log (actor_type, actor_label, action, appraisal_id, meta)
VALUES ('admin', 'vinay.bhardwaj@even.in', 'appraiser_update', NULL,
  jsonb_build_object('id', 13, 'rename_from', 'Mitsha Signh', 'rename_to', 'Mitasha Singh',
                     'reason', 'spelling correction; display only'));
