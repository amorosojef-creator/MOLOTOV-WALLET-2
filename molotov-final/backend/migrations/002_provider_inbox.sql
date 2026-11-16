-- Scaffold for the future licensed-provider integration. Nothing writes here while no
-- provider is configured. A durable inbox lets webhooks be verified, de-duplicated and
-- replayed safely.
CREATE TABLE webhook_inbox (
  id            bigserial PRIMARY KEY,
  provider      text NOT NULL,
  event_id      text NOT NULL,
  signature_ok  boolean NOT NULL,
  payload       jsonb NOT NULL,
  received_at   timestamptz NOT NULL DEFAULT now(),
  processed_at  timestamptz,
  UNIQUE (provider, event_id)
);
