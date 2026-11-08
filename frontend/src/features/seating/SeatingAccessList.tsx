import { useEffect, useState } from "react";
import { GetSeatingJoinedStudentIDs, ResetSeatingStudentAccess } from "../../../wailsjs/go/main/App";
import { main as models } from "../../../wailsjs/go/models";
import { errorMessage } from "../shared/format";

// 자리배정 회차의 학생별 입장 현황(교사만 보기). 닉네임은 보여 주지 않아 전자칠판에 비쳐도 이름-닉네임 짝이 드러나지 않는다.
// 학생 휴대폰이 꺼졌거나 다른 학생이 잘못 들어온 경우 [접속 초기화]로 풀면 본인이 다른 기기로 다시 들어올 수 있다.
export function SeatingAccessList({ planId, students }: { planId: string; students: models.Student[] }) {
  const [open, setOpen] = useState(false);
  const [joined, setJoined] = useState<string[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open || !planId) return;
    let active = true;
    const load = () => void GetSeatingJoinedStudentIDs(planId).then((ids) => active && setJoined(ids || [])).catch(() => undefined);
    load();
    const timer = window.setInterval(load, 2000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [open, planId]);

  async function reset(student: models.Student) {
    try {
      await ResetSeatingStudentAccess(planId, student.id);
      setMessage(`${student.number}번 ${student.name} 학생의 접속을 초기화했습니다. 본인 휴대폰으로 다시 들어오면 됩니다.`);
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  const joinedSet = new Set(joined);
  const sorted = [...students].sort((a, b) => a.number - b.number);
  return (
    <details className="seating-access-list" onToggle={(event) => setOpen((event.target as HTMLDetailsElement).open)}>
      <summary>학생별 입장 현황(교사만 보기) · 전자칠판에 비치는 화면이면 펼치지 마세요</summary>
      {message && <p className="seating-access-message" role="status">{message}</p>}
      <ul>
        {sorted.map((student) => (
          <li key={student.id}>
            <span>{student.number}번 {student.name}</span>
            <small>{joinedSet.has(student.id) ? "입장함" : "미입장"}</small>
            {joinedSet.has(student.id) && <button type="button" className="text-button" onClick={() => void reset(student)}>접속 초기화</button>}
          </li>
        ))}
      </ul>
    </details>
  );
}
