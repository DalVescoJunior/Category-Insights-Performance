-- Reporting views. Every figure on the dashboard is computed here.
-- Country = the brand's country of origin (3-letter code). Views rolled up by scope also carry a country column:
-- null = all countries, otherwise one country's figures.
drop view if exists v_perf_target, v_perf, v_daily_detail, v_dim_item, v_dim_customer, v_dim_org, v_dim_rep, v_alerts, v_margin_leak, v_customers, v_channel, v_aging, v_monthly, v_daily, v_brand, v_kpi, v_sku, v_item_base cascade;
drop function if exists f_margin_detail(text);
create or replace view v_period as
select max(billing_date) as_of,
       date_trunc('month', max(billing_date))::date as month_start,
       extract(day from max(billing_date))::int days_elapsed,
       extract(day from date_trunc('month', max(billing_date)) + interval '1 month - 1 day')::int days_in_month,
       date_trunc('year', max(billing_date))::date year_start
from sales_line;

-- One row per item and hub: sales windows, stock, pipeline and status
create or replace view v_item_base as
with p as (select * from v_period),
s as (
  select l.item_code, l.org_code,
    sum(net_value) filter (where billing_date >= p.month_start) mtd_sales,
    sum(cost_value) filter (where billing_date >= p.month_start) mtd_cost,
    sum(net_value) filter (where billing_date between (p.month_start - interval '1 year') and (p.as_of - interval '1 year')) ly_mtd_sales,
    sum(net_value) filter (where billing_date between (p.month_start - interval '1 year') and (p.month_start + p.days_in_month - 1 - interval '1 year')) ly_month_sales,
    sum(net_value) filter (where billing_date >= p.year_start) ytd_sales,
    sum(cost_value) filter (where billing_date >= p.year_start) ytd_cost,
    sum(net_value) filter (where billing_date between (p.year_start - interval '1 year') and (p.as_of - interval '1 year')) ly_ytd_sales,
    sum(net_value) filter (where billing_date > p.as_of - 28) sales_28d,
    sum(cost_value) filter (where billing_date > p.as_of - 28) cogs_28d,
    sum(qty) filter (where billing_date > p.as_of - 28 and qty > 0) qty_28d
  from sales_line l, p where billing_date >= p.year_start - interval '1 year' group by 1, 2
),
k as (
  select b.item_code, b.org_code,
    sum(qty) filter (where stock_type = 'Unrestricted' and expiry_date >= p.as_of) unr_qty,
    sum(value) filter (where stock_type = 'Unrestricted' and expiry_date >= p.as_of) unr_value,
    sum(value) soh_value,
    sum(value) filter (where stock_type in ('Blocked','Quality inspection')) blocked_value,
    sum(value) filter (where expiry_date < p.as_of) expired_value,
    sum(value) filter (where stock_type = 'Unrestricted' and expiry_date between p.as_of and p.as_of + 30) at_risk_value,
    sum(value) filter (where received_date < p.as_of - 90) aged_value,
    min(expiry_date) filter (where expiry_date >= p.as_of and stock_type = 'Unrestricted') next_expiry
  from stock_batch b, p group by 1, 2
),
o as (
  select item_code, org_code, sum(qty) inbound_qty, sum(value) inbound_value, min(eta) next_eta,
         count(*) filter (where status = 'Delayed') delayed_pos
  from inbound_po group by 1, 2
),
keys as (select item_code, org_code from s union select item_code, org_code from k union select item_code, org_code from o),
x as (
  select keys.item_code, keys.org_code, b.country_code country, i.description, i.storage, i.uom,
         b.brand_id, b.name brand, c.category_id, c.name category, c.manager, c.assistant,
         c.margin_floor, c.cover_min, c.cover_max,
         coalesce(s.mtd_sales,0) mtd_sales, coalesce(s.mtd_cost,0) mtd_cost, coalesce(s.ly_mtd_sales,0) ly_mtd_sales, coalesce(s.ly_month_sales,0) ly_month_sales,
         coalesce(s.ytd_sales,0) ytd_sales, coalesce(s.ytd_cost,0) ytd_cost, coalesce(s.ly_ytd_sales,0) ly_ytd_sales,
         coalesce(s.sales_28d,0) sales_28d, coalesce(s.cogs_28d,0) cogs_28d,
         coalesce(s.qty_28d,0) / 28.0 avg_daily_qty,
         coalesce(k.unr_qty,0) unr_qty, coalesce(k.unr_value,0) unr_value, coalesce(k.soh_value,0) soh_value,
         coalesce(k.blocked_value,0) blocked_value, coalesce(k.expired_value,0) expired_value,
         coalesce(k.at_risk_value,0) at_risk_value, coalesce(k.aged_value,0) aged_value,
         k.next_expiry - p.as_of days_to_expiry,
         coalesce(o.inbound_qty,0) inbound_qty, coalesce(o.inbound_value,0) inbound_value, o.next_eta,
         coalesce(o.delayed_pos,0) delayed_pos
  from keys join item i using (item_code) join brand b using (brand_id) join category c using (category_id)
  left join s using (item_code, org_code) left join k using (item_code, org_code) left join o using (item_code, org_code)
  cross join p
),
y as (
  select x.*,
         case when avg_daily_qty > 0 then unr_qty / avg_daily_qty end days_cover,
         case when avg_daily_qty > 0 then (unr_qty + inbound_qty) / avg_daily_qty end cover_incl_inbound
  from x
)
select y.*,
       case when avg_daily_qty > 0 and unr_qty <= 0 then 'Out of stock'
            when avg_daily_qty > 0 and days_cover < cover_min then 'Low cover'
            when avg_daily_qty = 0 and soh_value > 0 then 'No sales 28d'
            when avg_daily_qty > 0 and days_cover > cover_max then 'Overstock'
            when avg_daily_qty = 0 then 'Inactive'
            else 'Healthy' end status
