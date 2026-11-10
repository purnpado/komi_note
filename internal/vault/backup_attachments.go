package vault

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// 암호화 백업에 학생 사진·영수증 사진을 함께 넣는다.
// 사진 파일은 이미 보관함 키로 암호화돼 있으므로 암호문 그대로 백업 파일 안에 담고,
// 되살릴 때 data\photos·data\receipts에 다시 풀어 둔다. 예전 백업(사진 없음)도 그대로 열린다.

// backupFile은 보관함 파일 형식에 사진·영수증 암호문을 더한 백업 형식이다.
type backupFile struct {
	vaultFile
	Attachments map[string]encryptedBlob `json:"attachments,omitempty"`
}

var attachmentName = regexp.MustCompile(`^(photos/[0-9a-zA-Z_-]+\.photo|receipts/[0-9a-f]+\.receipt|attendance-templates/[0-9a-zA-Z_-]+\.template)$`)

// collectAttachmentsLocked는 보관함 자료가 가리키는 사진·영수증 암호문을 모은다(파일이 없으면 건너뜀).
func (s *VaultStore) collectAttachmentsLocked() map[string]encryptedBlob {
	result := map[string]encryptedBlob{}
	add := func(name, path string) {
		var blob encryptedBlob
		if readJSON(path, &blob) == nil && blob.Ciphertext != "" {
			result[name] = blob
		}
	}
	for _, student := range s.session.Students {
		if student.HasPhoto {
			add("photos/"+student.ID+".photo", s.photoPath(student.ID))
		}
	}
	// 출결 서식 파일(2026-11-10 점검: 예전에는 백업에 빠져 새 PC에서 서류를 만들 수 없었다)
	for _, template := range s.session.AttendanceTemplates {
		add("attendance-templates/"+template.ID+".template", s.attendanceTemplatePath(template.ID))
	}
	if s.session.Budget != nil {
		for _, entry := range s.session.Budget.Entries {
			for _, receipt := range entry.Receipts {
				add("receipts/"+receipt.ID+".receipt", s.receiptPath(receipt.ID))
			}
		}
	}
	return result
}

// restoreAttachments는 백업 안 사진·영수증을 data 폴더에 다시 쓴다. 이름이 이상한 항목은 건너뛴다.
func (s *VaultStore) restoreAttachments(attachments map[string]encryptedBlob) (restored, failed int) {
	dataDir := filepath.Dir(s.filePath)
	for name, blob := range attachments {
		if !attachmentName.MatchString(name) || strings.Contains(name, "..") {
			failed++
			continue
		}
		path := filepath.Join(dataDir, filepath.FromSlash(name))
		if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
			failed++
			continue
		}
		if err := writeJSONSecure(path, blob); err != nil {
			failed++
			continue
		}
		restored++
	}
	return restored, failed
}
