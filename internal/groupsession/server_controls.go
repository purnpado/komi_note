package groupsession

import (
	"errors"
	"time"
)

// 교사 화면의 회차 조작(지망 열기·연장·마감·공개·접속 초기화·정지·일시정지)입니다.

// OpenPreferences는 입장을 마감하지 않고 지망 제출을 엽니다(늦게 온 학생도 제출 시간 안에 들어올 수 있음).
func (s *Server) OpenPreferences(seconds int) (Info, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	x, err := s.active()
	if err != nil {
		return Info{}, err
	}
	if x.request.Mode != ModePreference {
		return Info{}, errors.New("모둠장이 있는 방식은 모둠장 투표부터 시작합니다")
	}
	if x.phase != PhaseEntry {
		return Info{}, errors.New("입장 단계에서만 지망 제출을 시작할 수 있습니다")
	}
	if seconds >= 30 && seconds <= 900 {
		x.request.SubmitSeconds = seconds
	}
	x.phase = PhaseSubmit
	x.deadline = s.now().Add(time.Duration(x.request.SubmitSeconds) * time.Second)
	return s.infoLocked(x)
}

// Extend는 지망 제출 시간을 늘립니다(최대 15분 남도록).
func (s *Server) Extend(seconds int) (Info, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	x, err := s.active()
	if err != nil {
		return Info{}, err
	}
	s.tickLocked(x)
	if x.phase != PhaseSubmit && x.phase != PhaseVote {
		return Info{}, errors.New("지망 제출이나 모둠장 투표 중에만 시간을 늘릴 수 있습니다")
	}
	if seconds < 10 || seconds > 600 {
		seconds = 60
	}
	x.deadline = x.deadline.Add(time.Duration(seconds) * time.Second)
	if limit := s.now().Add(15 * time.Minute); x.deadline.After(limit) {
		x.deadline = limit
	}
	return s.infoLocked(x)
}

// ClosePreferences는 지망 제출을 바로 마감하고 배정합니다.
func (s *Server) ClosePreferences() (Info, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	x, err := s.active()
	if err != nil {
		return Info{}, err
	}
	s.tickLocked(x)
	if x.phase != PhaseSubmit {
		return Info{}, errors.New("지망 제출 중이 아닙니다")
	}
	s.allocateLocked(x)
	return s.infoLocked(x)
}

// RevealNext는 다음 라운드 결과를 전자칠판에 공개합니다. 모두 공개하면 배정 완료.
func (s *Server) RevealNext() (Info, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	x, err := s.active()
	if err != nil {
		return Info{}, err
	}
	if x.phase != PhaseReveal {
		return Info{}, errors.New("공개할 배정 결과가 없습니다")
	}
	x.revealed++
	if x.revealed >= len(x.rounds) {
		x.revealed = len(x.rounds)
		x.phase = PhaseAssigned
	}
	return s.infoLocked(x)
}

// RevealNames는 모든 배정이 끝난 뒤 실명을 공개합니다.
func (s *Server) RevealNames() (Info, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	x, err := s.active()
	if err != nil {
		return Info{}, err
	}
	if x.phase != PhaseAssigned && x.phase != PhaseNamesShown {
		return Info{}, errors.New("모든 학생 배정이 끝난 뒤에 이름을 공개할 수 있습니다")
	}
	x.phase = PhaseNamesShown
	return s.infoLocked(x)
}

// ResetStudent는 학생 기기 연결을 풀어 다른 기기(본인)로 다시 들어오게 합니다. 닉네임·지망은 유지합니다.
func (s *Server) ResetStudent(key string) (Info, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	x, err := s.active()
	if err != nil {
		return Info{}, err
	}
	p := x.byKey[key]
	if p == nil {
		return Info{}, errors.New("학생을 찾지 못했습니다")
	}
	if p.token != "" {
		delete(x.byToken, p.token)
		p.token = ""
	}
	return s.infoLocked(x)
}

// Stop은 회차를 닫고 메모리의 지망·닉네임·접속 정보를 모두 지웁니다.
func (s *Server) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.current == nil {
		return
	}
	_ = s.current.server.Close()
	_ = s.current.listener.Close()
	s.current = nil
}

// 자동 잠금 연동(다른 QR 회차와 같은 규칙)
func (s *Server) HasActiveSession() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.current != nil
}

func (s *Server) IsPaused() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.current != nil && s.current.paused
}

func (s *Server) PauseAll() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.current != nil && !s.current.paused {
		s.current.paused = true
		s.current.pausedAt = s.now()
	}
}

func (s *Server) ResumeAll() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if x := s.current; x != nil && x.paused {
		if !x.deadline.IsZero() {
			x.deadline = x.deadline.Add(s.now().Sub(x.pausedAt))
		}
		if !x.turnDeadline.IsZero() {
			x.turnDeadline = x.turnDeadline.Add(s.now().Sub(x.pausedAt))
		}
		x.paused = false
		x.pausedAt = time.Time{}
	}
}
