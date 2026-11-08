package system

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
	"unicode/utf16"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// updateDownloadPrefix는 업데이트 실행 파일을 받을 수 있는 유일한 주소 앞부분입니다(GitHub 공개 릴리즈).
const updateDownloadPrefix = "https://github.com/purnpado/komi_note/releases/download/"

// UpdateInfo는 공개 업데이트 채널에서 받는 정보와 화면 표시 상태를 함께 담습니다.
// 학생 정보·암호화 보관함·개인 인증 정보는 포함하지 않습니다.
type UpdateInfo struct {
	CurrentVersion string `json:"currentVersion"`
	LatestVersion  string `json:"latestVersion"`
	DownloadURL    string `json:"downloadURL"`
	SHA256         string `json:"sha256"`
	PublishedAt    string `json:"publishedAt"`
	Notes          string `json:"notes"`
	Signature      string `json:"signature,omitempty"`
	Available      bool   `json:"available"`
	Message        string `json:"message"`
}

// CheckForUpdate는 지정된 매니페스트 주소에서 최신 업데이트 정보를 확인합니다.
func CheckForUpdate() (UpdateInfo, error) {
	info := UpdateInfo{CurrentVersion: AppVersion}
	manifestURL := strings.TrimSpace(UpdateManifestURL)
	if manifestURL == "" {
		info.Message = "이 빌드에서는 업데이트 채널이 설정되지 않았습니다."
		return info, nil
	}

	client := &http.Client{Timeout: 12 * time.Second}
	response, err := client.Get(manifestURL)
	if err != nil {
		return info, fmt.Errorf("업데이트 정보를 확인하지 못했습니다: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode == http.StatusNotFound {
		info.Message = "아직 배포된 업데이트가 없습니다."
		return info, nil
	}
	if response.StatusCode != http.StatusOK {
		return info, fmt.Errorf("업데이트 정보를 확인하지 못했습니다: 서버 응답 %d", response.StatusCode)
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 64*1024)).Decode(&info); err != nil {
		return UpdateInfo{CurrentVersion: AppVersion}, fmt.Errorf("업데이트 정보 형식이 올바르지 않습니다: %w", err)
	}
	// 화면 표시용 값은 서명 대상이 아니므로 서버가 보낸 값을 쓰지 않는다.
	info.CurrentVersion = AppVersion
	info.Available = false
	info.Message = ""
	if err := ValidateUpdateInfo(info); err != nil {
		return UpdateInfo{CurrentVersion: AppVersion}, err
	}
	info.Available = IsNewerVersion(info.LatestVersion, AppVersion)
	if !info.Available && info.Message == "" {
		info.Message = "현재 최신 버전을 사용하고 있습니다."
	}
	return info, nil
}

// InstallAvailableUpdate는 서명된 업데이트 정보와 배포 파일의 해시를 확인한 뒤 프로그램 종료 후 자동 교체·재시작합니다.
func InstallAvailableUpdate() error {
	if runtime.GOOS != "windows" {
		return errors.New("자동 업데이트는 Windows 실행 파일에서만 사용할 수 있습니다")
	}
	info, err := CheckForUpdate()
	if err != nil {
		return err
	}
	if !info.Available {
		return errors.New("설치할 새 버전이 없습니다")
	}

	executablePath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("현재 실행 파일 위치를 확인하지 못했습니다: %w", err)
	}
	executablePath, err = filepath.Abs(executablePath)
	if err != nil {
		return fmt.Errorf("현재 실행 파일 경로를 준비하지 못했습니다: %w", err)
	}
	directory := filepath.Dir(executablePath)
	temporaryFile, err := os.CreateTemp(directory, "꼬미노트-업데이트-*.exe")
	if err != nil {
		return errors.New("프로그램 폴더에 업데이트 파일을 쓸 수 없습니다. 쓰기 가능한 폴더로 옮긴 뒤 다시 시도해 주세요")
	}
	temporaryPath := temporaryFile.Name()
	completed := false
	defer func() {
		_ = temporaryFile.Close()
		if !completed {
			_ = os.Remove(temporaryPath)
		}
	}()

	response, err := (&http.Client{Timeout: 3 * time.Minute}).Get(info.DownloadURL)
	if err != nil {
		return fmt.Errorf("업데이트 파일을 내려받지 못했습니다: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("업데이트 파일을 내려받지 못했습니다: 서버 응답 %d", response.StatusCode)
	}
	hash := sha256.New()
	limitedBody := &io.LimitedReader{R: response.Body, N: 512*1024*1024 + 1}
	if _, err := io.Copy(io.MultiWriter(temporaryFile, hash), limitedBody); err != nil {
		return fmt.Errorf("업데이트 파일을 저장하지 못했습니다: %w", err)
	}
	if limitedBody.N == 0 {
		return errors.New("업데이트 파일 크기가 허용 범위를 넘었습니다")
	}
	if err := temporaryFile.Close(); err != nil {
		return fmt.Errorf("업데이트 파일을 마무리하지 못했습니다: %w", err)
	}
	if !strings.EqualFold(hex.EncodeToString(hash.Sum(nil)), info.SHA256) {
		_ = os.Remove(temporaryPath)
		return errors.New("업데이트 파일의 무결성 확인에 실패했습니다. 설치하지 않았습니다")
	}

	script := "$source = '" + strings.ReplaceAll(temporaryPath, "'", "''") + "'; " +
		"$target = '" + strings.ReplaceAll(executablePath, "'", "''") + "'; " +
		"$deadline = (Get-Date).AddSeconds(60); $replaced = $false; " +
		"do { Start-Sleep -Milliseconds 700; try { Move-Item -LiteralPath $source -Destination $target -Force -ErrorAction Stop; $replaced = $true } catch { } } while (-not $replaced -and (Get-Date) -lt $deadline); " +
		"if ($replaced) { " +
		"$process = Start-Process -FilePath $target -WorkingDirectory (Split-Path -Parent $target) -WindowStyle Normal -PassThru; " +
		"Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class KkomiWindow { [DllImport(\"user32.dll\")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow); [DllImport(\"user32.dll\")] public static extern bool SetForegroundWindow(IntPtr hWnd); }'; " +
		"$deadline2 = (Get-Date).AddSeconds(12); do { Start-Sleep -Milliseconds 250; $process.Refresh(); if ($process.MainWindowHandle -ne 0) { [KkomiWindow]::ShowWindowAsync($process.MainWindowHandle, 9); [KkomiWindow]::SetForegroundWindow($process.MainWindowHandle); break } } while ((Get-Date) -lt $deadline2) " +
		"}"
	encoded := base64.StdEncoding.EncodeToString(utf16Bytes(script))
	if err := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded).Start(); err != nil {
		_ = os.Remove(temporaryPath)
		return fmt.Errorf("업데이트 교체 작업을 시작하지 못했습니다: %w", err)
	}
	completed = true
	if appInst := application.Get(); appInst != nil {
		appInst.Quit()
	}
	return nil
}