from y;

-- Item by hub, ready to read. Cover = unrestricted in-date units / average units sold per day over the last 28 days
create or replace view v_sku as
select item_code, org_code hub, country, description, category, manager, assistant, brand, storage, uom,
       round(mtd_sales, 0) mtd_sales,
       round(mtd_sales / nullif(ly_mtd_sales, 0) - 1, 4) yoy_pct,
       round(1 - mtd_cost / nullif(mtd_sales, 0), 4) gm_pct,
       round(avg_daily_qty, 2) avg_daily_qty, round(unr_qty, 1) unr_qty,
       round(soh_value, 0) soh_value, round(days_cover, 1) days_cover, round(cover_incl_inbound, 1) cover_incl_inbound,
       cover_min, cover_max, round(inbound_qty, 0) inbound_qty, to_char(next_eta, 'YYYY-MM-DD') next_eta, delayed_pos::int,
       round(at_risk_value, 0) at_risk_value, round(expired_value, 0) expired_value, round(blocked_value, 0) blocked_value,
       days_to_expiry, status,
       case when status = 'Out of stock' and inbound_qty > 0 then 'Expedite open PO (ETA ' || to_char(next_eta, 'DD Mon') || ')'
            when status = 'Out of stock' then 'Raise PO now; offer substitute'
            when status = 'Low cover' and cover_incl_inbound >= cover_min then 'Covered by PO; confirm ETA ' || to_char(next_eta, 'DD Mon')
            when status = 'Low cover' then 'Reorder; cover under ' || cover_min || ' days'
            when status = 'No sales 28d' then 'Liquidate or transfer'
            when status = 'Overstock' and inbound_qty > 0 then 'Defer inbound PO; push sell-out'
            when status = 'Overstock' then 'Pause buying; push sell-out'
            when expired_value > 0 then 'Write off or return expired batch'
            when at_risk_value > 0 then 'Sell near-expiry batch first'
            else '' end action,
       q.expired_qty, q.expired_unit_cost, q.at_risk_qty, q.at_risk_unit_cost
from v_item_base ib
left join (
  -- quantities and average cost price per unit of the expired and the expiring (<= 30 days) batches
  select b.item_code q_item, b.org_code q_org,
         round(sum(b.qty) filter (where b.expiry_date < p.as_of), 1) expired_qty,
         round(sum(b.value) filter (where b.expiry_date < p.as_of) / nullif(sum(b.qty) filter (where b.expiry_date < p.as_of), 0), 2) expired_unit_cost,
         round(sum(b.qty) filter (where b.stock_type = 'Unrestricted' and b.expiry_date between p.as_of and p.as_of + 30), 1) at_risk_qty,
         round(sum(b.value) filter (where b.stock_type = 'Unrestricted' and b.expiry_date between p.as_of and p.as_of + 30)
               / nullif(sum(b.qty) filter (where b.stock_type = 'Unrestricted' and b.expiry_date between p.as_of and p.as_of + 30), 0), 2) at_risk_unit_cost
  from stock_batch b, v_period p group by 1, 2
) q on q.q_item = ib.item_code and q.q_org = ib.org_code;

