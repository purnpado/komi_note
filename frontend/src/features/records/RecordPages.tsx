import "./records.css";
type StatProps = { icon: string; title: string; value: string; note: string; color: string };

function Stat({ icon, title, value, note, color }: StatProps) {
  return <div className="stat"><span className={`stat-icon ${color}`}>{icon}</span><div><p>{title}</p><strong>{value}</strong><small>{note}</small></div></div>;
}

export function BudgetPage() {
  return <><div className="example-banner" role="note"><strong>예시 화면</strong> 아직 실제 자료와 연결되지 않은 준비 중인 기능입니다. 화면의 숫자·이름·내용은 모두 예시입니다.</div><section className="page-intro"><div><p className="eyebrow">2026학년도 2학년 3반</p><h2>학급 예산</h2><p>수입·지출과 증빙을 항목별로 정리합니다.</p></div><button disabled title="준비 중인 기능입니다" className="primary-button">＋ 지출 입력</button></section><section className="summary-grid"><Stat icon="₩" title="편성 예산" value="500,000원" note="학급 운영비" color="purple" /><Stat icon="↓" title="집행 금액" value="182,500원" note="총 5건" color="yellow" /><Stat icon="◌" title="남은 예산" value="317,500원" note="63.5% 남음" color="mint" /></section><section className="panel"><div className="panel-heading"><h3>최근 지출</h3><button disabled title="준비 중인 기능입니다" className="text-button">전체 내역 →</button></div>{[["10. 02", "학급 환경 정비 물품", "48,500원"], ["09. 25", "진로 체험 재료비", "92,000원"], ["09. 10", "청소 물품", "42,000원"]].map(([date, title, amount]) => <div className="expense" key={date}><span>{date}</span><strong>{title}</strong><small>학급 운영비 · 영수증 첨부</small><b>- {amount}</b></div>)}</section></>;
}
