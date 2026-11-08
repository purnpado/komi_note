// Package records는 학교생활기록(교과세특·창체·행동특성·자유학기제)의
// 관찰 메모와 기재 문장을 정리·검사하는 규칙을 담당합니다. 저장은 vault 패키지가
// 암호화 보관함에 합니다. 학생은 가리키는 값(StudentKey)만 다루며
// 생년월일·연락처·주소 같은 기본정보는 저장하지 않습니다.
package records

import (
	"errors"
	"fmt"
	"regexp"
	"strings"
	"unicode/utf8"
)

// 기록 영역입니다.
const (
	AreaSubject      = "subject"      // 교과세특(과목별 세부능력 및 특기사항)
	AreaAutonomy     = "autonomy"     // 창체 자율·자치활동
	AreaClub         = "club"         // 창체 동아리활동
	AreaCareer       = "career"       // 창체 진로활동
	AreaBehavior     = "behavior"     // 행동특성 및 종합의견(담임)
	AreaFreeSemester = "freeSemester" // 자유학기 활동
)

// 기록 대상 명단의 종류입니다.
const (
	TargetHomeroom = "homeroom" // 담임 학급 학생 명렬(학생 ID)
	TargetCourse   = "course"   // 수업 명렬("번호|이름")
	TargetList     = "list"     // 교사가 만든 활동 명단("학년-반-번호|이름")
)

const (
	maxEntries      = 20000
	maxMemos        = 200
	maxMemoRunes    = 1000
	maxTextRunes    = 4000
	maxLists        = 100
	maxListMembers  = 300
	maxListName     = 40
	maxSubjectRunes = 40
	maxKeyRunes     = 120
	maxIDRunes      = 80
	minLimit        = 50
	maxLimit        = 2000
)

// DefaultLimits는 영역별 기본 글자 수 한도입니다(나이스 바이트는 한글 기준 3배).
// 학교 기재요령에 따라 환경 설정에서 바꿀 수 있습니다.
var DefaultLimits = map[string]int{
	AreaSubject:      500,
	AreaAutonomy:     500,
	AreaClub:         500,
	AreaCareer:       700,
	AreaBehavior:     300,
	AreaFreeSemester: 500,
}

var areaNames = map[string]string{
	AreaSubject:      "교과세특",
	AreaAutonomy:     "자율·자치활동",
	AreaClub:         "동아리활동",
	AreaCareer:       "진로활동",
	AreaBehavior:     "행동특성 및 종합의견",
	AreaFreeSemester: "자유학기 활동",
}

// AreaName은 영역의 한국어 이름입니다(모르는 영역이면 빈 문자열).
func AreaName(area string) string { return areaNames[area] }

var validYear = regexp.MustCompile(`^[0-9]{4}$`)

// Memo는 관찰 메모(누가기록) 하나입니다. 날짜는 따로 입력하지 않고 필요하면 문장 안에 씁니다.
type Memo struct {
	ID        string `json:"id"`
	Text      string `json:"text"`
	CreatedAt string `json:"createdAt"`
}

// Entry는 한 학생의 한 영역 기록입니다.
type Entry struct {
	ID         string `json:"id"`
	SchoolYear string `json:"schoolYear"`
	Area       string `json:"area"`
	TargetKind string `json:"targetKind"`
	TargetID   string `json:"targetId"`
	Subject    string `json:"subject"`
	StudentKey string `json:"studentKey"`
	Memos      []Memo `json:"memos"`
	Text       string `json:"text"`
	Reviewed   bool   `json:"reviewed"`
	CreatedAt  string `json:"createdAt"`
	UpdatedAt  string `json:"updatedAt"`
}

// Member는 활동 명단(동아리 등 여러 반이 섞인 명단)의 학생 한 명입니다.
type Member struct {
	Grade     string `json:"grade"`
	ClassName string `json:"className"`
	Number    string `json:"number"`
	Name      string `json:"name"`
}

// Key는 활동 명단 기록이 학생을 가리키는 값입니다.
func (m Member) Key() string {
	return fmt.Sprintf("%s-%s-%s|%s", m.Grade, m.ClassName, m.Number, m.Name)
}

