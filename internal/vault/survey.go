package vault

import (
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"TeacherNote/internal/survey"
)

// Survey는 학급 안에서만 운영하는 설문지와 암호화 응답 기록입니다.
type Survey = survey.Survey

// SurveyQuestion은 설문 문항 정의입니다.
type SurveyQuestion = survey.SurveyQuestion

// SurveyResponse는 교사용 암호화 보관함에서만 학생별 응답을 확인할 수 있도록 보관합니다.
type SurveyResponse = survey.SurveyResponse

// SurveySessionInfo는 실시간 설문 참여 세션 상태입니다.
type SurveySessionInfo = survey.SurveySessionInfo

func newSurveyID() (string, error) {
	bytes, err := randomBytes(12)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("survey-%x", bytes), nil
}

func (s *VaultStore) ListSurveys() ([]Survey, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return nil, errors.New("먼저 보관함을 열어 주세요")
	}
	items := append([]Survey{}, s.session.Surveys...)
	sort.Slice(items, func(i, j int) bool { return items[i].UpdatedAt > items[j].UpdatedAt })
	return items, nil
}

func (s *VaultStore) SaveSurvey(item Survey) (Survey, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return Survey{}, errors.New("먼저 보관함을 열어 주세요")
	}
	item.Title = strings.TrimSpace(item.Title)
	if item.Title == "" {
		return Survey{}, errors.New("설문 제목을 입력해 주세요")
	}
	if item.Audience == "" {
		item.Audience = "학생"
	}
	if item.Audience != "학생" && item.Audience != "교직원" {
		return Survey{}, errors.New("설문 대상을 확인해 주세요")
	}
	if item.Scope == "" {
		item.Scope = "수업용"
	}
	if item.Scope != "담임용" && item.Scope != "수업용" && item.Scope != "업무용" {
		return Survey{}, errors.New("설문 구분을 확인해 주세요")
	}
	if item.Scope == "업무용" && item.Audience != "교직원" {
		return Survey{}, errors.New("업무용 설문은 교직원 대상으로만 만들 수 있습니다")
	}
	if item.Scope != "업무용" && item.Audience != "학생" {
		return Survey{}, errors.New("담임용·수업용 설문은 학생 대상으로만 만들 수 있습니다")
	}
	if item.Audience == "교직원" {
		if item.StaffIdentityMode == "" {
			item.StaffIdentityMode = "익명"
		}
		if item.StaffIdentityMode != "익명" && item.StaffIdentityMode != "이름 입력" {
			return Survey{}, errors.New("교직원 응답 확인 방식을 선택해 주세요")
		}
	} else {
		item.StaffIdentityMode = ""
	}
	if utf8.RuneCountInString(item.Title) > 100 {
		return Survey{}, errors.New("설문 제목은 100자까지 쓸 수 있습니다")
	}
	item.Description = strings.TrimSpace(item.Description)
	if utf8.RuneCountInString(item.Description) > 1000 {
		return Survey{}, errors.New("설문 설명은 1000자까지 쓸 수 있습니다")
	}
	item.TargetRosterID = strings.TrimSpace(item.TargetRosterID)
	if item.Scope != "수업용" {
		item.TargetRosterID = ""
	} else if item.TargetRosterID != "" && s.courseRosterLocked(item.TargetRosterID) == nil {
		return Survey{}, errors.New("고른 수업 반 명렬을 찾지 못했습니다. 수업 반을 다시 골라 주세요")
	}
	questions, err := survey.NormalizeQuestions(item.Questions, func() string {
		id, _ := newSurveyID()
		return id
	})
	if err != nil {
		return Survey{}, err
	}
	item.Questions = questions
	if err := s.missingSurveyImagesLocked(questions); err != nil {
		return Survey{}, err
	}
	if item.ExpectedParticipants < 0 {
		return Survey{}, errors.New("참여 대상 인원은 0명 이상으로 입력해 주세요")
	}
	now := time.Now().In(time.Local).Format(time.RFC3339)
	if item.ID == "" {
		item.ID, _ = newSurveyID()
		item.CreatedAt = now
		item.Status = "준비"
	}
	item.UpdatedAt = now
	for index := range s.session.Surveys {
		if s.session.Surveys[index].ID == item.ID {
			if s.session.Surveys[index].Status != "준비" {
				return Survey{}, errors.New("참여 대기·진행·마감 설문은 복제한 뒤 수정해 주세요")
			}
			item.Responses = s.session.Surveys[index].Responses
			item.CreatedAt = s.session.Surveys[index].CreatedAt
			if s.session.Surveys[index].Status == "진행 중" {
				item.Status = "진행 중"
			}
			dropped := droppedImages(s.session.Surveys[index].Questions, item.Questions)
			s.session.Surveys[index] = item
			s.session.UpdatedAt = time.Now().UTC()
			if err := s.writeCurrentVaultLocked(); err != nil {
				return item, err
			}
			s.cleanupSurveyImagesLocked(dropped)
			return item, nil
		}
	}
	s.session.Surveys = append(s.session.Surveys, item)
	s.session.UpdatedAt = time.Now().UTC()
	if err := s.writeCurrentVaultLocked(); err != nil {
		return item, err
	}
	s.cleanupSurveyImagesLocked(nil)
	return item, nil
}

