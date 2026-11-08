import { useState } from "react";
import { openExternalURL } from "../shared/desktopActions";

const issuesURL = "https://github.com/purnpado/komi_note/issues";
const licenseURL = "https://github.com/purnpado/komi_note/blob/main/LICENSE";

export function FeedbackPanel() {
  const [notice, setNotice] = useState("");
  async function open(url: string) {
    setNotice("");
    try {
      await openExternalURL(url);
    } catch {
      setNotice(`브라우저를 열지 못했습니다. 주소를 직접 입력해 주세요: ${url}`);
    }
  }
  return (
    <section className="panel settings-feedback-panel" aria-labelledby="settings-feedback-title">
      <div>
        <p className="eyebrow">의견 · 오류 신고</p>
        <h3 id="settings-feedback-title">꼬미노트에 의견 보내기</h3>
        <p>
          불편한 점, 오류, 필요한 기능을 GitHub Issues에 남겨 주세요. 공개 게시판이므로
          학생 이름·연락처·성적 같은 개인정보나 화면 사진은 올리지 마세요.
        </p>
      </div>
      <div className="settings-feedback-actions">
        <button type="button" className="primary-button" onClick={() => void open(issuesURL)}>
          의견 보내기 (GitHub Issues)
        </button>
        <button type="button" className="quiet-button" onClick={() => void open(licenseURL)}>
          라이선스 보기
        </button>
      </div>
      {notice && <p className="setting-help" role="status">{notice}</p>}
    </section>
  );
}
