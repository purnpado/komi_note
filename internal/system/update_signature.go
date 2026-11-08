package system

import (
	"crypto/ed25519"
	"encoding/base64"
	"errors"
	"strings"
)

// UpdatePublicKey는 업데이트 정보(latest.json) 서명을 확인하는 ed25519 공개키(base64)입니다.
// 짝이 되는 개인키는 저장소 밖(배포 담당 PC)에만 두며, 이 값은 공개되어도 안전합니다.
// 배포 빌드에서 -ldflags로 바꿀 수 있습니다.
var UpdatePublicKey = "84Gt1crTTXolpavBXUSS7INb6tqufdq5h5t0tDo5RM0="

const updateSignatureContext = "kkomi-update-v1"

// UpdateSigningMessage는 서명 대상이 되는 업데이트 정보를 정해진 순서의 바이트로 만듭니다.
// 버전·내려받기 주소·SHA-256·게시 시각·변경 기록이 하나라도 바뀌면 서명이 맞지 않습니다.
func UpdateSigningMessage(info UpdateInfo) []byte {
	parts := []string{
		updateSignatureContext,
		strings.TrimSpace(info.LatestVersion),
		strings.TrimSpace(info.DownloadURL),
		strings.ToLower(strings.TrimSpace(info.SHA256)),
		strings.TrimSpace(info.PublishedAt),
		info.Notes,
	}
	return []byte(strings.Join(parts, "\n"))
}

// SignUpdateInfo는 배포 도구에서 개인키로 업데이트 정보에 서명합니다.
func SignUpdateInfo(info UpdateInfo, privateKey ed25519.PrivateKey) string {
	return base64.StdEncoding.EncodeToString(ed25519.Sign(privateKey, UpdateSigningMessage(info)))
}

// VerifyUpdateSignature는 내장 공개키로 업데이트 정보의 서명을 확인합니다.
func VerifyUpdateSignature(info UpdateInfo, publicKeyBase64 string) error {
	publicKey, err := base64.StdEncoding.DecodeString(strings.TrimSpace(publicKeyBase64))
	if err != nil || len(publicKey) != ed25519.PublicKeySize {
		return errors.New("이 빌드에는 업데이트 서명 확인 키가 없어 자동 업데이트를 사용할 수 없습니다")
	}
	signature, err := base64.StdEncoding.DecodeString(strings.TrimSpace(info.Signature))
	if err != nil || len(signature) != ed25519.SignatureSize {
		return errors.New("업데이트 정보에 올바른 서명이 없습니다. 설치하지 않았습니다")
	}
	if !ed25519.Verify(ed25519.PublicKey(publicKey), UpdateSigningMessage(info), signature) {
		return errors.New("업데이트 정보의 서명이 맞지 않습니다. 꼬미노트 공식 배포가 아닐 수 있어 설치하지 않았습니다")
	}
	return nil
}
