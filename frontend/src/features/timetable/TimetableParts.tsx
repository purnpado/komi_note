import { main as models } from "../../../wailsjs/go/models";
import { shortDate } from "./useTimetablePage";

export function ChangeRow({
  change,
  showTarget,
  onEdit,
  onDelete,
}: {
  change: models.TimetableChange;
  showTarget: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="timetable-change-row">
      <span className={`timetable-change-kind kind-${change.kind}`}>{change.kind}</span>
      <div>
        <b>
          {shortDate(change.date)} {change.period}교시
          {showTarget ? ` · ${change.target === "class" ? "우리 반" : "내 수업"}` : ""}
        </b>
        <small>
          {[change.subject, change.className, change.room, change.note].filter(Boolean).join(" · ") || "원래 수업 취소"}
        </small>
      </div>
      <button type="button" className="text-button" onClick={onEdit}>
        고치기
      </button>
      <button type="button" className="text-button danger-text" onClick={onDelete}>
        지우기
      </button>
    </div>
  );
}
