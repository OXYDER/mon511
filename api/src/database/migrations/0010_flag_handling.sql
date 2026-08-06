ALTER TABLE report_flags
  ADD COLUMN handled_at timestamptz,
  ADD COLUMN handled_by uuid REFERENCES users(id);
