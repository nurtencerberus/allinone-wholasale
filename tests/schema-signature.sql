-- Prints a sorted fingerprint of the public schema (columns, constraints, indexes).
-- CI compares "main's schema + db/migrations" with "db/schema.sql" using it.
\pset format unaligned
\pset tuples_only on
select 'col ' || table_name || '.' || column_name || ' ' || data_type || ' ' || is_nullable || ' ' || coalesce(column_default, '')
  from information_schema.columns where table_schema = 'public' order by 1;
select 'con ' || conrelid::regclass || ' ' || conname || ' ' || pg_get_constraintdef(oid)
  from pg_constraint where connamespace = 'public'::regnamespace order by 1;
select 'idx ' || indexname || ' ' || indexdef from pg_indexes where schemaname = 'public' order by 1;