func utf16Bytes(value string) []byte {
	encoded := utf16.Encode([]rune(value))
	result := make([]byte, len(encoded)*2)
	for index, character := range encoded {
		result[index*2] = byte(character)
		result[index*2+1] = byte(character >> 8)
	}
	return result
}

// CleanupUpdateArtifacts는 이전 업데이트 실패로 남은 임시 실행 파일·명령 파일만 정리합니다.
func CleanupUpdateArtifacts() {
	path, err := os.Executable()
	if err != nil {
		return
	}
	directory := filepath.Dir(path)
	entries, err := os.ReadDir(directory)
	if err != nil {
		return
	}
	for _, entry := range entries {
		name := entry.Name()
		if strings.HasPrefix(name, "꼬미노트-업데이트-") || strings.HasPrefix(name, "담임노트-업데이트-") || name == "담임노트-업데이트-교체.cmd" {
			_ = os.Remove(filepath.Join(directory, name))
		}
	}
}

func ValidateUpdateInfo(info UpdateInfo) error {
	if strings.TrimSpace(info.LatestVersion) == "" {
		return errors.New("업데이트 정보에 버전이 없습니다")
	}
	if len(info.SHA256) != 64 {
		return errors.New("업데이트 파일의 SHA-256 정보가 올바르지 않습니다")
	}
	if _, err := hex.DecodeString(info.SHA256); err != nil {
		return errors.New("업데이트 파일의 SHA-256 정보가 올바르지 않습니다")
	}
	parsedURL, err := url.Parse(info.DownloadURL)
	if err != nil || parsedURL.Scheme != "https" || !strings.HasPrefix(info.DownloadURL, updateDownloadPrefix) {
		return errors.New("허용되지 않은 업데이트 파일 주소입니다")
	}
	// 주소·해시가 맞아도 서명이 없으면 배포 저장소가 바뀌었을 때 가짜 파일을 막을 수 없다.
	return VerifyUpdateSignature(info, UpdatePublicKey)
}

func IsNewerVersion(candidate, current string) bool {
	candidateParts := versionParts(candidate)
	currentParts := versionParts(current)
	for index := 0; index < 3; index++ {
		if candidateParts[index] != currentParts[index] {
			return candidateParts[index] > currentParts[index]
		}
	}
	candidatePrerelease := versionPrerelease(candidate)
	currentPrerelease := versionPrerelease(current)
	if candidatePrerelease == currentPrerelease {
		return false
	}
	if candidatePrerelease == "" {
		return currentPrerelease != ""
	}
	if currentPrerelease == "" {
		return false
	}
	return prereleaseNumber(candidatePrerelease) > prereleaseNumber(currentPrerelease)
}

func versionParts(value string) [3]int {
	var parts [3]int
	value = strings.TrimPrefix(strings.TrimSpace(value), "v")
	for index, text := range strings.Split(strings.SplitN(value, "-", 2)[0], ".") {
		if index >= len(parts) {
			break
		}
		_, _ = fmt.Sscanf(text, "%d", &parts[index])
	}
	return parts
}

func versionPrerelease(value string) string {
	parts := strings.SplitN(strings.TrimPrefix(strings.TrimSpace(value), "v"), "-", 2)
	if len(parts) < 2 {
		return ""
	}
	return parts[1]
}

func prereleaseNumber(value string) int {
	segments := strings.Split(value, ".")
	if len(segments) == 0 {
		return 0
	}
	var number int
	_, _ = fmt.Sscanf(segments[len(segments)-1], "%d", &number)
	return number
}

