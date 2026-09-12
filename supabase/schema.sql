-- ==============================================================================
-- AnimeList • Schema do Banco de Dados PostgreSQL (Supabase)
-- Execute este script no SQL Editor do painel do seu projeto no Supabase
-- ==============================================================================

-- 1. Criação da Tabela de Animes do Usuário
create table if not exists public.animes (
  id text not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  japanese_title text,
  cover_image text,
  banner_image text,
  format text default 'TV',
  status text not null default 'plan_to_watch',
  current_episode integer not null default 0,
  total_episodes integer,
  score numeric(3, 1) default 0,
  favorite boolean default false,
  season text,
  year integer,
  studio text,
  genres text[] default '{}',
  custom_tags text[] default '{}',
  synopsis text,
  general_notes text,
  episodes jsonb default '{}'::jsonb,
  links jsonb default '[]'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  primary key (id, user_id)
);

-- 2. Índices para buscas e ordenações rápidas
create index if not exists idx_animes_user_id on public.animes(user_id);
create index if not exists idx_animes_status on public.animes(user_id, status);
create index if not exists idx_animes_favorite on public.animes(user_id, favorite);
create index if not exists idx_animes_updated_at on public.animes(user_id, updated_at desc);

-- 3. Habilitar Segurança por Linha (Row Level Security - RLS)
alter table public.animes enable row level security;

-- 4. Políticas de RLS (Cada usuário só acessa e manipula seus próprios registros)
drop policy if exists "Usuários podem visualizar seus próprios animes" on public.animes;
create policy "Usuários podem visualizar seus próprios animes"
  on public.animes for select
  using (auth.uid() = user_id);

drop policy if exists "Usuários podem inserir seus próprios animes" on public.animes;
create policy "Usuários podem inserir seus próprios animes"
  on public.animes for insert
  with check (auth.uid() = user_id);

drop policy if exists "Usuários podem atualizar seus próprios animes" on public.animes;
create policy "Usuários podem atualizar seus próprios animes"
  on public.animes for update
  using (auth.uid() = user_id);

drop policy if exists "Usuários podem excluir seus próprios animes" on public.animes;
create policy "Usuários podem excluir seus próprios animes"
  on public.animes for delete
  using (auth.uid() = user_id);

-- 5. Função e Gatilho para atualização automática do campo updated_at
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists trigger_animes_updated_at on public.animes;
create trigger trigger_animes_updated_at
  before update on public.animes
  for each row
  execute function public.handle_updated_at();
