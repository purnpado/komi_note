export function HelpTip({ children }: { children: string }) {
  return (
    <span className="help-tip" tabIndex={0} aria-label={`도움말: ${children}`}>
      ?<span role="tooltip">{children}</span>
    </span>
  );
}
