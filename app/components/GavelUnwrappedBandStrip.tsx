type Props = {
  dataUrl: string;
  empty?: boolean;
};

export function GavelUnwrappedBandStrip({ dataUrl, empty }: Props) {
  return (
    <div className="gf-band-strip">
      <div className="gf-band-strip-label">Unwrapped band (engraving proof)</div>
      {empty || !dataUrl ? (
        <div className="gf-band-strip-empty">
          Enter text to see it laid out on the band
        </div>
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
