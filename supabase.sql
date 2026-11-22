-- ============================================================
--  MODULI LIVE — database per Supabase
--  Incolla tutto in Supabase → SQL Editor → Run.
--  Si può rieseguire (aggiorna le funzioni, non cancella i dati).
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- TABELLE ----------
create table if not exists public.forms (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null,
  code        text not null unique,
  title       text not null default 'Modulo senza titolo',
  description text not null default '',
  theme       jsonb not null default '{}'::jsonb,
  settings    jsonb not null default '{}'::jsonb,
  content     jsonb not null default '{"sections":[]}'::jsonb,
  state       jsonb not null default '{"open":true,"active_section":null,"hidden":{},"round":1}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists forms_owner_idx on public.forms(owner);

create table if not exists public.responses (
  form_id     uuid not null references public.forms(id) on delete cascade,
  round       int  not null,
  session_id  text not null,
  question_id text not null,
  value       jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (form_id, round, session_id, question_id)
);
create index if not exists responses_q_idx on public.responses(form_id, round, question_id);

create table if not exists public.sessions (
  form_id    uuid not null references public.forms(id) on delete cascade,
  round      int  not null,
  session_id text not null,
  started_at timestamptz not null default now(),
  done_at    timestamptz,
  primary key (form_id, round, session_id)
);

create table if not exists public.qa_items (
  id          bigserial primary key,
  form_id     uuid not null references public.forms(id) on delete cascade,
  round       int  not null,
  question_id text not null,
  session_id  text not null,
  body        text not null,
  hidden      boolean not null default false,
  answered    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists qa_items_idx on public.qa_items(form_id, round, question_id);

create table if not exists public.qa_votes (
  item_id    bigint not null references public.qa_items(id) on delete cascade,
  session_id text not null,
  primary key (item_id, session_id)
);

-- Nessun accesso diretto alle tabelle: tutto passa dalle funzioni qui sotto.
alter table public.forms     enable row level security;
alter table public.responses enable row level security;
alter table public.sessions  enable row level security;
alter table public.qa_items  enable row level security;
alter table public.qa_votes  enable row level security;
revoke all on public.forms, public.responses, public.sessions, public.qa_items, public.qa_votes from anon, authenticated;

-- ---------- FUNZIONI DI SERVIZIO ----------
create or replace function public._form_by_code(p_code text)
returns public.forms language sql stable security definer set search_path = public as $$
  select * from public.forms where code = lower(btrim(p_code)) limit 1;
$$;

create or replace function public._question(p_form public.forms, p_qid text)
returns jsonb language sql immutable as $$
  select q from jsonb_array_elements(coalesce(p_form.content->'sections','[]'::jsonb)) s,
                jsonb_array_elements(coalesce(s->'questions','[]'::jsonb)) q
  where q->>'id' = p_qid limit 1;
$$;

create or replace function public._section_of(p_form public.forms, p_qid text)
returns text language sql immutable as $$
  select s->>'id' from jsonb_array_elements(coalesce(p_form.content->'sections','[]'::jsonb)) s,
                       jsonb_array_elements(coalesce(s->'questions','[]'::jsonb)) q
  where q->>'id' = p_qid limit 1;
$$;

create or replace function public._can_answer(p_form public.forms, p_qid text)
returns void language plpgsql stable as $$
begin
  if p_form.id is null then raise exception 'not_found'; end if;
  if not coalesce((p_form.state->>'open')::boolean, true) then raise exception 'closed'; end if;
  if public._question(p_form, p_qid) is null then raise exception 'bad_question'; end if;
  if coalesce(p_form.settings->>'mode','free') = 'guided'
     and public._section_of(p_form, p_qid) is distinct from (p_form.state->>'active_section') then
    raise exception 'closed';
  end if;
end $$;

create or replace function public._check_sid(p_sid text)
returns void language plpgsql immutable as $$
begin
  if p_sid is null or char_length(p_sid) not between 8 and 64 then raise exception 'bad_session'; end if;
end $$;

create or replace function public._round(p_form public.forms)
returns int language sql immutable as $$ select coalesce((p_form.state->>'round')::int, 1) $$;

create or replace function public._own(p_id uuid)
returns public.forms language plpgsql stable security definer set search_path = public as $$
declare f public.forms;
begin
  select * into f from public.forms where id = p_id;
  if f.id is null or auth.uid() is null or f.owner <> auth.uid() then raise exception 'forbidden'; end if;
  return f;
end $$;

-- ---------- FUNZIONI PUBBLICHE (partecipanti) ----------
create or replace function public.f_get(p_code text)
returns json language plpgsql stable security definer set search_path = public as $$
declare f public.forms;
begin
  f := public._form_by_code(p_code);
  if f.id is null then return null; end if;
  return json_build_object('code', f.code, 'title', f.title, 'description', f.description,
    'theme', f.theme, 'settings', f.settings, 'content', f.content,
    'state', json_build_object('open', coalesce((f.state->>'open')::boolean, true),
                               'active_section', f.state->'active_section', 'round', public._round(f)),
    'version', extract(epoch from f.updated_at));
end $$;

-- versione "leggera" per i controlli periodici
create or replace function public.f_state(p_code text)
returns json language plpgsql stable security definer set search_path = public as $$
declare f public.forms;
begin
  f := public._form_by_code(p_code);
  if f.id is null then return null; end if;
  return json_build_object('open', coalesce((f.state->>'open')::boolean, true),
    'active_section', f.state->'active_section', 'round', public._round(f),
    'version', extract(epoch from f.updated_at));
end $$;

create or replace function public.f_submit(p_code text, p_sid text, p_answers jsonb, p_done boolean default false)
returns json language plpgsql security definer set search_path = public as $$
declare f public.forms; k text; v jsonb; r int; n int := 0;
begin
  f := public._form_by_code(p_code);
  if f.id is null then raise exception 'not_found'; end if;
  perform public._check_sid(p_sid);
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then raise exception 'bad_answers'; end if;
  r := public._round(f);
  if not coalesce((f.state->>'open')::boolean, true) then raise exception 'closed'; end if;
  for k, v in select * from jsonb_each(p_answers) loop
    n := n + 1;
    if n > 200 then raise exception 'too_many'; end if;
    perform public._can_answer(f, k);
    if char_length(v::text) > 4000 then raise exception 'too_long'; end if;
    if v = 'null'::jsonb or v = '""'::jsonb or v = '[]'::jsonb then
      delete from public.responses where form_id = f.id and round = r and session_id = p_sid and question_id = k;
    else
      insert into public.responses (form_id, round, session_id, question_id, value)
      values (f.id, r, p_sid, k, v)
      on conflict (form_id, round, session_id, question_id)
      do update set value = excluded.value, updated_at = now();
    end if;
  end loop;
  insert into public.sessions (form_id, round, session_id, done_at)
  values (f.id, r, p_sid, case when p_done then now() end)
  on conflict (form_id, round, session_id)
  do update set done_at = coalesce(case when p_done then now() end, public.sessions.done_at);
  return json_build_object('ok', true, 'round', r);
end $$;

create or replace function public.qa_list(p_code text, p_qid text, p_sid text)
returns json language plpgsql stable security definer set search_path = public as $$
declare f public.forms;
begin
  f := public._form_by_code(p_code);
  if f.id is null then raise exception 'not_found'; end if;
  return coalesce((
    select json_agg(x order by x.answered, x.votes desc, x.created_at) from (
      select i.id, i.body, i.answered, i.created_at,
             (select count(*) from public.qa_votes v where v.item_id = i.id)::int as votes,
             exists (select 1 from public.qa_votes v where v.item_id = i.id and v.session_id = p_sid) as mine,
             (i.session_id = p_sid) as own
      from public.qa_items i
      where i.form_id = f.id and i.round = public._round(f) and i.question_id = p_qid and not i.hidden
      order by i.created_at desc limit 300) x), '[]'::json);
end $$;

create or replace function public.qa_ask(p_code text, p_sid text, p_qid text, p_text text)
returns json language plpgsql security definer set search_path = public as $$
declare f public.forms; r int;
begin
  f := public._form_by_code(p_code);
  perform public._check_sid(p_sid);
  perform public._can_answer(f, p_qid);
  if coalesce(public._question(f, p_qid)->>'type','') <> 'qa' then raise exception 'bad_question'; end if;
  if p_text is null or char_length(btrim(p_text)) = 0 or char_length(p_text) > 280 then raise exception 'too_long'; end if;
  r := public._round(f);
  if (select count(*) from public.qa_items where form_id = f.id and round = r and question_id = p_qid and session_id = p_sid) >= 5 then
    raise exception 'limit';
  end if;
  insert into public.qa_items (form_id, round, question_id, session_id, body) values (f.id, r, p_qid, p_sid, btrim(p_text));
  insert into public.sessions (form_id, round, session_id) values (f.id, r, p_sid) on conflict do nothing;
  return json_build_object('ok', true);
end $$;

create or replace function public.qa_vote(p_code text, p_sid text, p_item bigint, p_on boolean)
returns json language plpgsql security definer set search_path = public as $$
declare f public.forms;
begin
  f := public._form_by_code(p_code);
  if f.id is null then raise exception 'not_found'; end if;
  perform public._check_sid(p_sid);
  if not exists (select 1 from public.qa_items where id = p_item and form_id = f.id and round = public._round(f)) then
    raise exception 'not_found';
  end if;
  if p_on then
    insert into public.qa_votes (item_id, session_id) values (p_item, p_sid) on conflict do nothing;
  else
    delete from public.qa_votes where item_id = p_item and session_id = p_sid;
  end if;
  return json_build_object('ok', true);
end $$;

-- ---------- FUNZIONI DI GESTIONE (solo tu, dopo il login) ----------
create or replace function public.a_list()
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'forbidden'; end if;
  return coalesce((select json_agg(x order by x.updated_at desc) from (
    select f.id, f.code, f.title, f.updated_at, f.created_at,
           coalesce(f.settings->>'mode','free') as mode,
           coalesce((f.state->>'open')::boolean, true) as open,
           (select count(*) from public.sessions s where s.form_id = f.id and s.round = public._round(f) and s.done_at is not null)::int as done,
           (select count(*) from public.sessions s where s.form_id = f.id and s.round = public._round(f))::int as started
    from public.forms f where f.owner = auth.uid()) x), '[]'::json);
end $$;

create or replace function public.a_get(p_id uuid)
returns json language plpgsql stable security definer set search_path = public as $$
declare f public.forms;
begin
  f := public._own(p_id);
  return row_to_json(f);
end $$;

create or replace function public.a_create(p_title text, p_description text, p_theme jsonb, p_settings jsonb, p_content jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare c text; i int; new_id uuid;
  alphabet text := 'abcdefghjkmnpqrstuvwxyz23456789';
begin
  if auth.uid() is null then raise exception 'forbidden'; end if;
  loop
    c := '';
    for i in 1..6 loop c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1); end loop;
    exit when not exists (select 1 from public.forms where code = c);
  end loop;
  insert into public.forms (owner, code, title, description, theme, settings, content)
  values (auth.uid(), c, coalesce(nullif(btrim(p_title),''), 'Modulo senza titolo'), coalesce(p_description,''),
          coalesce(p_theme,'{}'::jsonb), coalesce(p_settings,'{}'::jsonb), coalesce(p_content,'{"sections":[]}'::jsonb))
  returning id into new_id;
  return json_build_object('id', new_id, 'code', c);
end $$;

create or replace function public.a_save(p_id uuid, p_title text, p_description text, p_theme jsonb, p_settings jsonb, p_content jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare f public.forms; t timestamptz;
begin
  f := public._own(p_id);
  if char_length(p_content::text) > 600000 then raise exception 'too_big'; end if;
  update public.forms set title = coalesce(p_title, title), description = coalesce(p_description, description),
    theme = coalesce(p_theme, theme), settings = coalesce(p_settings, settings), content = coalesce(p_content, content),
    updated_at = now()
  where id = p_id returning updated_at into t;
  return json_build_object('ok', true, 'updated_at', t);
end $$;

create or replace function public.a_delete(p_id uuid)
returns json language plpgsql security definer set search_path = public as $$
begin
  perform public._own(p_id);
  delete from public.forms where id = p_id;
  return json_build_object('ok', true);
end $$;

-- p_patch può contenere: open (bool), active_section (id o null), hidden (oggetto)
create or replace function public.a_set_state(p_id uuid, p_patch jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare f public.forms; st jsonb;
begin
  f := public._own(p_id);
  st := f.state;
  if p_patch ? 'open' then st := jsonb_set(st, '{open}', to_jsonb(coalesce((p_patch->>'open')::boolean, true))); end if;
  if p_patch ? 'active_section' then st := jsonb_set(st, '{active_section}', coalesce(p_patch->'active_section','null'::jsonb)); end if;
  if p_patch ? 'hidden' and jsonb_typeof(p_patch->'hidden') = 'object' then st := jsonb_set(st, '{hidden}', p_patch->'hidden'); end if;
  update public.forms set state = st, updated_at = updated_at where id = p_id;
  return st::json;
end $$;

-- Cancella tutte le risposte e ricomincia (es. dopo la prova generale)
create or replace function public.a_reset(p_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare f public.forms; st jsonb;
begin
  f := public._own(p_id);
  delete from public.responses where form_id = p_id;
  delete from public.sessions  where form_id = p_id;
  delete from public.qa_items  where form_id = p_id;
  st := jsonb_build_object('open', coalesce((f.state->>'open')::boolean, true), 'active_section', null,
                           'hidden', '{}'::jsonb, 'round', public._round(f) + 1);
  update public.forms set state = st where id = p_id;
  return st::json;
end $$;

create or replace function public.a_results(p_id uuid, p_qid text default null)
returns json language plpgsql stable security definer set search_path = public as $$
declare f public.forms; r int;
begin
  f := public._own(p_id);
  r := public._round(f);
  return json_build_object(
    'state', f.state,
    'started', (select count(*) from public.sessions where form_id = p_id and round = r),
    'done', (select count(*) from public.sessions where form_id = p_id and round = r and done_at is not null),
    'responses', coalesce((select json_agg(json_build_object('s', session_id, 'q', question_id, 'v', value, 't', updated_at) order by created_at)
                  from public.responses where form_id = p_id and round = r and (p_qid is null or question_id = p_qid)), '[]'::json),
    'qa', coalesce((select json_agg(json_build_object('id', i.id, 'q', i.question_id, 'body', i.body, 'hidden', i.hidden,
                     'answered', i.answered, 't', i.created_at,
                     'votes', (select count(*) from public.qa_votes v where v.item_id = i.id)) order by i.created_at)
                  from public.qa_items i where i.form_id = p_id and i.round = r and (p_qid is null or i.question_id = p_qid)), '[]'::json)
  );
end $$;

create or replace function public.a_qa_mod(p_id uuid, p_item bigint, p_hidden boolean, p_answered boolean)
returns json language plpgsql security definer set search_path = public as $$
begin
  perform public._own(p_id);
  update public.qa_items set hidden = coalesce(p_hidden, hidden), answered = coalesce(p_answered, answered)
  where id = p_item and form_id = p_id;
  return json_build_object('ok', true);
end $$;

-- ---------- PERMESSI ----------
do $$
declare fn text;
begin
  for fn in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and (p.proname like 'f\_%' or p.proname like 'qa\_%' or p.proname like 'a\_%' or p.proname like '\_%')
  loop
    execute 'revoke all on function ' || fn || ' from public, anon, authenticated';
  end loop;
end $$;
grant execute on function public.f_get(text), public.f_state(text), public.f_submit(text, text, jsonb, boolean),
  public.qa_list(text, text, text), public.qa_ask(text, text, text, text), public.qa_vote(text, text, bigint, boolean)
  to anon, authenticated;
grant execute on function public.a_list(), public.a_get(uuid), public.a_create(text, text, jsonb, jsonb, jsonb),
  public.a_save(uuid, text, text, jsonb, jsonb, jsonb), public.a_delete(uuid), public.a_set_state(uuid, jsonb),
  public.a_reset(uuid), public.a_results(uuid, text), public.a_qa_mod(uuid, bigint, boolean, boolean)
  to authenticated;

-- ---------- IMMAGINI (Supabase Storage) ----------
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('media', 'media', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
    on conflict (id) do update set public = true;
    execute 'drop policy if exists "media: caricamento proprio" on storage.objects';
    execute $p$create policy "media: caricamento proprio" on storage.objects for insert to authenticated
             with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
    execute 'drop policy if exists "media: modifica propria" on storage.objects';
    execute $p$create policy "media: modifica propria" on storage.objects for update to authenticated
             using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
    execute 'drop policy if exists "media: eliminazione propria" on storage.objects';
    execute $p$create policy "media: eliminazione propria" on storage.objects for delete to authenticated
             using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  end if;
end $$;

select 'Installazione completata ✔' as esito;
