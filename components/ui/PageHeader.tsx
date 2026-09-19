/**
 * Board header — the title + count + description on the left, an actions/toolbar
 * slot on the right. Used at the top of every interior surface for a consistent
 * Monday-style board head.
 */
export function PageHeader({
  title,
  count,
  description,
  children,
}: {
  title: string;
  count?: number;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="page-title">
          {title}
          {count != null && <span className="page-count">{count}</span>}
        </h1>
        {description && <p className="page-desc">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
