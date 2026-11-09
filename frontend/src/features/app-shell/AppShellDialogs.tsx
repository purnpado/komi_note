import { useState } from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { main as models } from "../../../wailsjs/go/models";
import kkomiIcon from "../../assets/images/kkomi-note-icon.png";
import "./app-shell.css";

export const termsVersion = "2026-10-09";

export function UpdateDialog({
  info,
  busy,
  onClose,
  onInstall,
}: {
  info: models.UpdateInfo | null;
  busy: boolean;
  onClose: () => void;
  onInstall: () => Promise<void>;
}) {
  return (
    <AlertDialog.Root
      open={Boolean(info?.available)}
      onOpenChange={(open) => !open && onClose()}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="dialog-overlay" />
        <AlertDialog.Content className="dialog-content update-dialog">
          <p className="eyebrow">GitHub 공개 업데이트 채널</p>
          <AlertDialog.Title>새 버전이 준비되었습니다</AlertDialog.Title>
          <AlertDialog.Description>
            현재 {info?.currentVersion} → 새 버전 {info?.latestVersion}
            <br />
            파일을 내려받은 뒤 프로그램을 자동으로 다시 시작합니다. 학생 정보와
            암호화 보관함은 전송하지 않습니다.
          </AlertDialog.Description>
          {info?.notes && <p className="update-notes">{info.notes}</p>}
          <div className="dialog-actions">
            <AlertDialog.Cancel asChild>
              <button className="quiet-button" disabled={busy}>
                나중에
              </button>
            </AlertDialog.Cancel>
            <button
              className="primary-button"
              disabled={busy}
              onClick={() => void onInstall()}
            >
              {busy ? "업데이트 준비 중입니다" : "지금 업데이트"}
            </button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

export function AgreementGate({
  version,
  onAgree,
  onDecline,
  removeOnDecline = false,
}: {
  version: string;
  onAgree: () => void | Promise<void>;
  onDecline: () => void;
  removeOnDecline?: boolean;
}) {
  const [checked, setChecked] = useState(false);
  return (
    <div className="agreement-screen">
      <section className="agreement-card">
        <div className="lock-title">
          <img className="brand-mark" src={kkomiIcon} alt="꼬미노트 꼬미" />
          <div>
            <strong>꼬미노트</strong>
            <small>시작 전 이용 안내</small>
          </div>
        </div>
        <p className="eyebrow">개인정보 보호 및 이용자 책임</p>
        <h1>사용 전 꼭 확인해 주세요</h1>
        <div className="agreement-copy">
          <p>꼬미노트는 학생 정보·수업·상담·출결을 이 컴퓨터의 암호화 보관함에 저장하는 교사 업무 지원 프로그램입니다.</p>
          <ol>
            <li><b>개인정보 보호:</b> 마스터 비밀번호, 복구 파일, 기기 잠금과 외부 반출을 이용자가 안전하게 관리해야 합니다.</li>
            <li><b>데이터 책임:</b> 기기 분실·악성코드·무단 접근·백업 파일 유출로 인한 개인정보 문제의 책임은 프로그램 이용자에게 있습니다.</li>
            <li><b>업무 확인:</b> 나이스와 학교 규정에 따른 최종 행정 처리 및 공식 문서 확인은 이용자의 책임입니다.</li>
            <li><b>외부 연동:</b> 향후 캘린더·AI 기능은 사용자가 직접 활성화할 때만 사용하며, 학생 개인정보 입력 여부를 다시 확인해야 합니다.</li>
            <li><b>기록 시각:</b> 상담 기록의 작성 시각은 이 컴퓨터의 시스템 시간을 기준으로 저장되며 공인 전자서명이나 법정 타임스탬프는 아닙니다.</li>
          </ol>
        </div>
        <label className="agreement-check">
          <input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} />
          위 내용을 확인했고 개인정보 보호와 이용자 책임에 동의합니다.
        </label>
        <div className="agreement-actions">
          <button className="quiet-button" onClick={onDecline}>
            {removeOnDecline ? "동의하지 않고 프로그램 삭제" : "동의하지 않고 종료"}
          </button>
          <button className="primary-button" disabled={!checked} onClick={() => void onAgree()}>
            동의하고 시작하기
          </button>
        </div>
        <small className="creator-watermark">
          꼬미노트 {version ? `v${version}` : ""} · 푸른파도소리 제작 · 약관 {termsVersion}
        </small>
      </section>
    </div>
  );
}
