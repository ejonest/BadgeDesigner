import { useEffect, useMemo, useState } from "react";
import {
  buildCustomBadgeBackgroundSrc,
  listCustomBadgeBackgroundCategoriesForTemplate,
} from "~/utils/badgeCustomBackgrounds";
import { buildBadgeTemplatePhotoThumbSvg } from "~/utils/badgeBlankPhotos";

export type AqbBadgeStyleSelection = "plain" | string;

type AqbBadgeStylePickerProps = {
  templateId: string;
  selected: AqbBadgeStyleSelection | null;
  onSelectPlain: () => void;
  onSelectCustom: (backgroundId: string) => void;
};

function PlainBadgeThumb({ templateId }: { templateId: string }) {
  const svg = useMemo(
    () => buildBadgeTemplatePhotoThumbSvg(templateId, "#FFFFFF"),
    [templateId],
  );
  if (svg) {
    return (
      <div
        className="aqb-badge-style-picker__thumb-inner"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  }
  return (
    <div
      className="aqb-badge-style-picker__thumb-inner aqb-badge-style-picker__thumb-inner--plain"
      aria-hidden
    />
  );
}

export function AqbBadgeStylePicker({
  templateId,
  selected,
  onSelectPlain,
  onSelectCustom,
}: AqbBadgeStylePickerProps) {
  const categories = useMemo(
    () => listCustomBadgeBackgroundCategoriesForTemplate(templateId),
    [templateId],
  );

  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  useEffect(() => {
    if (!selected || selected === "plain") return;
    const match = categories.find((c) =>
      c.items.some((item) => item.id === selected),
    );
    if (match) setExpandedCategory(match.category);
  }, [selected, categories]);

  const toggleCategory = (category: string) => {
    setExpandedCategory((prev) => (prev === category ? null : category));
  };

  return (
    <div className="aqb-badge-style-picker">
      <p className="aqb-badge-style-picker__hint">
        Choose a plain badge and pick your own color next, or open a category
        below to pick a pre-designed background.
      </p>

      <button
        type="button"
        className={`aqb-badge-style-picker__card aqb-badge-style-picker__card--plain ${
          selected === "plain" ? "is-selected" : ""
        }`}
        onClick={onSelectPlain}
      >
        <div className="aqb-badge-style-picker__thumb">
          <PlainBadgeThumb templateId={templateId} />
        </div>
        <span className="aqb-badge-style-picker__name">Plain color badge</span>
      </button>

      <div className="aqb-badge-style-picker__categories">
        {categories.map(({ category, items }) => {
          const open = expandedCategory === category;
          const selectedInCategory = items.some((item) => item.id === selected);
          return (
            <div
              key={category}
              className={`aqb-badge-style-picker__category ${
                open ? "is-open" : ""
              } ${selectedInCategory ? "has-selection" : ""}`}
            >
              <button
                type="button"
                className="aqb-badge-style-picker__category-toggle"
                aria-expanded={open}
                onClick={() => toggleCategory(category)}
              >
                <span className="aqb-badge-style-picker__category-toggle-label">
                  {category}
                  <span className="aqb-badge-style-picker__category-count">
                    {items.length}
                  </span>
                </span>
                <span
                  className="aqb-badge-style-picker__category-chevron"
                  aria-hidden
                >
                  {open ? "−" : "+"}
                </span>
              </button>
              <div
                className={`aqb-badge-style-picker__category-panel ${
                  open ? "is-open" : ""
                }`}
              >
                <div className="aqb-badge-style-picker__grid">
                  {items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`aqb-badge-style-picker__card ${
                        selected === item.id ? "is-selected" : ""
                      }`}
                      onClick={() => onSelectCustom(item.id)}
                      title={`${category} · ${item.name}`}
                    >
                      <div className="aqb-badge-style-picker__thumb">
                        <img
                          src={buildCustomBadgeBackgroundSrc(item.fileName)}
                          alt=""
                          className="aqb-badge-style-picker__img"
                          loading="lazy"
                          draggable={false}
                        />
                      </div>
                      <span className="aqb-badge-style-picker__name">
                        {item.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
