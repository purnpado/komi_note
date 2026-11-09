package system

// AppVersion은 배포 빌드마다 ldflags로 바꿀 수 있는 프로그램 버전입니다.
// 개발·베타 빌드는 기본값을 사용하며, 사용자 개인정보나 인증 정보는 포함하지 않습니다.
var AppVersion = "0.1.5"

// UpdateManifestURL은 공개 업데이트 정보 파일의 주소입니다.
// GitHub 공개 릴리즈 저장소의 "최신 릴리즈"에 올린 latest.json을 읽습니다.
// 시험판(pre-release)으로 표시한 릴리즈는 "최신"에 잡히지 않습니다.
var UpdateManifestURL = "https://github.com/purnpado/komi_note/releases/latest/download/latest.json"