-- KPIs at three levels: all categories, each manager, each category.
-- Forecast = month-to-date sales scaled by how last year's same month finished (seasonality-aware run rate)
create or replace view v_kpi as
with p as (select * from v_period),
t as (
  select b.category_id, b.country_code country,
         sum(t.target_value) filter (where t.month = p.month_start) month_target,
         sum(t.target_value) filter (where t.month < p.month_start and t.month >= p.year_start) ytd_target_closed,
         sum(t.target_value * t.target_gm) filter (where t.month = p.month_start) month_target_gp
  from sales_target t join brand b using (brand_id), p group by 1, 2
),
c as (
  select ib.category_id, ib.category, ib.manager, ib.assistant, ib.country, max(ib.margin_floor) margin_floor,
         sum(mtd_sales) mtd_sales, sum(mtd_cost) mtd_cost, sum(ly_mtd_sales) ly_mtd_sales, sum(ly_month_sales) ly_month_sales,
         sum(ytd_sales) ytd_sales, sum(ly_ytd_sales) ly_ytd_sales, sum(cogs_28d) cogs_28d,
         sum(unr_value) unr_value, sum(soh_value) soh_value, sum(blocked_value) blocked_value,
         sum(expired_value) expired_value, sum(at_risk_value) at_risk_value, sum(aged_value) aged_value,
         sum(inbound_value) inbound_value
  from v_item_base ib group by 1, 2, 3, 4, 5
),
st as (
  select category, country, count(*) filter (where status = 'Out of stock') oos_skus,
         count(*) filter (where status = 'Low cover') low_skus,
         count(*) filter (where status = 'Overstock') over_skus,
         count(*) filter (where status = 'No sales 28d') nomove_skus,
         count(*) filter (where status <> 'Inactive') active_skus
  from v_item_base group by category, country
),
j as (select c.*, t.month_target, t.ytd_target_closed, t.month_target_gp, st.oos_skus, st.low_skus, st.over_skus, st.nomove_skus, st.active_skus
      from c left join t using (category_id, country) join st using (category, country)),
g as (
  select case when grouping(manager) = 1 then 'total' when grouping(category) = 1 then 'manager' else 'category' end level,
         case when grouping(manager) = 1 then 'All categories' when grouping(category) = 1 then manager else category end scope,
         case when grouping(country) = 1 then null else country end country,
         case when grouping(manager) = 1 then null else manager end manager,
         case when grouping(category) = 1 then null else max(assistant) end assistant,
         case when grouping(category) = 1 then null else max(margin_floor) end margin_floor,
         sum(mtd_sales) mtd_sales, sum(mtd_cost) mtd_cost, sum(ly_mtd_sales) ly_mtd_sales, sum(ly_month_sales) ly_month_sales,
         sum(ytd_sales) ytd_sales, sum(ly_ytd_sales) ly_ytd_sales, sum(cogs_28d) cogs_28d,
         sum(unr_value) unr_value, sum(soh_value) soh_value, sum(blocked_value) blocked_value,
         sum(expired_value) expired_value, sum(at_risk_value) at_risk_value, sum(aged_value) aged_value,
         sum(inbound_value) inbound_value, sum(month_target) month_target, sum(ytd_target_closed) ytd_target_closed,
         sum(month_target_gp) month_target_gp,
         sum(oos_skus) oos_skus, sum(low_skus) low_skus, sum(over_skus) over_skus, sum(nomove_skus) nomove_skus, sum(active_skus) active_skus
  from j group by grouping sets ((), (manager), (manager, category), (country), (country, manager), (country, manager, category))
)
select g.level, g.scope, g.country, g.manager, g.assistant,
       p.as_of, p.days_elapsed, p.days_in_month,
       round(mtd_sales, 0) mtd_sales,
       round(mtd_sales - mtd_cost, 0) mtd_gp,
       round(1 - mtd_cost / nullif(mtd_sales, 0), 4) gm_pct,
       round(month_target_gp / nullif(month_target, 0), 4) target_gm_pct,
       g.margin_floor,
       round(month_target, 0) month_target,
       round(month_target * p.days_elapsed / p.days_in_month, 0) target_to_date,
       round(mtd_sales / nullif(month_target * p.days_elapsed / p.days_in_month, 0), 4) pace_pct,
       round(fc, 0) forecast_eom,
       round(fc / nullif(month_target, 0), 4) forecast_pct,
       round(fc - month_target, 0) forecast_gap,
       round(ly_mtd_sales, 0) ly_mtd_sales,
       round(mtd_sales / nullif(ly_mtd_sales, 0) - 1, 4) yoy_pct,
       round(ytd_sales, 0) ytd_sales,
       round(ytd_target_closed + month_target * p.days_elapsed / p.days_in_month, 0) ytd_target,
       round(ytd_sales / nullif(ytd_target_closed + month_target * p.days_elapsed / p.days_in_month, 0), 4) ytd_pct,
       round(ytd_sales / nullif(ly_ytd_sales, 0) - 1, 4) ytd_yoy_pct,
       round(soh_value, 0) soh_value,
       round(unr_value / nullif(cogs_28d / 28.0, 0), 1) days_cover,
       round(at_risk_value, 0) at_risk_value, round(expired_value, 0) expired_value,
       round(blocked_value, 0) blocked_value, round(aged_value, 0) aged_value,
       round(inbound_value, 0) inbound_value,
       oos_skus::int, low_skus::int, over_skus::int, nomove_skus::int, active_skus::int
from (select g.*, case when ly_mtd_sales > 0 then mtd_sales / ly_mtd_sales * ly_month_sales
                       else mtd_sales / pp.days_elapsed * pp.days_in_month end fc
      from g, v_period pp) g, v_period p;

