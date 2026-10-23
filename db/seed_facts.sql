-- Facts: generated sales lines, targets, stock and inbound POs (all random, as of 2026-10-22)
create temp table cust_pick on commit drop as
select customer_code,
       coalesce(sum(weight) over (order by customer_code rows between unbounded preceding and 1 preceding), 0) / sum(weight) over () lo,
       sum(weight) over (order by customer_code) / sum(weight) over () hi
from customer;

create temp table item_pick on commit drop as
with basket(b, category_id, share) as (
  select 'G', category_id, line_share from category
  union all select 'P', * from (values (7,0.55::numeric),(6,0.30),(8,0.15)) v
  union all select 'F', * from (values (1,0.45::numeric),(3,0.25),(6,0.15),(8,0.15)) v
), w as (
  select bk.b, i.item_code, bk.share * i.weight / sum(i.weight) over (partition by bk.b, bk.category_id) w
  from basket bk join brand br using (category_id) join item i using (brand_id)
)
select b, item_code,
       coalesce(sum(w) over (partition by b order by item_code rows between unbounded preceding and 1 preceding), 0) / sum(w) over (partition by b) lo,
       sum(w) over (partition by b order by item_code) / sum(w) over (partition by b) hi
from w;

insert into sales_line (billing_date, org_code, customer_code, item_code, sp_id, qty, net_value, cost_value, order_type)
with days as (
  select d::date d,
         (case extract(isodow from d) when 5 then 0.55 when 6 then 0.8 when 7 then 0.9 else 1 end)
         * (array[1.0,1.0,0.88,1.05,1.0,0.85,0.75,0.8,0.95,1.05,1.12,1.22])[extract(month from d)::int] f
  from generate_series(date '2025-01-01', date '2026-10-22', interval '1 day') d
), slots as (
  select d, generate_series(1, greatest(1, round(95 * f))::int) n from days
), r as materialized (
  select d, random() rc, random() ri from slots
), picked as (
  select r.d, cu.customer_code, cu.org_code, cu.sp_id, ip.item_code
  from r
  join cust_pick cp on r.rc >= cp.lo and r.rc < cp.hi
  join customer cu on cu.customer_code = cp.customer_code
  join item_pick ip on ip.b = case cu.division when 'Pastry & Bakery' then 'P' when '4PL' then 'F' else 'G' end
                   and r.ri >= ip.lo and r.ri < ip.hi
), q as (
  select p.*, i.uom, i.list_price, i.unit_cost, b.category_id, random()::numeric rq, random()::numeric rp, random()::numeric rr, random()::numeric rd,
         case when extract(year from p.d) = 2026
              then (array[1.06,0.93,1.15,1.03,0.90,1.08,1.12,1.00])[b.category_id]
                   * case when p.d >= date '2026-10-01' then (array[0.95,0.86,1.06,1.0,0.82,1.02,1.0,0.97])[b.category_id] else 1 end
              else 1 end g,
         case when b.category_id = 1 and p.d >= date '2026-05-01' then 1.08
              when b.category_id = 5 and p.d >= date '2026-01-01' then 1.04 else 1 end infl
  from picked p join item i using (item_code) join brand b using (brand_id)
), lines as (
  select *,
         (case when rr < 0.015 then -1 else 1 end) *
         case when uom = 'KG' then round((2 + 30 * rq * rq) * g, 2)
              else ceil((1 + 10 * rq * rq) * g) end qty,
         case when rp < 0.03 then 0.22 + rd * 0.08 else rd * 0.10 end disc
  from q
)
select d, org_code, customer_code, item_code, sp_id, qty,
       round(qty * list_price * (1 - disc), 2),
       round(qty * unit_cost * infl * (0.97 + random()::numeric * 0.06), 2),
       case when rr < 0.015 then 'Return' when rp < 0.03 then 'Promotion' else 'Standard' end
from lines;

