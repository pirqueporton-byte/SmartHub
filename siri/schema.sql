CREATE TABLE IF NOT EXISTS siri_links (
 id TEXT PRIMARY KEY,
 uid TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('pending','active')),
 secret_hash TEXT NOT NULL UNIQUE,
 cipher TEXT NOT NULL,
 created INTEGER NOT NULL,
 expires INTEGER NOT NULL,
 label TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS siri_links_uid ON siri_links(uid);
CREATE INDEX IF NOT EXISTS siri_links_expires ON siri_links(expires);
