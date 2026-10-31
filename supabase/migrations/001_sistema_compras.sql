-- =====================================================================
-- Sistema de Controle de Compras - Migration inicial (Supabase/PostgreSQL)
-- Login por usuario: o frontend converte "usuario" em "usuario@app.local"
-- e chama signInWithPassword. Usuarios sao criados por Edge Function
-- (service role), que tambem insere a linha em public.profiles.
-- =====================================================================

create extension if not exists citext;

-- ---------- Tipos ----------
create type user_role    as enum ('admin', 'operator');
create type list_status  as enum ('open', 'consolidated');
create type order_status as enum ('consolidated', 'sent', 'partially_received', 'received', 'cancelled');

-- ---------- Sequencias ----------
create sequence purchase_list_code_seq start 1;
create sequence purchase_order_number_seq start 1;

-- ---------- Funcoes auxiliares ----------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------- Tabelas ----------
create table profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  name       text not null,
  username   citext not null unique,
  role       user_role not null default 'operator',
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create or replace function is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and active) $$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and active and role = 'admin') $$;

create table stores (
  id uuid primary key default gen_random_uuid(),
  name text not null, address text, contact text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id)
);

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null, cnpj text, contact text, phone text, email text, notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id)
);

create table products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique, description text not null, category text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id)
);
create index on products using gin (to_tsvector('portuguese', description));

create table product_suppliers (
  product_id  uuid not null references products(id) on delete cascade,
  supplier_id uuid not null references suppliers(id) on delete restrict,
  created_at  timestamptz not null default now(),
  primary key (product_id, supplier_id)
);

create table purchase_lists (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default 'L-' || lpad(nextval('purchase_list_code_seq')::text, 5, '0'),
  name text not null,
  status list_status not null default 'open',
  last_activity_at timestamptz not null default now(),
  consolidated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id)
);

create table purchase_list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references purchase_lists(id) on delete cascade,
  entry_date date not null default (now() at time zone 'America/Sao_Paulo')::date,
  product_id  uuid not null references products(id),
  supplier_id uuid not null references suppliers(id),
  store_id    uuid not null references stores(id),
  quantity    integer not null check (quantity > 0),
  unit_price  numeric(12,2) not null check (unit_price >= 0),
  total       numeric(14,2) generated always as (quantity * unit_price) stored,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id),
  foreign key (product_id, supplier_id) references product_suppliers(product_id, supplier_id)
);
create index on purchase_list_items (list_id, entry_date);
create index on purchase_list_items (list_id, supplier_id, store_id);

create table purchase_orders (
  id uuid primary key default gen_random_uuid(),
  number text not null unique default 'P-' || lpad(nextval('purchase_order_number_seq')::text, 6, '0'),
  list_id     uuid not null references purchase_lists(id),
  supplier_id uuid not null references suppliers(id),
  store_id    uuid not null references stores(id),
  supplier_name text not null,           -- snapshot historico
  store_name    text not null,           -- snapshot historico
  status order_status not null default 'consolidated',
  total_amount numeric(14,2) not null default 0,
  notes text,
  sent_at timestamptz, cancelled_at timestamptz, cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id),
  unique (list_id, supplier_id, store_id)   -- impede pedido duplicado
);
create index on purchase_orders (status, created_at desc);

create table purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id   uuid not null references purchase_orders(id) on delete cascade,
  product_id uuid not null references products(id),
  sku text not null, description text not null,   -- snapshot historico
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  total numeric(14,2) generated always as (quantity * unit_price) stored,
  received_quantity integer not null default 0 check (received_quantity >= 0),
  created_at timestamptz not null default now(),
  unique (order_id, product_id, unit_price)
);

create table receipts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references purchase_orders(id),
  received_at date not null default (now() at time zone 'America/Sao_Paulo')::date,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id)
);

create table receipt_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references receipts(id) on delete cascade,
  order_item_id uuid not null references purchase_order_items(id),
  quantity integer not null check (quantity > 0)
);

-- updated_at
do $$ declare t text; begin
  foreach t in array array['profiles','stores','suppliers','products','purchase_lists','purchase_list_items','purchase_orders']
  loop execute format('create trigger trg_%1$s_updated before update on %1$s for each row execute function set_updated_at()', t); end loop;
end $$;

-- ---------- Imutabilidade de listas consolidadas ----------
create or replace function guard_list_items() returns trigger
language plpgsql as $$
declare v_list uuid := coalesce(new.list_id, old.list_id); v_status list_status;
begin
  select status into v_status from purchase_lists where id = v_list;
  if v_status is distinct from 'open' then
    raise exception 'Lista consolidada nao pode ser alterada';
  end if;
  update purchase_lists set last_activity_at = now() where id = v_list;
  return coalesce(new, old);
end $$;
create trigger trg_guard_items before insert or update or delete on purchase_list_items
  for each row execute function guard_list_items();

create or replace function guard_list() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'open' then raise exception 'Lista consolidada nao pode ser excluida'; end if;
    return old;
  end if;
  if old.status = 'consolidated' then raise exception 'Lista consolidada nao pode ser alterada'; end if;
  return new;
end $$;
create trigger trg_guard_list before update or delete on purchase_lists
  for each row execute function guard_list();