// ActivityList는 교사가 직접 만든 활동 명단입니다.
type ActivityList struct {
	ID         string   `json:"id"`
	SchoolYear string   `json:"schoolYear"`
	Name       string   `json:"name"`
	Members    []Member `json:"members"`
	CreatedAt  string   `json:"createdAt"`
	UpdatedAt  string   `json:"updatedAt"`
}

// Phrase는 문장 보관함의 문장 하나입니다. 학생 ID·이름·번호·반은 저장하지 않습니다.
type Phrase struct {
	ID        string   `json:"id"`
	Text      string   `json:"text"`
	Area      string   `json:"area"`
	Subject   string   `json:"subject"`
	Tags      []string `json:"tags"`
	CreatedAt string   `json:"createdAt"`
	UpdatedAt string   `json:"updatedAt"`
}

// Book은 학교생활기록 전체입니다.
type Book struct {
	Entries []Entry        `json:"entries"`
	Lists   []ActivityList `json:"lists"`
	Limits  map[string]int `json:"limits"`
	Phrases []Phrase       `json:"phrases"`
}

// SameSlot은 두 기록이 같은 학생·같은 영역 칸인지 확인합니다.
func SameSlot(a, b Entry) bool {
	return a.SchoolYear == b.SchoolYear && a.Area == b.Area && a.TargetKind == b.TargetKind &&
		a.TargetID == b.TargetID && a.Subject == b.Subject && a.StudentKey == b.StudentKey
}

func clean(value string) string { return strings.TrimSpace(value) }

// cleanText는 앞뒤 공백을 지우고 줄바꿈을 \n으로 맞춥니다(문장 안 공백은 그대로 둡니다).
func cleanText(value string) string {
	value = strings.ReplaceAll(value, "\r\n", "\n")
	value = strings.ReplaceAll(value, "\r", "\n")
	return strings.TrimSpace(value)
}

func tooLong(value string, limit int) bool { return utf8.RuneCountInString(value) > limit }

// NormaliseEntry는 기록 하나를 정리하고 검사합니다. 메모 ID가 비어 있으면 newID로 채웁니다.
func NormaliseEntry(entry Entry, newID func() (string, error), now string) (Entry, error) {
	entry.ID = clean(entry.ID)
	entry.SchoolYear = clean(entry.SchoolYear)
	entry.Area = clean(entry.Area)
	entry.TargetKind = clean(entry.TargetKind)
	entry.TargetID = clean(entry.TargetID)
	entry.Subject = clean(entry.Subject)
	entry.StudentKey = clean(entry.StudentKey)
	entry.Text = cleanText(entry.Text)
	if !validYear.MatchString(entry.SchoolYear) {
		return Entry{}, errors.New("학년도를 확인할 수 없습니다. 환경 설정의 학년도나 명렬의 학년도를 확인해 주세요")
	}
	if _, ok := areaNames[entry.Area]; !ok {
		return Entry{}, errors.New("기록 영역을 확인할 수 없습니다")
	}
	switch entry.TargetKind {
	case TargetHomeroom:
		entry.TargetID = ""
	case TargetCourse, TargetList:
		if entry.TargetID == "" {
			return Entry{}, errors.New("기록할 명단을 먼저 골라 주세요")
		}
	default:
		return Entry{}, errors.New("기록할 명단 종류를 확인할 수 없습니다")
	}
	if entry.Area == AreaSubject && entry.TargetKind != TargetCourse {
		return Entry{}, errors.New("교과세특은 수업 명렬의 반에서 작성합니다")
	}
	if entry.Area == AreaBehavior && entry.TargetKind != TargetHomeroom {
		return Entry{}, errors.New("행동특성은 담임 학급 학생 명렬에서 작성합니다")
	}
	if entry.Area != AreaSubject {
		entry.Subject = ""
	} else if entry.Subject == "" {
		return Entry{}, errors.New("교과세특의 과목 이름을 입력해 주세요")
	}
	if entry.StudentKey == "" {
		return Entry{}, errors.New("학생을 확인할 수 없습니다")
	}
	if tooLong(entry.StudentKey, maxKeyRunes) || tooLong(entry.TargetID, maxIDRunes) || tooLong(entry.ID, maxIDRunes) {
		return Entry{}, errors.New("기록을 가리키는 값이 너무 깁니다")
	}
	if tooLong(entry.Subject, maxSubjectRunes) {
		return Entry{}, fmt.Errorf("과목 이름은 %d자 이하로 입력해 주세요", maxSubjectRunes)
	}
	if tooLong(entry.Text, maxTextRunes) {
		return Entry{}, fmt.Errorf("기재 문장은 %d자 이하로 입력해 주세요", maxTextRunes)
	}
	memos := make([]Memo, 0, len(entry.Memos))
	for _, memo := range entry.Memos {
		memo.Text = cleanText(memo.Text)
		if memo.Text == "" {
			continue
		}
		if tooLong(memo.Text, maxMemoRunes) {
			return Entry{}, fmt.Errorf("관찰 메모 하나는 %d자 이하로 입력해 주세요", maxMemoRunes)
		}
		memo.ID = clean(memo.ID)
		if memo.ID == "" {
			id, err := newID()
			if err != nil {
				return Entry{}, err
			}
			memo.ID = id
		}
		if clean(memo.CreatedAt) == "" {
			memo.CreatedAt = now
		}
		memos = append(memos, memo)
	}
	if len(memos) > maxMemos {
		return Entry{}, fmt.Errorf("관찰 메모는 한 학생에 %d개까지 남길 수 있습니다", maxMemos)
	}
	entry.Memos = memos
	if entry.Text == "" {
		entry.Reviewed = false
	}
	return entry, nil
}

