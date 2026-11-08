package system

import (
	"net"
	"testing"
)

func TestUsableLANIPv4(t *testing.T) {
	tests := []struct {
		name string
		ip   string
		want bool
	}{
		{name: "학교 Wi-Fi 주소", ip: "172.2.96.56", want: true},
		{name: "일반 사설 주소", ip: "192.168.0.25", want: true},
		{name: "루프백 주소", ip: "127.0.0.1", want: false},
		{name: "링크 로컬 주소", ip: "169.254.10.20", want: false},
		{name: "멀티캐스트 주소", ip: "224.0.0.1", want: false},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := usableLANIPv4(net.ParseIP(test.ip)); got != test.want {
				t.Fatalf("usableLANIPv4(%s) = %v, want %v", test.ip, got, test.want)
			}
		})
	}
}

func TestLocalAddressUsesHostPortFormat(t *testing.T) {
	address := LocalAddress(59313)
	host, port, err := net.SplitHostPort(address)
	if err != nil {
		t.Fatalf("LocalAddress() 형식이 올바르지 않습니다: %q, %v", address, err)
	}
	if host == "" || port != "59313" {
		t.Fatalf("LocalAddress() = %q, 호스트와 포트를 올바르게 만들지 못했습니다", address)
	}
}

