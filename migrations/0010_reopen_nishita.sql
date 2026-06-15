-- Reopen Dr Nishita Das (BA100076) scoring so HOD Chandrika can re-enter it
-- (she entered the wrong person's scores). Replicates the app's admin "reopen":
-- snapshot the prior submission to audit, revert to self_submitted, demote scores
-- to editable drafts, clear totals/discussion. Guarded + scoped to the live cycle.

-- 1) Snapshot the prior submitted version into the audit trail (history preserved)
INSERT INTO audit_log (actor_type, actor_label, action, appraisal_id, meta)
SELECT 'admin', 'vinay.bhardwaj@even.in', 'score_version_snapshot', a.id,
  jsonb_build_object(
    'version', a.reopened_count + 1,
    'totals', jsonb_build_object('total_score', a.total_score, 'percent', a.percent, 'band', a.band,
              'scores_submitted_at', a.scores_submitted_at, 'scored_by_label', a.scored_by_label,
              'discussion_date', a.discussion_date, 'reopened_count', a.reopened_count),
    'scores', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                 'factor_code', s.factor_code, 'value', s.value, 'example_text', s.example_text)), '[]'::jsonb)
               FROM score s WHERE s.appraisal_id = a.id AND NOT s.is_draft),
    'reason', 'HOD entered wrong scores - reopened for re-entry (15 Jun 2026, HR/V)')
FROM appraisal a JOIN employee e ON e.id = a.employee_id JOIN cycle c ON c.id = a.cycle_id
WHERE e.emp_code = 'BA100076' AND e.full_name = 'Nishita Das'
  AND c.status = 'live' AND a.status IN ('scored', 'discussed');

-- 2) Demote her scores to drafts (pre-filled, editable for correction)
UPDATE score s SET is_draft = true
FROM appraisal a JOIN employee e ON e.id = a.employee_id JOIN cycle c ON c.id = a.cycle_id
WHERE s.appraisal_id = a.id AND e.emp_code = 'BA100076' AND e.full_name = 'Nishita Das'
  AND c.status = 'live' AND a.status IN ('scored', 'discussed');

-- 3) Revert appraisal to self_submitted; clear totals + discussion; bump reopened_count
UPDATE appraisal a
SET status = 'self_submitted', reopened_count = a.reopened_count + 1,
    total_score = NULL, percent = NULL, band = NULL, scores_submitted_at = NULL,
    discussion_date = NULL, discussion_marked_at = NULL
FROM employee e, cycle c
WHERE a.employee_id = e.id AND a.cycle_id = c.id
  AND e.emp_code = 'BA100076' AND e.full_name = 'Nishita Das'
  AND c.status = 'live' AND a.status IN ('scored', 'discussed');

-- 4) Remove any concurrence (none expected post-policy; safety)
DELETE FROM concurrence WHERE appraisal_id IN (
  SELECT a.id FROM appraisal a JOIN employee e ON e.id = a.employee_id JOIN cycle c ON c.id = a.cycle_id
  WHERE e.emp_code = 'BA100076' AND e.full_name = 'Nishita Das' AND c.status = 'live');

-- 5) Audit the reopen action
INSERT INTO audit_log (actor_type, actor_label, action, appraisal_id, meta)
SELECT 'admin', 'vinay.bhardwaj@even.in', 'admin_reopen', a.id,
  jsonb_build_object('reason', 'HOD entered wrong scores - reopened for re-entry', 'from', 'scored')
FROM appraisal a JOIN employee e ON e.id = a.employee_id JOIN cycle c ON c.id = a.cycle_id
WHERE e.emp_code = 'BA100076' AND e.full_name = 'Nishita Das'
  AND c.status = 'live' AND a.status = 'self_submitted';