// CheckEntryCount는 기록 수 한도를 넘는지 확인합니다.
func CheckEntryCount(count int) error {
	if count > maxEntries {
		return fmt.Errorf("학교생활기록은 %d건까지 보관할 수 있습니다. 지난 학년도 기록을 정리해 주세요", maxEntries)
	}
	return nil
}

// NormaliseList는 활동 명단을 정리하고 검사합니다.
func NormaliseList(list ActivityList) (ActivityList, error) {
	list.ID = clean(list.ID)
	list.SchoolYear = clean(list.SchoolYear)
	list.Name = clean(list.Name)
	if !validYear.MatchString(list.SchoolYear) {
		return ActivityList{}, errors.New("활동 명단의 학년도를 4자리 숫자로 입력해 주세요")
	}
	if list.Name == "" {
		return ActivityList{}, errors.New("활동 명단 이름을 입력해 주세요(예: 과학탐구 동아리)")
	}
	if tooLong(list.Name, maxListName) {
		return ActivityList{}, fmt.Errorf("활동 명단 이름은 %d자 이하로 입력해 주세요", maxListName)
	}
	if len(list.Members) > maxListMembers {
		return ActivityList{}, fmt.Errorf("활동 명단에는 %d명까지 넣을 수 있습니다", maxListMembers)
	}
	members := make([]Member, 0, len(list.Members))
	seen := map[string]bool{}
	for _, member := range list.Members {
		member.Grade = clean(member.Grade)
		member.ClassName = clean(member.ClassName)
		member.Number = strings.TrimLeft(clean(member.Number), "0")
		member.Name = clean(member.Name)
		if member.Name == "" && member.Number == "" {
			continue
		}
		if member.Grade == "" || member.ClassName == "" || member.Number == "" || member.Name == "" {
			return ActivityList{}, errors.New("활동 명단 학생마다 학년·반·번호·이름을 모두 입력해 주세요")
		}
		if tooLong(member.Grade, 4) || tooLong(member.ClassName, 10) || tooLong(member.Number, 4) || tooLong(member.Name, 30) {
			return ActivityList{}, errors.New("학년·반·번호·이름 중 너무 긴 값이 있습니다")
		}
		key := member.Key()
		if seen[key] {
			return ActivityList{}, fmt.Errorf("%s학년 %s반 %s번 %s 학생이 두 번 들어 있습니다", member.Grade, member.ClassName, member.Number, member.Name)
		}
		seen[key] = true
		members = append(members, member)
	}
	list.Members = members
	return list, nil
}