-- Targets: last year's month by hub and brand, plus a planned uplift of 7-15%
insert into sales_target
select (date_trunc('month', s.billing_date) + interval '1 year')::date, s.org_code, i.brand_id,
       round(sum(s.net_value) * (1.10 + ((abs(hashtext(i.brand_id::text || s.org_code)) % 9) - 3) / 100.0), -2),
       max(c.margin_floor) + 0.04
from sales_line s join item i using (item_code) join brand b using (brand_id) join category c using (category_id)
where s.billing_date < date '2026-01-01'
group by 1, 2, 3
having sum(s.net_value) > 0;

-- Stock profile per hub and item, so stock and POs tell one story
create temp table stk on commit drop as
with dem as (
  select s.org_code, s.item_code,
         sum(case when s.billing_date > date '2026-10-22' - 28 and s.qty > 0 then s.qty else 0 end) / 28.0 avg_daily,
         max(s.billing_date) last_sale
  from sales_line s where s.billing_date > date '2026-10-22' - 180
  group by 1, 2
)
select d.*, i.unit_cost, i.shelf_life_days, i.storage, c.cover_min, c.cover_max, b.supplier,
       abs(hashtext(d.item_code::text || d.org_code || 'stk')) % 100 p,
       case when d.avg_daily = 0 then 'dead'
            when abs(hashtext(d.item_code::text || d.org_code || 'stk')) % 100 < 7 then 'oos'
            when abs(hashtext(d.item_code::text || d.org_code || 'stk')) % 100 < 15 then 'low'
            when abs(hashtext(d.item_code::text || d.org_code || 'stk')) % 100 < 25 then 'over'
            else 'ok' end profile
from dem d join item i using (item_code) join brand b using (brand_id) join category c using (category_id);

insert into stock_batch
with tgt as (
  select *,
         case profile
           when 'oos' then 0
           when 'low' then avg_daily * (2 + random()::numeric * 5)
           when 'over' then avg_daily * cover_max * (1.6 + random()::numeric * 1.9)
           when 'dead' then 20 + random()::numeric * 180
           else avg_daily * (cover_min * 1.1 + random()::numeric * (cover_max * 0.9 - cover_min * 1.1)) end total_qty,
         1 + p % 3 k
  from stk
), b as (
  select t.*, g batch_no, random()::numeric ra, random()::numeric rt from tgt t, generate_series(1, k) g where total_qty > 0
)
select date '2026-10-22', org_code, item_code,
       'B' || to_char(item_code, 'FM0000000') || org_code || batch_no,
       case storage when 'Chilled' then 'Chill room' when 'Frozen' then 'Freezer' else 'Dry store' end,
       case when rt < 0.03 then 'Quality inspection' when rt < 0.06 then 'Blocked' when rt < 0.08 then 'Consignment' else 'Unrestricted' end,
       round(total_qty / k, 2),
       round(total_qty / k * unit_cost, 2),
       rd, rd + shelf_life_days
from (
  select b.*,
         date '2026-10-22' - (case profile
            when 'over' then 15 + ra * least(shelf_life_days * 0.9, 300)
            when 'dead' then 80 + ra * 320
            else 3 + ra * least(shelf_life_days * 0.55, 120) end)::int rd
  from b
) x;

insert into inbound_po
select 'PO45' || to_char(row_number() over (order by org_code, item_code), 'FM00000'),
       supplier, item_code, org_code,
       round(greatest(avg_daily * 45, 40)::numeric, 0),
       round((greatest(avg_daily * 45, 40) * unit_cost)::numeric, 2),
       date '2026-10-22' + eta_off - 50,
       date '2026-10-22' + eta_off,
       case when eta_off < 0 then 'Delayed' when eta_off > 25 then 'Ordered' when eta_off > 12 then 'Shipped'
            when eta_off > 4 then 'At port' else 'Customs clearance' end
from (
  select s.*, (-6 + (abs(hashtext(item_code::text || org_code || 'po')) % 47)) eta_off,
         abs(hashtext(item_code::text || org_code || 'po2')) % 100 q
  from stk s
) z
where (profile in ('oos','low') and q < 65) or (profile = 'over' and q < 25) or (profile = 'ok' and q < 15);