-- Brand drill-down
create or replace view v_brand as
with p as (select * from v_period),
t as (select brand_id, b.country_code country, sum(target_value) month_target from sales_target join brand b using (brand_id), p where month = p.month_start
      group by grouping sets ((brand_id), (brand_id, b.country_code))),
a as (
  select category, manager, brand_id, brand, country, max(margin_floor) margin_floor,
         sum(mtd_sales) mtd_sales, sum(mtd_cost) mtd_cost, sum(ly_mtd_sales) ly_mtd_sales, sum(ly_month_sales) ly_month_sales,
         sum(soh_value) soh_value, sum(unr_value) unr_value, sum(cogs_28d) cogs_28d,
         sum(at_risk_value + expired_value) at_risk_value,
         count(*) filter (where status in ('Out of stock','Low cover')) short_lines
  from v_item_base group by grouping sets ((category, manager, brand_id, brand), (category, manager, brand_id, brand, country))
)
select a.category, a.manager, a.brand, a.country, b.origin,
       round(a.mtd_sales, 0) mtd_sales, round(t.month_target, 0) month_target,
       round(a.mtd_sales / nullif(t.month_target * p.days_elapsed / p.days_in_month, 0), 4) pace_pct,
       round(case when a.ly_mtd_sales > 0 then a.mtd_sales / a.ly_mtd_sales * a.ly_month_sales else a.mtd_sales / p.days_elapsed * p.days_in_month end - t.month_target, 0) forecast_gap,
       round(a.mtd_sales / nullif(a.ly_mtd_sales, 0) - 1, 4) yoy_pct,
       round(1 - a.mtd_cost / nullif(a.mtd_sales, 0), 4) gm_pct, a.margin_floor,
       round(a.soh_value, 0) soh_value,
       round(a.unr_value / nullif(a.cogs_28d / 28.0, 0), 1) days_cover,
       round(a.at_risk_value, 0) at_risk_value, a.short_lines::int
from a join brand b using (brand_id) left join t on t.brand_id = a.brand_id and t.country is not distinct from a.country, p;

-- Current month day by day, cumulative against a straight-line target, at the three levels
create or replace view v_daily as
with p as (select * from v_period),
days as (select generate_series(p.month_start, p.month_start + p.days_in_month - 1, interval '1 day')::date d from p),
cat as (select distinct c.category_id, c.name category, c.manager, b.country_code country from category c join brand b using (category_id)),
t as (select b.category_id, b.country_code country, sum(target_value) month_target from sales_target t join brand b using (brand_id), p where month = p.month_start group by 1, 2),
s as (select i.category_id, i.country_code country, l.billing_date d, sum(net_value) sales from sales_line l join item it using (item_code) join brand i using (brand_id), p where billing_date >= p.month_start group by 1, 2, 3),
ly as (select i.category_id, i.country_code country, (l.billing_date + interval '1 year')::date d, sum(net_value) sales from sales_line l join item it using (item_code) join brand i using (brand_id), p
       where billing_date between p.month_start - interval '1 year' and p.month_start + p.days_in_month - 1 - interval '1 year' group by 1, 2, 3),
grid as (
  select days.d, cat.category, cat.manager, cat.country, coalesce(s.sales, 0) sales, coalesce(ly.sales, 0) ly_sales, coalesce(t.month_target, 0) / p.days_in_month day_target
  from days cross join cat cross join p
  left join t on t.category_id = cat.category_id and t.country = cat.country
  left join s on s.category_id = cat.category_id and s.country = cat.country and s.d = days.d
  left join ly on ly.category_id = cat.category_id and ly.country = cat.country and ly.d = days.d
),
g as (
  select d,
         case when grouping(manager) = 1 then 'All categories' when grouping(category) = 1 then manager else category end scope,
         case when grouping(country) = 1 then null else country end country,
         sum(sales) sales, sum(ly_sales) ly_sales, sum(day_target) day_target
  from grid group by grouping sets ((d), (d, manager), (d, manager, category), (d, country), (d, country, manager), (d, country, manager, category))
)
select scope, country, to_char(d, 'YYYY-MM-DD') as day,
       case when d <= p.as_of then round(sales, 0) end sales,
       case when d <= p.as_of then round(sum(sales) over w, 0) end cum_sales,
       round(sum(day_target) over w, 0) cum_target,
       round(sum(ly_sales) over w, 0) cum_ly
from g, p
window w as (partition by scope, country order by d);

-- Month by month for the current year
create or replace view v_monthly as
with p as (select * from v_period),
m as (select generate_series(p.year_start, p.year_start + interval '11 months', interval '1 month')::date as month from p),
cat as (select distinct c.category_id, c.name category, c.manager, b.country_code country from category c join brand b using (category_id)),
s as (select b.category_id, b.country_code country, date_trunc('month', billing_date)::date as month,
             sum(net_value) filter (where billing_date >= p.year_start) sales,
             sum(cost_value) filter (where billing_date >= p.year_start) cost
      from sales_line l join item using (item_code) join brand b using (brand_id), p group by 1, 2, 3),
