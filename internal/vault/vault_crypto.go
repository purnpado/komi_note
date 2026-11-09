package vault

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"

	"golang.org/x/crypto/argon2"
)

// 보관함 암호화·복호화와 키 만들기입니다.

func decryptVaultData(key []byte, data encryptedBlob) (vaultData, error) {
	payload, err := open(key, data, "vault-data-v1")
	if err != nil {
		return vaultData{}, err
	}
	defer zeroBytes(payload)
	var result vaultData
	if err := json.Unmarshal(payload, &result); err != nil {
		return vaultData{}, err
	}
	return result, nil
}

func deriveKey(password string, salt []byte) []byte {
	return argon2.IDKey([]byte(password), salt, 3, 64*1024, 4, 32)
}

func seal(key, plaintext []byte, additionalData string) (encryptedBlob, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return encryptedBlob{}, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return encryptedBlob{}, err
	}
	nonce, err := randomBytes(gcm.NonceSize())
	if err != nil {
		return encryptedBlob{}, err
	}
	ciphertext := gcm.Seal(nil, nonce, plaintext, []byte(additionalData))
	return encryptedBlob{Nonce: encode(nonce), Ciphertext: encode(ciphertext)}, nil
}

func open(key []byte, encrypted encryptedBlob, additionalData string) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonce, err := decode(encrypted.Nonce)
	if err != nil || len(nonce) != gcm.NonceSize() {
		return nil, errors.New("잘못된 암호화 데이터입니다")
	}
	ciphertext, err := decode(encrypted.Ciphertext)
	if err != nil {
		return nil, err
	}
	return gcm.Open(nil, nonce, ciphertext, []byte(additionalData))
}

func randomBytes(length int) ([]byte, error) {
	value := make([]byte, length)
	if _, err := io.ReadFull(rand.Reader, value); err != nil {
		return nil, fmt.Errorf("안전한 난수를 만들지 못했습니다: %w", err)
	}
	return value, nil
}

func encode(value []byte) string { return base64.RawStdEncoding.EncodeToString(value) }

func decode(value string) ([]byte, error) { return base64.RawStdEncoding.DecodeString(value) }
