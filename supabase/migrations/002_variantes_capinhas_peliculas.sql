-- Atributos de catálogo para as variantes de capinhas e películas.
alter table public.products
  add column if not exists manufacturer text,
  add column if not exists model text,
  add column if not exists product_type text,
  add column if not exists color text;

-- A combinação identifica uma variante; cor vazia representa "não se aplica".
create unique index if not exists products_accessory_variant_unique
  on public.products (
    lower(btrim(category)),
    lower(btrim(manufacturer)),
    lower(btrim(model)),
    lower(btrim(product_type)),
    lower(btrim(coalesce(color, '')))
  )
  where lower(btrim(category)) in ('capinha', 'película', 'pelicula')
    and nullif(btrim(manufacturer), '') is not null
    and nullif(btrim(model), '') is not null
    and nullif(btrim(product_type), '') is not null;

comment on column public.products.manufacturer is 'Fabricante do aparelho para variantes de capinhas e películas';
comment on column public.products.model is 'Modelo do aparelho para variantes de capinhas e películas';
comment on column public.products.product_type is 'Tipo da capinha ou película';
comment on column public.products.color is 'Cor da variante; nulo quando não se aplica';
