package vault

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

// 학생 사진 암호화 저장과 읽기입니다.

const maxStudentPhotoSize = 5 * 1024 * 1024

type studentPhoto struct {
	MIME string `json:"mime"`
	Data string `json:"data"`
}

func (s *VaultStore) SaveStudentPhoto(studentID, path string) (Student, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return Student{}, errors.New("먼저 보관함을 열어 주세요")
	}
	student, index := findStudent(s.session.Students, studentID)
	if index < 0 {
		return Student{}, errors.New("학생을 찾지 못했습니다")
	}
	contents, err := os.ReadFile(path)
	if err != nil {
		return Student{}, fmt.Errorf("사진 파일을 읽지 못했습니다: %w", err)
	}
	defer zeroBytes(contents)
	if len(contents) == 0 || len(contents) > maxStudentPhotoSize {
		return Student{}, errors.New("사진은 5MB 이하의 이미지 파일만 사용할 수 있습니다")
	}
	mime := http.DetectContentType(contents)
	if mime != "image/jpeg" && mime != "image/png" && mime != "image/webp" {
		return Student{}, errors.New("JPG, PNG, WEBP 사진 파일만 사용할 수 있습니다")
	}
	payload, err := json.Marshal(studentPhoto{MIME: mime, Data: base64.StdEncoding.EncodeToString(contents)})
	if err != nil {
		return Student{}, errors.New("사진 저장을 준비하지 못했습니다")
	}
	defer zeroBytes(payload)
	encrypted, err := seal(s.sessionKey, payload, studentPhotoAAD(studentID))
	if err != nil {
		return Student{}, err
	}
	if err := writeJSONSecure(s.photoPath(studentID), encrypted); err != nil {
		return Student{}, fmt.Errorf("학생 사진을 저장하지 못했습니다: %w", err)
	}
	student.HasPhoto = true
	s.session.Students[index] = student
	s.session.UpdatedAt = time.Now().UTC()
	if err := s.writeCurrentVaultLocked(); err != nil {
		return Student{}, err
	}
	return student, nil
}

func (s *VaultStore) GetStudentPhoto(studentID string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return "", errors.New("먼저 보관함을 열어 주세요")
	}
	if _, index := findStudent(s.session.Students, studentID); index < 0 {
		return "", errors.New("학생을 찾지 못했습니다")
	}
	var encrypted encryptedBlob
	if err := readJSON(s.photoPath(studentID), &encrypted); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "", nil
		}
		return "", errors.New("학생 사진을 읽지 못했습니다")
	}
	payload, err := open(s.sessionKey, encrypted, studentPhotoAAD(studentID))
	if err != nil {
		// 2026-11 이전 사진은 학생 ID 없이 암호화되었다. 예전 방식으로 열리면
		// 이 학생 ID를 넣어 다시 암호화해 둔다. 다시 저장에 실패해도 사진은 보여 준다.
		legacy, legacyErr := open(s.sessionKey, encrypted, legacyStudentPhotoAAD)
		if legacyErr != nil {
			return "", errors.New("학생 사진을 열지 못했습니다")
		}
		payload = legacy
		if resealed, sealErr := seal(s.sessionKey, payload, studentPhotoAAD(studentID)); sealErr == nil {
			_ = writeJSONSecure(s.photoPath(studentID), resealed)
		}
	}
	defer zeroBytes(payload)
	var photo studentPhoto
	if err := json.Unmarshal(payload, &photo); err != nil {
		return "", errors.New("학생 사진 형식이 올바르지 않습니다")
	}
	return "data:" + photo.MIME + ";base64," + photo.Data, nil
}

// legacyStudentPhotoAAD는 학생 ID를 묶기 전 사진의 추가 인증 값이다. 읽기 호환에만 쓴다.
const legacyStudentPhotoAAD = "student-photo-v1"

// studentPhotoAAD는 사진 암호문을 해당 학생 ID에 묶는다.
// 다른 학생의 사진 파일을 이 학생 이름으로 바꿔 넣으면 열리지 않는다.
func studentPhotoAAD(studentID string) string {
	return "student-photo-v2:" + studentID
}

func (s *VaultStore) photoPath(studentID string) string {
	return filepath.Join(filepath.Dir(s.filePath), "photos", studentID+".photo")
}
