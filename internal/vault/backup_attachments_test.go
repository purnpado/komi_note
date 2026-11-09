package vault

import (
	"encoding/base64"
	"os"
	"path/filepath"
	"testing"
)

func TestBackup학생사진과영수증을함께담고되살린다(t *testing.T) {
	dir := t.TempDir()
	store := newTestVault(t, dir)
	student, err := store.AddStudent(Student{Number: 1, Name: "가상학생", BirthDate: "2013-01-01", TransferInDate: "2026-03-02"})
	if err != nil {
		t.Fatal(err)
	}
	photo := filepath.Join(dir, "p.png")
	os.WriteFile(photo, tinyPNG, 0o600)
	if _, err := store.SaveStudentPhoto(student.ID, photo); err != nil {
		t.Fatal(err)
	}
	ledger, _ := store.SaveBudgetLedger(BudgetLedger{Name: "학급", SchoolYear: "2026"})
	entry, _ := store.SaveBudgetEntry(BudgetEntry{LedgerID: ledger.ID, Date: "2026-11-09", Title: "간식", Amount: 1000})
	withReceipt, err := store.AddBudgetReceipt(entry.ID, "r.png", base64.StdEncoding.EncodeToString(tinyPNG))
	if err != nil {
		t.Fatal(err)
	}
	backupPath := filepath.Join(dir, "백업.kkomi-backup")
	if err := store.ExportBackup(backupPath); err != nil {
		t.Fatal(err)
	}
	// 사진·영수증 폴더를 잃어버린 상황
	os.RemoveAll(filepath.Join(filepath.Dir(store.filePath), "photos"))
	os.RemoveAll(filepath.Join(filepath.Dir(store.filePath), "receipts"))
	if url, _ := store.GetStudentPhoto(student.ID); url != "" {
		t.Fatal("지운 뒤에는 사진이 없어야 합니다")
	}
	result, err := store.RestoreBackup(backupPath, testMaster)
	if err != nil {
		t.Fatal(err)
	}
	if result.AttachmentsRestored != 2 || result.AttachmentsFailed != 0 {
		t.Fatalf("사진 2장 되살림: %+v", result)
	}
	if url, err := store.GetStudentPhoto(student.ID); err != nil || url == "" {
		t.Fatalf("학생 사진이 다시 열려야 합니다: %v", err)
	}
	if _, err := store.GetBudgetReceipt(entry.ID, withReceipt.Receipts[0].ID); err != nil {
		t.Fatalf("영수증이 다시 열려야 합니다: %v", err)
	}
}

func TestBackup이상한첨부이름은건너뛴다(t *testing.T) {
	store := newTestVault(t, t.TempDir())
	restored, failed := store.restoreAttachments(map[string]encryptedBlob{"../vault.dat": {Ciphertext: "x"}, "photos/../../a.photo": {Ciphertext: "x"}, "receipts/abc.receipt": {Ciphertext: "x"}})
	if restored != 1 || failed != 2 {
		t.Fatalf("경로 밖 이름은 거부: %d %d", restored, failed)
	}
}