ly as (select b.category_id, b.country_code country, (date_trunc('month', billing_date) + interval '1 year')::date as month, sum(net_value) sales
       from sales_line l join item using (item_code) join brand b using (brand_id), p
       where billing_date >= p.year_start - interval '1 year' and billing_date < p.year_start group by 1, 2, 3),
t as (select b.category_id, b.country_code country, month, sum(target_value) target from sales_target join brand b using (brand_id) group by 1, 2, 3),
grid as (
  select m.month, cat.category, cat.manager, cat.country, s.sales, s.cost, ly.sales ly_sales, t.target
  from m cross join cat
  left join s on s.category_id = cat.category_id and s.country = cat.country and s.month = m.month
  left join ly on ly.category_id = cat.category_id and ly.country = cat.country and ly.month = m.month
  left join t on t.category_id = cat.category_id and t.country = cat.country and t.month = m.month
)
select case when grouping(manager) = 1 then 'All categories' when grouping(category) = 1 then manager else category end scope,
       case when grouping(country) = 1 then null else country end country,
       to_char(month, 'YYYY-MM') as month,
       round(sum(sales), 0) sales, round(sum(target), 0) target, round(sum(ly_sales), 0) ly_sales,
       round(1 - sum(cost) / nullif(sum(sales), 0), 4) gm_pct
from grid group by grouping sets ((month), (month, manager), (month, manager, category),
                                  (month, country), (month, country, manager), (month, country, manager, category));

-- Stock value by remaining shelf life and by days in stock
create or replace view v_aging as
with p as (select * from v_period),
b as (
  select c.name category, c.manager, br.country_code country, sb.value,
         case when sb.expiry_date < p.as_of then '1 Expired'
              when sb.expiry_date - p.as_of <= 30 then '2 0-30 days'
              when sb.expiry_date - p.as_of <= 60 then '3 31-60 days'
              when sb.expiry_date - p.as_of <= 90 then '4 61-90 days'
              when sb.expiry_date - p.as_of <= 180 then '5 91-180 days'
              else '6 Over 180 days' end life_bucket,
         case when p.as_of - sb.received_date <= 30 then '1 0-30 days'
              when p.as_of - sb.received_date <= 60 then '2 31-60 days'
              when p.as_of - sb.received_date <= 90 then '3 61-90 days'
              when p.as_of - sb.received_date <= 180 then '4 91-180 days'
              else '5 Over 180 days' end age_bucket
  from stock_batch sb join item using (item_code) join brand br using (brand_id) join category c using (category_id), p
),
u as (
  select category, manager, country, 'Shelf life left' basis, life_bucket bucket, value from b
  union all select category, manager, country, 'Days in stock', age_bucket, value from b
)
select case when grouping(manager) = 1 then 'All categories' when grouping(category) = 1 then manager else category end scope,
       case when grouping(country) = 1 then null else country end country,
       basis, substr(bucket, 3) bucket, substr(bucket, 1, 1)::int bucket_order, round(sum(value), 0) value
from u group by grouping sets ((basis, bucket), (basis, bucket, manager), (basis, bucket, manager, category),
                               (basis, bucket, country), (basis, bucket, country, manager), (basis, bucket, country, manager, category));

-- Sales mix by customer segment, against the same days last year
create or replace view v_channel as
with p as (select * from v_period),
x as (
  select c.name category, c.manager, br.country_code country, cu.segment,
         sum(net_value) filter (where billing_date >= p.month_start) mtd,
         sum(cost_value) filter (where billing_date >= p.month_start) mtd_cost,
         sum(net_value) filter (where billing_date between p.month_start - interval '1 year' and p.as_of - interval '1 year') ly
  from sales_line l join customer cu using (customer_code) join item using (item_code) join brand br using (brand_id) join category c using (category_id), p
  where billing_date >= p.month_start - interval '1 year'
  group by 1, 2, 3, 4
)
select case when grouping(manager) = 1 then 'All categories' when grouping(category) = 1 then manager else category end scope,
       case when grouping(country) = 1 then null else country end country,
       segment, round(sum(mtd), 0) mtd_sales, round(sum(ly), 0) ly_mtd_sales,
       round(sum(mtd) / nullif(sum(ly), 0) - 1, 4) yoy_pct,
       round(1 - sum(mtd_cost) / nullif(sum(mtd), 0), 4) gm_pct
from x group by grouping sets ((segment), (segment, manager), (segment, manager, category),
                               (segment, country), (segment, country, manager), (segment, country, manager, category));

