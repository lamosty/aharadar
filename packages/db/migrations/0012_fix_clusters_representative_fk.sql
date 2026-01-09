-- Fix clusters.representative_content_item_id FK to allow cascade deletion of content_items.
-- Previously the FK had no action (defaults to RESTRICT), blocking source deletion.

alter table clusters
drop constraint if exists clusters_representative_content_item_id_fkey;

alter table clusters
add constraint clusters_representative_content_item_id_fkey
foreign key (representative_content_item_id)
references content_items(id)
on delete set null;
