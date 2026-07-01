-- Screen heartbeat for TV boards: stamped each time a TV loads or polls the
-- board, so /admin/tv can show whether a screen is actually online.
ALTER TABLE "TvBoard" ADD COLUMN "lastSeenAt" TIMESTAMP(3);
