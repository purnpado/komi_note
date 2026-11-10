package vault

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"TeacherNote/internal/survey"
)

// 설문 그림(문항 그림·보기 그림): 영수증 사진처럼 data\survey-images\ 아래 암호화 파일로 둔다.
// 설문을 저장하기 전에 먼저 올리므로 그림 번호는 설문과 따로 만들고, 암호문은 그림 번호에 묶는다.
// 설문이 더는 쓰지 않는 그림은 설문을 저장·삭제할 때 지운다(다른 설문이 쓰면 남김).

const maxSurveyImageSize = 2 << 20

// 저장하지 않고 닫은 설문 화면에서 올린 그림은 하루가 지나면 정리한다.
const orphanSurveyImageAge = 24 * time.Hour

type surveyImagePayload struct {
	MIME string `json:"mime"`
	Data string `json:"data"`
}

func surveyImageAAD(id string) string { return "survey-image-v1:" + id }

func (s *VaultStore) surveyImageDir() string {
	return filepath.Join(filepath.Dir(s.filePath), "survey-images")
}

func (s *VaultStore) surveyImagePath(id string) string {
	return filepath.Join(s.surveyImageDir(), id+".image")
}

// decodeImageData는 "data:image/...;base64," 앞머리가 있어도 없어도 그림 내용을 꺼낸다.
func decodeImageData(value string) ([]byte, error) {
	value = strings.TrimSpace(value)
	if strings.HasPrefix(value, "data:") {
		comma := strings.Index(value, ",")
		if comma < 0 {
			return nil, errors.New("그림 파일을 읽지 못했습니다")
		}
		value = value[comma+1:]
	}
	contents, err := base64.StdEncoding.DecodeString(value)
	if err != nil {
		return nil, errors.New("그림 파일을 읽지 못했습니다")
	}
	return contents, nil
}

// SaveSurveyImage는 화면이 보낸 그림을 검사해 암호화 저장하고 그림 번호를 돌려줍니다.
func (s *VaultStore) SaveSurveyImage(data string) (string, error) {
	contents, err := decodeImageData(data)
	if err != nil {
		return "", err
	}
	defer zeroBytes(contents)
	if len(contents) == 0 || len(contents) > maxSurveyImageSize {
		return "", errors.New("설문 그림은 2MB 이하만 넣을 수 있습니다")
	}
	mime := http.DetectContentType(contents)
	if mime != "image/jpeg" && mime != "image/png" && mime != "image/webp" {
		return "", errors.New("JPG, PNG, WEBP 그림만 넣을 수 있습니다")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return "", errors.New("먼저 보관함을 열어 주세요")
	}
	id, err := newStudentID()
	if err != nil {
		return "", err
	}
	payload, err := json.Marshal(surveyImagePayload{MIME: mime, Data: base64.StdEncoding.EncodeToString(contents)})
	if err != nil {
		return "", errors.New("그림 저장을 준비하지 못했습니다")
	}
	defer zeroBytes(payload)
	encrypted, err := seal(s.sessionKey, payload, surveyImageAAD(id))
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(s.surveyImageDir(), 0o700); err != nil {
		return "", errors.New("설문 그림을 저장하지 못했습니다")
	}
	if err := writeJSONSecure(s.surveyImagePath(id), encrypted); err != nil {
		_ = os.Remove(s.surveyImagePath(id))
		return "", errors.New("설문 그림을 저장하지 못했습니다")
	}
	return id, nil
}

// GetSurveyImage는 그림 종류와 내용을 돌려줍니다. 교실 설문 서버도 이 함수로 그림을 꺼낸다.
func (s *VaultStore) GetSurveyImage(id string) (string, []byte, error) {
	if !survey.ValidImageID(id) {
		return "", nil, errors.New("그림을 찾지 못했습니다")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return "", nil, errors.New("먼저 보관함을 열어 주세요")
	}
	var encrypted encryptedBlob
	if err := readJSON(s.surveyImagePath(id), &encrypted); err != nil {
		return "", nil, errors.New("설문 그림 파일이 없습니다. data 폴더를 함께 옮겼는지 확인해 주세요")
	}
	payload, err := open(s.sessionKey, encrypted, surveyImageAAD(id))
	if err != nil {
		return "", nil, errors.New("설문 그림을 열지 못했습니다")
	}
	defer zeroBytes(payload)
	var image surveyImagePayload
	if err := json.Unmarshal(payload, &image); err != nil {
		return "", nil, errors.New("설문 그림을 열지 못했습니다")
	}
	contents, err := base64.StdEncoding.DecodeString(image.Data)
	if err != nil {
		return "", nil, errors.New("설문 그림을 열지 못했습니다")
	}
	return image.MIME, contents, nil
}

// GetSurveyImageURL은 교사 화면에서 바로 보일 수 있게 그림을 data URL로 돌려줍니다.
func (s *VaultStore) GetSurveyImageURL(id string) (string, error) {
	mime, contents, err := s.GetSurveyImage(id)
	if err != nil {
		return "", err
	}
	defer zeroBytes(contents)
	return "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(contents), nil
}

func (s *VaultStore) surveyImagesInUseLocked() map[string]bool {
	used := map[string]bool{}
	for _, item := range s.session.Surveys {
		for _, id := range survey.ImageIDs(item.Questions) {
			used[id] = true
		}
	}
	return used
}

// missingSurveyImagesLocked는 문항이 가리키지만 파일이 없는 그림이 있는지 확인한다.
func (s *VaultStore) missingSurveyImagesLocked(questions []SurveyQuestion) error {
	for _, id := range survey.ImageIDs(questions) {
		if _, err := os.Stat(s.surveyImagePath(id)); err != nil {
			return errors.New("설문 그림 파일을 찾지 못했습니다. 그림을 다시 넣어 주세요")
		}
	}
	return nil
}

// cleanupSurveyImagesLocked는 어떤 설문도 쓰지 않는 그림을 지운다.
// dropped는 방금 설문에서 빠진 그림(바로 지움), 그 밖의 쓰이지 않는 파일은 하루가 지난 것만 지운다.
func (s *VaultStore) cleanupSurveyImagesLocked(dropped []string) {
	used := s.surveyImagesInUseLocked()
	for _, id := range dropped {
		if !used[id] && survey.ValidImageID(id) {
			_ = os.Remove(s.surveyImagePath(id))
		}
	}
	entries, err := os.ReadDir(s.surveyImageDir())
	if err != nil {
		return
	}
	for _, entry := range entries {
		id, ok := strings.CutSuffix(entry.Name(), ".image")
		if !ok || !survey.ValidImageID(id) || used[id] {
			continue
		}
		info, err := entry.Info()
		if err == nil && time.Since(info.ModTime()) > orphanSurveyImageAge {
			_ = os.Remove(s.surveyImagePath(id))
		}
	}
}

// droppedImages는 예전 문항에는 있었지만 새 문항에는 없는 그림 번호다.
func droppedImages(before, after []SurveyQuestion) []string {
	kept := map[string]bool{}
	for _, id := range survey.ImageIDs(after) {
		kept[id] = true
	}
	result := []string{}
	for _, id := range survey.ImageIDs(before) {
		if !kept[id] {
			result = append(result, id)
		}
	}
	return result
}