-- Customers this month against their own run-rate of the three months before
create or replace view v_customers as
with p as (select * from v_period),
x as (
  select c.name category, c.manager, br.country_code country, cu.name customer, cu.segment, sp.name salesperson,
         sum(net_value) filter (where billing_date >= p.month_start) mtd,
         sum(net_value) filter (where billing_date >= p.month_start - interval '3 months' and billing_date < p.month_start) / 3.0 prev3_avg
  from sales_line l join customer cu using (customer_code) left join salesperson sp on sp.sp_id = cu.sp_id
  join item using (item_code) join brand br using (brand_id) join category c using (category_id), p
  where billing_date >= p.month_start - interval '3 months'
  group by 1, 2, 3, 4, 5, 6
),
g as (
  select case when grouping(manager) = 1 then 'All categories' when grouping(category) = 1 then manager else category end scope,
         case when grouping(country) = 1 then null else country end country,
         customer, max(segment) segment, max(salesperson) salesperson,
         coalesce(sum(mtd), 0) mtd, coalesce(sum(prev3_avg), 0) prev3_avg
  from x group by grouping sets ((customer), (customer, manager), (customer, manager, category),
                                 (customer, country), (customer, country, manager), (customer, country, manager, category))
),
r as (
  select g.*, g.prev3_avg * p.days_elapsed / p.days_in_month expected,
         row_number() over (partition by scope, country order by prev3_avg desc) rk
  from g, p
)
select scope, country, customer, segment, salesperson,
       round(mtd, 0) mtd_sales, round(prev3_avg, 0) prev3_avg, round(expected, 0) expected_to_date,
       round(mtd - expected, 0) vs_expected,
       round(mtd / nullif(expected, 0), 4) run_rate_pct,
       case when mtd <= 0 then 'Lapsed' when mtd < 0.6 * expected then 'Declining' when mtd > 1.3 * expected then 'Growing' else 'Steady' end trend
from r where rk <= 25;

-- Lines this month sold under the category margin floor
create or replace view v_margin_leak as
with p as (select * from v_period)
select c.name category, c.manager, br.country_code country, cu.name customer, sp.name salesperson, i.description item,
       round(sum(net_value), 0) net_sales,
       round(1 - sum(cost_value) / nullif(sum(net_value), 0), 4) gm_pct,
       c.margin_floor,
       round(c.margin_floor * sum(net_value) - (sum(net_value) - sum(cost_value)), 0) gp_gap,
       string_agg(distinct order_type, ', ') order_types
from sales_line l join customer cu using (customer_code) left join salesperson sp on sp.sp_id = l.sp_id
join item i using (item_code) join brand br using (brand_id) join category c using (category_id), p
where billing_date >= p.month_start and qty > 0
group by c.name, c.manager, br.country_code, cu.name, sp.name, i.description, c.margin_floor
having sum(net_value) > 300 and 1 - sum(cost_value) / nullif(sum(net_value), 0) < c.margin_floor - 0.03;

