import "./dashboard.css";

export function Attention({
  name,
  num,
  text,
  tag,
  onClick,
}: {
  name: string;
  num: string;
  text: string;
  tag: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <i className="avatar" aria-hidden="true">
        {name[0]}
      </i>
      <div>
        <b>
          {num}번 {name}
        </b>
        <small>{text}</small>
      </div>
      <span>{tag}</span>
    </>
  );
  return onClick ? (
    <button type="button" className="attention-row attention-button" onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className="attention-row">{body}</div>
  );
}

export function Quick({
  icon,
  title,
  text,
  onClick,
}: {
  icon: string;
  title: string;
  text: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="quick quick-button" onClick={onClick}>
      <i aria-hidden="true">{icon}</i>
      <b>{title}</b>
      <small>{text}</small>
      <span aria-hidden="true">→</span>
    </button>
  );
}
