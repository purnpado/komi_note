package system

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"strconv"
)

// RandomBytes는 암호학적으로 안전한 무작위 바이트 배열을 생성합니다.
func RandomBytes(length int) ([]byte, error) {
	value := make([]byte, length)
	if _, err := io.ReadFull(rand.Reader, value); err != nil {
		return nil, fmt.Errorf("안전한 난수를 만들지 못했습니다: %w", err)
	}
	return value, nil
}

// LocalAddress는 QR 회차나 로컬 웹서버에서 외부 접근 가능한 로컬 IPv4 주소를 반환합니다.
func LocalAddress(port int) string {
	return net.JoinHostPort(localIPv4Address(), strconv.Itoa(port))
}

func localIPv4Address() string {
	if conn, err := net.Dial("udp4", "1.1.1.1:53"); err == nil {
		defer conn.Close()
		if address, ok := conn.LocalAddr().(*net.UDPAddr); ok && usableLANIPv4(address.IP) {
			return address.IP.String()
		}
	}
	interfaces, _ := net.Interfaces()
	for _, item := range interfaces {
		if item.Flags&net.FlagUp == 0 || item.Flags&net.FlagLoopback != 0 {
			continue
		}
		addresses, _ := item.Addrs()
		for _, address := range addresses {
			ip, _, _ := net.ParseCIDR(address.String())
			if usableLANIPv4(ip) {
				return ip.String()
			}
		}
	}
	return "127.0.0.1"
}

func usableLANIPv4(ip net.IP) bool {
	if ip == nil || ip.To4() == nil {
		return false
	}
	return !ip.IsLoopback() && !ip.IsLinkLocalUnicast() && !ip.IsUnspecified() && !ip.IsMulticast()
}

// SecurityHeaders는 브라우저 보안 헤더를 설정하는 HTTP 미들웨어입니다.
func SecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Content-Security-Policy", "default-src 'self' 'unsafe-inline'")
		next.ServeHTTP(w, r)
	})
}

// WriteJSON은 HTTP 응답으로 JSON 데이터를 인코딩하여 전송합니다.
func WriteJSON(w http.ResponseWriter, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(value)
}

// DecodeJSONBody는 요청 본문에서 JSON 데이터를 안전하게 파싱합니다.
func DecodeJSONBody(r *http.Request, target any) error {
	defer r.Body.Close()
	return json.NewDecoder(io.LimitReader(r.Body, 1024*1024)).Decode(target)
}

