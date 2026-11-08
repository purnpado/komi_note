package seating

import (
	_ "embed"
	"net/http"
)

//go:embed assets/seating/rps-rock.webp
var rpsRockWebP []byte

//go:embed assets/seating/rps-paper.webp
var rpsPaperWebP []byte

//go:embed assets/seating/rps-scissors.webp
var rpsScissorsWebP []byte

//go:embed assets/seating/kkomi-note-icon.png
var kkomiIconPNG []byte

// kkomiNoteIconPNG는 전자칠판의 사다리 이동 말에 쓰는 꼬미 아이콘을 돌려준다.
func kkomiNoteIconPNG() []byte {
	return kkomiIconPNG
}

func writeSeatingPublicAsset(contentType string, asset []byte) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", contentType)
		w.Header().Set("Cache-Control", "public, max-age=3600")
		_, _ = w.Write(asset)
	}
}
