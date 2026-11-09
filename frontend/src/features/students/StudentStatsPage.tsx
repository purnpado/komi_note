import { useEffect, useState } from "react";
import { GetStudentPhoto, GetStudentStats, ListSurveys } from "../../../wailsjs/go/main/App";
import { main as models } from "../../../wailsjs/go/models";
import { HelpGuide } from "../shared/HelpGuide";
import { Stat } from "../shared/Stat";
import "./students.css";
import "./student-stats.css";

import { errorMessage, todayLocal } from "../shared/format";
function formatRecordedAt(value: string) {
  if (!value) return "기록 시각 없음";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}
export function StudentStatsPage({ displayGender }: { displayGender: (gender: string) => string }) {
  const [tab, setTab] = useState<"연령·성별" | "설문 조사">("연령·성별");
  return (
    <>
      <div className="stats-tabs" role="tablist" aria-label="학생 통계 종류">
        <button
          className={tab === "연령·성별" ? "active" : ""}
          onClick={() => setTab("연령·성별")}
        >
          연령·성별 통계
        </button>
        <button
          className={tab === "설문 조사" ? "active" : ""}
          onClick={() => setTab("설문 조사")}
        >
          설문 조사 통계
        </button>
      </div>
      {tab === "연령·성별" ? (
        <StudentAgeStatsPanel displayGender={displayGender} />
      ) : (
        <StudentSurveyStatsPanel />
      )}
    </>
  );
}

