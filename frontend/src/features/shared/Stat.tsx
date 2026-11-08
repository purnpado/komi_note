export function Stat({ icon, title, value, note, color }: {
  icon: string;
  title: string;
  value: string;
  note: string;
  color?: string;
}) {
  return <div className="stat"><span className={`stat-icon ${color}`}>{icon}</span><div><p>{title}</p><strong>{value}</strong><small>{note}</small></div></div>;
}
