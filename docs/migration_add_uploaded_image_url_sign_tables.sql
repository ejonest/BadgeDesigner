-- User-uploaded logo image URL for sign designer (stored in Supabase Storage).
-- Distinct from full_image_url, which holds the exported SVG for the composed design.
-- Run in Supabase SQL Editor after reviewing.

alter table public.sign_designs
  add column if not exists uploaded_image_url text null;

alter table public.sign_order_items
  add column if not exists uploaded_image_url text null;

comment on column public.sign_designs.uploaded_image_url is
  'Public URL of the user-uploaded logo raster (sign designer); not the SVG export.';

comment on column public.sign_order_items.uploaded_image_url is
  'Public URL of the user-uploaded logo raster for this line item; not the SVG export.';
