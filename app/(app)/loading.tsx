// Shown during navigation between (app) routes. Every page is a dynamic render
// against the database, so a plain blank screen reads as "broken" on slower
// connections; a shaped skeleton makes the wait legible.
export default function Loading() {
  return (
    <div className="p-6" aria-busy="true" aria-label="Loading">
      <div className="skeleton" style={{ height: 28, width: 220, marginBottom: 20 }} />
      <div className="skeleton" style={{ height: 14, width: 340, marginBottom: 28 }} />
      <div className="surface" style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "0.85rem" }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
            <div className="skeleton" style={{ height: 34, width: 34, borderRadius: "50%" }} />
            <div className="skeleton" style={{ height: 14, flex: 1, maxWidth: 260 }} />
            <div className="skeleton" style={{ height: 14, width: 90, marginLeft: "auto" }} />
          </div>
        ))}
      </div>
    </div>
  );
}
