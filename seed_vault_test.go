package main

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"TeacherNote/internal/attendance"
	"TeacherNote/internal/cleaning"
	"TeacherNote/internal/seating"
	"TeacherNote/internal/students"
	"TeacherNote/internal/submissions"
	"TeacherNote/internal/survey"
	"TeacherNote/internal/vault"
)

// TestSeedSampleData는 개발 및 UI 실측 확인을 위해 bin/data 폴더에 가상 학급 보관함(25명)을 생성합니다.
//
// 이 테스트는 bin/data/vault.dat를 지우고 새로 만들기 때문에, 일반 `go test ./...`에서는 실행하지 않는다.
// 가상 학급이 필요할 때만 `KKOMI_SEED_SAMPLE=1 go test -run TestSeedSampleData .`로 실행한다.
func TestSeedSampleData(t *testing.T) {
	if os.Getenv("KKOMI_SEED_SAMPLE") != "1" {
		t.Skip("가상 학급 보관함 생성은 KKOMI_SEED_SAMPLE=1일 때만 실행합니다(bin/data/vault.dat 보호)")
	}
	vaultPath := filepath.Join("bin", "data", "vault.dat")
	recoveryPath := filepath.Join("bin", "backup_key", "복구키.teacher-recovery")

	// 신규 25명 가상 데이터를 완전히 새로 세팅하기 위해 기존 파일이 있으면 정리
	_ = os.Remove(vaultPath)
	_ = os.Remove(recoveryPath)

	vaultStore := vault.NewVaultStoreWithPaths(vaultPath, filepath.Join("bin", "backup_key"))

	masterPassword := "test12345678"
	recoveryPassword := "test12345678"

	setupReq := vault.SetupRequest{
		Config: vault.ClassConfig{
			SchoolYear:             "2026",
			Grade:                  "2",
			ClassNumber:            "3",
			SchoolName:             "꼬미중학교",
			TeacherRole:            "담임 교사",
			AutoLockMinutes:        60,
			ExperienceLearningUnit: "학년",
			Semester1StartDate:     "2026-03-02",
			Semester1EndDate:       "2026-07-20",
		},
		MasterPassword:   masterPassword,
		RecoveryPassword: recoveryPassword,
		RecoveryFilePath: recoveryPath,
	}

	_, err := vaultStore.Initialize(setupReq)
	if err != nil {
		t.Fatalf("보관함 초기화 실패: %v", err)
	}

	// 간편 PIN 번호(123456) 기본 등록
	if err := vaultStore.SetPin("123456"); err != nil {
		t.Fatalf("간편 PIN 설정 실패: %v", err)
	}

	sampleStudents := []students.Student{
		{Number: 1, Name: "김도윤", Gender: "남", BirthDate: "2013-03-12", TransferInDate: "2026-03-02", StudentPhone: "010-1234-5601", FatherName: "김태호", FatherPhone: "010-9876-5601", CareerHope: "로봇 공학자", Note: "학급 반장, 책임감이 강하고 모둠 활동을 훌륭히 이끎"},
		{Number: 2, Name: "김서준", Gender: "남", BirthDate: "2013-05-18", TransferInDate: "2026-03-02", StudentPhone: "010-1234-5602", MotherName: "박지영", MotherPhone: "010-9876-5602", CareerHope: "소프트웨어 개발자", Note: "수학 및 컴퓨터 활용 능력이 우수하며 알고리즘에 관심이 많음"},
		{Number: 3, Name: "김하은", Gender: "여", BirthDate: "2013-01-25", TransferInDate: "2026-03-02", StudentPhone: "010-1234-5603", MotherName: "이지은", MotherPhone: "010-9876-5603", CareerHope: "수의사", Note: "땅콩 및 갑각류 식품 알레르기 있음(급식 지도 주의)"},
		{Number: 4, Name: "이시우", Gender: "남", BirthDate: "2013-08-09", TransferInDate: "2026-03-02", StudentPhone: "010-1234-5604", FatherName: "이정훈", FatherPhone: "010-9876-5604", CareerHope: "건축가", Note: "시력이 좋지 않아 수업 시 앞자리 배치를 희망함"},
		{Number: 5, Name: "이지호", Gender: "남", BirthDate: "2013-04-30", TransferInDate: "2026-03-02", StudentPhone: "010-1234-5605", MotherName: "최수민", MotherPhone: "010-9876-5605", CareerHope: "천문학자", Note: "차분하고 집중력이 높으며 독서를 매우 좋아함"},
		{Number: 6, Name: "박수아", Gender: "여", BirthDate: "2013-11-14", TransferInDate: "2026-03-02", StudentPhone: "010-1234-5606", MotherName: "윤미래", MotherPhone: "010-9876-5606", CareerHope: "초등교사", Note: "학급 부반장, 주변 친구들을 세심하게 챙기고 배려심이 깊음"},
		{Number: 7, Name: "박지안", Gender: "여", BirthDate: "2013-07-03", TransferInDate: "2026-03-02", StudentPhone: "010-1234-5607", FatherName: "박성호", FatherPhone: "010-9876-5607", CareerHope: "웹툰 작가", Note: "미술과 일러스트 감각이 뛰어나며 교내 환경미화에 적극적"},
		{Number: 8, Name: "최예준", Gender: "남", BirthDate: "2013-09-22", TransferInDate: "2026-03-02", StudentPhone: "010-1234-5608", FatherName: "최동원", FatherPhone: "010-9876-5608", CareerHope: "프로 축구선수", Note: "체육 부장, 운동신경이 뛰어나고 축구 동아리 활동 중"},
		{Number: 9, Name: "최유진", Gender: "여", BirthDate: "2013-02-17", TransferInDate: "2026-03-02", StudentPhone: "010-1234-5609", MotherName: "한선영", MotherPhone: "010-9876-5609", CareerHope: "생명과학 연구원", Note: "비염 증세가 있어 환절기 체육 활동 및 먼지 주의 필요"},
		{Number: 10, Name: "정민재", Gender: "남", BirthDate: "2013-06-11", TransferInDate: "2026-03-02", StudentPhone: "010-1234-5610", FatherName: "정우진", FatherPhone: "010-9876-5610", CareerHope: "비행기 조종사", Note: "호기심이 많고 질문을 적극적으로 하며 발표력이 우수함"},
		{Number: 11, Name: "정서아", Gender: "여", BirthDate: "2013-10-05", TransferInDate: "2026-03-02", StudentPhone: "010-1234-5611", MotherName: "오현주", MotherPhone: "010-9876-5611", CareerHope: "뮤지컬 배우", Note: "음악적 재능이 풍부하고 목소리가 맑으며 합창 활동 중"},
		{Number: 12, Name: "강선우", Gender: "남", BirthDate: "2013-12-19", TransferInDate: "2026-03-02", StudentPhone: "010-1234-5612", FatherName: "강현석", FatherPhone: "010-9876-5612", CareerHope: "기계공학자", Note: "교우관계가 원만하고 블록 조립 및 메이커 활동 선호"},
		{Number: 13, Name: "강하린", Gender: "여", BirthDate: "2013-03-28", TransferInDate: "2026-03-02", StudentPhone: "010-1234-5613", MotherName: "송나래", MotherPhone: "010-9876-5613", CareerHope: "외교관", Note: "영어 회화 능력이 탁월하고 외국 문화에 관심이 많음"},
		{Number: 14, Name: "조은우", Gender: "남", BirthDate: "2013-07-15", TransferInDate: "2026-03-02", StudentPhone: "010-1234-5614", FatherName: "조재현", FatherPhone: "010-9876-5614", CareerHope: "요리 연구가", Note: "손재주가 좋고 정리정돈을 매우 깔끔하게 잘함"},
		{Number: 15, Name: "조서윤", Gender: "여", BirthDate: "2013-04-02", TransferInDate: "2026-03-02", StudentPhone: "010-1234-5615", MotherName: "임소연", MotherPhone: "010-9876-5615", CareerHope: "약사", Note: "성실하고 차분한 성격이며 과제 제출 기한을 철저히 지킴"},
		{Number: 16, Name: "윤도현", Gender: "남", BirthDate: "2013-08-21", TransferInDate: "2026-03-02", StudentPhone: "010-1234-5616", FatherName: "윤성민", FatherPhone: "010-9876-5616", CareerHope: "환경 운동가", Note: "생태 및 분리배출에 관심이 많아 학급 분리수거 도우미 자원"},
		{Number: 17, Name: "윤지우", Gender: "여", BirthDate: "2013-05-07", TransferInDate: "2026-03-02", StudentPhone: "010-1234-5617", MotherName: "배수진", MotherPhone: "010-9876-5617", CareerHope: "아나운서", Note: "발음이 정확하고 전달력이 뛰어나 방송반 아나운서 활동"},
		{Number: 18, Name: "장우진", Gender: "남", BirthDate: "2013-11-30", TransferInDate: "2026-03-02", StudentPhone: "010-1234-5618", FatherName: "장민호", FatherPhone: "010-9876-5618", CareerHope: "게임 기획자", Note: "창의적인 아이디어가 많고 논리적 사고력이 뛰어남"},
		{Number: 19, Name: "장채원", Gender: "여", BirthDate: "2013-06-24", TransferInDate: "2026-03-02", StudentPhone: "010-1234-5619", MotherName: "신미영", MotherPhone: "010-9876-5619", CareerHope: "심리상담사", Note: "친구들의 고민을 잘 들어주며 또래 상담자 역할을 잘함"},
		{Number: 20, Name: "임현우", Gender: "남", BirthDate: "2013-01-18", TransferInDate: "2026-03-02", StudentPhone: "010-1234-5620", FatherName: "임철호", FatherPhone: "010-9876-5620", CareerHope: "경찰관", Note: "정의감이 넘치며 학급 규칙 준수에 모범을 보임"},
		{Number: 21, Name: "임서현", Gender: "여", BirthDate: "2013-09-13", TransferInDate: "2026-03-02", StudentPhone: "010-1234-5621", MotherName: "문혜진", MotherPhone: "010-9876-5621", CareerHope: "패션 디자이너", Note: "색채 감각이 탁월하고 손재주가 좋아 만들기 수업에 적극적"},
		{Number: 22, Name: "한주원", Gender: "남", BirthDate: "2013-03-05", TransferInDate: "2026-03-02", StudentPhone: "010-1234-5622", FatherName: "한경수", FatherPhone: "010-9876-5622", CareerHope: "빅데이터 전문가", Note: "통계 및 도표 분석을 흥미로워하며 논리적임"},
		{Number: 23, Name: "한나은", Gender: "여", BirthDate: "2013-10-29", TransferInDate: "2026-03-02", StudentPhone: "010-1234-5623", MotherName: "서지은", MotherPhone: "010-9876-5623", CareerHope: "피아니스트", Note: "감수성이 풍부하고 교내 피아노 연주회 참가 경력 있음"},
		{Number: 24, Name: "오승우", Gender: "남", BirthDate: "2013-12-04", TransferInDate: "2026-04-01", StudentPhone: "010-1234-5624", FatherName: "오진석", FatherPhone: "010-9876-5624", CareerHope: "소방관", Note: "4월 1일 타교에서 전입, 현재 새로운 친구들과 잘 적응 중"},
		{Number: 25, Name: "오지유", Gender: "여", BirthDate: "2013-02-08", TransferInDate: "2026-03-02", StudentPhone: "010-1234-5625", MotherName: "류하경", MotherPhone: "010-9876-5625", CareerHope: "동화 작가", Note: "상상력이 풍부하고 글짓기 대회 수상 경력이 다수 있음"},
	}

	created := make([]students.Student, 0, len(sampleStudents))
	for _, std := range sampleStudents {
		saved, addErr := vaultStore.AddStudent(std)
		if addErr == nil {
			created = append(created, saved)
		} else {
			t.Logf("학생 추가 경고 (%s): %v", std.Name, addErr)
		}
	}

	if len(created) > 0 {
		// 25명 일별 출결 샘플
		entries := make([]attendance.AttendanceEntry, 0, len(created))
		for i, st := range created {
			switch i {
			case 2:
				entries = append(entries, attendance.AttendanceEntry{StudentID: st.ID, Status: "결석", ReasonCategory: "질병", Reason: "감기 몸살"})
			case 3:
				entries = append(entries, attendance.AttendanceEntry{StudentID: st.ID, Status: "지각", ReasonCategory: "기타", Reason: "안과 진료"})
			default:
				entries = append(entries, attendance.AttendanceEntry{StudentID: st.ID, Status: "출석"})
			}
		}
		_, _ = vaultStore.SaveAttendance(attendance.AttendanceDay{
			Date:    "2026-04-13",
			Entries: entries,
		})

		// 25명 5x5 교실 자리배정 샘플
		seats := make([]seating.SeatingSeat, 0, len(created))
		seatIdx := 1
		for r := 1; r <= 5; r++ {
			for c := 1; c <= 5; c++ {
				if seatIdx <= len(created) {
					seats = append(seats, seating.SeatingSeat{
						ID:        fmt.Sprintf("r%dc%d", r, c), // 앱(seatLayout.makeSeats)과 같은 좌석 번호 형식
						Row:       r,
						Column:    c,
						Label:     fmt.Sprintf("%d분단 %d열", c, r),
						StudentID: created[seatIdx-1].ID,
					})
					seatIdx++
				}
			}
		}
		_, _ = vaultStore.SaveSeatingPlan(seating.SeatingPlan{
			Title:   "1학기 전체 자리배정 (5x5)",
			Rows:    5,
			Columns: 5,
			Seats:   seats,
		})

		// 설문 샘플
		_, _ = vaultStore.SaveSurvey(survey.Survey{
			Title:    "1학기 학급 임원 선출 및 학생 희망 설문",
			Audience: "학생",
			Scope:    "담임용",
			Questions: []survey.SurveyQuestion{
				{Text: "가장 성실하게 봉사할 반장은 누구인가요?", Type: "단일 선택", Options: []string{"김도윤", "김서준", "이시우"}},
				{Text: "올해 학급 특색 활동으로 가장 하고 싶은 것은?", Type: "단일 선택", Options: []string{"학급 보드게임 데이", "학급 텃밭 가꾸기", "스포츠 리그전"}},
			},
		})

		// 제출서류 샘플
		doc, _ := vaultStore.SaveSubmissionDocument(submissions.SubmissionDocument{
			Title:   "현장체험학습 참가 신청서 및 동의서",
			DueDate: "2026-04-20",
			Note:    "학부모 동의 서명 필수 지참",
		})
		if doc.ID != "" {
			for i := 0; i < 15 && i < len(created); i++ {
				_, _ = vaultStore.SaveSubmissionStatus(doc.ID, created[i].ID, "제출", "서명 확인 완료")
			}
		}

		// 청소구역 25명 배정 샘플
		zones := []cleaning.CleaningZone{
			{ID: "z1", Name: "칠판 및 교탁"},
			{ID: "z2", Name: "창문 및 창틀"},
			{ID: "z3", Name: "복도 및 계단"},
			{ID: "z4", Name: "교실 바닥 쓸기"},
			{ID: "z5", Name: "분리수거 및 휴지통"},
		}
		cleaningAssignments := make([]cleaning.CleaningAssignment, 0, len(created))
		for i, st := range created {
			zoneID := zones[i%len(zones)].ID
			cleaningAssignments = append(cleaningAssignments, cleaning.CleaningAssignment{
				StudentID: st.ID,
				ZoneID:    zoneID,
			})
		}
		_, _ = vaultStore.SaveCleaningPlan(cleaning.CleaningPlan{
			Title:       "4월 3주차 청소 구역 배정",
			PeriodType:  "주간",
			Zones:       zones,
			Assignments: cleaningAssignments,
		})
	}

	// 사용자가 실행했을 때 바로 열 수 있도록 잠금 상태로 안전하게 보관
	vaultStore.Lock()

	t.Logf("🎉 bin/data/vault.dat 에 25명 가상 학급 데이터가 성공적으로 생성 및 저장되었습니다!")
	t.Logf("🔑 마스터 비밀번호: %s", masterPassword)
	t.Logf("🔢 간편 PIN 번호: 123456")
}
