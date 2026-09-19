type Props = {
  children: React.ReactNode;
  className?: string;
  as?: "p" | "span" | "div" | "h2" | "h3";
};

/**
 * Small-caps tracked label used above section heads.
 * Matches `.eyebrow` in globals.css.
 */
export function Eyebrow({ children, className = "", as: Tag = "p" }: Props) {
  return <Tag className={`eyebrow ${className}`}>{children}</Tag>;
}