-- Exceptions: every rule that needs someone to act, ranked by severity then money at stake.
-- Item alerts carry their item's country of origin. Roll-up alerts (category, brand, customer) come once for all countries
-- (country null) and once per country, flagged country_rollup, so the page shows the set that matches its country filter.
create or replace view v_alerts as
with p as (select * from v_period),
ib as (select * from v_item_base),
a as (
  select case when next_eta is null or next_eta > p.as_of + 7 then 1 else 2 end severity, 'Out of stock' alert_type,
         category, manager, assistant, country, false country_rollup, description subject,
         'Sells ' || round(avg_daily_qty, 1) || ' ' || lower(uom) || '/day; nothing available' ||
           coalesce('; PO due ' || to_char(next_eta, 'DD Mon'), '; no open PO') detail,
         sales_28d / 4 value_at_stake,
         case when inbound_qty > 0 then 'Expedite PO, offer substitute' else 'Raise PO now, offer substitute' end action
  from ib, p where status = 'Out of stock'
  union all
  select 2, 'Low cover', category, manager, assistant, country, false, description,
         round(days_cover, 1) || ' days of cover vs ' || cover_min || ' minimum' ||
           coalesce('; PO due ' || to_char(next_eta, 'DD Mon'), '; no open PO'),
         sales_28d / 4, 'Reorder or move stock from another hub'
  from ib where status = 'Low cover' and coalesce(cover_incl_inbound, 0) < cover_min
  union all
  select case when ib.status in ('Out of stock','Low cover') then 1 else 3 end, 'Delayed shipment', ib.category, ib.manager, ib.assistant, ib.country, false, ib.description,
         po.po || ' from ' || po.supplier || ' was due ' || to_char(po.eta, 'DD Mon') || ' (' || po.status || ')',
         po.value, 'Chase supplier and forwarder for a new ETA'
  from inbound_po po join ib using (item_code, org_code) where po.status = 'Delayed'
  union all
  select 1, 'Expired stock', category, manager, assistant, country, false, description,
         'Stock past its expiry date still on hand', expired_value, 'Block, write off or claim from supplier'
  from ib where expired_value > 0
  union all
  select 2, 'Expiring within 30 days', category, manager, assistant, country, false, description,
         'Next batch expires in ' || days_to_expiry || ' days; ' ||
           coalesce(round(days_cover) || ' days of cover', 'no recent sales'),
         at_risk_value, 'Promote, bundle or transfer before expiry'
  from ib where at_risk_value > 300
  union all
  select case when inbound_qty > 0 then 2 else 3 end, 'Overstock', category, manager, assistant, country, false, description,
         round(days_cover) || ' days of cover vs ' || cover_max || ' maximum' ||
           case when inbound_qty > 0 then '; more on order' else '' end,
         case when inbound_qty > 0 then inbound_value else unr_value - cover_max * cogs_28d / 28.0 end,
         case when inbound_qty > 0 then 'Defer or cancel the open PO' else 'Pause buying, push sell-out' end
  from ib where status = 'Overstock' and unr_value > 2000
  union all
  select 3, 'No sales in 28 days', category, manager, assistant, country, false, description,
         'Stock on hand but nothing sold in 28 days', soh_value, 'Liquidate, transfer or return'
  from ib where status = 'No sales 28d' and soh_value > 300
  union all
  select 3, 'Blocked or in QI', category, manager, assistant, country, false, description,
         'Stock held in quality inspection or blocked', blocked_value, 'Release or dispose with quality team'
  from ib where blocked_value > 1500
  union all
  select case when pace_pct < 0.85 then 1 else 2 end, 'Behind target', scope, manager, assistant, country, true, scope || ' category',
         round(pace_pct * 100) || '% of target to date; forecast ' || round(forecast_pct * 100) || '% of month',
         -forecast_gap, 'Review brand gaps and push top customers'
  from v_kpi where level = 'category' and pace_pct < 0.95
  union all
  select 2, 'Brand behind target', b.category, b.manager, c.assistant, b.country, true, b.brand,
         round(b.pace_pct * 100) || '% of target to date', -b.forecast_gap, 'Agree a catch-up plan with the brand'
  from v_brand b join category c on c.name = b.category where b.pace_pct < 0.85 and b.month_target > 5000
  union all
  select 2, 'Margin below floor', scope, manager, assistant, country, true, scope || ' category',
         'GM ' || round(gm_pct * 100, 1) || '% vs floor ' || round(margin_floor * 100) || '%',
         (margin_floor - gm_pct) * mtd_sales, 'Check cost increases and discount approvals'
  from v_kpi where level = 'category' and gm_pct < margin_floor
  union all
  select 3, 'Margin leakage', ml.category, ml.manager, c.assistant, ml.country, true, ml.customer,
         count(*) || ' items sold under the floor; ' || string_agg(distinct ml.salesperson, ', '),
         sum(ml.gp_gap), 'Review pricing with the salesperson'
  from v_margin_leak ml join category c on c.name = ml.category
  group by grouping sets ((ml.category, ml.manager, c.assistant, ml.customer), (ml.category, ml.manager, c.assistant, ml.customer, ml.country))
  having sum(ml.gp_gap) > 250
  union all
  select case when cu.trend = 'Lapsed' then 2 else 3 end, 'Customer ' || lower(cu.trend), cu.scope, c.manager, c.assistant, cu.country, true, cu.customer,
         'Buying ' || coalesce(round(cu.run_rate_pct * 100) || '%', '0%') || ' of its usual pace (' || cu.salesperson || ')',
         cu.expected_to_date - cu.mtd_sales, 'Call the customer with the salesperson'
  from v_customers cu join category c on c.name = cu.scope
  where cu.trend in ('Lapsed','Declining') and cu.prev3_avg > 2500
)
select row_number() over (order by severity, value_at_stake desc)::int alert_id,
       severity, case severity when 1 then 'Critical' when 2 then 'High' else 'Medium' end severity_label,
       alert_type, category, manager, assistant, country, country_rollup, subject, detail,
       round(greatest(value_at_stake, 0), 0) value_at_stake, action
from a;

-- ---------- Performance pages (sales summary, brand by month, daily tracking, margin tracker) ----------
-- These return lean rows keyed by codes; the page joins them to the small lookup views below and does the grouping,
-- so one dataset serves every breakdown (sales organisation, division, brand, item, customer, salesperson).

-- Lookups
create or replace view v_dim_item as
select i.item_code item, i.description, i.uom, b.name brand, c.name category, c.manager, b.country_code country, c.margin_floor
from item i join brand b using (brand_id) join category c using (category_id);
create or replace view v_dim_customer as
select customer_code cu, name, segment, sub_segment, division, org_code org from customer;
create or replace view v_dim_org as select org_code org, name from org;
create or replace view v_dim_rep as select sp_id sp, name, division from salesperson;

