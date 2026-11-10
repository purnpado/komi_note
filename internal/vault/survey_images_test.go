package vault

import (
	"encoding/base64"
	"os"
	"path/filepath"
	"testing"
	"time"

	"TeacherNote/internal/survey"
)

func imageQuestions(questionImage, optionImage string) []SurveyQuestion {
	return []SurveyQuestion{{Text: "어느 그림?", Type: survey.TypeSingle, Options: []string{"가", "나"}, ImageID: questionImage, OptionImages: []string{optionImage, ""}}}
}

func TestSurvey그림은암호화저장하고쓰지않으면지운다(t *testing.T) {
	store := newTestVault(t, t.TempDir())
	if _, err := store.SaveSurveyImage(base64.StdEncoding.EncodeToString([]byte("그림 아님"))); err == nil {
		t.Fatal("그림이 아닌 파일은 거부해야 합니다")
	}
	first, err := store.SaveSurveyImage("data:image/png;base64," + base64.StdEncoding.EncodeToString(tinyPNG))
	if err != nil {
		t.Fatal(err)
	}
	second, _ := store.SaveSurveyImage(base64.StdEncoding.EncodeToString(tinyPNG))
	raw, _ := os.ReadFile(store.surveyImagePath(first))
	if len(raw) == 0 || string(raw) == string(tinyPNG) {
		t.Fatal("그림 파일은 암호화돼 있어야 합니다")
	}
	mime, contents, err := store.GetSurveyImage(first)
	if err != nil || mime != "image/png" || string(contents) != string(tinyPNG) {
		t.Fatalf("그림을 다시 열 수 있어야 합니다: %v %s", err, mime)
	}
	if _, _, err := store.GetSurveyImage("../vault"); err == nil {
		t.Fatal("이상한 그림 번호는 막아야 합니다")
	}

	saved, err := store.SaveSurvey(Survey{Title: "그림 설문", Scope: "담임용", Audience: "학생", Questions: imageQuestions(first, second)})
	if err != nil {
		t.Fatal(err)
	}
	copied, err := store.SaveSurvey(Survey{Title: "복제", Scope: "담임용", Audience: "학생", Questions: imageQuestions(first, "")})
	if err != nil {
		t.Fatal(err)
	}
	// 보기 그림을 빼고 다시 저장 → 다른 설문이 쓰지 않으므로 바로 지움
	saved.Questions = imageQuestions(first, "")
	if _, err := store.SaveSurvey(saved); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(store.surveyImagePath(second)); !os.IsNotExist(err) {
		t.Fatal("쓰지 않게 된 보기 그림은 지워야 합니다")
	}
	// 첫 설문을 지워도 복제 설문이 문항 그림을 쓰므로 남김
	if err := store.DeleteSurvey(saved.ID, "설문 삭제"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(store.surveyImagePath(first)); err != nil {
		t.Fatal("다른 설문이 쓰는 그림은 남겨야 합니다")
	}
	if err := store.DeleteSurvey(copied.ID, "설문 삭제"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(store.surveyImagePath(first)); !os.IsNotExist(err) {
		t.Fatal("마지막 설문을 지우면 그림도 지워야 합니다")
	}

	// 저장하지 않은 그림: 하루가 지난 것만 정리
	fresh, _ := store.SaveSurveyImage(base64.StdEncoding.EncodeToString(tinyPNG))
	stale, _ := store.SaveSurveyImage(base64.StdEncoding.EncodeToString(tinyPNG))
	old := time.Now().Add(-48 * time.Hour)
	os.Chtimes(store.surveyImagePath(stale), old, old)
	if _, err := store.SaveSurvey(Survey{Title: "다른 설문", Scope: "담임용", Audience: "학생", Questions: surveyQuestions()}); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(store.surveyImagePath(fresh)); err != nil {
		t.Fatal("방금 올린 그림은 남겨야 합니다(아직 설문 화면에서 쓰는 중)")
	}
	if _, err := os.Stat(store.surveyImagePath(stale)); !os.IsNotExist(err) {
		t.Fatal("하루 지난 쓰지 않는 그림은 지워야 합니다")
	}
	os.Remove(store.surveyImagePath(fresh))
	if _, err := store.SaveSurvey(Survey{Title: "없는 그림", Scope: "담임용", Audience: "학생", Questions: imageQuestions(fresh, "")}); err == nil {
		t.Fatal("파일이 없는 그림을 가리키면 저장하지 않습니다")
	}
}

func TestBackup설문그림을함께담고되살린다(t *testing.T) {
	dir := t.TempDir()
	store := newTestVault(t, dir)
	id, err := store.SaveSurveyImage(base64.StdEncoding.EncodeToString(tinyPNG))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.SaveSurvey(Survey{Title: "그림 설문", Scope: "담임용", Audience: "학생", Questions: imageQuestions("", id)}); err != nil {
		t.Fatal(err)
	}
	backupPath := filepath.Join(dir, "백업.kkomi-backup")
	if err := store.ExportBackup(backupPath); err != nil {
		t.Fatal(err)
	}
	os.RemoveAll(store.surveyImageDir())
	result, err := store.RestoreBackup(backupPath, testMaster)
	if err != nil {
		t.Fatal(err)
	}
	if result.AttachmentsRestored != 1 || result.AttachmentsFailed != 0 {
		t.Fatalf("설문 그림 1장 되살림: %+v", result)
	}
	if url, err := store.GetSurveyImageURL(id); err != nil || url == "" {
		t.Fatalf("되살린 그림이 열려야 합니다: %v", err)
	}
}
