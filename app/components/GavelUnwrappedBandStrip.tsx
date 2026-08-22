type Props = {
  dataUrl: string;
  empty?: boolean;
  label?: string;
  emptyText?: string;
  square?: boolean;
  /** Art is cut to its own silhouette, so it gets no frame around it. */
  shaped?: boolean;
};

export function GavelUnwrappedBandStrip({
  dataUrl,
  empty,
  label = "Unwrapped band (custom proof)",
  emptyText = "Enter text to see it laid out on the band",
  square = false,
  shaped = false,
}: Props) {
  return (
    <div className="gf-band-strip">
      <div className="gf-band-strip-label">{label}</div>
      {empty || !dataUrl ? (
        <div
          className={`gf-band-strip-empty${square ? " is-square" : ""}`}
        >
          {emptyText}
        </div>
      ) : (
        <img
          src={dataUrl}
          alt={label}
          className={`gf-band-strip-img${square ? " is-square" : ""}${
            shaped ? " is-shaped" : ""
          }`}
        />
      )}
    </div>
  );
}
