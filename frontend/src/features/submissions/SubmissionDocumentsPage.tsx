import React, { FormEvent, useEffect, useState } from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { DeleteSubmissionDocument, ListSubmissionDocuments, SaveSubmissionDocument, SaveSubmissionStatus } from "../../../wailsjs/go/main/App";
import { main as models } from "../../../wailsjs/go/models";
import { HelpGuide } from "../shared/HelpGuide";
import { Stat } from "../shared/Stat";
import "./submission.css";

import { errorMessage } from "../shared/format";
export function SubmissionDocumentsPage({ students }: { students: models.Student[] }) {
  const [documents, setDocuments] = useState<models.SubmissionDocument[]>([]);
  const [selectedID, setSelectedID] = useState("");
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");
  const [documentTab, setDocumentTab] = useState<"목록" | "작성">("목록");
  const [detailOpen, setDetailOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("전체");
  const [notice, setNotice] = useState("");
  const selected = documents.find((item) => item.id === selectedID) || null;
  const statuses = new Map(
    (selected?.statuses || []).map((item) => [item.studentId, item]),
  );
  const refresh = async () => {
    const items = (await ListSubmissionDocuments()) || [];
    const next = items.map((item) => new models.SubmissionDocument(item));
    setDocuments(next);
    setSelectedID((current) =>
      current && next.some((item) => item.id === current)
        ? current
        : next[0]?.id || "",
    );
    const active = next.find((item) => item.id === selectedID) || next[0];
    if (active) {
      setTitle(active.title);
      setDueDate(active.dueDate || "");
      setNote(active.note || "");
    }
  };
  useEffect(() => {
    void refresh().catch((error) => setNotice(errorMessage(error)));
  }, []);
  useEffect(() => {
    if (selected) {
      setTitle(selected.title);
      setDueDate(selected.dueDate || "");
      setNote(selected.note || "");
    }
  }, [selectedID]);
  const normalizedStatus = (value?: string) =>
    value === "기타" ? "확인 필요" : value || "미제출";
  const count = (status: string) =>
    students.filter(
      (student) =>
        normalizedStatus(statuses.get(student.id)?.status) === status,
    ).length;
  // 해당 없음 학생은 제출 대상에서 제외하므로 재적·미제출 집계에서도 제외합니다.
  const eligibleCount = students.length - count("해당 없음");
  async function saveDocument(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) {
      setNotice("제출서류 이름을 입력해 주세요.");
      return;
    }
    try {
      const saved = await SaveSubmissionDocument(
        new models.SubmissionDocument({
          id: selected?.id || "",
          title,
          dueDate,
          note,
          statuses: selected?.statuses || [],
        }),
      );
      setNotice("제출서류 항목을 저장했습니다.");
      await refresh();
      setSelectedID(saved.id);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }
  function removeDocument() {
    if (selected) setDeleteOpen(true);
  }
  async function confirmRemoveDocument() {
    if (!selected) return;
    try {
      await DeleteSubmissionDocument(selected.id);
      setNotice("제출서류 항목을 삭제했습니다.");
      await refresh();
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setDeleteOpen(false);
    }
  }
  async function updateStatus(
    studentID: string,
    status: string,
    studentNote = "",
  ) {
    if (!selected) return;
    try {
      const saved = await SaveSubmissionStatus(
        selected.id,
        studentID,
        status,
        studentNote,
      );
      setDocuments((items) =>
        items.map((item) =>
          item.id === saved.id ? new models.SubmissionDocument(saved) : item,
        ),
      );
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }
  function startNewDocument() {
    setSelectedID("");
    setDetailOpen(false);
    setTitle("");
    setDueDate("");
    setNote("");
    setDocumentTab("작성");
  }
  function currentStatus(studentID: string) {
    return normalizedStatus(statuses.get(studentID)?.status);
  }
  const statusOptions = [
    "제출",
    "미제출",
    "확인 필요",
    "부분 제출",
    "해당 없음",
  ];
  const filterOptions = ["전체", ...statusOptions];
  const filteredStudents = students.filter(
    (student) =>
      statusFilter === "전체" || currentStatus(student.id) === statusFilter,
  );
  const studentTable = selected && (
    <div className="submission-table-wrap">
      <table className="submission-status-table">
        <thead>
          <tr>
            <th>번호</th>
            <th>이름</th>
            <th>제출</th>
            <th>미제출</th>
            <th>확인 필요</th>
            <th>부분 제출</th>
            <th>해당 없음</th>
            <th>비고</th>
          </tr>
        </thead>
        <tbody>
          {filteredStudents.map((student) => {
            const current = statuses.get(student.id);
            const status = currentStatus(student.id);
            return (
              <tr key={student.id}>
                <td>{String(student.number).padStart(2, "0")}</td>
                <td className="submission-name-cell">{student.name}</td>
                {statusOptions.map((option) => (
                  <td key={option}>
                    <input
                      type="checkbox"
                      className="submission-check"
                      checked={status === option}
                      onChange={() =>
                        void updateStatus(
                          student.id,
                          option,
                          current?.note || "",
                        )
                      }
                      aria-label={`${student.name} ${option}`}
                    />
                  </td>
                ))}
                <td>
                  <input
                    className="submission-note-input"
                    defaultValue={current?.note || ""}
                    onBlur={(event) =>
                      void updateStatus(student.id, status, event.target.value)
                    }
                    placeholder="비고"
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {filteredStudents.length === 0 && (
        <p className="empty-state">선택한 상태의 학생이 없습니다.</p>
      )}
    </div>
  );
  return (
    <>
      <AlertDialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="dialog-overlay" />
          <AlertDialog.Content className="dialog-content">
Wall time: 0.9 seconds
Output:
            <AlertDialog.Title>제출서류를 삭제할까요?</AlertDialog.Title>
            <AlertDialog.Description>
              “{selected?.title || "선택한 제출서류"}”와 학생별 제출 상태를
              삭제합니다. 삭제한 정보는 되돌릴 수 없습니다.
            </AlertDialog.Description>
            <div className="dialog-actions">
              <AlertDialog.Cancel asChild>
                <button className="quiet-button">취소</button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <button
                  className="danger-button"
                  onClick={() => void confirmRemoveDocument()}
                >
                  삭제
                </button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
      <section className="page-intro">
        <div>
          <p className="eyebrow">담임용 · 제출 상태 관리</p>
          <h2>제출서류 관리</h2>
          <p>서류 항목별 제출 현황을 확인하고 학생별 상태를 기록합니다.</p>
        </div>
        <button className="primary-button" onClick={startNewDocument}>
          ＋ 새 서류 작성
        </button>
      </section>
      <div className="submission-tabs" role="tablist">
        <button
          className={documentTab === "목록" ? "active" : ""}
          onClick={() => {
            setDocumentTab("목록");
            setDetailOpen(false);
          }}
        >
          제출서류 목록
        </button>
        <button
          className={documentTab === "작성" ? "active" : ""}
          onClick={() => {
            setDocumentTab("작성");
            setDetailOpen(false);
          }}
        >
          제출서류 작성
        </button>
      </div>
      <HelpGuide
        title="제출서류 관리하기"
        description="서류 항목을 만든 뒤 학생별 상태를 제출·미제출 등으로 표시합니다."
        steps={[
          {
            title: "서류 항목 만들기",
            detail:
              "학생기초조사서, 개인정보 동의서처럼 확인할 서류 이름과 제출 기한을 입력합니다.",
          },
          {
            title: "학생별 상태 기록",
            detail:
              "학생 카드의 상태를 바꾸면 암호화 보관함에 즉시 저장됩니다.",
          },
          {
            title: "누계 확인",
            detail: "제출·미제출·확인 필요 인원을 서류별 요약에서 확인합니다.",
          },
        ]}
        note="상태 종류와 메모는 나중에 학교 업무에 맞게 확장할 수 있습니다."
      />
      {notice && <p className="form-notice">{notice}</p>}
      {documentTab === "목록" ? (
        <>
          <section className="panel submission-overview">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">서류별 집계</p>
                <h3>제출서류 목록</h3>
                <p>
                  {documents.length}개 항목 · 서류를 클릭하면 학생별 상태를
                  관리합니다.
                </p>
              </div>
            </div>
            <div className="submission-overview-grid">
              {documents.length === 0 ? (
                <p className="empty-state">
                  등록된 제출서류가 없습니다. `제출서류 작성`에서 항목을 추가해
                  주세요.
                </p>
              ) : (
                documents.map((item) => {
                  const itemStatuses = new Map(
                    (item.statuses || []).map((status) => [
                      status.studentId,
                      normalizedStatus(status.status),
                    ]),
                  );
                  const submitted = students.filter(
                    (student) => itemStatuses.get(student.id) === "제출",
                  ).length;
                  const notApplicable = students.filter(
                    (student) => itemStatuses.get(student.id) === "해당 없음",
                  ).length;
                  const targetCount = students.length - notApplicable;
                  const missing = targetCount - submitted;
                  return (
                    <button
                      key={item.id}
                      className={
                        item.id === selectedID
                          ? "submission-overview-card active"
                          : "submission-overview-card"
                      }
                      onClick={() => {
                        setSelectedID(item.id);
                        setDetailOpen(true);
                        setStatusFilter("전체");
                      }}
                    >
                      <strong>{item.title}</strong>
                      <small>
                        {item.dueDate
                          ? `제출 기한 ${item.dueDate}`
                          : "제출 기한 없음"}
                      </small>
                      <div>
                        <span>
                          재적 <b>{targetCount}</b>
                        </span>
                        <span className="submitted">
                          제출 <b>{submitted}</b>
                        </span>
                        <span className="missing">
                          미제출 <b>{missing}</b>
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </section>
          {selected && detailOpen && (
            <section className="panel submission-student-panel">
              <div className="submission-breadcrumb">
                <button
                  className="quiet-button"
                  onClick={() => setDetailOpen(false)}
                >
                  ← 제출서류 목록
                </button>
                <span>학생별 제출 상태</span>
              </div>
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">{selected.title}</p>
                  <h3>학생별 제출 상태</h3>
                  <p>
                    {selected.note || "학생별 상태를 선택하면 즉시 저장됩니다."}
                  </p>
                </div>
              </div>
              <div className="submission-summary">
                <Stat
                  icon="✓"
                  title="제출"
                  value={`${count("제출")}명`}
                  note="완료"
                  color="mint"
                />
                <Stat
                  icon="○"
                  title="미제출"
                  value={`${count("미제출")}명`}
                  note="확인 필요"
                />
                <Stat
                  icon="!"
                  title="확인 필요"
                  value={`${count("확인 필요")}명`}
                  note="추가 확인"
                  color="purple"
                />
                <Stat
                  icon="#"
                  title="재적"
                  value={`${eligibleCount}명`}
                  note="해당 없음 제외"
                  color="blue"
                />
              </div>
              <div className="submission-filter-tabs">
                {filterOptions.map((option) => (
                  <button
                    key={option}
                    className={statusFilter === option ? "active" : ""}
                    onClick={() => setStatusFilter(option)}
                  >
                    {option}
                    <b>{option === "전체" ? eligibleCount : count(option)}</b>
                  </button>
                ))}
              </div>
              {studentTable}
              <div className="submission-detail-actions">
                <button
                  className="quiet-button"
                  onClick={() => {
                    setDocumentTab("작성");
                    setDetailOpen(false);
                  }}
                >
                  서류 정보 수정
                </button>
                <button
                  className="danger-button"
                  onClick={() => void removeDocument()}
                >
                  서류 삭제
                </button>
              </div>
            </section>
          )}
        </>
      ) : (
        <section className="panel submission-editor">
          <form onSubmit={saveDocument}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">서류 항목 작성</p>
                <h3>{selected ? "제출서류 수정" : "제출서류 등록"}</h3>
                <p>서류 이름과 제출 기한을 입력해 목록을 만듭니다.</p>
              </div>
              <div className="dialog-actions">
                <button type="submit" className="primary-button">
                  저장
                </button>
                {selected && (
                  <button
                    type="button"
                    className="danger-button"
                    onClick={() => void removeDocument()}
                  >
                    삭제
                  </button>
                )}
              </div>
            </div>
            <div className="form-grid">
              <label>
                서류 이름
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="예: 학생기초조사서"
                />
              </label>
              <label>
                제출 기한
                <input
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </label>
              <label className="full-width">
                설명 또는 메모
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={2}
                  placeholder="학생에게 안내할 내용"
                />
              </label>
            </div>
          </form>
        </section>
      )}
    </>
  );
}