function StudentAgeStatsPanel({ displayGender }: { displayGender: (gender: string) => string }) {
  const [baseDate, setBaseDate] = useState(
    todayLocal(),
  );
  const [stats, setStats] = useState<models.StudentStats | null>(null);
  const [notice, setNotice] = useState("");
  const [photos, setPhotos] = useState<Record<string, string>>({});
  useEffect(() => {
    GetStudentStats(baseDate)
      .then((result) => setStats(new models.StudentStats(result)))
      .then(() => setNotice(""))
      .catch((error) => setNotice(errorMessage(error)));
  }, [baseDate]);
  useEffect(() => {
    const students = (stats?.ageGroups || []).flatMap(
      (group) => group.students || [],
    );
    let active = true;
    void Promise.all(
      students
        .filter((student) => student.hasPhoto)
        .map(
          async (student) =>
            [student.id, await GetStudentPhoto(student.id)] as const,
        ),
    )
      .then((items) => {
        if (active)
          setPhotos(Object.fromEntries(items.filter(([, photo]) => photo)));
      })
      .catch(() => {
        if (active) setPhotos({});
      });
    return () => {
      active = false;
    };
  }, [stats]);
  return (
    <>
      <section className="page-intro page-head">
        <div>
          <p className="eyebrow">잠금 해제 상태에서만 표시됩니다</p>
          <h2>학생 통계 · 만 나이</h2>
          <p>
            선택한 기준일의 생일 전후를 반영하여 정확한 만 나이를 계산합니다.
          </p>
        </div>
        <label className="date-picker">
          기준일
          <input
            type="date"
            value={baseDate}
            onChange={(event) => setBaseDate(event.target.value)}
          />
        </label>
      </section>
      <HelpGuide
        title="만 나이 통계 확인"
        description="오늘 또는 원하는 기준일을 기준으로 학생의 만 나이와 성별 인원을 확인합니다."
        steps={[
          {
            title: "기준일 선택",
            detail:
              "달력에서 기준일을 고르면 생일 전후까지 반영해 만 나이를 다시 계산합니다.",
          },
          {
            title: "성별·연령 인원 확인",
            detail: "입력된 성별과 생년월일을 기준으로 인원 수를 보여줍니다.",
          },
          {
            title: "학생 명단 확인",
            detail:
              "아래 연령별 카드에서 사진·번호·이름·성별·생년월일을 확인합니다.",
          },
        ]}
        note="생년월일이 없는 학생은 통계에 포함되지 않으므로 학생 상세정보에서 보완해 주세요."
      />
      {notice && <p className="form-notice">{notice}</p>}
      {stats && (
        <>
          <section className="summary-grid">
            <Stat
              icon="♙"
              title="전체 학생"
              value={`${stats.total}명`}
              note={`${stats.baseDate} 기준`}
              color="mint"
            />
            {(stats.genderCounts || []).map((item) => (
              <Stat
                key={item.gender}
                icon="▥"
                title={`${displayGender(item.gender)}학생`}
                value={`${item.count}명`}
                note="성별 입력 기준"
                color={item.gender === "남성" ? "blue" : "purple"}
              />
            ))}
          </section>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h3>만 나이별 학생 명단</h3>
                <p>
                  학생 이름과 생년월일은 암호화 보관함을 연 상태에서만
                  표시합니다.
                </p>
              </div>
            </div>
            {(stats.ageGroups || []).length === 0 ? (
              <p className="empty-state">생년월일을 입력한 학생이 없습니다.</p>
            ) : (
              (stats.ageGroups || []).map((group) => (
                <div className="age-group" key={group.age}>
                  <strong>
                    만 {group.age}세 <small>{group.count}명</small>
                  </strong>
                  <div className="age-student-card-grid">
                    {(group.students || []).map((student) => (
                      <article className="age-student-card" key={student.id}>
                        <div className="age-student-photo" aria-hidden="true">
                          {photos[student.id] ? (
                            <img src={photos[student.id]} alt="" />
                          ) : (
                            <span>{student.name?.slice(0, 1) || "?"}</span>
                          )}
                        </div>
                        <div className="age-student-card-content">
                          <div className="age-student-card-title">
                            <span>
                              {String(student.number).padStart(2, "0")}번
                            </span>
                            <strong>{student.name}</strong>
                          </div>
                          <p>
                            {displayGender(student.gender) || "성별 미입력"} ·
                            만 {group.age}세
                          </p>
                          <time>{student.birthDate}</time>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ))
            )}
          </section>
        </>
      )}
    </>
  );
}

function StudentSurveyStatsPanel() {
  const [surveys, setSurveys] = useState<models.Survey[]>([]);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    ListSurveys()
      .then((items) =>
        setSurveys(
          (items || [])
            .map((item) => new models.Survey(item))
            .filter((item) => item.audience !== "교직원"),
        ),
      )
      .catch((error) => setNotice(errorMessage(error)));
  }, []);
  const responseTotal = surveys.reduce(
    (total, survey) => total + (survey.responses?.length || 0),
    0,
  );
  const closedTotal = surveys.filter(
    (survey) => survey.status === "마감",
  ).length;
  return (
    <>
      <section className="page-intro page-head">
        <div>
          <p className="eyebrow">학생 대상 설문 결과</p>
          <h2>학생 통계 · 설문 조사</h2>
          <p>
            저장된 학생 설문의 진행 상태와 문항별 응답 인원을 한곳에서
            확인합니다.
          </p>
        </div>
      </section>
      <HelpGuide
        title="설문 조사 통계 확인"
        description="설문 조사 메뉴에서 수집한 학생 응답 수와 문항별 참여 현황을 확인합니다."
        steps={[
          {
            title: "설문 목록 확인",
            detail:
              "설문 조사 메뉴의 담임용·수업용 탭에서 저장한 학생 설문 결과를 확인합니다. 교직원 설문은 업무용 탭에서 관리합니다.",
          },
          {
            title: "응답 현황 확인",
            detail:
              "설문별 응답 수와 참여 대상, 마감 상태를 비교할 수 있습니다.",
          },
          {
            title: "문항별 참여 수 확인",
            detail:
              "각 문항에 실제로 답변한 학생 수를 확인해 누락 응답을 파악합니다.",
          },
        ]}
        note="학생 이름과 답변 내용은 설문 관리 화면에서만 확인하며, 이 통계 화면에는 집계 수만 표시합니다."
      />
      {notice && <p className="form-notice">{notice}</p>}
      <section className="summary-grid">
        <Stat
          icon="▤"
          title="저장 설문"
          value={`${surveys.length}개`}
          note="학생 대상 설문"
          color="mint"
        />
        <Stat
          icon="✓"
          title="누적 응답"
          value={`${responseTotal}명`}
          note="설문별 응답 합계"
          color="blue"
        />
        <Stat
          icon="▣"
          title="마감 설문"
          value={`${closedTotal}개`}
          note="결과 확인 가능"
          color="purple"
        />
      </section>
      <section className="panel student-survey-stats-panel">
        <div className="panel-heading">
          <div>
            <h3>설문별 응답 현황</h3>
            <p>수업용 학생 설문만 표시됩니다.</p>
          </div>
        </div>
        {surveys.length === 0 ? (
          <p className="empty-state">
            저장된 학생 설문이 없습니다. 수업용 메뉴에서 설문을 먼저 만들어
            주세요.
          </p>
        ) : (
          <div className="student-survey-stats-grid">
            {surveys.map((survey) => (
              <article className="student-survey-stats-card" key={survey.id}>
                <div className="student-survey-stats-heading">
                  <span className={`survey-status ${survey.status}`}>
                    {survey.status || "준비"}
                  </span>
                  <small>
                    {survey.anonymous ? "익명" : "실명"} ·{" "}
                    {survey.responses?.length || 0} /{" "}
                    {survey.expectedParticipants || "-"}명
                  </small>
                </div>
                <h4>{survey.title}</h4>
                <p>
                  {survey.questions?.length || 0}문항 ·{" "}
                  {survey.updatedAt
                    ? formatRecordedAt(survey.updatedAt)
                    : "기록 시각 없음"}
                </p>
                <div className="student-survey-question-stats">
                  {(survey.questions || []).map((question, index) => {
                    const answered = (survey.responses || []).filter(
                      (response) =>
                        Boolean(response.answers?.[question.id]) ||
                        Boolean(response.multiAnswers?.[question.id]?.length),
                    ).length;
                    return (
                      <span key={question.id}>
                        {index + 1}. {question.text} <b>{answered}명</b>
                      </span>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}


