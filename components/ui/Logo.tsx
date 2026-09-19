type Props = {
  size?: number;
  className?: string;
  withWordmark?: boolean;
};

/**
 * "Example Co" lockup: an invented mark drawn for this demo (public/example-logo.svg).
 *
 * The SVG itself includes the words "EXAMPLE CO", so `withWordmark` does not
 * re-render the company name; it controls the small product wordmark ("DRMC")
 * shown beside the mark.
 */
export function Logo({ size = 28, className = "", withWordmark = false }: Props) {
  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- static SVG, nothing to optimize */}
      <img
        src="/example-logo.svg"
        alt="Example Co"
        width={size * 3.8}
        height={size}
        className="brand-logo object-contain"
      />
      {withWordmark && (
        <span
          className="font-display text-[15px] font-semibold uppercase leading-none text-ink"
          style={{ letterSpacing: "0.14em" }}
        >
          DRMC
        </span>
      )}
    </span>
  );
}
