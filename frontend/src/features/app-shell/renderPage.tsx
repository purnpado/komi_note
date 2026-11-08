import { AttendancePage } from "../attendance/AttendancePage";
import { CourseRosterPage } from "../course-roster/CourseRosterPage";
import { DashboardPage } from "../dashboard/DashboardPage";
import { SettingsFeaturePage } from "../settings/SettingsPage";
import { CleaningPage } from "../cleaning/CleaningPage";
import { TimetablePage } from "../timetable/TimetablePage";
import { GroupingPage } from "../grouping/GroupingPage";
import { SubmissionDocumentsPage } from "../submissions/SubmissionDocumentsPage";
import { StudentsPage } from "../students/StudentsPage";
import { StudentStatsPage } from "../students/StudentStatsPage";
import { AssessmentPage } from "../assessment/AssessmentPage";
import { SurveyHubPage } from "../survey/SurveyHubPage";
import { ConsultationPage } from "../consultation/ConsultationPage";
import { ClassroomPage } from "../seating/ClassroomPage";
import { BudgetPage } from "../records/RecordPages";
import { RecordsPage } from "../records/RecordsPage";
import { FeatureGuidePage } from "../shared/FeatureGuidePage";
import { confirmWithRadix } from "./AppConfirmDialog";
import type { PageKey } from "../navigation/menuTypes";
import { main as models } from "../../../wailsjs/go/models";
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

function displayGender(gender: string) {
  if (["남", "남자", "남성"].includes(gender)) return "남";
  if (["여", "여자", "여성"].includes(gender)) return "여";
  return gender;
}

export function renderPage(
  active: PageKey,
  students: models.Student[],
  reloadStudents: () => Promise<void>,
  openStudent: (student: models.Student) => void,
  config: models.ClassConfig | null,
  attendanceFocusDate: string,
  consultationFocusStudentID: string,
  consultationPageKey: number,
  saveConfig: (config: models.ClassConfig) => Promise<void>,
  isHomeroomTeacher: boolean,
  navigate: (page: PageKey) => void,
  openConsultation: (studentID: string) => void,
) {
  if (active === "환경 설정" && config)
    return <SettingsFeaturePage config={config} saveConfig={saveConfig} />;
  if (active === "학생 명렬" && isHomeroomTeacher)
    return (
      <StudentsPage
        students={students}
        reloadStudents={reloadStudents}
        openStudent={openStudent}
        displayGender={displayGender}
      />
    );
  if (active === "학생 통계" && isHomeroomTeacher) return <StudentStatsPage displayGender={displayGender} />;
  if (active === "제출서류 관리" && isHomeroomTeacher)
    return <SubmissionDocumentsPage students={students} />;
  if (active === "상담 기록" && isHomeroomTeacher)
    return (
      <ConsultationPage
        key={consultationPageKey}
        students={students}
        openStudent={openStudent}
        initialStudentID={consultationFocusStudentID}
        formatRecordedAt={formatRecordedAt}
        confirm={confirmWithRadix}
      />
    );
  if (active === "출결 관리" && isHomeroomTeacher)
    return (
      <AttendancePage
        students={students}
        config={config}
        initialDate={attendanceFocusDate}
        openStudent={openStudent}
      />
    );
  if ((active === "학급 운영" || active === "자리배정") && isHomeroomTeacher)
    return (
      <ClassroomPage
        students={students}
        formatRecordedAt={formatRecordedAt}
      />
    );
  if (active === "청소배정" && isHomeroomTeacher)
    return <CleaningPage students={students} />;
  if (active === "설문 조사") {
    return <SurveyHubPage formatRecordedAt={formatRecordedAt} />;
  }
  if (active === "수업 명렬") return <CourseRosterPage />;
  if (active === "시간표")
    return <TimetablePage config={config} isHomeroomTeacher={isHomeroomTeacher} />;
  if (active === "모둠 편성")
    return <GroupingPage students={students} isHomeroomTeacher={isHomeroomTeacher} config={config} />;
  if (active === "메모 · 할 일")
    return (
      <FeatureGuidePage
        title="메모 · 할 일"
        description="색상 메모, 마감일, 알림을 통합해 개인 업무를 관리하는 기능을 준비하고 있습니다."
      />
    );
  if (active === "일정 · 구글 캘린더")
    return (
      <FeatureGuidePage
        title="일정 · 구글 캘린더"
        description="교사 일정과 구글 캘린더 동기화를 안전하게 연결하는 기능을 준비하고 있습니다."
      />
    );
  if (active === "평가 관리") return <AssessmentPage config={config} />;
  if (active === "학교생활기록")
    return <RecordsPage students={students} config={config} isHomeroomTeacher={isHomeroomTeacher} />;
  if (active === "예산 관리") return <BudgetPage />;
  return (
    <DashboardPage
      config={config}
      students={students}
      isHomeroomTeacher={isHomeroomTeacher}
      navigate={navigate}
      openStudent={openStudent}
      openConsultation={openConsultation}
    />
  );
}
