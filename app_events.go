package main

import "github.com/wailsapp/wails/v3/pkg/application"

// 변경 알림(이벤트): 저장이 바뀌면 화면에 "무엇이 바뀌었는지"만 알립니다.
// 알림에는 제목·내용·금액·학생 정보를 넣지 않고 변경 종류와 내부 번호만 담습니다.
// 받는 화면은 알림을 받으면 자기 바인딩으로 자료를 다시 읽습니다.

// ChangeNotice는 화면으로 보내는 변경 알림 내용입니다.
type ChangeNotice struct {
	Kind string `json:"kind"`
	ID   string `json:"id,omitempty"`
}

// 변경 알림 이름. 새 기능은 여기에 이름을 더하고 프런트 shared/changeEvents.ts에도 같은 이름을 둡니다.
const (
	eventCourseRosterChanged = "course-roster:변경"
	eventSurveyChanged       = "survey:변경"
	eventMemoChanged         = "memo:변경"
	eventScheduleChanged     = "schedule:변경"
	eventTimetableChanged    = "timetable:변경"
	eventBudgetChanged       = "budget:변경"
	eventReminderChanged     = "reminder:변경"
	// 기존 기능(2026-11-09 P2): 학생 정보·학적변동·사진, 상담, 출결, 제출서류, 환경 설정
	eventStudentsChanged     = "students:변경"
	eventConsultationChanged = "consultation:변경"
	eventAttendanceChanged   = "attendance:변경"
	eventSubmissionsChanged  = "submissions:변경"
	eventSettingsChanged     = "settings:변경"
)

// 변경 종류
const (
	changeAdded    = "추가"
	changeUpdated  = "수정"
	changeDeleted  = "삭제"
	changeDone     = "완료"
	changeArchived = "보관"
	changeAnswered = "응답"
)

// emitChange는 실제 Wails 이벤트를 보냅니다. 테스트에서는 가짜 함수로 바꿔 보낸 알림을 확인합니다.
var emitChange = func(name string, notice ChangeNotice) {
	if appInst := application.Get(); appInst != nil {
		appInst.Event.Emit(name, notice)
	}
}

// notifyChange는 저장에 성공한 뒤에만 부릅니다.
func notifyChange(name, kind, id string) {
	emitChange(name, ChangeNotice{Kind: kind, ID: id})
}

// notifyAfter는 err가 없을 때만 변경 알림을 보내고 결과를 그대로 돌려줍니다.
func notifyAfter[T any](name, kind string, id func(T) string, value T, err error) (T, error) {
	if err == nil {
		identifier := ""
		if id != nil {
			identifier = id(value)
		}
		notifyChange(name, kind, identifier)
	}
	return value, err
}
