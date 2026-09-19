const AVATAR_COLORS = [
  "#0ea5e9", "#8b5cf6", "#10b981", "#f59e0b",
  "#ef4444", "#ec4899", "#14b8a6", "#6366f1",
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function colorFor(name: string): string {
  let sum = 0;
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

/** Initials avatar with a deterministic color derived from the name. */
export function Avatar({ name }: { name: string }) {
  return (
    <span className="avatar" style={{ background: colorFor(name) }} aria-hidden>
      {initials(name)}
    </span>
  );
}

/** Avatar + name in one cell, the standard person reference in tables. */
export function NameCell({ name }: { name: string }) {
  return (
    <span className="name-cell">
      <Avatar name={name} />
      {name}
    </span>
  );
}
