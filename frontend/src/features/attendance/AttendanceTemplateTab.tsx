import { useState } from "react";

const hwpxTokens = [
  ["학생 기본", "{{이름}} {{학번}} {{학년}} {{반}} {{번호}}"],
  ["출결 내용", "{{출결상태}} {{사유구분}} {{상세사유}} {{교시}}"],
  ["날짜", "{{기준일}} {{시작일}} {{종료일}} {{작성일}} {{결석일수}}"],
  ["결석신고서", "{{보호자성명}} {{담임교사}}"],
] as const;

function HWPXPlaceholderGuide() {
  const [notice, setNotice] = useState("");

  async function copyToken(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(`${label} 치환자를 복사했습니다.`);
    } catch {
      setNotice("복사하지 못했습니다. 치환자를 직접 선택해 복사해 주세요.");
    }
  }

  return (
    <details className="hwpx-placeholder-guide">
      <summary>HWPX 치환자 넣는 방법</summary>
      <div className="hwpx-placeholder-guide-body">
        <p>
          학교 원본은 보관하고 <b>복사본</b>을 한글에서 연 뒤, 값을 넣을 칸의 기존 문구를 아래 치환자로 바꿔 저장하세요.
          저장한 복사본만 이 화면에서 등록하면 새 출결 서류를 만들 때 자동으로 채워집니다.
        </p>
        <ol>
          <li>원본 HWPX를 복사해 이름에 <b>치환용</b>처럼 구분 표시를 합니다.</li>
          <li>한글에서 학생·날짜·보호자 성명 등이 들어갈 칸에 아래 치환자를 그대로 입력합니다.</li>
          <li>복사본을 저장한 뒤 이 화면에서 양식 파일을 선택하고, 출결 서류 출력 탭에서 새 파일을 생성합니다.</li>
        </ol>
        <div className="hwpx-token-list" aria-label="복사할 수 있는 HWPX 치환자 목록">
          {hwpxTokens.map(([label, tokens]) => (
            <div className="hwpx-token-row" key={label}>
              <b>{label}</b>
              <code>{tokens}</code>
              <button type="button" className="quiet-button" onClick={() => void copyToken(tokens, label)}>
                복사
              </button>
            </div>
          ))}
        </div>
        <p className="hwpx-placeholder-note">
          <b>{"{{보호자성명}}"}</b>은 학생 상세의 결석신고서 보호자 설정을 사용합니다. 지정하지 않으면 모 → 부 → 기타 보호자 성명 순으로 찾으며, 성명이 없으면 빈 문서를 만들지 않고 먼저 입력을 안내합니다.
        </p>
        <p className="hwpx-placeholder-note">
          실제 학생 이름·출결 사유·학교 원본 양식은 외부에 공유하거나 저장소에 올리지 마세요. 여러 건·주간 표처럼 행을 반복 채우는 양식은 현재 지원 범위가 아닙니다.
        </p>
        {notice && <p className="hwpx-copy-notice" role="status">{notice}</p>}
      </div>
    </details>
  );
}

