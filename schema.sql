-- ============================================================
-- Futzin Marcador — Schema limpo
-- Cole no SQL Editor do Supabase e execute tudo de uma vez.
-- ============================================================

-- ── 1. EXTENSÕES ─────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── 2. TABELAS ───────────────────────────────────────────────

-- Grupos de futebol
create table groups (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  pin        text        not null,
  created_at timestamptz not null default now()
);

-- Jogadores do grupo
create table players (
  id            uuid        primary key default gen_random_uuid(),
  group_id      uuid        not null references groups(id) on delete cascade,
  name          text        not null,
  type          text        not null default 'FIXO' check (type in ('FIXO', 'COMPLETE')),
  preferred_pos text        check (preferred_pos in ('GK', 'FIXO', 'ALA_E', 'ALA_D', 'PIVO')),
  pace          int         not null default 50 check (pace between 0 and 99),
  shooting      int         not null default 50 check (shooting between 0 and 99),
  passing       int         not null default 50 check (passing between 0 and 99),
  defending     int         not null default 50 check (defending between 0 and 99),
  physical      int         not null default 50 check (physical between 0 and 99),
  active        bool        not null default true,
  created_at    timestamptz not null default now()
);

-- Sessão de jogo (dia de pelada — agrupa várias rodadas)
create table meetings (
  id         uuid        primary key default gen_random_uuid(),
  group_id   uuid        not null references groups(id) on delete cascade,
  starts_at  timestamptz not null default now(),
  ended_at   timestamptz,
  created_at timestamptz not null default now()
);

-- Rodada dentro de uma sessão
create table matches (
  id                 uuid        primary key default gen_random_uuid(),
  meeting_id         uuid        not null references meetings(id) on delete cascade,
  seq                int         not null default 1,
  status             text        not null default 'IN_PROGRESS' check (status in ('IN_PROGRESS', 'FINISHED')),
  team_a_name        text        not null default 'Time A',
  team_b_name        text        not null default 'Time B',
  waiting_team_name  text        not null default 'Time C',
  team_a_color       text        not null default '#FACC15',
  team_b_color       text        not null default '#3B82F6',
  waiting_team_color text        not null default '#A3A3A3',
  score_a            int         not null default 0,
  score_b            int         not null default 0,
  minutes            int         not null default 10,
  started_at         timestamptz,
  ended_at           timestamptz,
  -- campos de timer para o live screen
  timer_acc_ms       bigint      not null default 0,
  timer_started_at   timestamptz,
  created_at         timestamptz not null default now()
);

