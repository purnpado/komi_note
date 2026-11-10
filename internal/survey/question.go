package survey

import (
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"
)

// 문항 유형. "5점 척도"는 예전 설문을 그대로 열기 위한 유형이며 새 문항은 "척도"를 쓴다.
const (
	TypeSingle      = "단일 선택"
	TypeMulti       = "복수 선택"
	TypeDropdown    = "목록 선택"
	TypeShort       = "단답"
	TypeLong        = "서술"
	TypeScale       = "척도"
	TypeLegacyScale = "5점 척도"
)

// OtherPrefix는 "기타(직접 입력)" 답 앞에 붙는 표시다. 예: "기타: 체육 대회"
const OtherPrefix = "기타: "

const (
	maxQuestions      = 50
	maxQuestionText   = 200
	maxDescription    = 500
	maxOptions        = 30
	maxOptionText     = 100
	maxScaleLabel     = 30
	maxShortAnswer    = 200
	maxLongAnswer     = 2000
	maxOtherAnswer    = 100
	defaultScaleSteps = 5
	// MaxImages는 설문 하나에 넣을 수 있는 그림(문항 그림+보기 그림) 수다.
	MaxImages = 20
)

var imageIDPattern = regexp.MustCompile(`^[0-9a-f]{32}$`)

// ValidImageID는 그림 번호 모양이 맞는지 알려 준다(파일 경로에 쓰이므로 꼭 확인).
func ValidImageID(id string) bool { return imageIDPattern.MatchString(id) }

// OptionImagesAllowed는 보기마다 그림을 붙일 수 있는 유형인지 알려 준다(목록·척도는 그림을 보일 자리가 없음).
func OptionImagesAllowed(questionType string) bool {
	return questionType == TypeSingle || questionType == TypeMulti
}

// ImageIDs는 설문 문항들이 쓰는 그림 번호를 겹치지 않게 모은다.
func ImageIDs(questions []SurveyQuestion) []string {
	seen := map[string]bool{}
	result := []string{}
	add := func(id string) {
		if id != "" && !seen[id] {
			seen[id] = true
			result = append(result, id)
		}
	}
	for _, question := range questions {
		add(question.ImageID)
		for _, id := range question.OptionImages {
			add(id)
		}
	}
	return result
}

var legacyScaleOptions = []string{"1점 매우 아쉬움", "2점 아쉬움", "3점 보통", "4점 만족", "5점 매우 만족"}

// IsChoice는 보기를 고르는 유형인지 알려 준다.
func IsChoice(questionType string) bool {
	switch questionType {
	case TypeSingle, TypeMulti, TypeDropdown, TypeScale, TypeLegacyScale:
		return true
	}
	return false
}

// IsText는 글로 답하는 유형인지 알려 준다.
func IsText(questionType string) bool { return questionType == TypeShort || questionType == TypeLong }

// ScaleOptions는 척도 문항의 보기("1"~"N")를 만든다.
func ScaleOptions(steps int) []string {
	if steps != 10 {
		steps = defaultScaleSteps
	}
	options := make([]string, steps)
	for index := range options {
		options[index] = strconv.Itoa(index + 1)
	}
	return options
}

func tooLong(value string, limit int) bool { return utf8.RuneCountInString(value) > limit }

// NormalizeQuestions는 문항을 다듬고 검사한다. newID는 비어 있는 문항 번호를 채운다.
func NormalizeQuestions(questions []SurveyQuestion, newID func() string) ([]SurveyQuestion, error) {
	if len(questions) == 0 {
		return nil, errors.New("설문 문항을 한 개 이상 입력해 주세요")
	}
	if len(questions) > maxQuestions {
		return nil, fmt.Errorf("문항은 %d개까지 만들 수 있습니다", maxQuestions)
	}
	result := make([]SurveyQuestion, 0, len(questions))
	seen := map[string]bool{}
	images := 0
	for index, question := range questions {
		label := fmt.Sprintf("%d번 문항", index+1)
		question.Text = strings.TrimSpace(question.Text)
		question.Description = strings.TrimSpace(question.Description)
		if question.Type == "" {
			question.Type = TypeSingle
		}
		if !IsChoice(question.Type) && !IsText(question.Type) {
			return nil, fmt.Errorf("%s의 유형을 확인해 주세요", label)
		}
		if question.Text == "" {
			return nil, fmt.Errorf("%s의 질문을 입력해 주세요", label)
		}
		if tooLong(question.Text, maxQuestionText) {
			return nil, fmt.Errorf("%s의 질문은 %d자까지 쓸 수 있습니다", label, maxQuestionText)
		}
		if tooLong(question.Description, maxDescription) {
			return nil, fmt.Errorf("%s의 설명은 %d자까지 쓸 수 있습니다", label, maxDescription)
		}
		question.ImageID = strings.TrimSpace(question.ImageID)
		if question.ImageID != "" && !ValidImageID(question.ImageID) {
			return nil, fmt.Errorf("%s의 그림을 다시 넣어 주세요", label)
		}
		if err := normalizeOptions(&question, label); err != nil {
			return nil, err
		}
		images += boolInt(question.ImageID != "")
		for _, id := range question.OptionImages {
			images += boolInt(id != "")
		}
		if images > MaxImages {
			return nil, fmt.Errorf("그림은 설문 하나에 %d장까지 넣을 수 있습니다", MaxImages)
		}
		if question.ID == "" || seen[question.ID] {
			question.ID = newID()
		}
		seen[question.ID] = true
		result = append(result, question)
	}
	return result, nil
}

