CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit log is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit log is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER points_ledger_no_update BEFORE UPDATE ON points_ledger BEGIN SELECT RAISE(ABORT, 'points ledger is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER points_ledger_no_delete BEFORE DELETE ON points_ledger BEGIN SELECT RAISE(ABORT, 'points ledger is append-only'); END;
