-- Multi-pack job support & anti-collision conclusion assignments
ALTER TABLE jobs ADD COLUMN pack_id TEXT NOT NULL DEFAULT 'it2406_pt1';

CREATE TABLE IF NOT EXISTS conclusion_assignments (
  pack_id TEXT NOT NULL,
  sap_user TEXT NOT NULL,
  variation_idx INTEGER NOT NULL,
  assigned_at INTEGER NOT NULL,
  PRIMARY KEY (pack_id, sap_user),
  UNIQUE (pack_id, variation_idx)
);
