package crypto

import (
	"bytes"
	"fmt"
	"io"

	"filippo.io/age"
)

func GenerateIdentity() (*age.X25519Identity, error) {
	identity, err := age.GenerateX25519Identity()
	if err != nil {
		return nil, fmt.Errorf("generate age identity: %w", err)
	}
	return identity, nil
}

func Encrypt(plain []byte, recipient age.Recipient) ([]byte, error) {
	var out bytes.Buffer
	writer, err := age.Encrypt(&out, recipient)
	if err != nil {
		return nil, fmt.Errorf("create age encrypt writer: %w", err)
	}
	if _, err := writer.Write(plain); err != nil {
		return nil, fmt.Errorf("write age payload: %w", err)
	}
	if err := writer.Close(); err != nil {
		return nil, fmt.Errorf("finalize age payload: %w", err)
	}
	return out.Bytes(), nil
}

func Decrypt(ciphertext []byte, identity age.Identity) ([]byte, error) {
	reader, err := age.Decrypt(bytes.NewReader(ciphertext), identity)
	if err != nil {
		return nil, fmt.Errorf("open age payload: %w", err)
	}
	plain, err := io.ReadAll(reader)
	if err != nil {
		return nil, fmt.Errorf("read age payload: %w", err)
	}
	return plain, nil
}
