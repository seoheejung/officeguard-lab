CREATE TABLE IF NOT EXISTS security_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  source_ip TEXT,
  device_id TEXT,
  user_alias TEXT,
  severity TEXT,
  message TEXT NOT NULL,
  metadata JSONB NOT NULL,
  stored_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT security_events_severity_check
    CHECK (
      severity IS NULL
      OR severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')
    ),

  CONSTRAINT security_events_metadata_object_check
    CHECK (jsonb_typeof(metadata) = 'object'),

  CONSTRAINT security_events_rule_hit_severity_check
    CHECK (
      event_type <> 'RULE_HIT'
      OR severity IS NOT NULL
    ),

  CONSTRAINT security_events_rule_hit_metadata_check
    CHECK (
      event_type <> 'RULE_HIT'
      OR (
        metadata ? 'ruleId'
        AND metadata ? 'relatedEventIds'
        AND jsonb_typeof(metadata -> 'relatedEventIds') = 'array'
      )
    )
);

CREATE INDEX IF NOT EXISTS idx_security_events_occurred_at
  ON security_events (occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_events_type_occurred_at
  ON security_events (event_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_events_source_ip_occurred_at
  ON security_events (source_ip, occurred_at DESC)
  WHERE source_ip IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_security_events_device_id_occurred_at
  ON security_events (device_id, occurred_at DESC)
  WHERE device_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_security_events_rule_id_occurred_at
  ON security_events (
    (metadata ->> 'ruleId'),
    occurred_at DESC
  )
  WHERE event_type = 'RULE_HIT';