import { main as models } from "../../../wailsjs/go/models";
import { HelpGuide } from "../shared/HelpGuide";
import "./attendance.css";
import { AttendanceInputTab } from "./AttendanceInputTab";
import { AttendanceOutputTab } from "./AttendanceOutputTab";
import { AttendanceTemplateTab } from "./AttendanceTemplateTab";
import type { AttendanceTab } from "./attendanceTypes";
import { weekday } from "./attendanceUtils";
import { useAttendance } from "./useAttendance";

export type AttendancePageProps = {
  students: models.Student[];
  config: models.ClassConfig | null;
  initialDate?: string;
  openStudent: (student: models.Student) => void;
};

const tabs: AttendanceTab[] = ["출결 입력", "출결 서식", "출결 서류 출력"];

export function AttendancePage({ students, config, initialDate = "", openStudent }: AttendancePageProps) {
  const attendance = useAttendance({ students, config, initialDate });
  const {
    date,
    setDate,
    day,
    notice,
    busy,
    templates,
    template,
    setTemplate,
    templatePath,
    templateName,
    setTemplateName,
    templateStatuses,
    setTemplateStatuses,
    hwpxCustomText,
    setHwpxCustomText,
    mapField,
    setMapField,
    customFieldName,
    setCustomFieldName,
    selectedMappingID,
    setSelectedMappingID,
    documentPeriod,
    setSelectedDocumentStudentID,
    attendanceTab,
    setAttendanceTab,
    dateInputRef,
    studentByID,
    resizeReason,
    moveDate,
    updateEntry,
    markAllPresent,
    saveAttendance,
    summary,
    documentStudents,
    documentStudent,
    outputStatus,
    outputTemplates,
    baseDocumentValues,
    mappedFields,
    fieldValue,
    rangeSeparators,
    chooseTemplate,
    saveTemplate,
    deleteTemplate,
    placeField,
    beginMoveMapping,
    beginResizeMapping,
    changeMappingFont,
    removeMapping,
    saveHWPXCustomValues,
    exportAttendanceHWPX,
    saveAttendancePDF,
    outputPoint,
    beginOutputMove,
    changeOutputFont,
    beginOutputResize,
  } = attendance;

  return (
    <>
      <nav className="attendance-subnav">
        {tabs.map((item) => (
          <button
            key={item}
            className={`${attendanceTab === item ? "active" : ""} ${item === "출결 입력" ? "attendance-tab-input" : item === "출결 서식" ? "attendance-tab-template" : "attendance-tab-output"}`}
            onClick={() => setAttendanceTab(item)}
          >
            {item}
          </button>
        ))}
      </nav>
      <HelpGuide
        title="출결 관리 처음 사용 안내"
        description="날짜별 출결을 먼저 저장하고, 학교별 HWPX 양식을 연결한 뒤 필요한 학생의 서류를 개별 생성합니다."
        steps={[
          {
            title: "날짜별 출결 입력",
            detail: "날짜를 고른 뒤 학생별 출석·결석·지각·조퇴·결과·교외체험학습을 입력하고 저장합니다.",
          },
          {
            title: "학교 양식 등록",
            detail: "학교 HWPX 양식 복사본에 {{이름}} 같은 치환자를 넣어 저장한 뒤, 출결 서식 탭에서 등록합니다.",
          },
          {
            title: "출력 대상 선택",
            detail: "출결 서류 출력 탭에서 그날 기록된 학생 전체 중 실제로 발급할 학생을 한 명씩 선택합니다.",
          },
          {
            title: "HWPX 생성",
            detail: "자동값과 학교별 추가값을 확인한 뒤 새 파일로 저장합니다. 원본 양식은 수정하지 않습니다.",
          },
        ]}
        note="학생 이름·출결 사유는 교사 컴퓨터의 암호화 보관함에서만 처리합니다. 교외체험학습은 사용·잔여 일수만 누계하며, 학교 서류 발급 기준은 학교 규정을 확인하세요."
      />
      {attendanceTab === "출결 입력" && (
        <AttendanceInputTab
          date={date}
          weekday={weekday}
          markAllPresent={markAllPresent}
          day={day}
          busy={busy}
          saveAttendance={saveAttendance}
          notice={notice}
          moveDate={moveDate}
          dateInputRef={dateInputRef}
          setDate={setDate}
          summary={summary}
          studentByID={studentByID}
          openStudent={openStudent}
          updateEntry={updateEntry}
          resizeReason={resizeReason}
        />
      )}
      {attendanceTab === "출결 서식" && (
        <AttendanceTemplateTab
          templatePath={templatePath}
          template={template}
          templateName={templateName}
          setTemplateName={setTemplateName}
          templateStatuses={templateStatuses}
          setTemplateStatuses={setTemplateStatuses}
          chooseTemplate={chooseTemplate}
          saveTemplate={saveTemplate}
          templates={templates}
          setTemplate={setTemplate}
          deleteTemplate={deleteTemplate}
          mapField={mapField}
          setMapField={setMapField}
          baseDocumentValues={baseDocumentValues}
          customFieldName={customFieldName}
          setCustomFieldName={setCustomFieldName}
          removeMapping={removeMapping}
          selectedMappingID={selectedMappingID}
          beginMoveMapping={beginMoveMapping}
          setSelectedMappingID={setSelectedMappingID}
          changeMappingFont={changeMappingFont}
          beginResizeMapping={beginResizeMapping}
          placeField={placeField}
        />
      )}
      {attendanceTab === "출결 서류 출력" && (
        <AttendanceOutputTab
          date={date}
          documentStudents={documentStudents}
          documentStudent={documentStudent}
          setSelectedDocumentStudentID={setSelectedDocumentStudentID}
          day={day}
          templates={templates}
          outputStatus={outputStatus}
          outputTemplates={outputTemplates}
          template={template}
          setTemplate={setTemplate}
          hwpxCustomText={hwpxCustomText}
          setHwpxCustomText={setHwpxCustomText}
          saveHWPXCustomValues={saveHWPXCustomValues}
          exportAttendanceHWPX={exportAttendanceHWPX}
          documentPeriod={documentPeriod}
          mappedFields={mappedFields}
          fieldValue={fieldValue}
          setDocumentOverrides={attendance.setDocumentOverrides}
          saveAttendancePDF={saveAttendancePDF}
          outputPoint={outputPoint}
          beginOutputMove={beginOutputMove}
          changeOutputFont={changeOutputFont}
          beginOutputResize={beginOutputResize}
          rangeSeparators={rangeSeparators}
        />
      )}
    </>
  );
}
