-- 0002_cycle: cycles, assignments, appraisals, scores, training needs, concurrence
CREATE TABLE IF NOT EXISTS cycle (
  id serial PRIMARY KEY,
  hospital_id int NOT NULL REFERENCES hospital(id),
  label text NOT NULL,
  type char(1) NOT NULL CHECK (type IN ('Q','H','A')),
  period_from date NOT NULL,
  period_to date NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','live','closed')),
  factor_snapshot jsonb,
  launched_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assignment (
  id serial PRIMARY KEY,
  cycle_id int NOT NULL REFERENCES cycle(id),
  employee_id int NOT NULL REFERENCES employee(id),
  appraiser_id int NOT NULL REFERENCES appraiser(id),
  UNIQUE (cycle_id, employee_id)
);

CREATE TABLE IF NOT EXISTS appraisal (
  id text PRIMARY KEY,
  cycle_id int NOT NULL REFERENCES cycle(id),
  employee_id int NOT NULL REFERENCES employee(id),
  appraiser_id int NOT NULL REFERENCES appraiser(id),
  status text NOT NULL DEFAULT 'invited' CHECK (status IN
    ('invited','self_submitted','scored','discussed','concurred',
     'disagreed','hr_review','closed','cancelled')),
  self_json jsonb,
  self_submitted_at timestamptz,
  self_overridden boolean NOT NULL DEFAULT false,
  scores_submitted_at timestamptz,
  scored_by_label text,
  discussion_date date,
  discussion_marked_at timestamptz,
  total_score int,
  percent numeric(5,2),
  band text,
  hr_notes text,
  reopened_count int NOT NULL DEFAULT 0,
  pdf_generated_at timestamptz,
  closed_at timestamptz,
  cancelled_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, employee_id)
);
CREATE INDEX IF NOT EXISTS idx_appraisal_cycle_status ON appraisal(cycle_id, status);

CREATE TABLE IF NOT EXISTS score (
  id serial PRIMARY KEY,
  appraisal_id text NOT NULL REFERENCES appraisal(id),
  factor_code text NOT NULL,
  value smallint CHECK (value BETWEEN 1 AND 5),
  example_text text,
  is_draft boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (appraisal_id, factor_code)
);

CREATE TABLE IF NOT EXISTS training_need (
  id serial PRIMARY KEY,
  appraisal_id text NOT NULL REFERENCES appraisal(id),
  category text NOT NULL,
  detail text
);

CREATE TABLE IF NOT EXISTS concurrence (
  id serial PRIMARY KEY,
  appraisal_id text UNIQUE NOT NULL REFERENCES appraisal(id),
  choice text NOT NULL CHECK (choice IN ('agree','agree_remarks','disagree')),
  remarks text,
  signed_name text NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT now()
);
