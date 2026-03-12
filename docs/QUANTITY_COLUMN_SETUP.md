# Quantity column setup (badge_order_items and future sign/stamp tables)

Quantity is stored on each order-item row: **1** when the user adds to cart, and **updated from the order line item** when the order is paid (link-order). This supports customers changing quantity at checkout (e.g. adding duplicates) without creating extra rows.

---

## Supabase

### 1. Run the migration (badge store)

In the **Supabase SQL Editor** for your project, run:

```sql
-- From docs/migration_add_quantity_to_badge_order_items.sql
ALTER TABLE public.badge_order_items
  ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.badge_order_items.quantity IS 'Number of units for this design/badge; 1 at add-to-cart, updated from order line item at checkout.';
```

Existing rows will get `quantity = 1`. New rows from add-to-cart get `quantity = 1`; at checkout, link-order updates the row with the order’s quantity.

### 2. Future tables (sign store, stamps, etc.)

When you add `sign_order_items`, `stamp_order_items`, or similar tables, add the same column so the same link-order logic works:

```sql
ALTER TABLE public.sign_order_items
  ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1;
-- (and similarly for stamp_order_items, etc.)
```

Use the same pattern: one row per (design_id, badge_id)—or per (design_id, sign_id)—with `quantity` set to 1 at add-to-cart and updated from the order at checkout.

---

## Shopify

**No changes required.** Cart line item quantity is already sent by your Gadget `on_order_paid` action (`item.quantity`). The Vercel link-order API uses that value to update the Supabase `quantity` column when the order is paid.

---

## Summary

| Where            | Action |
|------------------|--------|
| **Supabase**     | Run the migration once on `badge_order_items`; add the same `quantity` column to any new order-item tables (sign, stamp) when you create them. |
| **Shopify**      | Nothing. |
| **Gadget**       | No code changes. It already sends `quantity` per line item. |
