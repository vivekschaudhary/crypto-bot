-- Migration: add orders.base_quantity for paper-aware cockpit P&L (CB-6.7).
--
-- The orders ledger stored only USD `amount`, not the base quantity. The
-- cockpit's Profit/Loss (CB-6.2) + Current Position (CB-6.1) cards computed the
-- position from REAL Coinbase fills while `amount` (which counts dry_run paper
-- buys) drove "invested" — so while dark (LIVE_MODE=false) the cards compared
-- paper invested against a $0 real position ("$400 invested / $0 value").
--
-- CB-6.7 derives a PAPER position from the dry_run orders ledger while dark;
-- that needs the base quantity per order (the qty the order bought/sold).
-- Additive + nullable (append-only ledger preserved). Existing rows stay NULL
-- → excluded from the paper position (forward-only; a Reset Session starts a
-- fresh run whose orders carry base_quantity).

ALTER TABLE orders ADD COLUMN IF NOT EXISTS base_quantity numeric;
