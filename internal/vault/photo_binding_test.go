package vault

import (
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func newPhotoTestStore(t *testing.T) (*VaultStore, string) {
	t.Helper()
	directory := t.TempDir()
	store := &VaultStore{filePath: filepath.Join(directory, "data", "vault.dat")}
	request := SetupRequest{Config: ClassConfig{SchoolYear: "2026", Grade: "2", ClassNumber: "3", AutoLockMinutes: 5}, MasterPassword: "안전한마스터암호1234", RecoveryPassword: "안전한복구암호1234", RecoveryFilePath: filepath.Join(directory, "복구.teacher-recovery")}
	if _, err := store.Initialize(request); err != nil {
		t.Fatal(err)
	}
	store.session.Students = []Student{{ID: "student-one", Number: 1, Name: "가상하나"}, {ID: "student-two", Number: 2, Name: "가상둘"}}
	if err := store.writeCurrentVaultLocked(); err != nil {
		t.Fatal(err)
	}
	return store, directory
}

func Test다른학생사진파일로바꿔치기하면열리지않는다(t *testing.T) {
	store, directory := newPhotoTestStore(t)
	source := filepath.Join(directory, "사진.png")
	if err := os.WriteFile(source, []byte{0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a}, 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := store.SaveStudentPhoto("student-one", source); err != nil {
		t.Fatal(err)
	}
	contents, err := os.ReadFile(store.photoPath("student-one"))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(store.photoPath("student-two"), contents, 0600); err != nil {
		t.Fatal(err)
	}
	if photo, err := store.GetStudentPhoto("student-two"); err == nil {
		t.Fatalf("바꿔 넣은 사진이 열렸습니다: %q", photo[:20])
	}
	if photo, err := store.GetStudentPhoto("student-one"); err != nil || !strings.HasPrefix(photo, "data:image/png;base64,") {
		t.Fatalf("원래 학생 사진 읽기 실패: %v", err)
	}
}

func Test예전방식사진은열리고학생ID방식으로바뀐다(t *testing.T) {
	store, _ := newPhotoTestStore(t)
	payload, _ := json.Marshal(studentPhoto{MIME: "image/png", Data: base64.StdEncoding.EncodeToString([]byte("가상사진"))})
	legacy, err := seal(store.sessionKey, payload, legacyStudentPhotoAAD)
	if err != nil {
		t.Fatal(err)
	}
	if err := writeJSONSecure(store.photoPath("student-one"), legacy); err != nil {
		t.Fatal(err)
	}
	if photo, err := store.GetStudentPhoto("student-one"); err != nil || !strings.HasPrefix(photo, "data:image/png;base64,") {
		t.Fatalf("예전 사진 읽기 실패: %v", err)
	}
	var migrated encryptedBlob
	if err := readJSON(store.photoPath("student-one"), &migrated); err != nil {
		t.Fatal(err)
	}
	if _, err := open(store.sessionKey, migrated, studentPhotoAAD("student-one")); err != nil {
		t.Fatalf("학생 ID 방식으로 다시 저장되지 않았습니다: %v", err)
	}
}
