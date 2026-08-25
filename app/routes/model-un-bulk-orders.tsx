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

type ProductChoice = "block" | "stand";

const PRODUCTS = [
  {
    id: "block",
    title: "Gavel on Block",
    price: "From $19.98",
    image: "/images/gavel/product-walnut-block-angle.jpg",
    available: true,
  },
  {
    id: "stand",
    title: "Gavel on Stand",
    price: "From $19.98",
    image: "/images/gavel/product-walnut-stand-front.jpg",
    available: true,
  },
  {
    id: "sound-block",
    title: "Sound Block",
    price: "Coming soon",
    image: "/images/gavel/product-soundblock-engraved.jpg",
    available: false,
  },
  {
    id: "band",
    title: "Gavel Band",
    price: "Included with gavels",
    image: "/images/gavel/product-walnut-gavel.jpg",
    available: false,
  },
] as const;

export default function ModelUnBulkOrdersRoute() {
  const { shop, customerId, embedded } = useLoaderData<typeof loader>();
  const [product, setProduct] = useState<ProductChoice>("block");
  const [bulk, setBulk] = useState(true);

  const designerUrl = useMemo(() => {
    const params = new URLSearchParams({
      productType: product === "stand" ? "stand" : "gavel",
      bulk: bulk ? "1" : "0",
      audience: "model-un",
    });
    if (product === "block") params.set("soundBlock", "engraved");
    if (shop) params.set("shop", shop);
    if (customerId) params.set("customerId", customerId);
    if (embedded) params.set("embedded", "1");
    return `/gavel-designer?${params.toString()}`;
  }, [bulk, customerId, embedded, product, shop]);

  const selected = PRODUCTS.find((item) => item.id === product) ?? PRODUCTS[0];

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
                    disabled={!item.available}
                    className={product === item.id ? "is-selected" : ""}
                    onClick={() => {
                      if (item.available) setProduct(item.id);
                    }}
                  >
                    <span className="mun-product-photo">
                      <img src={item.image} alt="" />
                    </span>
                    <strong>{item.title}</strong>
                    <small>{item.price}</small>
                  </button>
                ))}
              </div>
              <label className="mun-bulk-toggle">
                <input
                  type="checkbox"
                  checked={bulk}
                  onChange={(event) => setBulk(event.target.checked)}
                />
                <span aria-hidden><i /></span>
                <b>I need a personalized bulk order</b>
              </label>
              <p className="mun-helper">
                {bulk
                  ? "Upload names in the designer using our CSV template. Your wood, finish, font, and optional school logo stay consistent."
                  : "You can also create one design and choose a standard quantity."}
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
                <div><dt>Style</dt><dd>Choose next</dd></div>
                <div><dt>Personalization</dt><dd>{bulk ? "CSV names" : "One design"}</dd></div>
                <div><dt>School logo</dt><dd>Optional</dd></div>
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
