-- Register dispatch cron in the *postgres* database (pg_cron is not installed per-tenant).
-- Set psql variables before running:
--   \set dispatch_url 'https://adralproject-uspulzkzew.indobase.in/functions/v1/scheduled-tasks-dispatch'
--   \set cron_secret 'your-schedule-cron-secret'

select cron.unschedule(jobid)
from cron.job
where jobname = 'adral-scheduled-tasks-dispatch';

select cron.schedule(
  'adral-scheduled-tasks-dispatch',
  '* * * * *',
  $$
  select net.http_post(
    url := :'dispatch_url',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Schedule-Cron-Secret', :'cron_secret'
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
