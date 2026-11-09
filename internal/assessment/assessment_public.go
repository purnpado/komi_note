package assessment

import "strings"

// 학생 본인에게만 보여 줄 점수·채점 사유·이의 답변을 고르는 계산입니다.

func assessmentStudentScore(item Assessment, studentID string) (AssessmentStudent, AssessmentScore, bool) {
	var student AssessmentStudent
	for _, value := range item.Students {
		if value.ID == studentID {
			student = value
			break
		}
	}
	if student.ID == "" {
		return AssessmentStudent{}, AssessmentScore{}, false
	}
	for _, score := range item.Scores {
		if score.StudentID == studentID {
			return student, score, true
		}
	}
	return student, AssessmentScore{StudentID: studentID}, true
}

func assessmentPublicDomains(item Assessment, score AssessmentScore) []map[string]any {
	values := map[string]AssessmentDomainScore{}
	for _, domain := range score.Domains {
		values[domain.DomainID] = domain
	}
	result := make([]map[string]any, 0, len(item.Domains))
	for _, domain := range item.Domains {
		criteriaScores := map[string]AssessmentCriterionScore{}
		for _, score := range values[domain.ID].Criteria {
			criteriaScores[score.CriterionID] = score
		}
		criteria := make([]map[string]any, 0, len(domain.Criteria))
		for _, criterion := range domain.Criteria {
			if isLegacyAssessmentImportedCriterion(domain, criterion) {
				continue
			}
			value := criteriaScores[criterion.ID]
			criteria = append(criteria, map[string]any{"name": criterion.Name, "maxScore": criterion.MaxScore, "score": value.Score, "reason": value.Reason, "note": criterion.Note})
		}
		result = append(result, map[string]any{"name": domain.Name, "maxScore": domain.MaxScore, "importedScore": assessmentImportedScore(domain, values[domain.ID]), "criteria": criteria})
	}
	return result
}

func assessmentPublicDomain(item Assessment, score AssessmentScore, domainID string) (map[string]any, bool) {
	domain, ok := assessmentDomain(item, domainID)
	if !ok {
		return nil, false
	}
	criteriaScores := map[string]AssessmentCriterionScore{}
	var importedScore *float64
	for _, domainScore := range score.Domains {
		if domainScore.DomainID != domainID {
			continue
		}
		importedScore = assessmentImportedScore(domain, domainScore)
		for _, criterion := range domainScore.Criteria {
			criteriaScores[criterion.CriterionID] = criterion
		}
	}
	criteria := make([]map[string]any, 0, len(domain.Criteria))
	for _, criterion := range domain.Criteria {
		if isLegacyAssessmentImportedCriterion(domain, criterion) {
			continue
		}
		value := criteriaScores[criterion.ID]
		criteria = append(criteria, map[string]any{"name": criterion.Name, "maxScore": criterion.MaxScore, "score": value.Score, "reason": value.Reason, "note": criterion.Note})
	}
	return map[string]any{"name": domain.Name, "maxScore": domain.MaxScore, "importedScore": importedScore, "criteria": criteria}, true
}

func assessmentHasOpenObjection(item Assessment, studentID, domainID string) bool {
	for _, objection := range item.Objections {
		if objection.StudentID == studentID && objection.Status != "답변 완료" && (objection.DomainID == "" || objection.DomainID == domainID) {
			return true
		}
	}
	return false
}

// assessmentAnsweredObjections는 답변 재확인 QR에서 해당 학생만 볼 수 있는 최소 이력입니다.
func assessmentAnsweredObjections(item Assessment, studentID, domainID string) []map[string]string {
	values := []map[string]string{}
	for _, objection := range item.Objections {
		if objection.StudentID != studentID || objection.Status != "답변 완료" || strings.TrimSpace(objection.Answer) == "" {
			continue
		}
		// 영역 정보가 없던 이전 이의는 같은 학생의 답변 재확인에만 호환 표시합니다.
		if objection.DomainID != "" && objection.DomainID != domainID {
			continue
		}
		values = append(values, map[string]string{"content": objection.Content, "answer": objection.Answer, "answeredAt": objection.AnsweredAt})
	}
	return values
}
