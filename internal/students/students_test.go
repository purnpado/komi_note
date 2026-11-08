package students

import (
	"encoding/json"
	"testing"
)

func TestStudentSerialization(t *testing.T) {
	student := Student{
		ID:        "std-1",
		Number:    1,
		Name:      "김철수",
		Gender:    "남",
		BirthDate: "2010-05-15",
	}

	data, err := json.Marshal(student)
	if err != nil {
		t.Fatalf("Student JSON 마샬링 실패: %v", err)
	}

	var parsed Student
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("Student JSON 언마샬링 실패: %v", err)
	}

	if parsed.Name != "김철수" || parsed.Number != 1 {
		t.Fatalf("파싱된 학생 데이터 불일치: %+v", parsed)
	}
}

func TestSortStudents(t *testing.T) {
	list := []Student{
		{ID: "3", Number: 3, Name: "박영희"},
		{ID: "1", Number: 1, Name: "김철수"},
		{ID: "2", Number: 2, Name: "이민수"},
	}

	SortStudents(list)

	if list[0].Number != 1 || list[1].Number != 2 || list[2].Number != 3 {
		t.Fatalf("학생 정렬 결과 불일치: %+v", list)
	}
	if StudentNumber(list, "2") != 2 {
		t.Fatalf("학생 번호 조회 실패")
	}
}