-- Current year by month, sales organisation (hub), customer division and item, against the same month last year
-- (the same days for the current month, so the comparison is like-for-like).
-- The change against last year splits into four parts that add up to sales - ly_sales:
--   vol   = (qty - LY qty) x LY price          more or fewer units of items sold in both years
--   price = what is left for those items       price and discount changes
--   new   = items sold now but not last year
--   lost  = items sold last year but not now (negative)
create or replace view v_perf as
with p as (select * from v_period),
ty as (
  select date_trunc('month', l.billing_date)::date m, l.org_code, cu.division, l.item_code,
         sum(l.net_value) s, sum(l.cost_value) c, sum(l.qty) q
  from sales_line l join customer cu using (customer_code), p
  where l.billing_date >= p.year_start
  group by 1, 2, 3, 4
),
ly as (
  select (date_trunc('month', l.billing_date) + interval '1 year')::date m, l.org_code, cu.division, l.item_code,
         sum(l.net_value) s, sum(l.cost_value) c, sum(l.qty) q
  from sales_line l join customer cu using (customer_code), p
  where l.billing_date >= p.year_start - interval '1 year' and l.billing_date <= p.as_of - interval '1 year'
  group by 1, 2, 3, 4
),
j as (
  select m, org_code, division, item_code,
         round(coalesce(ty.s, 0), 0) s, round(coalesce(ty.c, 0), 0) c, coalesce(ty.q, 0) q,
         round(coalesce(ly.s, 0), 0) ly_s, round(coalesce(ly.c, 0), 0) ly_c, coalesce(ly.q, 0) ly_q
  from ty full join ly using (m, org_code, division, item_code)
),
v as (
  select j.*, case when q > 0 and ly_q > 0 then round((q - ly_q) * ly_s / ly_q, 0) end vol from j
)
select to_char(m, 'YYYY-MM') as month, org_code org, division, item_code item,
       s sales, c cost, round(q, 1) qty, ly_s ly_sales, ly_c ly_cost, round(ly_q, 1) ly_qty,
       coalesce(vol, 0) vol,
       case when vol is not null then s - ly_s - vol else 0 end price,
       case when vol is null and ly_q <= 0 then s - ly_s else 0 end new,
       case when vol is null and ly_q > 0 then s - ly_s else 0 end lost
from v;

-- Monthly targets for the current year by sales organisation and brand
create or replace view v_perf_target as
select to_char(t.month, 'YYYY-MM') as month, t.org_code org, b.name brand, round(t.target_value, 0) target
from sales_target t join brand b using (brand_id), v_period p
where t.month >= p.year_start and t.month < p.year_start + interval '1 year';

-- Current month line detail for daily tracking: k = 'ty' (this month by day), 'ly' (same days last year, by day)
-- or 'pm' (the whole previous month, d null), by salesperson, customer and item
create or replace view v_daily_detail as
with p as (select * from v_period)
select extract(day from billing_date)::int d, 'ty' k, sp_id sp, customer_code cu, item_code it,
       round(sum(qty), 1) q, round(sum(net_value), 0) s, round(sum(cost_value), 0) c
from sales_line, p where billing_date >= p.month_start
group by 1, 3, 4, 5
union all
select extract(day from billing_date)::int, 'ly', sp_id, customer_code, item_code,
       round(sum(qty), 1), round(sum(net_value), 0), round(sum(cost_value), 0)
from sales_line, p where billing_date between p.month_start - interval '1 year' and p.as_of - interval '1 year'
group by 1, 3, 4, 5
union all
select null, 'pm', sp_id, customer_code, item_code,
       round(sum(qty), 1), round(sum(net_value), 0), round(sum(cost_value), 0)
from sales_line, p where billing_date >= p.month_start - interval '1 month' and billing_date < p.month_start
group by 3, 4, 5;

-- One month of sales by item, customer and salesperson for the margin tracker, with the same month last year
-- (same days when it is the current month). p_month = 'YYYY-MM'; null = the current month.
create or replace function f_margin_detail(p_month text)
returns table (k text, sp smallint, cu int, it int, q numeric, s numeric, c numeric)
language sql stable as $$
  with p as (select * from v_period),
  w as (
    select m, least((m + interval '1 month' - interval '1 day')::date, p.as_of) e
    from p, lateral (select coalesce(to_date(p_month, 'YYYY-MM'), p.month_start) m) x
  )
  select 'ty', sp_id, customer_code, item_code, round(sum(qty), 1), round(sum(net_value), 2), round(sum(cost_value), 2)
  from sales_line, w where billing_date between w.m and w.e group by 2, 3, 4
  union all
  select 'ly', sp_id, customer_code, item_code, round(sum(qty), 1), round(sum(net_value), 2), round(sum(cost_value), 2)
  from sales_line, w where billing_date between w.m - interval '1 year' and w.e - interval '1 year' group by 2, 3, 4
$$;