-- ---------- RPC: consolidar lista (transacional) ----------
create or replace function consolidate_purchase_list(p_list_id uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare v_status list_status; v_count integer;
begin
  if not is_active_user() then raise exception 'Acesso negado'; end if;

  select status into v_status from purchase_lists where id = p_list_id for update;
  if not found then raise exception 'Lista nao encontrada'; end if;
  if v_status <> 'open' then raise exception 'Lista ja consolidada'; end if;
  if not exists (select 1 from purchase_list_items where list_id = p_list_id) then
    raise exception 'Lista sem lancamentos';
  end if;

  insert into purchase_orders (list_id, supplier_id, store_id, supplier_name, store_name, created_by)
  select distinct i.list_id, i.supplier_id, i.store_id, s.name, st.name, auth.uid()
  from purchase_list_items i
  join suppliers s on s.id = i.supplier_id
  join stores st   on st.id = i.store_id
  where i.list_id = p_list_id;
  get diagnostics v_count = row_count;

  insert into purchase_order_items (order_id, product_id, sku, description, quantity, unit_price)
  select o.id, i.product_id, p.sku, p.description, sum(i.quantity), i.unit_price
  from purchase_list_items i
  join purchase_orders o on o.list_id = i.list_id and o.supplier_id = i.supplier_id and o.store_id = i.store_id
  join products p on p.id = i.product_id
  where i.list_id = p_list_id
  group by o.id, i.product_id, p.sku, p.description, i.unit_price;

  update purchase_orders o set total_amount =
    (select coalesce(sum(total), 0) from purchase_order_items where order_id = o.id)
  where o.list_id = p_list_id;

  update purchase_lists set status = 'consolidated', consolidated_at = now(), last_activity_at = now()
  where id = p_list_id;

  return v_count;
end $$;

-- ---------- RPC: registrar envio ----------
create or replace function mark_order_sent(p_order_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_active_user() then raise exception 'Acesso negado'; end if;
  update purchase_orders set status = 'sent', sent_at = now()
  where id = p_order_id and status = 'consolidated';
  if not found then raise exception 'Pedido nao esta no status Consolidado'; end if;
end $$;

-- ---------- RPC: cancelar pedido (somente admin; sem recebimentos) ----------
create or replace function cancel_purchase_order(p_order_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Somente administrador pode cancelar'; end if;
  if exists (select 1 from receipts where order_id = p_order_id) then
    raise exception 'Pedido com recebimentos nao pode ser cancelado';
  end if;
  update purchase_orders set status = 'cancelled', cancelled_at = now(), cancel_reason = p_reason
  where id = p_order_id and status in ('consolidated', 'sent');
  if not found then raise exception 'Pedido nao pode ser cancelado neste status'; end if;
end $$;

-- ---------- RPC: registrar recebimento ----------
-- p_items: [{"order_item_id":"uuid","quantity":10}, ...]
create or replace function register_receipt(
  p_order_id uuid, p_items jsonb, p_notes text default null, p_allow_over boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_status order_status; v_receipt uuid; r record; v_item purchase_order_items;
begin
  if not is_active_user() then raise exception 'Acesso negado'; end if;
  if p_allow_over and not is_admin() then
    raise exception 'Recebimento acima do pendente exige administrador';
  end if;

  select status into v_status from purchase_orders where id = p_order_id for update;
  if not found then raise exception 'Pedido nao encontrado'; end if;
  if v_status not in ('consolidated', 'sent', 'partially_received') then
    raise exception 'Pedido nao aceita recebimento no status atual';
  end if;

  insert into receipts (order_id, notes) values (p_order_id, p_notes) returning id into v_receipt;

  for r in select (e->>'order_item_id')::uuid as item_id, (e->>'quantity')::int as qty
           from jsonb_array_elements(p_items) e
  loop
    if r.qty is null or r.qty <= 0 then continue; end if;
    select * into v_item from purchase_order_items
      where id = r.item_id and order_id = p_order_id for update;
    if not found then raise exception 'Item invalido para este pedido'; end if;
    if not p_allow_over and v_item.received_quantity + r.qty > v_item.quantity then
      raise exception 'Quantidade excede o pendente do item %', v_item.sku;
    end if;
    insert into receipt_items (receipt_id, order_item_id, quantity) values (v_receipt, r.item_id, r.qty);
    update purchase_order_items set received_quantity = received_quantity + r.qty where id = r.item_id;
  end loop;

  if not exists (select 1 from receipt_items where receipt_id = v_receipt) then
    raise exception 'Nenhum item informado';
  end if;

  update purchase_orders set status =
    case when not exists (select 1 from purchase_order_items
                          where order_id = p_order_id and received_quantity < quantity)
         then 'received'::order_status else 'partially_received'::order_status end
  where id = p_order_id;

  return v_receipt;
end $$;

-- ---------- RLS ----------
do $$ declare t text; begin
  foreach t in array array['profiles','stores','suppliers','products','product_suppliers','purchase_lists',
    'purchase_list_items','purchase_orders','purchase_order_items','receipts','receipt_items']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "%1$s_select" on %1$I for select to authenticated using (is_active_user())', t);
  end loop;
  -- cadastros e listas: escrita por usuarios ativos (triggers protegem listas consolidadas)
  foreach t in array array['stores','suppliers','products','product_suppliers','purchase_lists','purchase_list_items']
  loop
    execute format('create policy "%1$s_write" on %1$I for all to authenticated using (is_active_user()) with check (is_active_user())', t);
  end loop;
end $$;

-- profiles: somente admin altera (criacao via Edge Function com service role)
create policy profiles_admin_write on profiles for all to authenticated
  using (is_admin()) with check (is_admin());

-- Pedidos, itens de pedido e recebimentos: sem policies de escrita.
-- Toda escrita ocorre pelas RPCs security definer acima.

grant execute on function consolidate_purchase_list(uuid) to authenticated;
grant execute on function mark_order_sent(uuid) to authenticated;
grant execute on function cancel_purchase_order(uuid, text) to authenticated;
grant execute on function register_receipt(uuid, jsonb, text, boolean) to authenticated;
