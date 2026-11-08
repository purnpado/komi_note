type StatProps = { icon: string; title: string; value: string; note: string; color: string };

function Stat({ icon, title, value, note, color }: StatProps) {
  return <div className="stat"><span className={`stat-icon ${color}`}>{icon}</span><div><p>{title}</p><strong>{value}</strong><small>{note}</small></div></div>;
}

export function RecordPage() {
  return <><section className="page-intro"><div><p className="eyebrow">학생부 기재 전 교사 검토가 필요합니다</p><h2>학교생활기록</h2><p>창체·행동발달 기록을 작성하고, 학생 이름 없는 문장 자산으로도 저장합니다.</p></div><button className="primary-button">＋ 기록 작성</button></section><section className="two-column"><div className="panel"><div className="panel-heading"><div><p className="eyebrow">10월 창체</p><h3>작성 현황</h3></div><strong className="progress-number">12 <small>/ 28명</small></strong></div><div className="record-progress"><i /></div><p className="muted-copy">자율활동 8명 · 동아리 10명 · 진로 7명 기록이 작성되었습니다.</p><button className="quiet-button">미작성 학생 보기</button></div><div className="panel phrase-box"><p className="eyebrow">개인정보 없는 문장 자산</p><h3>나의 관찰 문장 보관함</h3><p>학생 이름을 제외한 문장을 태그와 함께 저장하여 다음 학년도에도 활용할 수 있습니다.</p><div className="tags"><span>#협업</span><span>#진로탐색</span><span>#자기주도</span></div><button className="text-button">문장 보관함 열기 →</button></div></section></>;
}

export function BudgetPage() {
  return <><section className="page-intro"><div><p className="eyebrow">2026학년도 2학년 3반</p><h2>학급 예산</h2><p>수입·지출과 증빙을 항목별로 정리합니다.</p></div><button className="primary-button">＋ 지출 입력</button></section><section className="summary-grid"><Stat icon="₩" title="편성 예산" value="500,000원" note="학급 운영비" color="purple" /><Stat icon="↓" title="집행 금액" value="182,500원" note="총 5건" color="yellow" /><Stat icon="◌" title="남은 예산" value="317,500원" note="63.5% 남음" color="mint" /></section><section className="panel"><div className="panel-heading"><h3>최근 지출</h3><button className="text-button">전체 내역 →</button></div>{[["10. 02", "학급 환경 정비 물품", "48,500원"], ["09. 25", "진로 체험 재료비", "92,000원"], ["09. 10", "청소 물품", "42,000원"]].map(([date, title, amount]) => <div className="expense" key={date}><span>{date}</span><strong>{title}</strong><small>학급 운영비 · 영수증 첨부</small><b>- {amount}</b></div>)}</section></>;
}
