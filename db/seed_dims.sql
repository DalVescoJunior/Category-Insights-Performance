-- Dimensions: every name below is invented
insert into category values
 (1,'Beef','Lina Farouk','Sara Ali',0.14,14,45,0.30),
 (2,'Lamb & Veal','Lina Farouk','Sara Ali',0.15,14,45,0.10),
 (3,'Poultry','Marco Silva','Omar Khalil',0.16,10,40,0.16),
 (4,'Pork & Deli','Marco Silva','Omar Khalil',0.20,14,50,0.06),
 (5,'Seafood','Priya Nair','Joy Santos',0.18,21,60,0.10),
 (6,'Dairy & Cheese','Priya Nair','Joy Santos',0.20,10,35,0.12),
 (7,'Pastry & Bakery','Tom Becker','Ken Ito',0.25,21,75,0.09),
 (8,'Grocery & Oils','Tom Becker','Ken Ito',0.18,21,75,0.07);

insert into country values
 ('ARE','United Arab Emirates'),
 ('AUS','Australia'),
 ('AUT','Austria'),
 ('BEL','Belgium'),
 ('BRA','Brazil'),
 ('CAN','Canada'),
 ('DEU','Germany'),
 ('ESP','Spain'),
 ('FRA','France'),
 ('GBR','United Kingdom'),
 ('IND','India'),
 ('ITA','Italy'),
 ('NLD','Netherlands'),
 ('NOR','Norway'),
 ('NZL','New Zealand'),
 ('USA','United States of America'),
 ('VNM','Vietnam'),
 ('ZAF','South Africa');

insert into brand (brand_id, name, category_id, origin, supplier) values
 (1,'Ridgeline Angus',1,'Australia','Ridgeline Meats Pty'),
 (2,'Pampas Prime',1,'Brazil','Pampas Exports SA'),
 (3,'Highveld Beef',1,'South Africa','Highveld Packers'),
 (4,'Prairie Gold',1,'USA','Prairie Gold Foods'),
 (5,'Southern Downs',2,'Australia','Southern Downs Lamb Co'),
 (6,'Kiwi Pasture',2,'New Zealand','Kiwi Pasture Ltd'),
 (7,'Alpine Veal',2,'Netherlands','Alpine Veal BV'),
 (8,'Golden Coop',3,'Brazil','Golden Coop Alimentos'),
 (9,'Meadow Turkey',3,'USA','Meadow Farms Inc'),
 (10,'Sunrise Poultry',3,'France','Sunrise Volailles'),
 (11,'Iberia Reserve',4,'Spain','Iberia Reserve SL'),
 (12,'Old Smokehouse',4,'USA','Old Smokehouse Co'),
 (13,'Black Forest Deli',4,'Germany','Schwarzwald Feinkost'),
 (14,'Arctic Catch',5,'Norway','Arctic Catch AS'),
 (15,'Coral Bay',5,'Vietnam','Coral Bay Seafood'),
 (16,'Atlantic Harvest',5,'Canada','Atlantic Harvest Ltd'),
 (17,'Alpenmilch',6,'Austria','Alpenmilch GmbH'),
 (18,'Normandy Creamery',6,'France','Cremerie de Normandie'),
 (19,'Green Valley Dairy',6,'New Zealand','Green Valley Co-op'),
 (20,'Maison Cacao',7,'Belgium','Maison Cacao NV'),
 (21,'Bakers Pride',7,'United Kingdom','Bakers Pride Ltd'),
 (22,'Fruit Atelier',7,'France','Fruit Atelier SAS'),
 (23,'Sunfield Oils',8,'USA','Sunfield Oils Inc'),
 (24,'Casa Grano',8,'Italy','Casa Grano SpA'),
 (25,'Spice Route',8,'India','Spice Route Exports');
update brand b set country_code = c.code from country c where c.name = b.origin or (b.origin = 'USA' and c.code = 'USA');

