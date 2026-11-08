// sign_update는 배포 담당 PC에서 업데이트 정보(latest.json)에 ed25519 서명을 붙이는 도구입니다.
//
//	키 만들기(한 번만): go run ./cmd/sign_update genkey -out ~/.config/kkomi-note/update-signing.key
//	서명하기:           go run ./cmd/sign_update sign -key ~/.config/kkomi-note/update-signing.key -manifest bin/release/latest.json -exe bin/꼬미노트.exe -version 0.1.1-beta.29 -url https://github.com/purnpado/komi_note/releases/download/v0.1.1-beta.29/kkomi-note.exe -notes "..." -now
//
// -manifest 파일이 없으면 새로 만듭니다.
//
// 개인키 파일은 저장소에 넣지 않습니다. 잃어버리면 새 키를 만들고 공개키를 바꾼 실행 파일을 직접 배포해야 합니다.
package main

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"TeacherNote/internal/system"
)

type manifest struct {
	LatestVersion string `json:"latestVersion"`
	DownloadURL   string `json:"downloadURL"`
	SHA256        string `json:"sha256"`
	PublishedAt   string `json:"publishedAt"`
	Notes         string `json:"notes"`
	Signature     string `json:"signature"`
}

func main() {
	if len(os.Args) < 2 {
		fail(errors.New("사용법: sign_update genkey|sign [옵션]"))
	}
	var err error
	switch os.Args[1] {
	case "genkey":
		err = genkey(os.Args[2:])
	case "sign":
		err = sign(os.Args[2:])
	default:
		err = fmt.Errorf("알 수 없는 명령: %s", os.Args[1])
	}
	if err != nil {
		fail(err)
	}
}

func fail(err error) {
	fmt.Fprintln(os.Stderr, "오류:", err)
	os.Exit(1)
}

func genkey(args []string) error {
	flags := flag.NewFlagSet("genkey", flag.ExitOnError)
	out := flags.String("out", "", "개인키를 저장할 경로(저장소 밖)")
	_ = flags.Parse(args)
	if *out == "" {
		return errors.New("-out 경로가 필요합니다")
	}
	if _, err := os.Stat(*out); err == nil {
		return errors.New("이미 키 파일이 있습니다. 덮어쓰지 않습니다")
	}
	publicKey, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(*out), 0o700); err != nil {
		return err
	}
	if err := os.WriteFile(*out, []byte(base64.StdEncoding.EncodeToString(privateKey.Seed())+"\n"), 0o600); err != nil {
		return err
	}
	fmt.Println("개인키 저장:", *out)
	fmt.Println("공개키(internal/system/update_signature.go의 UpdatePublicKey에 넣기):")
	fmt.Println(base64.StdEncoding.EncodeToString(publicKey))
	return nil
}

func sign(args []string) error {
	flags := flag.NewFlagSet("sign", flag.ExitOnError)
	keyPath := flags.String("key", "", "개인키 파일 경로")
	manifestPath := flags.String("manifest", "updates/latest.json", "업데이트 정보 파일")
	exePath := flags.String("exe", "", "배포할 실행 파일(주면 SHA-256을 다시 계산)")
	version := flags.String("version", "", "새 버전(선택)")
	notes := flags.String("notes", "", "한국어 변경 기록(선택)")
	published := flags.Bool("now", false, "게시 시각을 지금으로 바꾸기")
	downloadURL := flags.String("url", "", "실행 파일 내려받기 주소(선택)")
	_ = flags.Parse(args)

	seedText, err := os.ReadFile(*keyPath)
	if err != nil {
		return fmt.Errorf("개인키를 읽지 못했습니다: %w", err)
	}
	seed, err := base64.StdEncoding.DecodeString(strings.TrimSpace(string(seedText)))
	if err != nil || len(seed) != ed25519.SeedSize {
		return errors.New("개인키 형식이 올바르지 않습니다")
	}
	privateKey := ed25519.NewKeyFromSeed(seed)

	var current manifest
	raw, err := os.ReadFile(*manifestPath)
	switch {
	case err == nil:
		if err := json.Unmarshal(raw, &current); err != nil {
			return fmt.Errorf("업데이트 정보 형식 오류: %w", err)
		}
	case errors.Is(err, os.ErrNotExist):
		if err := os.MkdirAll(filepath.Dir(*manifestPath), 0o755); err != nil {
			return err
		}
	default:
		return err
	}
	if *downloadURL != "" {
		current.DownloadURL = *downloadURL
	}
	if *exePath != "" {
		file, err := os.Open(*exePath)
		if err != nil {
			return err
		}
		hash := sha256.New()
		_, err = io.Copy(hash, file)
		file.Close()
		if err != nil {
			return err
		}
		current.SHA256 = hex.EncodeToString(hash.Sum(nil))
	}
	if *version != "" {
		current.LatestVersion = *version
	}
	if *notes != "" {
		current.Notes = *notes
	}
	if *published {
		current.PublishedAt = time.Now().Format(time.RFC3339)
	}
	if current.LatestVersion == "" || current.DownloadURL == "" || current.SHA256 == "" {
		return errors.New("버전(-version)·주소(-url)·실행 파일(-exe)이 모두 필요합니다")
	}
	info := system.UpdateInfo{LatestVersion: current.LatestVersion, DownloadURL: current.DownloadURL, SHA256: current.SHA256, PublishedAt: current.PublishedAt, Notes: current.Notes}
	current.Signature = system.SignUpdateInfo(info, privateKey)
	info.Signature = current.Signature
	if err := system.VerifyUpdateSignature(info, base64.StdEncoding.EncodeToString(privateKey.Public().(ed25519.PublicKey))); err != nil {
		return err
	}
	output, err := json.MarshalIndent(current, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(*manifestPath, append(output, '\n'), 0o644); err != nil {
		return err
	}
	fmt.Println("서명 완료:", *manifestPath, current.LatestVersion)
	return nil
}
