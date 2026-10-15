-- Folders still on a retired schedule (15m, hourly, daily) move to every two days. 0010 does this
-- for databases it rebuilds; this catches any that applied 0010 before that line was added.
UPDATE `connector_scopes` SET `sync_frequency` = '2d' WHERE `sync_frequency` NOT IN ('2d', 'manual');
