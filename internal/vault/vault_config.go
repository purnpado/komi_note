package vault

import (
	"TeacherNote/internal/attendance"
	"errors"
	"fmt"
	"strings"
	"time"
)

// 최초 설정·학급 설정 검사와 정리입니다.

func validateSetup(request SetupRequest) error {
	if err := validateConfig(normaliseConfig(request.Config)); err != nil {
		return err
	}
	if len([]rune(request.MasterPassword)) < minimumPasswordLen {
		return fmt.Errorf("마스터 비밀번호는 %d자 이상 입력해 주세요", minimumPasswordLen)
	}
	if len([]rune(request.RecoveryPassword)) < minimumPasswordLen {
		return fmt.Errorf("복구용 암호는 %d자 이상 입력해 주세요", minimumPasswordLen)
	}
	if strings.TrimSpace(request.RecoveryFilePath) == "" {
		return errors.New("복구 파일 저장 위치를 선택해 주세요")
	}
	return nil
}

func validateConfig(config ClassConfig) error {
	if strings.TrimSpace(config.SchoolYear) == "" {
		return errors.New("학년도를 입력해 주세요")
	}
	role := config.TeacherRole
	if role == "" {
		// 이전 설정을 직접 검사하는 경우에도 기존 담임 설정으로 해석합니다.
		role = "담임 교사"
	}
	if role != "담임 교사" && role != "비담임 교과 교사" {
		return errors.New("담임 교사 또는 비담임 교과 교사를 선택해 주세요")
	}
	if role == "담임 교사" && (strings.TrimSpace(config.Grade) == "" || strings.TrimSpace(config.ClassNumber) == "") {
		return errors.New("담임 교사는 학년과 반을 입력해 주세요")
	}
	if config.AutoLockMinutes < 1 || config.AutoLockMinutes > 120 {
		return errors.New("자동 잠금 시간은 1분에서 120분 사이로 설정해 주세요")
	}
	if config.ExperienceLearningUnit != "학년" && config.ExperienceLearningUnit != "학기" {
		return errors.New("교외체험학습 관리 단위를 학년 또는 학기로 선택해 주세요")
	}
	if config.ExperienceLearningYearLimit < 0 || config.Semester1ExperienceLimit < 0 || config.Semester2ExperienceLimit < 0 {
		return errors.New("교외체험학습 허용 일수는 0일 이상으로 입력해 주세요")
	}
	if err := validateSemesterRange("1학기", config.Semester1StartDate, config.Semester1EndDate); err != nil {
		return err
	}
	if _, ok := attendance.NormaliseHolidays(config.Holidays); !ok {
		return errors.New("공휴일·휴업일 날짜를 확인해 주세요")
	}
	if err := validateSemesterRange("2학기", config.Semester2StartDate, config.Semester2EndDate); err != nil {
		return err
	}
	if config.ExperienceLearningUnit == "학기" && (config.Semester1StartDate == "" || config.Semester2StartDate == "") {
		return errors.New("학기 단위 관리는 1학기와 2학기 기간을 모두 입력해 주세요")
	}
	return nil
}

func validateSemesterRange(name, start, end string) error {
	if start == "" && end == "" {
		return nil
	}
	if start == "" || end == "" {
		return fmt.Errorf("%s 시작일과 종료일을 모두 입력해 주세요", name)
	}
	startDate, startErr := time.Parse("2006-01-02", start)
	endDate, endErr := time.Parse("2006-01-02", end)
	if startErr != nil || endErr != nil || endDate.Before(startDate) {
		return fmt.Errorf("%s 기간을 올바르게 입력해 주세요", name)
	}
	return nil
}

func normaliseConfig(config ClassConfig) ClassConfig {
	config.SchoolName = strings.TrimSpace(config.SchoolName)
	config.SchoolYear = strings.TrimSpace(config.SchoolYear)
	config.TeacherRole = strings.TrimSpace(config.TeacherRole)
	config.Grade = strings.TrimSpace(config.Grade)
	config.ClassNumber = strings.TrimSpace(config.ClassNumber)
	config.TeacherLabel = strings.TrimSpace(config.TeacherLabel)
	config.TeacherName = strings.TrimSpace(config.TeacherName)
	config.TeachingSubject = strings.TrimSpace(config.TeachingSubject)
	classes := make([]string, 0, len(config.TeachingClasses))
	seenClasses := map[string]bool{}
	for _, className := range config.TeachingClasses {
		className = strings.TrimSpace(className)
		if className != "" && !seenClasses[className] {
			classes = append(classes, className)
			seenClasses[className] = true
		}
	}
	config.TeachingClasses = classes
	config.ExperienceLearningUnit = strings.TrimSpace(config.ExperienceLearningUnit)
	config.Semester1StartDate = strings.TrimSpace(config.Semester1StartDate)
	config.Semester1EndDate = strings.TrimSpace(config.Semester1EndDate)
	config.Semester2StartDate = strings.TrimSpace(config.Semester2StartDate)
	config.Semester2EndDate = strings.TrimSpace(config.Semester2EndDate)
	// 날짜가 틀린 항목이 있으면 정리하지 않고 두어 validateConfig가 알려 주게 한다.
	if cleaned, ok := attendance.NormaliseHolidays(config.Holidays); ok {
		config.Holidays = cleaned
	}
	config.TermsVersion = strings.TrimSpace(config.TermsVersion)
	config.TermsAcceptedAt = strings.TrimSpace(config.TermsAcceptedAt)
	if config.AutoLockMinutes == 0 {
		config.AutoLockMinutes = 5
	}
	if config.TeacherRole == "" {
		// 기존 보관함은 담임 교사 설정으로 안전하게 이어받습니다.
		config.TeacherRole = "담임 교사"
	}
	if config.ExperienceLearningUnit == "" {
		config.ExperienceLearningUnit = "학년"
	}
	return config
}
