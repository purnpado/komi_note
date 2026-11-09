package main

// 공용 타입 알리아스 (프론트엔드 Wails v3 바인딩 호환)

import (
	"TeacherNote/internal/assessment"
	"TeacherNote/internal/attendance"
	"TeacherNote/internal/cleaning"
	"TeacherNote/internal/groupsession"
	"TeacherNote/internal/seating"
	"TeacherNote/internal/students"
	"TeacherNote/internal/submissions"
	"TeacherNote/internal/survey"
	"TeacherNote/internal/system"
	"TeacherNote/internal/vault"
)

// 공용 타입 알리아스 (프론트엔드 Wails v3 바인딩 호환)
type VaultStore = vault.VaultStore

type ClassConfig = vault.ClassConfig

type SetupRequest = vault.SetupRequest

type AppState = vault.AppState

type SessionResult = vault.SessionResult

// RestoreResult는 백업 되살리기 뒤 안내할 내용입니다.
type RestoreResult = vault.RestoreResult

type RosterPreview = vault.RosterPreview

type RosterImportResult = vault.RosterImportResult

type Student = students.Student

type StudentStats = students.StudentStats

type Consultation = vault.Consultation

type AcademicChange = vault.AcademicChange

type AttendanceDay = attendance.AttendanceDay

type AttendanceEntry = attendance.AttendanceEntry

type AttendanceDocumentPeriod = attendance.AttendanceDocumentPeriod

type AttendanceTemplate = vault.AttendanceTemplate

type AttendanceFieldPoint = vault.AttendanceFieldPoint

type AttendanceHWPXBuildResult = vault.AttendanceHWPXBuildResult

type SeatingPlan = seating.SeatingPlan

type SeatingSeat = seating.SeatingSeat

type Assessment = assessment.Assessment

type AssessmentStudent = assessment.AssessmentStudent

type AssessmentDomain = assessment.AssessmentDomain

type AssessmentCriterion = assessment.AssessmentCriterion

type AssessmentScore = assessment.AssessmentScore

type AssessmentDomainScore = assessment.AssessmentDomainScore

type AssessmentCriterionScore = assessment.AssessmentCriterionScore

type AssessmentObjection = assessment.AssessmentObjection

type AssessmentHistory = assessment.AssessmentHistory

type CourseRoster = vault.CourseRoster

type TimetableBook = vault.TimetableBook

type GroupingBook = vault.GroupingBook

type GroupPlan = vault.GroupPlan

type GroupRules = vault.GroupRules

type RecordBook = vault.RecordBook

type RecordEntry = vault.RecordEntry

type RecordActivityList = vault.RecordActivityList

type RecordPhrase = vault.RecordPhrase

// GroupSessionInfo는 학생 참여형 모둠 편성(지망 배정) QR 회차 상태입니다.
type GroupSessionInfo = groupsession.Info

// GroupSessionRequest는 학생 참여형 모둠 편성 회차 설정입니다.
type GroupSessionRequest = groupsession.StartRequest

type CourseRosterStudent = vault.CourseRosterStudent

type CourseRosterPreview = vault.CourseRosterPreview

type AssessmentImportPreview = vault.AssessmentImportPreview

type CleaningPlan = cleaning.CleaningPlan

type CleaningZone = cleaning.CleaningZone

type CleaningAssignment = cleaning.CleaningAssignment

type SubmissionDocument = submissions.SubmissionDocument

type Survey = survey.Survey

type SurveyQuestion = survey.SurveyQuestion

type SurveySessionInfo = survey.SurveySessionInfo

// SeatingSessionInfo는 자리배정 QR 참여 회차 정보입니다.
type SeatingSessionInfo = seating.SeatingSessionInfo

// AssessmentSessionInfo는 수행평가 전자칠판 QR 및 진행 정보입니다.
type AssessmentSessionInfo = assessment.AssessmentSessionInfo

// AssessmentEvent는 수행평가 모듈 상태 변경 이벤트입니다.
type AssessmentEvent = assessment.AssessmentEvent

// AssessmentEventBus는 수행평가 이벤트 버스입니다.
type AssessmentEventBus = assessment.AssessmentEventBus

// UpdateInfo는 공개 업데이트 채널에서 받는 정보와 화면 표시 상태를 함께 담습니다.
type UpdateInfo = system.UpdateInfo