// CheckListCount는 활동 명단 수 한도를 넘는지 확인합니다.
func CheckListCount(count int) error {
	if count > maxLists {
		return fmt.Errorf("활동 명단은 %d개까지 만들 수 있습니다", maxLists)
	}
	return nil
}

// NormaliseLimits는 영역별 글자 수 한도를 검사하고, 빠진 영역은 기본값으로 채웁니다.
func NormaliseLimits(limits map[string]int) (map[string]int, error) {
	result := map[string]int{}
	for area, value := range DefaultLimits {
		result[area] = value
	}
	for area, value := range limits {
		if _, ok := areaNames[area]; !ok {
			return nil, errors.New("알 수 없는 기록 영역의 한도가 있습니다")
		}
		if value < minLimit || value > maxLimit {
			return nil, fmt.Errorf("%s 글자 수 한도는 %d~%d자 사이로 입력해 주세요", areaNames[area], minLimit, maxLimit)
		}
		result[area] = value
	}
	return result, nil
}

const (
	maxPhrases   = 5000
	maxTags      = 20
	maxTagRunes  = 20
	nameMinRunes = 3
)

// NormalisePhrase는 보관할 문장을 정리하고 검사합니다. names에 든 학생 이름(3글자 이상)이
// 문장에 있으면 거부합니다(2글자 이름은 일반 낱말과 겹칠 수 있어 화면에서 확인합니다).
func NormalisePhrase(phrase Phrase, names []string) (Phrase, error) {
	phrase.ID = clean(phrase.ID)
	phrase.Text = cleanText(phrase.Text)
	phrase.Area = clean(phrase.Area)
	phrase.Subject = clean(phrase.Subject)
	if phrase.Text == "" {
		return Phrase{}, errors.New("보관할 문장을 입력해 주세요")
	}
	if tooLong(phrase.Text, maxTextRunes) {
		return Phrase{}, fmt.Errorf("보관할 문장은 %d자 이하로 입력해 주세요", maxTextRunes)
	}
	if phrase.Area != "" {
		if _, ok := areaNames[phrase.Area]; !ok {
			return Phrase{}, errors.New("기록 영역을 확인할 수 없습니다")
		}
	}
	if tooLong(phrase.Subject, maxSubjectRunes) {
		return Phrase{}, fmt.Errorf("과목 이름은 %d자 이하로 입력해 주세요", maxSubjectRunes)
	}
	for _, name := range names {
		name = clean(name)
		if utf8.RuneCountInString(name) >= nameMinRunes && strings.Contains(phrase.Text, name) {
			return Phrase{}, fmt.Errorf("문장에 학생 이름(%s)이 들어 있습니다. ○○로 바꾸거나 고친 뒤 보관해 주세요", name)
		}
	}
	tags := make([]string, 0, len(phrase.Tags))
	seen := map[string]bool{}
	for _, tag := range phrase.Tags {
		tag = strings.TrimSpace(strings.TrimLeft(strings.TrimSpace(tag), "#"))
		tag = strings.Join(strings.Fields(tag), "")
		if tag == "" || seen[tag] {
			continue
		}
		if tooLong(tag, maxTagRunes) {
			return Phrase{}, fmt.Errorf("태그는 %d자 이하로 입력해 주세요", maxTagRunes)
		}
		seen[tag] = true
		tags = append(tags, tag)
	}
	if len(tags) > maxTags {
		return Phrase{}, fmt.Errorf("태그는 한 문장에 %d개까지 붙일 수 있습니다", maxTags)
	}
	phrase.Tags = tags
	return phrase, nil
}

// CheckPhraseCount는 보관 문장 수 한도를 넘는지 확인합니다.
func CheckPhraseCount(count int) error {
	if count > maxPhrases {
		return fmt.Errorf("문장 보관함에는 %d개까지 보관할 수 있습니다", maxPhrases)
	}
	return nil
}
