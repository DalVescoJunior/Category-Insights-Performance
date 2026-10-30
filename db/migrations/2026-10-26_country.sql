-- Countries of origin with their ISO 3166 alpha-3 code and name; each brand points at one.
-- Run once on an existing database, then re-run views.sql.
create table if not exists country (code text primary key, name text not null);
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
 ('ZAF','South Africa')
on conflict (code) do update set name = excluded.name;
alter table brand add column if not exists country_code text references country;
update brand b set country_code = c.code from country c where c.name = b.origin or (b.origin = 'USA' and c.code = 'USA');
