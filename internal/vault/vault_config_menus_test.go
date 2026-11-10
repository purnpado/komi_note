package vault

import (
	"reflect"
	"testing"
)

func TestConfig숨긴메뉴정리(t *testing.T) {
	got := normaliseHiddenMenus([]string{" 예산 관리 ", "대시보드", "환경 설정", "예산 관리", "", "모둠 편성"})
	if !reflect.DeepEqual(got, []string{"예산 관리", "모둠 편성"}) {
		t.Fatalf("대시보드·환경 설정은 숨길 수 없고 겹친 이름은 뺍니다: %v", got)
	}
	if normaliseHiddenMenus([]string{"대시보드"}) != nil {
		t.Fatal("숨길 메뉴가 없으면 비웁니다")
	}
	store := newTestVault(t, t.TempDir())
	config := store.session.Config
	config.HiddenMenus = []string{"예산 관리", "대시보드"}
	if _, err := store.UpdateConfig(config); err != nil {
		t.Fatal(err)
	}
	saved := store.session.Config
	if !reflect.DeepEqual(saved.HiddenMenus, []string{"예산 관리"}) {
		t.Fatalf("숨긴 메뉴가 저장돼야 합니다: %v", saved.HiddenMenus)
	}
}
