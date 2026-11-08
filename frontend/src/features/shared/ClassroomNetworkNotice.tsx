// 교실 QR 회차는 교사 PC가 같은 와이파이 안에서 암호화되지 않은 http 주소로 연다.
// 교사가 그 위험을 알고 회차를 열고 닫도록 세 QR 화면(자리배정·설문·수행평가)에 같은 안내를 보여 준다.
export function ClassroomNetworkNotice({ sensitive = false }: { sensitive?: boolean }) {
  return (
    <div className="warning-box classroom-network-notice" role="note">
      <p>
        <strong>교실 와이파이 안내</strong> · 학생 주소는 암호화되지 않은 <code>http</code> 주소라서,
        같은 와이파이에 접속한 다른 사람이 오가는 내용을 엿볼 수 있습니다.
      </p>
      <p>
        학교 업무망이나 교실 전용 와이파이에서 열고, 누구나 들어오는 공용·개방 와이파이에서는 열지 마세요.
        {sensitive ? " 점수와 이의 내용이 오가므로 확인이 끝나면 바로 QR을 닫아 주세요." : " 진행이 끝나면 회차를 닫아 주세요."}
      </p>
    </div>
  );
}
