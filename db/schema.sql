-- Community stats schema. Run once against the Neon DB (Neon console SQL editor).
CREATE TABLE IF NOT EXISTS runs (
  id                 BIGSERIAL PRIMARY KEY,
  run_uuid           UUID UNIQUE NOT NULL,
  received_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  quarantined        BOOLEAN NOT NULL DEFAULT false,
  quarantine_reasons TEXT[] NOT NULL DEFAULT '{}',
  submitter_ip_hash  TEXT NOT NULL,
  game_version       TEXT NOT NULL,
  digger_name        TEXT NOT NULL,
  gen                INT NOT NULL,
  days               INT NOT NULL,
  depth              INT NOT NULL,
  blocks             INT NOT NULL,
  cause              TEXT NOT NULL,
  discoveries        INT NOT NULL DEFAULT 0,
  discovery_pct      REAL NOT NULL DEFAULT 0,
  villager_deaths    INT NOT NULL DEFAULT 0,
  peak_population    INT NOT NULL DEFAULT 0,
  wall_hp            BIGINT NOT NULL DEFAULT 0,
  machines_built     INT NOT NULL DEFAULT 0,
  astrolabe_uses     INT NOT NULL DEFAULT 0,
  tasks_fulfilled    INT NOT NULL DEFAULT 0,
  tasks_denied       INT NOT NULL DEFAULT 0,
  -- Original Digger board: lineage[0] days/depth, derived at ingest.
  first_death_days   INT,
  first_death_depth  INT,
  -- Everything not queried by column: history, peaks, lineage, cosmetics.
  payload            JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS runs_leader_idx ON runs (quarantined, days DESC, depth DESC);
CREATE INDEX IF NOT EXISTS runs_unbroken_idx ON runs (quarantined, first_death_days DESC, first_death_depth DESC);
CREATE INDEX IF NOT EXISTS runs_rate_idx ON runs (submitter_ip_hash, received_at);