-- Item templates per category: name, unit cost, storage, uom
with tpl(category_id, t, cost, storage, uom) as (values
 (1,'Ribeye',38,'Chilled','KG'),(1,'Striploin',32,'Chilled','KG'),(1,'Tenderloin',55,'Chilled','KG'),
 (1,'Brisket',18,'Frozen','KG'),(1,'Ground Beef 80/20',14,'Frozen','KG'),(1,'Short Ribs',26,'Frozen','KG'),(1,'Burger Patty 150g',16,'Frozen','KG'),
 (2,'Lamb Rack Frenched',48,'Chilled','KG'),(2,'Lamb Leg Boneless',30,'Chilled','KG'),(2,'Lamb Shoulder',22,'Frozen','KG'),
 (2,'Veal Tenderloin',60,'Frozen','KG'),(2,'Lamb Mince',18,'Frozen','KG'),(2,'Veal Striploin',45,'Chilled','KG'),
 (3,'Chicken Breast Fillet',10,'Frozen','KG'),(3,'Whole Chicken 1.2kg',8,'Frozen','KG'),(3,'Chicken Thigh Boneless',9,'Frozen','KG'),
 (3,'Smoked Turkey Breast',22,'Chilled','KG'),(3,'Whole Turkey',12,'Frozen','KG'),(3,'Duck Breast',30,'Frozen','KG'),
 (4,'Streaky Bacon',20,'Chilled','KG'),(4,'Pork Belly',18,'Frozen','KG'),(4,'Prosciutto Sliced',55,'Chilled','KG'),
 (4,'Pepperoni Sliced',24,'Chilled','KG'),(4,'Salami Milano',40,'Chilled','KG'),(4,'Pork Back Ribs',16,'Frozen','KG'),
 (5,'Salmon Fillet',34,'Frozen','KG'),(5,'Shrimp 16/20',28,'Frozen','KG'),(5,'Cod Loin',30,'Frozen','KG'),
 (5,'Squid Rings',14,'Frozen','KG'),(5,'Tuna Saku',45,'Frozen','KG'),(5,'Scallops',60,'Frozen','KG'),
 (6,'Unsalted Butter 10kg',10,'Chilled','KG'),(6,'Cooking Cream 35% 1L',6,'Chilled','PC'),(6,'Mozzarella 2kg',14,'Chilled','KG'),
 (6,'Cheddar Block',16,'Chilled','KG'),(6,'Parmesan Wheel',38,'Chilled','KG'),(6,'Cream Cheese 1kg',13,'Chilled','PC'),
 (7,'Dark Couverture 55%',40,'Ambient','KG'),(7,'Puff Pastry Sheets',9,'Frozen','KG'),(7,'Butter Croissant 70g',85,'Frozen','CS'),
 (7,'Raspberry Puree 1kg',45,'Frozen','PC'),(7,'Neutral Glaze 5kg',30,'Ambient','PC'),(7,'Almond Flour',22,'Ambient','KG'),
 (8,'Frying Oil 20L',95,'Ambient','CS'),(8,'Extra Virgin Olive Oil 5L',48,'Ambient','PC'),(8,'Penne Pasta 5kg',32,'Ambient','CS'),
 (8,'Basmati Rice 20kg',70,'Ambient','BAG'),(8,'Tomato Passata',40,'Ambient','CS'),(8,'Black Pepper Ground 1kg',26,'Ambient','PC')
), pick as (
 select b.brand_id, b.name bname, c.margin_floor, tpl.*,
        row_number() over (order by b.brand_id, tpl.t) rn,
        hashtext(b.name || tpl.t) h
 from brand b join category c using (category_id) join tpl using (category_id)
)
insert into item
select 1300000 + rn*7,
       upper(t || ' ' || bname),
       brand_id, storage, uom,
       case when storage='Chilled' and category_id in (1,2) then 90
            when storage='Chilled' then 120
            when storage='Frozen' then 540 else 365 end,
       round((cost * (0.85 + (abs(h) % 300)/1000.0))::numeric, 2),
       round((cost * (0.85 + (abs(h) % 300)/1000.0) / (1 - (margin_floor + 0.05 + (abs(h) % 70)/1000.0)))::numeric, 2),
       round((0.3 + (abs(h/7) % 270)/100.0)::numeric, 2)
from pick
where abs(h) % 100 < 72;   -- each brand carries roughly 70% of its category's range

insert into org values ('NTH','North Hub',0.60),('CAP','Capital Hub',0.28),('CST','Coastal Hub',0.12);

