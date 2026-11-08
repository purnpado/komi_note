export function AttendanceOutputTab(props: any) {
  const { date, documentStudents, documentStudent, setSelectedDocumentStudentID, day, templates, outputStatus, outputTemplates, template, setTemplate, hwpxCustomText, setHwpxCustomText, saveHWPXCustomValues, exportAttendanceHWPX, documentPeriod, mappedFields, fieldValue, setDocumentOverrides, saveAttendancePDF, outputPoint, beginOutputMove, changeOutputFont, beginOutputResize, rangeSeparators } = props;
  return (
        <section className="panel template-panel attendance-output-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">저장된 출결로 서류 만들기</p>
              <h3>출결 서류 출력</h3>
            </div>
          </div>
          <p className="attendance-output-guide">
            {date}에 저장한 출결을 기준으로, 출력할 학생을 선택한 뒤 출결 상태에
            맞는 서식을 개별 생성합니다.
          </p>
          {documentStudents.length > 1 && (
            <label className="attendance-output-student-select">
              출력할 학생
              <select value={documentStudent?.id || ""} onChange={(event) => setSelectedDocumentStudentID(event.target.value)}>
                {documentStudents.map((student: any) => {
                  const entry = day?.entries.find((item: any) => item.studentId === student.id);
                  return <option key={student.id} value={student.id}>{student.number}번 {student.name} · {entry?.status || ""}</option>;
                })}
              </select>
            </label>
          )}
          {!documentStudent && (
            <p className="empty-state">
              이 날짜에는 결석·지각·조퇴·결과 서류 출력 대상이 없습니다.
              교외체험학습은 누계 관리만 하며 출결 서류를 출력하지 않습니다.
            </p>
          )}
          {templates.length === 0 && (
            <p className="empty-state">
              먼저 출결 서식 탭에서 학교 양식을 등록하고 채움 위치를 지정해
              주세요.
            </p>
          )}
          {templates.length > 0 &&
            outputStatus !== "출석" &&
            outputTemplates.length === 0 && (
              <p className="empty-state">
                {outputStatus} 상태에 연결된 서식이 없습니다. 출결 서식 탭에서
                해당 상태를 선택해 등록해 주세요.
              </p>
            )}
          {outputTemplates.length > 0 && (
            <>
              <div className="template-list template-output-list">
                {outputTemplates.map((item: any) => (
                  <button
                    key={item.id}
                    className={
                      template?.id === item.id
                        ? "template-chip active"
                        : "template-chip"
                    }
                    onClick={() => setTemplate(item)}
                  >
                    {item.name}
                    <small>{(item.statuses || []).join("·") || "전체"}</small>
                  </button>
                ))}
              </div>
              {template?.format === "hwpx" && (
                <div className="template-workspace attendance-hwpx-output">
                  <div className="template-side">
                    <strong>{template.name}</strong>
                    <p>
                      {documentStudent
                        ? `${documentStudent.number}번 ${documentStudent.name} 학생의 저장된 출결 기록으로 원본 HWPX의 치환자를 채웁니다.`
                        : "출결 입력 탭에서 먼저 출결을 저장해 주세요."}
                    </p>
                    <p className="output-edit-guide">
                      HWPX 파일 안에 {"{{이름}}"}, {"{{보호자성명}}"}, {"{{출결상태}}"}, {"{{시작일}}"}처럼
                      치환자를 직접 넣어 두면 새 파일을 만들 때 값이 채워집니다.
                      생성 뒤 남은 치환자는 알림으로 안내합니다.
                    </p>
                    <label className="attendance-output-student-select">
                      학교별 기타 치환값 (한 줄에 항목=값)
                      <textarea
                        value={hwpxCustomText}
                        onChange={(event) => setHwpxCustomText(event.target.value)}
                        placeholder={"학교명=꼬미초등학교\n서식번호=2026-01"}
                      />
                    </label>
                    <button className="quiet-button" onClick={() => void saveHWPXCustomValues()}>
                      기타 치환값 저장
                    </button>
                    <button
                      className="primary-button"
                      onClick={() => void exportAttendanceHWPX()}
                      disabled={!documentStudent || !documentPeriod}
                    >
                      HWPX 서류 생성
                    </button>
                    <small>
                      원본 양식은 바꾸지 않고, 선택한 위치에 새 HWPX 파일만
                      저장합니다.
                    </small>
                  </div>
                  {template.previewData && (
                    <div className="template-canvas template-canvas-output">
                      <img src={template.previewData} alt="등록한 HWPX 서식 미리보기" />
                    </div>
                  )}
                </div>
              )}
              {template && template.format !== "hwpx" && (
                <div className="template-workspace">
                  <div className="template-side">
                    <strong>{template.name}</strong>
                    <p>
                      {documentStudent
                        ? `${documentStudent.number}번 ${documentStudent.name} 학생의 출결 정보를 불러왔습니다. 양식에 맞게 아래 값을 수정할 수 있습니다.`
                        : "출결 입력 탭에서 먼저 출결을 저장해 주세요."}
                    </p>
                    <p className="output-edit-guide">
                      항목을 끌어 위치를 옮기고, 오른쪽 아래 손잡이로 칸 크기를
                      조절하세요. A−·A+로 글씨 크기를 바꿀 수 있으며 이
                      화면에서만 적용됩니다.
                    </p>
                    <div className="document-field-editor">
                      {mappedFields.map((field: string) => (
                        <label key={field}>
                          {field}
                          <input
                            value={fieldValue(field)}
                            onChange={(event) =>
                              setDocumentOverrides((items: Record<string, string>) => ({
                                ...items,
                                [field]: event.target.value,
                              }))
                            }
                            placeholder="입력값 없음"
                          />
                        </label>
                      ))}
                    </div>
                    <button
                      className="primary-button"
                      onClick={() => void saveAttendancePDF()}
                      disabled={
                        !documentStudent ||
                        !template.previewData ||
                        (template.mappings || []).length === 0
                      }
                    >
                      PDF 생성·저장
                    </button>
                    <small>
                      저장한 PDF를 열어 학교에서 사용하는 PDF 뷰어로 인쇄합니다.
                    </small>
                  </div>
                  {template.previewData && (
                    <div className="template-canvas template-canvas-output">
                      <img
                        src={template.previewData}
                        alt="출결 서류 미리보기"
                      />
                      {(template.mappings || []).map((point: any, index: number) => {
                        const layout = outputPoint(point);
                        return (
                          <span
                            className="template-point template-point-editable template-point-output"
                            style={{
                              left: `${layout.x}%`,
                              top: `${layout.y}%`,
                              width: `${layout.width}%`,
                              height: `${layout.height}%`,
                              fontSize: `${Math.max(9, layout.fontSize * 6)}px`,
                            }}
                            key={point.id || `${point.field}-${index}`}
                            onPointerDown={(event) =>
                              beginOutputMove(event, point)
                            }
                            onClick={(event) => event.stopPropagation()}
                          >
                            {fieldValue(point.field) || point.field}
                            <span
                              className="template-font-tools"
                              onPointerDown={(event) => event.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={() => changeOutputFont(point, -0.2)}
                              >
                                A−
                              </button>
                              <button
                                type="button"
                                onClick={() => changeOutputFont(point, 0.2)}
                              >
                                A+
                              </button>
                            </span>
                            <span
                              className="template-resize-handle"
                              role="button"
                              aria-label={`${point.field} 입력 영역 크기 조절`}
                              onPointerDown={(event) =>
                                beginOutputResize(event, point)
                              }
                            />
                          </span>
                        );
                      })}
                      {rangeSeparators.map((separator: any) => {
                        const start = outputPoint(separator.start);
                        const end = outputPoint(separator.end);
                        return (
                          <span
                            className="template-point template-range-separator"
                            style={{
                              left: `calc(${start.x}% + ${start.width}%)`,
                              top: `${(start.y + end.y) / 2}%`,
                            }}
                            key={separator.id}
                          >
                            ~
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </section>
  );
}
