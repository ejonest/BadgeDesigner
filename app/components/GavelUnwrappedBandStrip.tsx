type Props = {
  dataUrl: string;
  empty?: boolean;
  label?: string;
  emptyText?: string;
};

export function GavelUnwrappedBandStrip({
  dataUrl,
  empty,
  label = "Unwrapped band (engraving proof)",
  emptyText = "Enter text to see it laid out on the band",
}: Props) {
  return (
    <div className="gf-band-strip">
      <div className="gf-band-strip-label">{label}</div>
      {empty || !dataUrl ? (
        <div className="gf-band-strip-empty">{emptyText}</div>
      ) : (
        <img
          src={dataUrl}
          alt="Unwrapped gavel band with your engraving"
          className="gf-band-strip-img"
        />
      )}
    </div>
  );
}
