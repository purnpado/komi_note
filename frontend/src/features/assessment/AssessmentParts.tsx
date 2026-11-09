import * as Dialog from "@radix-ui/react-dialog";

// 평가 관리 화면 여러 구역이 함께 쓰는 작은 부품입니다.
export function AssessmentDialogHeader({ title, description }: { title: string; description: string }) {
  return (
    <header className="assessment-dialog-header">
      <div>
        <Dialog.Title>{title}</Dialog.Title>
        <Dialog.Description>{description}</Dialog.Description>
      </div>
      <Dialog.Close asChild>
        <button className="assessment-dialog-close" aria-label={`${title} 닫기`}>
          ×
        </button>
      </Dialog.Close>
    </header>
  );
}
export function StatCard({
  title,
  value,
  note,
  tone,
}: {
  title: string;
  value: string;
  note: string;
  tone: "blue" | "green" | "orange";
}) {
  return (
    <article className={`assessment-stat-card ${tone}`}>
      <p>{title}</p>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}