// DeleteSurvey는 확인 문구를 받은 뒤 설문과 암호화된 응답을 함께 삭제합니다.
func (s *VaultStore) DeleteSurvey(id, confirmation string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return errors.New("먼저 보관함을 열어 주세요")
	}
	if confirmation != "설문 삭제" {
		return errors.New("확인 문구를 정확히 입력해 주세요")
	}
	for index, item := range s.session.Surveys {
		if item.ID != id {
			continue
		}
		if item.Status == "참여 대기" || item.Status == "진행 중" {
			return errors.New("진행 중인 설문은 먼저 마감해 주세요")
		}
		s.session.Surveys = append(s.session.Surveys[:index], s.session.Surveys[index+1:]...)
		s.session.UpdatedAt = time.Now().UTC()
		if err := s.writeCurrentVaultLocked(); err != nil {
			return err
		}
		s.cleanupSurveyImagesLocked(survey.ImageIDs(item.Questions))
		return nil
	}
	return errors.New("설문을 찾지 못했습니다")
}

func (s *VaultStore) surveyByIDLocked(id string) (*Survey, int, error) {
	if s.session == nil {
		return nil, -1, errors.New("먼저 보관함을 열어 주세요")
	}
	for index := range s.session.Surveys {
		if s.session.Surveys[index].ID == id {
			return &s.session.Surveys[index], index, nil
		}
	}
	return nil, -1, errors.New("설문을 찾지 못했습니다")
}

// GetSurvey는 지정된 ID의 설문 정보를 반환합니다.
func (s *VaultStore) GetSurvey(id string) (Survey, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	item, _, err := s.surveyByIDLocked(id)
	if err != nil {
		return Survey{}, err
	}
	return *item, nil
}

func (s *VaultStore) getSurvey(id string) (Survey, error) {
	return s.GetSurvey(id)
}

// SetSurveyStatus는 설문의 진행 상태를 갱신합니다.
func (s *VaultStore) SetSurveyStatus(id, status string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	item, _, err := s.surveyByIDLocked(id)
	if err != nil {
		return err
	}
	item.Status = status
	item.UpdatedAt = time.Now().In(time.Local).Format(time.RFC3339)
	s.session.UpdatedAt = time.Now().UTC()
	return s.writeCurrentVaultLocked()
}

func (s *VaultStore) setSurveyStatus(id, status string) error {
	return s.SetSurveyStatus(id, status)
}

// SubmitSurvey는 학생의 설문 응답을 암호화 보관함에 추가합니다.
func (s *VaultStore) SubmitSurvey(id, studentID, respondentName string, answers map[string]string, multiAnswers map[string][]string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	item, _, err := s.surveyByIDLocked(id)
	if err != nil {
		return err
	}
	if item.Status != "진행 중" {
		return errors.New("현재 참여할 수 없는 설문입니다")
	}
	cleanAnswers, cleanMulti, err := survey.ValidateAnswers(item.Questions, answers, multiAnswers)
	if err != nil {
		return err
	}
	if !strings.HasPrefix(studentID, "staff-anon-") {
		for _, previous := range item.Responses {
			if previous.StudentID == studentID {
				return errors.New("이미 응답을 제출했습니다")
			}
		}
	}
	answers, multiAnswers = cleanAnswers, cleanMulti
	response := SurveyResponse{StudentID: studentID, RespondentName: respondentName, Answers: answers, MultiAnswers: multiAnswers, SubmittedAt: time.Now().In(time.Local).Format(time.RFC3339)}
	item.Responses = append(item.Responses, response)
	item.UpdatedAt = response.SubmittedAt
	s.session.UpdatedAt = time.Now().UTC()
	return s.writeCurrentVaultLocked()
}

func (s *VaultStore) submitSurvey(id, studentID, respondentName string, answers map[string]string, multiAnswers map[string][]string) error {
	return s.SubmitSurvey(id, studentID, respondentName, answers, multiAnswers)
}

func (s *VaultStore) courseRosterLocked(id string) *CourseRoster {
	for index := range s.session.CourseRosters {
		if s.session.CourseRosters[index].ID == id {
			return &s.session.CourseRosters[index]
		}
	}
	return nil
}

// SurveyParticipants는 학생 설문의 참여 대상을 돌려준다.
// 수업용 설문은 고른 수업 반 명렬(재학 학생)을, 그 밖에는 담임 학급 학생을 쓴다.
func (s *VaultStore) SurveyParticipants(id string) ([]survey.Participant, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	item, _, err := s.surveyByIDLocked(id)
	if err != nil {
		return nil, err
	}
	result := []survey.Participant{}
	if item.Scope == "수업용" && item.TargetRosterID != "" {
		roster := s.courseRosterLocked(item.TargetRosterID)
		if roster == nil {
			return nil, errors.New("설문에 연결한 수업 반 명렬을 찾지 못했습니다")
		}
		for _, student := range roster.Students {
			if student.Status != "" && student.Status != "재학" {
				continue
			}
			result = append(result, survey.Participant{ID: survey.CourseParticipantID(roster.ID, student.Number, student.Name), Number: student.Number, Name: student.Name})
		}
		return result, nil
	}
	for _, student := range s.session.Students {
		result = append(result, survey.Participant{ID: student.ID, Number: fmt.Sprint(student.Number), Name: student.Name})
	}
	return result, nil
}
