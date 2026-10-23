-- Adjustments applied after seed_facts.sql to shape the sample stories
-- Halve overstock-profile stock
update stock_batch sb set qty = round(qty * 0.5, 2), value = round(value * 0.5, 2)
from (select org_code, item_code from sales_line where billing_date > date '2026-10-22' - 28 and qty > 0 group by 1, 2) d
where d.org_code = sb.org_code and d.item_code = sb.item_code and abs(hashtext(sb.item_code::text || sb.org_code || 'stk')) % 100 between 15 and 24;
-- Soften the Lamb & Veal October drop
update sales_line l set qty = round(qty * 1.35, 2), net_value = round(net_value * 1.35, 2), cost_value = round(cost_value * 1.35, 2)
from item i join brand b using (brand_id)
where i.item_code = l.item_code and b.category_id = 2 and l.billing_date >= date '2026-10-01';
-- Move most expired batches into the next 30 days so expiry risk shows up as "expiring"
update stock_batch sb set expiry_date = date '2026-10-22' + 4 + abs(hashtext(sb.batch)) % 26,
       received_date = date '2026-10-22' + 4 + abs(hashtext(sb.batch)) % 26 - i.shelf_life_days
from item i where i.item_code = sb.item_code and sb.expiry_date < date '2026-10-22' and abs(hashtext(sb.batch || 'x')) % 10 < 7;