func normalizeOptions(question *SurveyQuestion, label string) error {
	if IsText(question.Type) {
		question.Options = []string{}
		question.AllowOther, question.MaxChoices, question.ScaleSteps = false, 0, 0
		question.ScaleMinLabel, question.ScaleMaxLabel = "", ""
		question.OptionImages = nil
		return nil
	}
	if !OptionImagesAllowed(question.Type) {
		question.OptionImages = nil
	}
	switch question.Type {
	case TypeScale:
		if question.ScaleSteps != 10 {
			question.ScaleSteps = defaultScaleSteps
		}
		question.Options = ScaleOptions(question.ScaleSteps)
		question.ScaleMinLabel = strings.TrimSpace(question.ScaleMinLabel)
		question.ScaleMaxLabel = strings.TrimSpace(question.ScaleMaxLabel)
		if tooLong(question.ScaleMinLabel, maxScaleLabel) || tooLong(question.ScaleMaxLabel, maxScaleLabel) {
			return fmt.Errorf("%s의 척도 양 끝 이름은 %d자까지 쓸 수 있습니다", label, maxScaleLabel)
		}
		question.AllowOther, question.MaxChoices = false, 0
		return nil
	case TypeLegacyScale:
		if len(question.Options) < 2 {
			question.Options = append([]string{}, legacyScaleOptions...)
		}
	}
	options := make([]string, 0, len(question.Options))
	optionImages := make([]string, 0, len(question.Options))
	hasOptionImage := false
	seen := map[string]bool{}
	for index, option := range question.Options {
		text := strings.TrimSpace(option)
		image := ""
		if index < len(question.OptionImages) {
			image = strings.TrimSpace(question.OptionImages[index])
		}
		if text == "" {
			if image != "" {
				return fmt.Errorf("%s의 그림을 넣은 보기에 글(예: 1번 그림)도 써 주세요", label)
			}
			continue
		}
		if image != "" && !ValidImageID(image) {
			return fmt.Errorf("%s의 보기 그림을 다시 넣어 주세요", label)
		}
		if tooLong(text, maxOptionText) {
			return fmt.Errorf("%s의 보기는 %d자까지 쓸 수 있습니다", label, maxOptionText)
		}
		if strings.HasPrefix(text, OtherPrefix) {
			return fmt.Errorf("%s의 보기는 '기타:'로 시작할 수 없습니다. 기타 칸은 '기타(직접 입력)'를 켜 주세요", label)
		}
		if seen[text] {
			return fmt.Errorf("%s에 같은 보기 '%s'가 두 번 있습니다", label, text)
		}
		seen[text] = true
		options = append(options, text)
		optionImages = append(optionImages, image)
		hasOptionImage = hasOptionImage || image != ""
	}
	if len(options) > maxOptions {
		return fmt.Errorf("%s의 보기는 %d개까지 만들 수 있습니다", label, maxOptions)
	}
	minimum := 2
	if question.AllowOther {
		minimum = 1
	}
	if len(options) < minimum {
		return fmt.Errorf("%s에는 보기가 두 개 이상 필요합니다", label)
	}
	question.Options = options
	question.OptionImages = nil
	if hasOptionImage {
		question.OptionImages = optionImages
	}
	question.ScaleSteps, question.ScaleMinLabel, question.ScaleMaxLabel = 0, "", ""
	if question.Type != TypeMulti {
		question.MaxChoices = 0
	} else if question.MaxChoices < 0 || question.MaxChoices >= len(options)+boolInt(question.AllowOther) {
		question.MaxChoices = 0
	}
	if question.Type == TypeLegacyScale || question.Type == TypeDropdown {
		question.AllowOther = question.Type == TypeDropdown && question.AllowOther
	}
	return nil
}

