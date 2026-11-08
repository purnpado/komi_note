package submissions

// SubmissionDocument는 담임이 관리하는 학생 제출서류 항목입니다.
type SubmissionDocument struct {
	ID        string             `json:"id"`
	Title     string             `json:"title"`
	DueDate   string             `json:"dueDate"`
	Note      string             `json:"note"`
	Statuses  []SubmissionStatus `json:"statuses"`
	CreatedAt string             `json:"createdAt"`
	UpdatedAt string             `json:"updatedAt"`
}

// SubmissionStatus는 서류 항목별 학생 제출 상태입니다.
type SubmissionStatus struct {
	StudentID string `json:"studentId"`
	Status    string `json:"status"`
	Note      string `json:"note"`
	UpdatedAt string `json:"updatedAt"`
}

