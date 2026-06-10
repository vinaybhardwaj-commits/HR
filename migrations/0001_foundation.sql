-- 0001_foundation: hospitals, admins, employees, appraisers, factors
CREATE TABLE IF NOT EXISTS hospital (
  id serial PRIMARY KEY,
  code text UNIQUE NOT NULL,
  name text NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_user (
  id serial PRIMARY KEY,
  email text UNIQUE NOT NULL,
  name text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'hr' CHECK (role IN ('hr','super')),
  failed_attempts int NOT NULL DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS appraiser (
  id serial PRIMARY KEY,
  full_name text NOT NULL,
  email text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employee (
  id serial PRIMARY KEY,
  hospital_id int NOT NULL REFERENCES hospital(id),
  emp_code text NOT NULL,
  full_name text NOT NULL,
  department text NOT NULL,
  sub_department text,
  designation text,
  track char(1) NOT NULL CHECK (track IN ('C','N')),
  email text,
  phone text,
  default_appraiser_id int REFERENCES appraiser(id),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hospital_id, emp_code)
);

CREATE TABLE IF NOT EXISTS factor (
  id serial PRIMARY KEY,
  code text UNIQUE NOT NULL,
  track text NOT NULL CHECK (track IN ('ALL','C','N')),
  sort int NOT NULL,
  label text NOT NULL,
  description text,
  anchors jsonb NOT NULL,
  weight numeric NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true
);

INSERT INTO hospital (code, name) VALUES
  ('EHRC', 'Even Hospital Race Course Road'),
  ('EHBR', 'Even Healthcare HBR Layout')
ON CONFLICT (code) DO NOTHING;
