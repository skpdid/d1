CREATE TABLE IF NOT EXISTS refresh_tokens (
  uuid TEXT PRIMARY KEY,
  msisdn TEXT NOT NULL DEFAULT '',
  subscriber_id TEXT NOT NULL DEFAULT '',
  subscription_type TEXT NOT NULL DEFAULT '',
  refresh_token TEXT NOT NULL,
  fingerprint TEXT NOT NULL DEFAULT ''
);
