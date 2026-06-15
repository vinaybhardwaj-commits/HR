-- One-off data fix (15 Jun 2026, requested by V): remove the DUPLICATE
-- "Rebecca Susan Gladvin" record (emp_code BA100094) that wrongly reports to
-- Dr Ankita Priya. The CORRECT record (BA10094 -> Dr Gautham) is untouched.
-- Cancels the dup's open appraisal, audits it, revokes its personal link, and
-- deactivates the employee so a future re-launch never re-creates it. Idempotent.

-- 1) Audit the removal BEFORE we cancel (one row per affected open appraisal)
INSERT INTO audit_log (actor_type, actor_label, action, appraisal_id, meta)
SELECT 'admin', 'vinay.bhardwaj@even.in', 'employee_dedup_remove', a.id,
       jsonb_build_object('emp_code','BA100094','full_name','Rebecca Susan Gladvin',
                          'reason','duplicate record; correct entry is BA10094 reporting to Dr Gautham')
FROM appraisal a JOIN employee e ON e.id = a.employee_id
WHERE e.emp_code = 'BA100094' AND e.full_name = 'Rebecca Susan Gladvin'
  AND a.status NOT IN ('cancelled','closed');

-- 2) Cancel the duplicate's open appraisal(s)
UPDATE appraisal a
SET status = 'cancelled',
    cancelled_reason = 'Duplicate record (BA100094) - correct entry is BA10094 reporting to Dr Gautham. Removed 15 Jun 2026 (HR/V).'
FROM employee e
WHERE a.employee_id = e.id
  AND e.emp_code = 'BA100094' AND e.full_name = 'Rebecca Susan Gladvin'
  AND a.status NOT IN ('cancelled','closed');

-- 3) Revoke the duplicate's personal link(s)
UPDATE token t
SET revoked = true
FROM employee e
WHERE t.holder_type = 'employee' AND t.holder_id = e.id
  AND e.emp_code = 'BA100094' AND e.full_name = 'Rebecca Susan Gladvin';

-- 4) Deactivate the duplicate employee (stops future re-launch from re-creating it)
UPDATE employee
SET active = false
WHERE emp_code = 'BA100094' AND full_name = 'Rebecca Susan Gladvin';
