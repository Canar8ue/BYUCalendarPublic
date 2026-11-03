-- The daily digest becomes opt-in: nobody is emailed until they turn the
-- digest on from /account (or re-enable it after unsubscribing). The legacy
-- opted_out column stays in place so a rollback to the previous release keeps
-- working, and new code only reads opted_in.
ALTER TABLE `email_digests` ADD COLUMN `opted_in` integer DEFAULT false NOT NULL;