func boolInt(value bool) int {
	if value {
		return 1
	}
	return 0
}

// ValidateAnswers는 학생이 낸 답을 문항과 맞춰 검사하고, 다듬은 답을 돌려준다.
// 선택 문항(optional)이 아니면 꼭 답해야 한다. 문항에 없는 답은 버린다.
func ValidateAnswers(questions []SurveyQuestion, answers map[string]string, multi map[string][]string) (map[string]string, map[string][]string, error) {
	cleanAnswers := map[string]string{}
	cleanMulti := map[string][]string{}
	for index, question := range questions {
		label := fmt.Sprintf("%d번 문항", index+1)
		if question.Type == TypeMulti {
			picked, err := validateMulti(question, multi[question.ID], label)
			if err != nil {
				return nil, nil, err
			}
			if len(picked) > 0 {
				cleanMulti[question.ID] = picked
			}
			continue
		}
		value := strings.TrimSpace(answers[question.ID])
		if value == "" {
			if !question.Optional {
				return nil, nil, fmt.Errorf("%s에 답해 주세요", label)
			}
			continue
		}
		if IsText(question.Type) {
			limit := maxShortAnswer
			if question.Type == TypeLong {
				limit = maxLongAnswer
			}
			if tooLong(value, limit) {
				return nil, nil, fmt.Errorf("%s의 답은 %d자까지 쓸 수 있습니다", label, limit)
			}
			cleanAnswers[question.ID] = value
			continue
		}
		cleaned, ok := choiceAllowed(question, value)
		if !ok {
			return nil, nil, fmt.Errorf("%s의 보기를 다시 골라 주세요", label)
		}
		cleanAnswers[question.ID] = cleaned
	}
	return cleanAnswers, cleanMulti, nil
}

func validateMulti(question SurveyQuestion, values []string, label string) ([]string, error) {
	picked := []string{}
	seen := map[string]bool{}
	for _, raw := range values {
		value := strings.TrimSpace(raw)
		if value == "" {
			continue
		}
		cleaned, ok := choiceAllowed(question, value)
		if !ok {
			return nil, fmt.Errorf("%s의 보기를 다시 골라 주세요", label)
		}
		if !seen[cleaned] {
			seen[cleaned] = true
			picked = append(picked, cleaned)
		}
	}
	if len(picked) == 0 && !question.Optional {
		return nil, fmt.Errorf("%s에서 하나 이상 골라 주세요", label)
	}
	if question.MaxChoices > 0 && len(picked) > question.MaxChoices {
		return nil, fmt.Errorf("%s은 %d개까지 고를 수 있습니다", label, question.MaxChoices)
	}
	return picked, nil
}

// choiceAllowed는 보기에 있는 답인지, 또는 허용된 "기타: …" 답인지 확인한다.
func choiceAllowed(question SurveyQuestion, value string) (string, bool) {
	for _, option := range question.Options {
		if option == value {
			return value, true
		}
	}
	if question.AllowOther && strings.HasPrefix(value, OtherPrefix) {
		text := strings.TrimSpace(strings.TrimPrefix(value, OtherPrefix))
		if text == "" || tooLong(text, maxOtherAnswer) {
			return "", false
		}
		return OtherPrefix + text, true
	}
	return "", false
}

// ChoiceCounts는 고르기 문항의 보기별 응답 수를 센다. "기타: …" 답은 "기타"로 묶는다.
func ChoiceCounts(question SurveyQuestion, responses []SurveyResponse) map[string]int {
	counts := map[string]int{}
	for _, option := range question.Options {
		counts[option] = 0
	}
	if question.AllowOther {
		counts["기타"] = 0
	}
	add := func(value string) {
		if strings.HasPrefix(value, OtherPrefix) {
			if question.AllowOther {
				counts["기타"]++
			}
			return
		}
		if _, ok := counts[value]; ok {
			counts[value]++
		}
	}
	for _, response := range responses {
		if question.Type == TypeMulti {
			for _, value := range response.MultiAnswers[question.ID] {
				add(value)
			}
			continue
		}
		if value, ok := response.Answers[question.ID]; ok {
			add(value)
		}
	}
	return counts
}
