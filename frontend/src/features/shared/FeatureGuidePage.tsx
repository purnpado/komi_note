export function FeatureGuidePage({ title, description }: { title: string; description: string }) {
  return <>
    <section className="page-intro"><div><p className="eyebrow">꼬미노트 · 다음 기능</p><h2>{title}</h2><p>{description}</p></div></section>
    <section className="panel empty-feature-panel"><h3>구현 준비 중</h3><p>현재 역할별 메뉴와 접근 범위를 먼저 정리했습니다. 실제 데이터 입력 기능은 다음 구현 단위에서 안내와 함께 추가합니다.</p></section>
  </>;
}
