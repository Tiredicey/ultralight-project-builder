-- Runner self-report (host, platform, local accounts, SAP reachability) for the Readiness page
CREATE TABLE IF NOT EXISTS runner_info (
  runner_id INTEGER PRIMARY KEY,
  info TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Task sheet PDF uploaded by the owner. Base64 text chunks (D1 rows stay under 2 MB), reassembled in the browser.
CREATE TABLE IF NOT EXISTS docs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  size INTEGER NOT NULL,
  chunks INTEGER NOT NULL,
  task_pages TEXT NOT NULL DEFAULT '{}',
  complete INTEGER NOT NULL DEFAULT 0,
  uploaded_by INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS doc_chunks (
  doc_id INTEGER NOT NULL,
  idx INTEGER NOT NULL,
  body TEXT NOT NULL,
  PRIMARY KEY (doc_id, idx)
);
