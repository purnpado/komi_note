import "./dashboard.css";
import { Attention, Quick } from "./DashboardWidgets";

type StatProps = { icon: string; title: string; value: string; note: string; color: string };

function Stat({ icon, title, value, note, color }: StatProps) {
  return <div className="stat"><span className={`stat-icon ${color}`}>{icon}</span><div><p>{title}</p><strong>{value}</strong><small>{note}</small></div></div>;
}

function Timeline() {
  return <div className="timeline">
    <div><time>08:30</time><span className="timeline-dot blue" /><article><b>조회 · 출결 확인</b><small>교실</small></article></div>
    <div><time>10:40</time><span className="timeline-dot mint" /><article><b>진로 체험 신청 마감</b><small>학생 확인 필요</small></article></div>
    <div><time>15:30</time><span className="timeline-dot yellow" /><article><b>김서연 학생 상담</b><small>상담실</small></article></div>
  </div>;
}

export function DashboardPage() {
  return <>
    <section className="hero"><div><p className="eyebrow">좋은 아침입니다</p><h2>2학년 3반의 하루를<br /><em>차분하게</em> 시작해 볼까요?</h2><p>오늘 확인할 일과 학생 소식을 한곳에서 살펴보세요.</p></div><div className="hero-date"><strong>10</strong><span>수요일</span><small>10월 7일</small></div></section>
    <section className="summary-grid">
      <Stat icon="♙" title="우리 반 학생" value="28명" note="남 14명 · 여 14명" color="mint" />
      <Stat icon="✓" title="오늘 출결" value="26 / 28" note="결석 1 · 지각 1" color="blue" />
      <Stat icon="◌" title="상담 후속 조치" value="3건" note="이번 주 확인 필요" color="yellow" />
      <Stat icon="▱" title="기록 작성" value="12 / 28" note="창체 10월 기록" color="purple" />
    </section>
    <section className="two-column"><div className="panel"><div className="panel-heading"><div><p className="eyebrow">오늘의 일정</p><h3>10월 7일 수요일</h3></div><button className="text-button">일정 전체 보기 →</button></div><Timeline /><div className="panel-footer"><button className="add-button">＋ 새 일정</button><button className="text-button">구글 캘린더 연결</button></div></div><div className="panel"><div className="panel-heading"><div><p className="eyebrow">놓치지 마세요</p><h3>확인이 필요한 학생</h3></div><button className="text-button">학생 명렬 →</button></div><div className="attention"><Attention name="강민서" num="01" text="보호자 연락처를 입력해 주세요" tag="정보 확인" /><Attention name="김서연" num="03" text="상담 후속 조치 예정일입니다" tag="상담" /><Attention name="이하은" num="05" text="주소 정보를 다시 확인해 주세요" tag="정보 확인" /></div></div></section>
    <section className="panel quick-panel"><div className="panel-heading"><div><p className="eyebrow">바로 시작</p><h3>자주 쓰는 업무</h3></div></div><div className="quick-actions"><Quick icon="⇧" title="나이스 명렬표 가져오기" text="엑셀 파일을 안전하게 읽어옵니다" /><Quick icon="＋" title="상담 기록 남기기" text="학생별 누적 상담을 관리합니다" /><Quick icon="▦" title="자리 배치 만들기" text="교실 구조에 학생을 배치합니다" /><Quick icon="▤" title="수행평가 입력하기" text="평가 항목과 점수를 기록합니다" /></div></section>
  </>;
}
