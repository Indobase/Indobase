-- Tenantized Storage metadata (single shared DB + strict RLS)
--
-- Makes storage buckets/objects tenant-aware via `project_ref` and applies FORCE RLS.
-- Requires `app.project_ref()` from `tenant-rls.sql`.

do $$
declare
  p record;
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'storage.buckets/objects not found; skipping storage tenant RLS';
    return;
  end if;

  -- Add tenant key columns (nullable; policies will hide NULL rows, triggers will populate on insert).
  execute 'alter table storage.buckets add column if not exists project_ref text';
  execute 'alter table storage.objects add column if not exists project_ref text';

  execute 'create index if not exists buckets_project_ref_idx on storage.buckets (project_ref)';
  execute 'create index if not exists objects_project_ref_idx on storage.objects (project_ref)';
  execute 'create index if not exists objects_project_ref_bucket_id_idx on storage.objects (project_ref, bucket_id)';

  -- Ensure inserts are tagged with the active tenant.
  execute $fn$
    create or replace function storage.set_bucket_project_ref()
    returns trigger
    language plpgsql
    as $$
    begin
      if new.project_ref is null then
        new.project_ref := app.project_ref();
      end if;
      return new;
    end;
    $$;
  $fn$;

  execute 'drop trigger if exists tr_storage_buckets_project_ref on storage.buckets';
  execute 'create trigger tr_storage_buckets_project_ref before insert on storage.buckets for each row execute function storage.set_bucket_project_ref()';

  execute $fn$
    create or replace function storage.set_object_project_ref()
    returns trigger
    language plpgsql
    as $$
    begin
      if new.project_ref is null then
        select b.project_ref into new.project_ref
        from storage.buckets b
        where b.id = new.bucket_id;
      end if;
      if new.project_ref is null then
        new.project_ref := app.project_ref();
      end if;
      return new;
    end;
    $$;
  $fn$;

  execute 'drop trigger if exists tr_storage_objects_project_ref on storage.objects';
  execute 'create trigger tr_storage_objects_project_ref before insert on storage.objects for each row execute function storage.set_object_project_ref()';

  -- Enforce tenant isolation (FORCE RLS) and remove permissive policies.
  execute 'alter table storage.buckets enable row level security';
  execute 'alter table storage.buckets force row level security';
  execute 'alter table storage.objects enable row level security';
  execute 'alter table storage.objects force row level security';

  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'storage' and tablename in ('buckets','objects')
  loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;

  execute $pol$
    create policy tenant_isolation on storage.buckets
      for all
      using (project_ref = app.project_ref())
      with check (project_ref = app.project_ref());
  $pol$;

  execute $pol$
    create policy tenant_isolation on storage.objects
      for all
      using (project_ref = app.project_ref())
      with check (project_ref = app.project_ref());
  $pol$;
end;
$$;

