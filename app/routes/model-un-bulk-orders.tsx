import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { useMemo, useState } from "react";
import "../styles/modelUnBulkOrders.css";

export const meta: MetaFunction = () => [
  { title: "Model UN & Bulk Orders — Gavels Fast" },
  {
    name: "description",
    content:
      "Create custom Model UN gavels and personalize a full conference order from CSV.",
  },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  return json(
    {
      shop: url.searchParams.get("shop"),
      customerId:
        url.searchParams.get("customerId") ??
        url.searchParams.get("customer_id"),
      embedded: url.searchParams.get("embedded") === "1",
    },
    {
      headers: {
        "X-Frame-Options": "ALLOWALL",
        "Content-Security-Policy": "frame-ancestors *",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    },
  );
}

type ProductChoice = "block" | "stand" | "sound-block" | "band";

/**
 * Every card maps to a combination the store actually sells, since there is no
 * standalone sound block or band SKU. Prices are the lowest custom wood
 * (rubberwood) from the Gavels Fast product sheet; the designer resolves the
 * live variant price once a wood is chosen.
 */
const PRODUCTS: readonly {
  id: ProductChoice;
  title: string;
  note: string;
  price: string;
  image: string;
  productType: "gavel" | "stand";
  soundBlock: "none" | "plain" | "engraved";
}[] = [
  {
    id: "block",
    title: "Gavel on Block",
    note: "Engraved band, plain sound block",
    price: "From $24.98",
    image: "/images/gavel/product-walnut-block-angle.jpg",
    productType: "gavel",
    soundBlock: "plain",
  },
  {
    id: "stand",
    title: "Gavel on Stand",
    note: "Engraved band and stand plate",
    price: "From $34.95",
    image: "/images/gavel/product-walnut-stand-front.jpg",
    productType: "stand",
    soundBlock: "none",
  },
  {
    id: "sound-block",
    title: "Sound Block",
    note: "Personalized block top, gavel included",
    price: "From $34.98",
    image: "/images/gavel/product-soundblock-engraved.jpg",
    productType: "gavel",
    soundBlock: "engraved",
  },
  {
    id: "band",
    title: "Gavel Band",
    note: "Gavel only, engraved band",
    price: "From $19.99",
    image: "/images/gavel/product-walnut-gavel.jpg",
    productType: "gavel",
    soundBlock: "none",
  },
];

export default function ModelUnBulkOrdersRoute() {
  const { shop, customerId, embedded } = useLoaderData<typeof loader>();
  const [product, setProduct] = useState<ProductChoice>("block");

  const selected = PRODUCTS.find((item) => item.id === product) ?? PRODUCTS[0];

  /** Only the stand carries a plate, and only the square block top is engravable. */
  const engravingSurface =
    selected.productType === "stand"
      ? "Band + stand plate"
      : selected.soundBlock === "engraved"
        ? "Band + block top"
        : "Band";
  const defaultLogoSurface =
    selected.productType === "stand"
      ? "Stand plate (full color)"
      : selected.soundBlock === "engraved"
        ? "Sound block top (black ink)"
        : "Not available";

  const designerUrl = useMemo(() => {
    const params = new URLSearchParams({
      productType: selected.productType,
      soundBlock: selected.soundBlock,
      bulk: "1",
      audience: "model-un",
    });
    if (selected.productType === "stand") {
      params.set("logoSurface", "stand");
    } else if (selected.soundBlock === "engraved") {
      params.set("logoSurface", "sound-block");
    }
    if (shop) params.set("shop", shop);
    if (customerId) params.set("customerId", customerId);
    if (embedded) params.set("embedded", "1");
    return `/gavel-designer?${params.toString()}`;
  }, [customerId, embedded, selected, shop]);

  return (
    <div className="mun-page">
      <div className="mun-trustbar">
        <div><span>▣</span><strong>FAST, RELIABLE SHIPPING</strong><small>Most orders ship within 24–48 hours</small></div>
        <div><span>◇</span><strong>QUALITY CRAFTSMANSHIP</strong><small>Premium materials built to last</small></div>
        <div><span>♙</span><strong>BULK & CUSTOM ORDERS</strong><small>CSV personalization for organizations</small></div>
        <div><span>★</span><strong>4.7 from 3,400+ reviews</strong><small>Trusted by organizations nationwide</small></div>
      </div>

      <main className="mun-wrap">
        <nav className="mun-breadcrumb" aria-label="Breadcrumb">
          Home <span>›</span> Shop by Who It&apos;s For <span>›</span> Model UN
          &amp; Bulk Orders
        </nav>
        <header className="mun-title">
          <p>Conference awards made simple</p>
          <h1>Model UN &amp; Bulk Orders</h1>
          <span>
            Create one coordinated design, then personalize every gavel with
            delegate names, roles, or schools from a CSV.
          </span>
        </header>

        <section className="mun-tool">
          <div className="mun-steps" aria-label="Order steps">
            <div className="is-active"><b>1</b><span><strong>Choose Product</strong><small>Select your item</small></span></div>
            <div><b>2</b><span><strong>Design</strong><small>Style and import names</small></span></div>
            <div><b>3</b><span><strong>Preview</strong><small>Review and order</small></span></div>
          </div>

          <div className="mun-tool-grid">
            <div>
              <h2>Choose your product</h2>
              <div className="mun-products">
                {PRODUCTS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={product === item.id ? "is-selected" : ""}
                    onClick={() => setProduct(item.id)}
                  >
                    <span className="mun-product-photo">
                      <img src={item.image} alt="" />
                    </span>
                    <strong>{item.title}</strong>
                    <em className="mun-product-note">{item.note}</em>
                    <small>{item.price}</small>
                  </button>
                ))}
              </div>
              <div className="mun-bulk-toggle is-locked">
                <span aria-hidden><i /></span>
                <b>Personalized bulk order</b>
              </div>
              <p className="mun-helper">
                Upload the CSV template or paste rows directly — one gavel per
                line, commas between text lines. Your wood, finish, font, and
                shared logo stay consistent across the order.
              </p>
            </div>

            <div className="mun-preview">
              <h2>Live product preview</h2>
              <div className="mun-preview-photo">
                <img src={selected.image} alt={selected.title} />
              </div>
              <div className="mun-view-pills">
                <span>Gavel view</span><span>Top view available in designer</span>
              </div>
            </div>

            <aside className="mun-summary">
              <h2>Your design</h2>
              <div className="mun-plaque">
                <strong>MODEL UNITED NATIONS</strong>
                <span>Secretary-General</span>
              </div>
              <dl>
                <div><dt>Product</dt><dd>{selected.title}</dd></div>
                <div><dt>Engraving</dt><dd>{engravingSurface}</dd></div>
                <div><dt>Personalization</dt><dd>CSV names</dd></div>
                <div>
                  <dt>Logo placement</dt>
                  <dd>{defaultLogoSurface}</dd>
                </div>
              </dl>
              <Link className="mun-cta" to={designerUrl}>
                Continue to design
              </Link>
            </aside>
          </div>
        </section>

        <section className="mun-benefits" aria-label="Order benefits">
          <div><b>▣</b><span><strong>FREE USA SHIPPING</strong><small>On qualifying orders</small></span></div>
          <div><b>ϟ</b><span><strong>FAST PRODUCTION</strong><small>Clear proofs before production</small></span></div>
          <div><b>✓</b><span><strong>NO ARTWORK FEES</strong><small>Design free — preview before you buy</small></span></div>
          <div><b>♙</b><span><strong>ONE CSV, MANY NAMES</strong><small>Review every personalized row</small></span></div>
        </section>
      </main>
    </div>
  );
}
