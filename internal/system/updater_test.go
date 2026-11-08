package system

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"os"
	"testing"
)

// useTestUpdateKey는 테스트 동안만 임시 공개키를 내장 키로 쓴다.
func useTestUpdateKey(t *testing.T) ed25519.PrivateKey {
	t.Helper()
	publicKey, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	previous := UpdatePublicKey
	UpdatePublicKey = base64.StdEncoding.EncodeToString(publicKey)
	t.Cleanup(func() { UpdatePublicKey = previous })
	return privateKey
}

func TestIsNewerVersion(t *testing.T) {
	cases := []struct {
		candidate string
		current   string
		want      bool
	}{
		{"0.1.0-beta.2", "0.1.0-beta.1", true},
		{"0.1.1-beta.1", "0.1.0-beta.9", true},
		{"0.2.0", "0.1.9", true},
		{"0.1.0", "0.1.0-beta.3", true},
		{"0.1.0-beta.3", "0.1.0", false},
		{"0.1.0-beta.3", "0.1.0-beta.2", true},
	}
	for _, test := range cases {
		if got := IsNewerVersion(test.candidate, test.current); got != test.want {
			t.Errorf("IsNewerVersion(%q, %q) = %v, want %v", test.candidate, test.current, got, test.want)
		}
	}
}

func TestValidateUpdateInfo(t *testing.T) {
	valid := UpdateInfo{
		LatestVersion: "0.1.1-beta.1",
		DownloadURL:   updateDownloadPrefix + "꼬미노트.exe",
		SHA256:        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
	}
	privateKey := useTestUpdateKey(t)
	valid.Signature = SignUpdateInfo(valid, privateKey)
	if err := ValidateUpdateInfo(valid); err != nil {
		t.Fatalf("유효한 업데이트 정보를 거부했습니다: %v", err)
	}
	valid.DownloadURL = "https://example.com/꼬미노트.exe"
	if err := ValidateUpdateInfo(valid); err == nil {
		t.Fatal("허용되지 않은 내려받기 주소를 허용했습니다")
	}
}


func TestUpdateSignatureRejectsTampering(t *testing.T) {
	privateKey := useTestUpdateKey(t)
	info := UpdateInfo{
		LatestVersion: "0.1.1-beta.29",
		DownloadURL:   updateDownloadPrefix + "꼬미노트.exe",
		SHA256:        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
		PublishedAt:   "2026-11-08T00:00:00+09:00",
		Notes:         "가상 변경 기록",
	}
	unsigned := info
	if err := ValidateUpdateInfo(unsigned); err == nil {
		t.Fatal("서명 없는 업데이트 정보를 허용했습니다")
	}
	info.Signature = SignUpdateInfo(info, privateKey)
	for name, change := range map[string]func(*UpdateInfo){
		"해시":   func(item *UpdateInfo) { item.SHA256 = "f" + item.SHA256[1:] },
		"버전":   func(item *UpdateInfo) { item.LatestVersion = "9.9.9" },
		"변경기록": func(item *UpdateInfo) { item.Notes += "!" },
	} {
		tampered := info
		change(&tampered)
		if err := ValidateUpdateInfo(tampered); err == nil {
			t.Errorf("%s를 바꾼 업데이트 정보를 허용했습니다", name)
		}
	}
	_, otherKey, _ := ed25519.GenerateKey(rand.Reader)
	forged := info
	forged.Signature = SignUpdateInfo(info, otherKey)
	if err := ValidateUpdateInfo(forged); err == nil {
		t.Fatal("다른 키로 서명한 업데이트 정보를 허용했습니다")
	}
}

func TestPublishedManifestIsSignedWithEmbeddedKey(t *testing.T) {
	raw, err := os.ReadFile("../../updates/latest.json")
	if err != nil {
		t.Skip("updates/latest.json 없음")
	}
	var info UpdateInfo
	if err := json.Unmarshal(raw, &info); err != nil {
		t.Fatal(err)
	}
	// updates/는 예전 수동 베타 채널이라 주소 검사는 하지 않고 서명만 확인한다.
	if err := VerifyUpdateSignature(info, UpdatePublicKey); err != nil {
		t.Fatalf("저장소의 latest.json이 내장 공개키 서명과 맞지 않습니다: %v", err)
	}
}

func TestEmptyPublicKeyRefusesUpdates(t *testing.T) {
	previous := UpdatePublicKey
	UpdatePublicKey = ""
	t.Cleanup(func() { UpdatePublicKey = previous })
	info := UpdateInfo{LatestVersion: "1.0.0", DownloadURL: updateDownloadPrefix + "a.exe", SHA256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef", Signature: "x"}
	if err := ValidateUpdateInfo(info); err == nil {
		t.Fatal("공개키가 없는 빌드가 업데이트를 허용했습니다")
	}
}
