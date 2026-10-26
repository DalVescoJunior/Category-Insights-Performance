-- Category Insights demo schema (dummy data only)
create table category (
  category_id smallint primary key,
  name text not null,
  manager text not null,
  assistant text not null,
  margin_floor numeric not null,      -- minimum acceptable GM% (0-1)
  cover_min int not null,             -- days of cover below which we reorder
  cover_max int not null,             -- days of cover above which we call overstock
  line_share numeric not null         -- share of order lines (generator only)
);
create table brand (
  brand_id smallint primary key,
  name text not null,
  category_id smallint not null references category,
  origin text not null,
  supplier text not null
);
create table item (
  item_code int primary key,
  description text not null,
  brand_id smallint not null references brand,
  storage text not null,
  uom text not null,
  shelf_life_days int not null,
  unit_cost numeric not null,
  list_price numeric not null,
  weight numeric not null
);
create table org (org_code text primary key, name text not null, weight numeric not null, country text not null);  -- country: ISO 3166 alpha-3 code
create table salesperson (sp_id smallint primary key, name text not null, org_code text references org, division text not null);
create table customer (
  customer_code int primary key,
  name text not null,
  segment text not null,
  sub_segment text not null,
  division text not null,
  org_code text not null references org,
  sp_id smallint references salesperson,
  weight numeric not null
);
create table sales_line (
  line_id bigserial primary key,
  billing_date date not null,
  org_code text not null references org,
  customer_code int not null references customer,
  item_code int not null references item,
  sp_id smallint references salesperson,
  qty numeric not null,
  net_value numeric not null,
  cost_value numeric not null,
  order_type text not null
);
create index on sales_line (billing_date);
create index on sales_line (item_code, billing_date);
create table sales_target (
  month date not null,
  org_code text not null references org,
  brand_id smallint not null references brand,
  target_value numeric not null,
  target_gm numeric not null,
  primary key (month, org_code, brand_id)
);
create table stock_batch (
  snapshot_date date not null,
  org_code text not null references org,
  item_code int not null references item,
  batch text not null,
  storage_location text not null,
  stock_type text not null,           -- Unrestricted | Quality inspection | Blocked | Consignment
  qty numeric not null,
  value numeric not null,
  received_date date not null,
  expiry_date date not null
);
create table inbound_po (
  po text primary key,
  supplier text not null,
  item_code int not null references item,
  org_code text not null references org,
  qty numeric not null,
  value numeric not null,
  order_date date not null,
  eta date not null,
  status text not null                -- Ordered | Shipped | At port | Customs clearance
);
