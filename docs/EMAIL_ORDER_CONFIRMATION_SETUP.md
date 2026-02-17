# Order confirmation email: badge thumbnail, limited details, and proof link

The Order confirmation notification template has been updated (in `app/temp/tempEmailNotification.txt`) to:

1. **Thumbnail**: Show the custom badge thumbnail when present (`Custom Thumbnail` line item property), otherwise the variant image or placeholder.
2. **Details**: For custom badge line items (`Custom Badge Design` = Yes), show only: Badge Text Lines 1–4, Price, Attachment (Backing Type), and Background color (with swatch).
3. **Proof link**: When `Proof PDF URL` is present, show a “Download your proof (badge design for this order)” link.

## Applying the template in Shopify

1. Open **Shopify Admin** → **Settings** → **Notifications**.
2. Under **Customer notifications**, click **Order confirmation**.
3. Open the **Edit code** (or equivalent) view for the notification body.
4. Replace the full template content with the contents of **`app/temp/tempEmailNotification.txt`** from this repo (copy the entire file and paste into the Shopify editor).
5. Save.

The PDF URL is added to cart line item properties by the badge designer app when the customer adds to cart (after the proof is uploaded to Supabase). No other Shopify-side setup is required.
