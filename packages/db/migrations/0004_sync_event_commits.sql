CREATE TABLE IF NOT EXISTS "sync_event_commits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sync_event_id" uuid NOT NULL,
  "repository_id" uuid NOT NULL,
  "sha" text NOT NULL,
  "message" text NOT NULL,
  "author_name" text,
  "author_email" text,
  "authored_at" timestamp with time zone,
  "committed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "sync_event_commits_sync_event_id_sync_events_id_fk"
    FOREIGN KEY ("sync_event_id")
    REFERENCES "sync_events"("id")
    ON DELETE cascade,
  CONSTRAINT "sync_event_commits_repository_id_repositories_id_fk"
    FOREIGN KEY ("repository_id")
    REFERENCES "repositories"("id")
    ON DELETE cascade,
  CONSTRAINT "sync_event_commits_sync_event_sha_unique"
    UNIQUE ("sync_event_id", "sha")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sync_event_commits_sync_event_id_sync_events_id_fk'
      AND conrelid = 'sync_event_commits'::regclass
  ) THEN
    ALTER TABLE "sync_event_commits"
      ADD CONSTRAINT "sync_event_commits_sync_event_id_sync_events_id_fk"
      FOREIGN KEY ("sync_event_id")
      REFERENCES "sync_events"("id")
      ON DELETE cascade;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sync_event_commits_repository_id_repositories_id_fk'
      AND conrelid = 'sync_event_commits'::regclass
  ) THEN
    ALTER TABLE "sync_event_commits"
      ADD CONSTRAINT "sync_event_commits_repository_id_repositories_id_fk"
      FOREIGN KEY ("repository_id")
      REFERENCES "repositories"("id")
      ON DELETE cascade;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sync_event_commits_sync_event_sha_unique'
      AND conrelid = 'sync_event_commits'::regclass
  ) THEN
    ALTER TABLE "sync_event_commits"
      ADD CONSTRAINT "sync_event_commits_sync_event_sha_unique"
      UNIQUE ("sync_event_id", "sha");
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "sync_event_commits_sync_event_id_idx"
  ON "sync_event_commits" ("sync_event_id");

CREATE INDEX IF NOT EXISTS "sync_event_commits_repository_id_idx"
  ON "sync_event_commits" ("repository_id");

CREATE INDEX IF NOT EXISTS "sync_event_commits_repository_committed_idx"
  ON "sync_event_commits" ("repository_id", "committed_at");
