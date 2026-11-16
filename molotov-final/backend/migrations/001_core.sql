-- MOLOTOV SANDBOX core schema.
-- Money is stored as integer centavos. Every value movement is a balanced set of journal lines.

CREATE TABLE users (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email            text NOT NULL,
  handle           text NOT NULL,
  display_name     text NOT NULL,
  password_hash    text NOT NULL,
  pin_hash         text,
  role             text NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  token_version    integer NOT NULL DEFAULT 0,
  failed_logins    integer NOT NULL DEFAULT 0,
  locked_until     timestamptz,
  failed_pins      integer NOT NULL DEFAULT 0,
  pin_locked_until timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT handle_format CHECK (handle ~ '^[a-z0-9_]{3,24}$')
);
CREATE UNIQUE INDEX users_email_uq  ON users (lower(email));
CREATE UNIQUE INDEX users_handle_uq ON users (handle);

CREATE TABLE refresh_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_id   uuid NOT NULL,
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  user_agent  text
);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id);
CREATE INDEX refresh_tokens_family_idx ON refresh_tokens (family_id);

-- One ledger account per user wallet, plus ONE sandbox issuer account that is the
-- counter-party of every sandbox credit. Only the issuer may go negative.
CREATE TABLE ledger_accounts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind           text NOT NULL CHECK (kind IN ('user_wallet','sandbox_issuer')),
  user_id        uuid UNIQUE REFERENCES users(id),
  currency       char(3) NOT NULL DEFAULT 'PHP' CHECK (currency = 'PHP'),
  balance_cents  bigint NOT NULL DEFAULT 0,
  allow_negative boolean NOT NULL DEFAULT false,
  CONSTRAINT no_overdraft CHECK (allow_negative OR balance_cents >= 0),
  CONSTRAINT wallet_has_user CHECK ((kind = 'user_wallet') = (user_id IS NOT NULL)),
  CONSTRAINT only_issuer_negative CHECK (NOT allow_negative OR kind = 'sandbox_issuer')
);
CREATE UNIQUE INDEX one_sandbox_issuer ON ledger_accounts (kind) WHERE kind = 'sandbox_issuer';
INSERT INTO ledger_accounts (kind, allow_negative) VALUES ('sandbox_issuer', true);

CREATE TABLE transfers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference           text NOT NULL UNIQUE,
  -- 'sandbox' is the only value this build may write. A future live release must
  -- change this constraint through an audited migration; nothing can cross over silently.
  environment         text NOT NULL DEFAULT 'sandbox' CHECK (environment = 'sandbox'),
  kind                text NOT NULL CHECK (kind IN ('sandbox_credit','sandbox_transfer')),
  actor_id            uuid NOT NULL REFERENCES users(id),
  sender_id           uuid REFERENCES users(id),
  receiver_id         uuid NOT NULL REFERENCES users(id),
  amount_cents        bigint NOT NULL CHECK (amount_cents > 0),
  fee_cents           bigint NOT NULL DEFAULT 0 CHECK (fee_cents >= 0),
  status              text NOT NULL CHECK (status IN ('pending','completed','failed','reversed')),
  note                text CHECK (char_length(note) <= 140),
  idempotency_key     text,
  request_fingerprint text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT credit_has_no_sender CHECK ((kind = 'sandbox_credit') = (sender_id IS NULL)),
  CONSTRAINT idem_pair CHECK ((idempotency_key IS NULL) = (request_fingerprint IS NULL))
);
CREATE UNIQUE INDEX transfers_idem_uq ON transfers (actor_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX transfers_sender_idx   ON transfers (sender_id, created_at DESC);
CREATE INDEX transfers_receiver_idx ON transfers (receiver_id, created_at DESC);

CREATE TABLE journal_lines (
  id          bigserial PRIMARY KEY,
  transfer_id uuid NOT NULL REFERENCES transfers(id),
  account_id  uuid NOT NULL REFERENCES ledger_accounts(id),
  delta_cents bigint NOT NULL CHECK (delta_cents <> 0),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX journal_lines_transfer_idx ON journal_lines (transfer_id);
CREATE INDEX journal_lines_account_idx  ON journal_lines (account_id);

-- Keep the cached balance in lock-step with the journal, inside the same transaction.
CREATE FUNCTION journal_apply_balance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE ledger_accounts SET balance_cents = balance_cents + NEW.delta_cents WHERE id = NEW.account_id;
  RETURN NEW;
END $$;
CREATE TRIGGER journal_apply_balance_trg AFTER INSERT ON journal_lines
  FOR EACH ROW EXECUTE FUNCTION journal_apply_balance();

-- Double entry: at COMMIT, the lines of every transfer must sum to exactly zero.
CREATE FUNCTION journal_assert_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s bigint;
BEGIN
  SELECT COALESCE(SUM(delta_cents), 0) INTO s FROM journal_lines WHERE transfer_id = NEW.transfer_id;
  IF s <> 0 THEN
    RAISE EXCEPTION 'Unbalanced journal for transfer %: sum=%', NEW.transfer_id, s USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER journal_assert_balanced_trg AFTER INSERT ON journal_lines
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION journal_assert_balanced();

-- Journal lines and audit rows are append-only.
CREATE FUNCTION forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '42501'; END $$;
CREATE TRIGGER journal_lines_append_only BEFORE UPDATE OR DELETE ON journal_lines
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TABLE audit_log (
  id         bigserial PRIMARY KEY,
  at         timestamptz NOT NULL DEFAULT now(),
  actor_id   uuid,
  action     text NOT NULL,
  detail     jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip         text
);
CREATE INDEX audit_log_at_idx ON audit_log (at DESC);
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- Reconciliation view: should ALWAYS be empty.
CREATE VIEW v_ledger_mismatch AS
  SELECT a.id AS account_id, a.balance_cents AS cached_balance, COALESCE(SUM(l.delta_cents),0) AS journal_balance
  FROM ledger_accounts a LEFT JOIN journal_lines l ON l.account_id = a.id
  GROUP BY a.id, a.balance_cents
  HAVING a.balance_cents <> COALESCE(SUM(l.delta_cents),0);
