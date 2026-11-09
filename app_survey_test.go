package main

import "testing"

func Test설문저장삭제는변경알림을보낸다(t *testing.T) {
	app := newUnlockedTestApp(t)
	sent := captureChanges(t)
	if _, err := app.SaveSurvey(Survey{Title: ""}); err == nil {
		t.Fatal("제목 없는 설문은 오류여야 합니다")
	}
	saved, err := app.SaveSurvey(Survey{Title: "알림", Scope: "담임용", Audience: "학생", Questions: []SurveyQuestion{{Text: "질문", Type: "단답"}}})
	if err != nil {
		t.Fatal(err)
	}
	if err := app.DeleteSurvey(saved.ID, "설문 삭제"); err != nil {
		t.Fatal(err)
	}
	got := sent()
	if len(got) != 2 || got[0] != (sentChange{Name: "survey:변경", Notice: ChangeNotice{Kind: "추가", ID: saved.ID}}) || got[1].Notice.Kind != "삭제" {
		t.Fatalf("저장·삭제 성공 때만 알림: %+v", got)
	}
}
