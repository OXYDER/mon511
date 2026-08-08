ALTER TABLE report_photos
  ADD COLUMN exif_latitude double precision,
  ADD COLUMN exif_longitude double precision,
  ADD COLUMN exif_captured_at timestamptz,
  ADD COLUMN exif_camera_make text,
  ADD COLUMN exif_camera_model text,
  ADD COLUMN exif_raw jsonb;