insert into salesperson values
 (1,'Adam Rossi','NTH','Foodservice'),(2,'Bella Moreno','NTH','Foodservice'),(3,'Chris Okafor','NTH','Foodservice'),
 (4,'Dina Kovac','NTH','Foodservice'),(5,'Elias Brandt','NTH','Pastry & Bakery'),(6,'Fatima Rahman','NTH','E-Commerce'),
 (7,'George Lam','NTH','4PL'),(8,'Hana Sato','CAP','Foodservice'),(9,'Ivan Petrov','CAP','Foodservice'),
 (10,'Julia Costa','CAP','Pastry & Bakery'),(11,'Karim Aziz','CST','Foodservice'),(12,'Leah Murphy','CST','Foodservice');

-- Customers: invented names built from word lists
with seg(segment, sub_segment, division, n, a, b) as (values
 ('Hotels','5 star','Foodservice',34, array['Harbor','Palm','Desert','Marina','Skyline','Coral','Pearl','Oasis','Lagoon','Falcon','Summit','Crescent'], array['Grand Hotel','Resort & Spa','Suites','Beach Resort','Tower Hotel']),
 ('Hotels','4 star','Foodservice',26, array['City','Garden','Bay','Creek','Dune','Atrium','Cove','Gate'], array['Inn','Hotel','Residences','Plaza Hotel']),
 ('Restaurants','Fine dining','Foodservice',22, array['Saffron','Ember','Juniper','Truffle','Cedar','Fig','Copper','Velvet'], array['Steakhouse','Kitchen','Table','Brasserie']),
 ('Restaurants','Casual dining','Foodservice',40, array['Olive','Basil','Smoke','Sea Salt','Pepper','Charcoal','Lemon','Thyme','Paprika','Clove'], array['Grill','Bistro','Trattoria','Diner','Eatery']),
 ('Restaurants','Cafe','Foodservice',24, array['Bean','Morning','Brew','Corner','Daily','Avenue'], array['Cafe','Coffee House','Deli','Kitchen']),
 ('Restaurants','QSR','Foodservice',14, array['Stack','Bun','Flame','Quick','Urban'], array['Burger Co.','Wings','Shawarma Bar']),
 ('Catering','Inflight & industrial','Foodservice',10, array['SkyChef','Metro','Prime','Unity','Allied'], array['Catering','Food Solutions']),
 ('Traders & Wholesale','Trading','Foodservice',14, array['Northstar','Bluewave','Atlas','Meridian','Horizon','Keystone','Anchor'], array['Trading LLC','Foodstuff Trading']),
 ('Bakeries','Pastry & bakery','Pastry & Bakery',30, array['Butter & Bloom','Crumb','Golden Crust','Sugar Atelier','Petit Four','Rye & Co','Flour House','Brioche'], array['Bakery','Patisserie','Pastry Lab','Bakehouse']),
 ('Online','Direct to consumer','E-Commerce',3, array['Home Chef','Gourmet Box','Butcher Online'], array['Online']),
 ('Chains','Franchise partner','4PL',6, array['Brioche Chain','Burger Network','Cafe Group','Pizza Collective','Sandwich Hub','Juice Lab'], array['Partner'])
), gen as (
 select s.*, g, row_number() over () rn from seg s, generate_series(1, s.n) g
), named as (
 select *, a[1 + (g-1) % array_length(a,1)] || ' ' || b[1 + ((g-1) / array_length(a,1)) % array_length(b,1)] base,
        abs(hashtext(segment||g)) h
 from gen
)
insert into customer
select 1000000 + rn,
       base || case when count(*) over (partition by base order by rn) > 1 then ' ' || count(*) over (partition by base order by rn) else '' end,
       segment, sub_segment, division,
       case when division in ('E-Commerce','4PL') then 'NTH'
            when h % 100 < 58 then 'NTH' when h % 100 < 87 then 'CAP' else 'CST' end,
       null,
       round((case when division = 'E-Commerce' then 9 when division = '4PL' then 4
                   when segment = 'Hotels' and sub_segment = '5 star' then 2.2
                   when segment in ('Catering','Traders & Wholesale') then 2.6
                   else 1 end * (0.2 + power((h % 1000)/1000.0, 3) * 4))::numeric, 3)
from named;

-- Pastry customers outside NTH/CAP go to NTH so a pastry salesperson exists
update customer set org_code = 'NTH' where division = 'Pastry & Bakery' and org_code = 'CST';
update customer c set sp_id = (
  select sp_id from salesperson s where s.org_code = c.org_code and s.division = c.division
  order by abs(hashtext(c.customer_code::text || s.sp_id::text)) limit 1);
