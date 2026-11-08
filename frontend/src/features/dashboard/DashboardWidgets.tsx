import "./dashboard.css";

export function Attention({
  name,
  num,
  text,
  tag,
}: {
  name: string;
  num: string;
  text: string;
  tag: string;
}) {
  return (
    <div className="attention-row">
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
    </div>
  );
}

/** 실제 이동 동작이 연결되기 전까지는 장식성 카드로 표시합니다. */
export function Quick({
  icon,
  title,
  text,
}: {
  icon: string;
  title: string;
  text: string;
}) {
  return (
    <article className="quick">
      <i aria-hidden="true">{icon}</i>
      <b>{title}</b>
      <small>{text}</small>
      <span aria-hidden="true">→</span>
    </article>
  );
}
