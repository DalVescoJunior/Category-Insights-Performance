-- Give each hub a country (ISO 3166 alpha-3). Run once on an existing database, then re-run views.sql.
alter table org add column if not exists country text;
update org set country = v.country
from (values ('NTH','USA'), ('CAP','BRA'), ('CST','ARE')) v(org_code, country)
where org.org_code = v.org_code;
alter table org alter column country set not null;
