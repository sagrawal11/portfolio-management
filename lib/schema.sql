-- Portfolio Tracker schema (Neon Postgres)
-- All money/prices are NUMERIC (never float). All `date` columns are the
-- US-Eastern trading date. Idempotent: safe to run repeatedly.

-- Single-row competition configuration.
CREATE TABLE IF NOT EXISTS portfolio_config (
  id                INTEGER PRIMARY KEY DEFAULT 1,
  start_date        DATE NOT NULL,
  end_date          DATE,
  notional          NUMERIC(18,2) NOT NULL DEFAULT 100000,
  risk_free_annual  NUMERIC(8,5)  NOT NULL DEFAULT 0.02,
  benchmark_symbol  TEXT          NOT NULL DEFAULT '^SP500TR',
  price_field       TEXT          NOT NULL DEFAULT 'adj_close', -- 'adj_close' | 'close'
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT portfolio_config_single_row CHECK (id = 1)
);

-- One row per position ("money bag"). Active or closed. Swaps close one row
-- and open another 1-for-1. `allocation` is the invariant $ constant used for
-- valuation (weight*notional at seed, or the swapped-in proceeds thereafter).
CREATE TABLE IF NOT EXISTS holdings (
  id             SERIAL PRIMARY KEY,
  ticker         TEXT NOT NULL,                     -- normalized Yahoo symbol (canonical)
  display_ticker TEXT NOT NULL,                     -- what the user typed (e.g. BRK.B)
  weight         NUMERIC(9,6),                      -- target weight at entry (0..1)
  allocation     NUMERIC(18,6) NOT NULL,            -- invariant $ constant
  shares         NUMERIC(24,10),                    -- display-only: allocation / raw entry price
  entry_date     DATE NOT NULL,
  entry_price    NUMERIC(18,6),                     -- raw close on entry (display)
  exit_date      DATE,
  exit_price     NUMERIC(18,6),
  status         TEXT NOT NULL DEFAULT 'active',    -- 'active' | 'closed'
  is_option      BOOLEAN NOT NULL DEFAULT false,
  currency       TEXT,                              -- native currency (FX assumed constant)
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- At most one ACTIVE row per ticker (backstops the no-duplicate-holding rule).
CREATE UNIQUE INDEX IF NOT EXISTS holdings_active_ticker_uq
  ON holdings (ticker) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS holdings_status_idx ON holdings (status);
CREATE INDEX IF NOT EXISTS holdings_ticker_idx ON holdings (ticker);

-- Daily closes per ticker (adjusted + raw). Re-fetched fully each sync and
-- upserted, because Yahoo retroactively rescales adj_close on splits/dividends.
CREATE TABLE IF NOT EXISTS price_history (
  ticker     TEXT NOT NULL,
  date       DATE NOT NULL,
  adj_close  NUMERIC(18,6) NOT NULL,
  close      NUMERIC(18,6),
  PRIMARY KEY (ticker, date)
);

-- Daily benchmark closes (keyed by symbol so the benchmark is switchable).
CREATE TABLE IF NOT EXISTS benchmark_prices (
  symbol     TEXT NOT NULL,
  date       DATE NOT NULL,
  adj_close  NUMERIC(18,6) NOT NULL,
  close      NUMERIC(18,6),
  PRIMARY KEY (symbol, date)
);

-- Daily total portfolio value. Single source of truth; weekly returns and all
-- metrics are DERIVED ON READ from this series (keeps lib/metrics.ts pure).
CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  date        DATE PRIMARY KEY,
  total_value NUMERIC(18,6) NOT NULL
);

-- Append-only human-readable audit log of buys/swaps.
CREATE TABLE IF NOT EXISTS transactions (
  id         SERIAL PRIMARY KEY,
  date       DATE NOT NULL,
  type       TEXT NOT NULL,               -- 'initial_buy' | 'swap'
  ticker_out TEXT,
  ticker_in  TEXT NOT NULL,
  price      NUMERIC(18,6),               -- close of ticker_in on the date
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The graded "what happened & why" notes.
CREATE TABLE IF NOT EXISTS journal_entries (
  id         SERIAL PRIMARY KEY,
  date       DATE NOT NULL,
  note       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Observability for cron / manual refresh ("did the sync run?").
CREATE TABLE IF NOT EXISTS sync_runs (
  id          SERIAL PRIMARY KEY,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status      TEXT NOT NULL DEFAULT 'running', -- 'running' | 'ok' | 'error'
  trigger     TEXT,                            -- 'cron' | 'manual'
  error       TEXT,
  detail      JSONB
);
