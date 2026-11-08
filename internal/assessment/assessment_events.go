package assessment

import (
	"sync"
	"time"
)

// AssessmentEvent는 수행평가 모듈 안에서만 전달하는 상태 변경 알림입니다.
// 화면과 QR 서버는 이 이벤트를 구독할 수 있지만 서로를 직접 참조하지 않습니다.
type AssessmentEvent struct {
	Type         string `json:"type"`
	AssessmentID string `json:"assessmentId"`
	DomainID     string `json:"domainId"`
	StudentID    string `json:"studentId"`
	OccurredAt   string `json:"occurredAt"`
}

type AssessmentEventBus struct {
	mu        sync.RWMutex
	nextID    uint64
	listeners map[uint64]func(AssessmentEvent)
}

func NewAssessmentEventBus() *AssessmentEventBus {
	return &AssessmentEventBus{listeners: map[uint64]func(AssessmentEvent){}}
}

func (b *AssessmentEventBus) Subscribe(listener func(AssessmentEvent)) func() {
	b.mu.Lock()
	b.nextID++
	id := b.nextID
	b.listeners[id] = listener
	b.mu.Unlock()
	return func() {
		b.mu.Lock()
		delete(b.listeners, id)
		b.mu.Unlock()
	}
}

func (b *AssessmentEventBus) Publish(event AssessmentEvent) {
	if event.OccurredAt == "" {
		event.OccurredAt = time.Now().In(time.Local).Format(time.RFC3339)
	}
	b.mu.RLock()
	listeners := make([]func(AssessmentEvent), 0, len(b.listeners))
	for _, listener := range b.listeners {
		listeners = append(listeners, listener)
	}
	b.mu.RUnlock()
	for _, listener := range listeners {
		listener(event)
	}
}