export function AttendanceTemplateTab(props: any) {
  const { templatePath, template, templateName, setTemplateName, templateStatuses, setTemplateStatuses, chooseTemplate, saveTemplate, templates, setTemplate, deleteTemplate, mapField, setMapField, baseDocumentValues, customFieldName, setCustomFieldName, removeMapping, selectedMappingID, beginMoveMapping, setSelectedMappingID, changeMappingFont, beginResizeMapping, placeField } = props;
  return (
        <section className="panel template-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">학교별 출결 서식</p>
              <h3>양식 등록 · 좌표 지정</h3>
            </div>
            <button
              className="quiet-button"
              onClick={() => void chooseTemplate()}
            >
              양식 파일 선택
            </button>
          </div>
          <ol className="template-steps">
            <li className={!templatePath && !template ? "current" : "done"}>
              1. 신고서 업로드
            </li>
            <li
              className={
                template && (template.mappings || []).length === 0
                  ? "current"
                  : (template?.mappings || []).length > 0
                    ? "done"
                    : ""
              }
            >
              2. 채움 좌표 지정
            </li>
          </ol>
          <HWPXPlaceholderGuide />
          {templatePath && (
            <div className="template-register">
              <input
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
                placeholder="예: 결석 신고서, 지각·조퇴·결과 신고서"
              />
              <span>{templatePath}</span>
              <div className="template-statuses">
                {(["결석", "지각", "조퇴", "결과"] as const).map((status) => (
                  <label key={status}>
                    <input
                      type="checkbox"
                      checked={templateStatuses.includes(status)}
                      onChange={() =>
                        setTemplateStatuses((items: string[]) =>
                          items.includes(status)
                            ? items.filter((item: string) => item !== status)
                            : [...items, status],
                        )
                      }
                    />
                    {status}
                  </label>
                ))}
              </div>
              <button
                className="primary-button"
                onClick={() => void saveTemplate()}
              >
                등록
              </button>
            </div>
          )}
          <div className="template-list">
            {templates.map((item: any) => (
              <span
                key={item.id}
                className={
                  template?.id === item.id
                    ? "template-chip active"
                    : "template-chip"
                }
              >
                <button onClick={() => setTemplate(item)}>
                  {item.name}
                  <small>{item.format.toUpperCase()}</small>
                </button>
                <button
                  className="template-delete"
                  title="양식 삭제"
                  onClick={() => void deleteTemplate(item.id)}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          {template && (
            <div className="template-workspace">
              <div className="template-side">
                <strong>{template.name}</strong>
                <p>
                  학교 양식에 필요한 항목을 골라 위치를 지정하세요. 이
                  화면에서는 학생 정보 대신 항목명만 표시됩니다.
                </p>
                <label>
                  배치할 항목
                  <select
                    value={mapField}
                    onChange={(event) => setMapField(event.target.value)}
                  >
                    {[...Object.keys(baseDocumentValues), "담임교사"].map(
                      (field) => (
                        <option key={field}>{field}</option>
                      ),
                    )}
                    <option value="__직접입력">직접 입력 항목</option>
                  </select>
                </label>
                {mapField === "__직접입력" && (
                  <label>
                    직접 입력 항목 이름
                    <input
                      value={customFieldName}
                      onChange={(event) =>
                        setCustomFieldName(event.target.value)
                      }
                      placeholder="예: 보호자 성명, 확인 방법"
                    />
                  </label>
                )}
                <small>
                  지정 완료: {(template.mappings || []).length}개 항목
                </small>
                <div className="mapping-list">
                  {(template.mappings || []).map((point: any, index: number) => (
                    <button
                      key={point.id || `${point.field}-${index}`}
                      className="mapping-chip"
                      onClick={() => void removeMapping(point.id)}
                      title="이 위치 삭제"
                    >
                      {point.field} ×
                    </button>
                  ))}
                </div>
              </div>
              {template.previewData && (
                <div
                  className="template-canvas"
                  onClick={(event) => void placeField(event)}
                >
                  <img src={template.previewData} alt="등록한 출결 서식" />
                  {(template.mappings || []).map((point: any, index: number) => (
                    <span
                      className={`template-point template-point-editable ${selectedMappingID === point.id ? "selected" : ""}`}
                      style={{
                        left: `${point.x}%`,
                        top: `${point.y}%`,
                        width: `${point.width || 14}%`,
                        height: `${point.height || 5}%`,
                        fontSize: `${Math.max(9, (point.fontSize || 1.8) * 6)}px`,
                      }}
                      key={point.id || `${point.field}-${index}`}
                      onPointerDown={(event) => beginMoveMapping(event, point)}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedMappingID(point.id);
                      }}
                    >
                      {point.field}
                      {selectedMappingID === point.id && (
                        <span
                          className="template-font-tools"
                          onPointerDown={(event) => event.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => changeMappingFont(point, -0.2)}
                          >
                            A−
                          </button>
                          <button
                            type="button"
                            onClick={() => changeMappingFont(point, 0.2)}
                          >
                            A+
                          </button>
                        </span>
                      )}
                      <span
                        className="template-resize-handle"
                        role="button"
                        aria-label={`${point.field} 입력 영역 크기 조절`}
                        onPointerDown={(event) =>
                          beginResizeMapping(event, point)
                        }
                      />
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
  );
}
