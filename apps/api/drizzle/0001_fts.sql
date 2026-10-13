-- Full-text index over source chunks, kept in sync by triggers.
CREATE VIRTUAL TABLE `source_chunks_fts` USING fts5(
  `content`,
  `chunk_id` UNINDEXED,
  `project_id` UNINDEXED,
  tokenize = 'porter unicode61'
);
--> statement-breakpoint
CREATE TRIGGER `source_chunks_ai` AFTER INSERT ON `source_chunks` BEGIN
  INSERT INTO `source_chunks_fts` (`content`, `chunk_id`, `project_id`)
  VALUES (new.`content`, new.`id`, new.`project_id`);
END;
--> statement-breakpoint
CREATE TRIGGER `source_chunks_ad` AFTER DELETE ON `source_chunks` BEGIN
  DELETE FROM `source_chunks_fts` WHERE `chunk_id` = old.`id`;
END;
--> statement-breakpoint
CREATE TRIGGER `source_chunks_au` AFTER UPDATE OF `content` ON `source_chunks` BEGIN
  UPDATE `source_chunks_fts` SET `content` = new.`content` WHERE `chunk_id` = new.`id`;
END;