-- Quem jogou em cada rodada (sem conceito de banco — todos em campo)
create table match_roster (
  id        uuid primary key default gen_random_uuid(),
  match_id  uuid not null references matches(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  side      text not null check (side in ('A', 'B', 'C')),
  unique (match_id, player_id)
);

-- Stats pós-jogo: gols, assistências, defesas, DDs (fonte de verdade para rankings)
create table match_stats (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid not null references matches(id) on delete cascade,
  player_id  uuid not null references players(id) on delete cascade,
  goals      int  not null default 0,
  assists    int  not null default 0,
  saves      int  not null default 0,
  hard_saves int  not null default 0,
  unique (match_id, player_id)
);

-- Eventos ao vivo (apenas gols — para undo e histórico em tempo real)
create table match_events (
  id         uuid        primary key default gen_random_uuid(),
  match_id   uuid        not null references matches(id) on delete cascade,
  type       text        not null default 'GOAL' check (type = 'GOAL'),
  player_id  uuid        references players(id),
  assist_id  uuid        references players(id),
  side       text        check (side in ('A', 'B', 'C')),
  created_at timestamptz not null default now(),
  reverted   bool        not null default false
);

-- ── 3. ÍNDICES ───────────────────────────────────────────────
create index idx_players_group    on players(group_id);
create index idx_meetings_group   on meetings(group_id);
create index idx_matches_meeting  on matches(meeting_id);
create index idx_roster_match     on match_roster(match_id);
create index idx_roster_player    on match_roster(player_id);
create index idx_stats_match      on match_stats(match_id);
create index idx_stats_player     on match_stats(player_id);
create index idx_events_match     on match_events(match_id);
create index idx_meetings_starts  on meetings(starts_at);

-- ── 4. DESABILITAR RLS (app usa PIN próprio) ─────────────────
alter table groups       disable row level security;
alter table players      disable row level security;
alter table meetings     disable row level security;
alter table matches      disable row level security;
alter table match_roster disable row level security;
alter table match_stats  disable row level security;
alter table match_events disable row level security;

-- ── 5. RPC — AUTENTICAÇÃO / PIN ──────────────────────────────

create or replace function check_edit_pin_for_group(p_group_id uuid, p_pin text)
returns bool language plpgsql security definer as $$
begin
  return exists (select 1 from groups where id = p_group_id and pin = p_pin);
end;
$$;

create or replace function check_edit_pin_for_match(p_match_id uuid, p_pin text)
returns bool language plpgsql security definer as $$
declare v_group_id uuid;
begin
  select g.id into v_group_id
  from matches m
  join meetings mt on mt.id = m.meeting_id
  join groups g    on g.id  = mt.group_id
  where m.id = p_match_id;

  return exists (select 1 from groups where id = v_group_id and pin = p_pin);
end;
$$;

-- ── 6. RPC — GRUPOS ──────────────────────────────────────────

create or replace function create_group_with_pin(p_name text, p_pin text)
returns uuid language plpgsql security definer as $$
declare v_id uuid;
begin
  if length(trim(p_pin)) < 4 then
    raise exception 'PIN precisa ter pelo menos 4 caracteres';
  end if;
  insert into groups (name, pin)
  values (trim(p_name), trim(p_pin))
  returning id into v_id;
  return v_id;
end;
$$;

-- ── 7. RPC — JOGADORES ───────────────────────────────────────

create or replace function create_player(p_group_id uuid, p_name text, p_type text, p_pin text)
returns uuid language plpgsql security definer as $$
declare v_id uuid;
begin
  if not (select check_edit_pin_for_group(p_group_id, p_pin)) then
    raise exception 'PIN inválido';
  end if;
  insert into players (group_id, name, type)
  values (p_group_id, trim(p_name), p_type)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function rename_player(p_player_id uuid, p_name text, p_pin text)
returns void language plpgsql security definer as $$
declare v_group_id uuid;
begin
  select group_id into v_group_id from players where id = p_player_id;
  if not (select check_edit_pin_for_group(v_group_id, p_pin)) then
    raise exception 'PIN inválido';
  end if;
  update players set name = trim(p_name) where id = p_player_id;
end;
$$;

create or replace function set_player_type(p_player_id uuid, p_type text, p_pin text)
returns void language plpgsql security definer as $$
declare v_group_id uuid;
begin
  select group_id into v_group_id from players where id = p_player_id;
  if not (select check_edit_pin_for_group(v_group_id, p_pin)) then
    raise exception 'PIN inválido';
  end if;
  update players set type = p_type where id = p_player_id;
end;
$$;

create or replace function set_player_active(p_player_id uuid, p_active bool, p_pin text)
returns void language plpgsql security definer as $$
declare v_group_id uuid;
begin
  select group_id into v_group_id from players where id = p_player_id;
  if not (select check_edit_pin_for_group(v_group_id, p_pin)) then
    raise exception 'PIN inválido';
  end if;
  update players set active = p_active where id = p_player_id;
end;
$$;

create or replace function update_player_card(
  p_player_id   uuid,
  p_preferred_pos text,
  p_pace        int,
  p_shooting    int,
  p_passing     int,
  p_defending   int,
  p_physical    int,
  p_pin         text
) returns void language plpgsql security definer as $$
declare v_group_id uuid;
begin
  select group_id into v_group_id from players where id = p_player_id;
  if not (select check_edit_pin_for_group(v_group_id, p_pin)) then
    raise exception 'PIN inválido';
  end if;
  update players set
    preferred_pos = p_preferred_pos,
    pace          = p_pace,
    shooting      = p_shooting,
    passing       = p_passing,
    defending     = p_defending,
    physical      = p_physical
  where id = p_player_id;
end;
$$;

-- ── 8. RPC — PARTIDAS ────────────────────────────────────────

create or replace function create_meeting_and_match(
  p_group_id    uuid,
  p_starts_at   timestamptz,
  p_minutes     int,
  p_team_a_name text,
  p_team_b_name text,
  p_pin         text
) returns json language plpgsql security definer as $$
declare
  v_meeting_id uuid;
  v_match_id   uuid;
begin
  if not (select check_edit_pin_for_group(p_group_id, p_pin)) then
    raise exception 'PIN inválido';
  end if;

  insert into meetings (group_id, starts_at)
  values (p_group_id, p_starts_at)
  returning id into v_meeting_id;

  insert into matches (meeting_id, seq, minutes, team_a_name, team_b_name)
  values (v_meeting_id, 1, p_minutes, p_team_a_name, p_team_b_name)
  returning id into v_match_id;

  return json_build_object('meeting_id', v_meeting_id, 'match_id', v_match_id);
end;
$$;

create or replace function update_match_meta(
  p_match_id         uuid,
  p_team_a_name      text,
  p_team_b_name      text,
  p_waiting_team_name text,
  p_team_a_color     text,
  p_team_b_color     text,
  p_waiting_team_color text,
  p_pin              text
) returns void language plpgsql security definer as $$
begin
  if not (select check_edit_pin_for_match(p_match_id, p_pin)) then
    raise exception 'PIN inválido';
  end if;
  update matches set
    team_a_name        = p_team_a_name,
    team_b_name        = p_team_b_name,
    waiting_team_name  = p_waiting_team_name,
    team_a_color       = p_team_a_color,
    team_b_color       = p_team_b_color,
    waiting_team_color = p_waiting_team_color
  where id = p_match_id;
end;
$$;

-- Salvar roster (só player_id e side — sem estado de banco/quadra)
create or replace function set_match_roster(
  p_match_id uuid,
  p_items    json,   -- [{player_id, side}]
  p_pin      text
) returns void language plpgsql security definer as $$
begin
  if not (select check_edit_pin_for_match(p_match_id, p_pin)) then
    raise exception 'PIN inválido';
  end if;

  delete from match_roster where match_id = p_match_id;

  insert into match_roster (match_id, player_id, side)
  select p_match_id,
         (x->>'player_id')::uuid,
         x->>'side'
  from json_array_elements(p_items) as x;
end;
$$;

-- Timer do live screen
create or replace function set_match_timer(
  p_match_id   uuid,
  p_acc_ms     bigint,
  p_started_at timestamptz,
  p_pin        text
) returns void language plpgsql security definer as $$
begin
  if not (select check_edit_pin_for_match(p_match_id, p_pin)) then
    raise exception 'PIN inválido';
  end if;
  update matches set
    timer_acc_ms     = p_acc_ms,
    timer_started_at = p_started_at
  where id = p_match_id;
end;
$$;

-- ── 9. RPC — EVENTOS AO VIVO (GOLS) ─────────────────────────

-- Registrar gol: atualiza match_events + match_stats + placar
create or replace function add_goal_event(
  p_match_id  uuid,
  p_player_id uuid,
  p_assist_id uuid,
  p_side      text,
  p_pin       text
) returns void language plpgsql security definer as $$
begin
  if not (select check_edit_pin_for_match(p_match_id, p_pin)) then
    raise exception 'PIN inválido';
  end if;

  -- Registrar evento
  insert into match_events (match_id, type, player_id, assist_id, side)
  values (p_match_id, 'GOAL', p_player_id, p_assist_id, p_side);

  -- Stats do goleador
  insert into match_stats (match_id, player_id, goals)
  values (p_match_id, p_player_id, 1)
  on conflict (match_id, player_id)
  do update set goals = match_stats.goals + 1;

  -- Stats do assistente
  if p_assist_id is not null then
    insert into match_stats (match_id, player_id, assists)
    values (p_match_id, p_assist_id, 1)
    on conflict (match_id, player_id)
    do update set assists = match_stats.assists + 1;
  end if;

  -- Atualizar placar
  if p_side = 'A' then
    update matches set score_a = score_a + 1 where id = p_match_id;
  elsif p_side = 'B' then
    update matches set score_b = score_b + 1 where id = p_match_id;
  end if;
end;
$$;

-- Desfazer último evento
create or replace function undo_last_event(p_match_id uuid, p_pin text)
returns void language plpgsql security definer as $$
declare v_ev record;
begin
  if not (select check_edit_pin_for_match(p_match_id, p_pin)) then
    raise exception 'PIN inválido';
  end if;

  select * into v_ev
  from match_events
  where match_id = p_match_id and reverted = false
  order by created_at desc
  limit 1;

  if not found then return; end if;

  update match_events set reverted = true where id = v_ev.id;

  -- Reverter goleador
  if v_ev.player_id is not null then
    update match_stats
    set goals = greatest(0, goals - 1)
    where match_id = p_match_id and player_id = v_ev.player_id;
  end if;

  -- Reverter assistente
  if v_ev.assist_id is not null then
    update match_stats
    set assists = greatest(0, assists - 1)
    where match_id = p_match_id and player_id = v_ev.assist_id;
  end if;

  -- Reverter placar
  if v_ev.side = 'A' then
    update matches set score_a = greatest(0, score_a - 1) where id = p_match_id;
  elsif v_ev.side = 'B' then
    update matches set score_b = greatest(0, score_b - 1) where id = p_match_id;
  end if;
end;
$$;

-- Buscar eventos recentes (live screen)
create or replace function get_match_recent_events(p_match_id uuid, p_limit int default 10)
returns table (
  id         uuid,
  type       text,
  side       text,
  player_id  uuid,
  assist_id  uuid,
  created_at timestamptz,
  reverted   bool
) language plpgsql security definer as $$
begin
  return query
  select e.id, e.type, e.side, e.player_id, e.assist_id, e.created_at, e.reverted
  from match_events e
  where e.match_id = p_match_id
  order by e.created_at desc
  limit p_limit;
end;
$$;

-- ── 10. RPC — ENCERRAMENTO DE RODADAS ────────────────────────

-- Finalizar rodada e criar próxima com mesmo roster
create or replace function finish_and_create_next_same_roster(p_match_id uuid, p_pin text)
returns uuid language plpgsql security definer as $$
declare
  v_match  record;
  v_new_id uuid;
begin
  if not (select check_edit_pin_for_match(p_match_id, p_pin)) then
    raise exception 'PIN inválido';
  end if;

  select * into v_match from matches where id = p_match_id;

  update matches set status = 'FINISHED', ended_at = now() where id = p_match_id;

  insert into matches (
    meeting_id, seq, minutes,
    team_a_name, team_b_name, waiting_team_name,
    team_a_color, team_b_color, waiting_team_color
  ) values (
    v_match.meeting_id, v_match.seq + 1, v_match.minutes,
    v_match.team_a_name, v_match.team_b_name, v_match.waiting_team_name,
    v_match.team_a_color, v_match.team_b_color, v_match.waiting_team_color
  ) returning id into v_new_id;

  -- Copiar roster completo
  insert into match_roster (match_id, player_id, side)
  select v_new_id, player_id, side
  from match_roster
  where match_id = p_match_id;

  return v_new_id;
end;
$$;

-- Finalizar rodada com rotação de times (A/B/C)
-- p_next_waiting_side: qual time vai para a fila de espera
-- Os jogadores desse time passam para side='C', e o time C entra no lugar
create or replace function finish_and_create_next_with_rotation(
  p_match_id          uuid,
  p_next_waiting_side text,  -- 'A' ou 'B' (quem sai)
  p_playing_side_1    text,  -- 'A' (quem fica como A)
  p_playing_side_2    text,  -- 'B' (quem fica como B, vindo do C)
  p_pin               text
) returns uuid language plpgsql security definer as $$
declare
  v_match  record;
  v_new_id uuid;
begin
  if not (select check_edit_pin_for_match(p_match_id, p_pin)) then
    raise exception 'PIN inválido';
  end if;

  select * into v_match from matches where id = p_match_id;

  update matches set status = 'FINISHED', ended_at = now() where id = p_match_id;

  insert into matches (
    meeting_id, seq, minutes,
    team_a_name, team_b_name, waiting_team_name,
    team_a_color, team_b_color, waiting_team_color
  ) values (
    v_match.meeting_id, v_match.seq + 1, v_match.minutes,
    v_match.team_a_name, v_match.team_b_name, v_match.waiting_team_name,
    v_match.team_a_color, v_match.team_b_color, v_match.waiting_team_color
  ) returning id into v_new_id;

  -- Rotacionar sides:
  -- Quem estava em p_next_waiting_side → vai para 'C'
  -- Quem estava em 'C' → vai para o lado que p_next_waiting_side ocupava
  -- Quem estava no outro lado → fica igual
  insert into match_roster (match_id, player_id, side)
  select
    v_new_id,
    mr.player_id,
    case mr.side
      when p_next_waiting_side then 'C'
      when 'C'                 then p_next_waiting_side
      else mr.side
    end
  from match_roster mr
  where mr.match_id = p_match_id;

  return v_new_id;
end;
$$;

-- Encerrar sessão de jogo (meeting)
create or replace function end_match(p_match_id uuid, p_pin text)
returns uuid language plpgsql security definer as $$
declare v_meeting_id uuid;
begin
  if not (select check_edit_pin_for_match(p_match_id, p_pin)) then
    raise exception 'PIN inválido';
  end if;

  select meeting_id into v_meeting_id from matches where id = p_match_id;

  update matches  set status = 'FINISHED', ended_at = now() where id = p_match_id;
  update meetings set ended_at = now()                        where id = v_meeting_id;

  return v_meeting_id;
end;
$$;

-- ── 11. RPC — CONSULTAS / RELATÓRIOS ─────────────────────────

-- Rodadas de um meeting
create or replace function get_meeting_matches(p_meeting_id uuid)
returns table (
  match_id    uuid,
  seq         int,
  status      text,
  team_a_name text,
  team_b_name text,
  minutes     int,
  started_at  timestamptz,
  ended_at    timestamptz,
  score_a     int,
  score_b     int
) language plpgsql security definer as $$
begin
  return query
  select
    m.id, m.seq, m.status,
    m.team_a_name, m.team_b_name,
    m.minutes, m.started_at, m.ended_at,
    m.score_a, m.score_b
  from matches m
  where m.meeting_id = p_meeting_id
  order by m.seq;
end;
$$;

-- Stats consolidadas de todos os jogadores de um meeting
create or replace function get_meeting_player_stats(p_meeting_id uuid)
returns table (
  player_id   uuid,
  player_name text,
  goals       bigint,
  assists     bigint,
  saves       bigint,
  hard_saves  bigint,
  points      numeric
) language plpgsql security definer as $$
begin
  return query
  select
    p.id                                                                          as player_id,
    p.name                                                                        as player_name,
    coalesce(sum(ms.goals),      0)::bigint                                       as goals,
    coalesce(sum(ms.assists),    0)::bigint                                       as assists,
    coalesce(sum(ms.saves),      0)::bigint                                       as saves,
    coalesce(sum(ms.hard_saves), 0)::bigint                                       as hard_saves,
    coalesce(sum(ms.goals*2 + ms.assists*1 + ms.saves*0.25 + ms.hard_saves*1), 0) as points
  from match_stats ms
  join matches m  on m.id  = ms.match_id
  join players p  on p.id  = ms.player_id
  where m.meeting_id = p_meeting_id
  group by p.id, p.name
  order by points desc, goals desc;
end;
$$;

-- Ranking por período (mês / trimestre / ano)
create or replace function get_group_ranking_period(
  p_group_id uuid,
  p_period   text,          -- 'MONTH' | 'QUARTER' | 'YEAR'
  p_ref      timestamptz default now()
) returns table (
  player_id   uuid,
  player_name text,
  goals       bigint,
  assists     bigint,
  saves       bigint,
  hard_saves  bigint,
  points      numeric
) language plpgsql security definer as $$
declare v_from timestamptz;
begin
  v_from := case p_period
    when 'MONTH'   then date_trunc('month',   p_ref)
    when 'QUARTER' then date_trunc('quarter', p_ref)
    when 'YEAR'    then date_trunc('year',    p_ref)
    else                date_trunc('month',   p_ref)
  end;

  return query
  select
    p.id                                                                           as player_id,
    p.name                                                                         as player_name,
    coalesce(sum(ms.goals),      0)::bigint                                        as goals,
    coalesce(sum(ms.assists),    0)::bigint                                        as assists,
    coalesce(sum(ms.saves),      0)::bigint                                        as saves,
    coalesce(sum(ms.hard_saves), 0)::bigint                                        as hard_saves,
    coalesce(sum(ms.goals*2 + ms.assists*1 + ms.saves*0.25 + ms.hard_saves*1), 0)  as points
  from match_stats ms
  join matches  m  on m.id       = ms.match_id
  join meetings mt on mt.id      = m.meeting_id
  join players  p  on p.id       = ms.player_id
  where mt.group_id  = p_group_id
    and mt.starts_at >= v_from
    and p.active      = true
  group by p.id, p.name
  having coalesce(sum(ms.goals + ms.assists + ms.saves + ms.hard_saves), 0) > 0
  order by points desc, goals desc;
end;
$$;

-- Histórico de um jogador (últimos N jogos)
create or replace function get_player_history(p_player_id uuid, p_limit int default 20)
returns table (
  meeting_id     uuid,
  meeting_date   timestamptz,
  goals          bigint,
  assists        bigint,
  saves          bigint,
  hard_saves     bigint,
  goals_against  bigint,
  points         numeric,
  matches_played bigint
) language plpgsql security definer as $$
begin
  return query
  select
    mt.id                                                                           as meeting_id,
    mt.starts_at                                                                    as meeting_date,
    coalesce(sum(ms.goals),      0)::bigint                                         as goals,
    coalesce(sum(ms.assists),    0)::bigint                                         as assists,
    coalesce(sum(ms.saves),      0)::bigint                                         as saves,
    coalesce(sum(ms.hard_saves), 0)::bigint                                         as hard_saves,
    0::bigint                                                                       as goals_against,
    coalesce(sum(ms.goals*2 + ms.assists*1 + ms.saves*0.25 + ms.hard_saves*1), 0)  as points,
    count(distinct ms.match_id)::bigint                                             as matches_played
  from meetings mt
  join matches     m  on m.meeting_id = mt.id
  join match_stats ms on ms.match_id  = m.id and ms.player_id = p_player_id
  group by mt.id, mt.starts_at
  order by mt.starts_at desc
  limit p_limit;
end;
$$;
