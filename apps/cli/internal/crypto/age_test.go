package crypto

import "testing"

func TestAgeEncryption(t *testing.T) {
	identity, err := GenerateIdentity()
	if err != nil {
		t.Fatal(err)
	}
	plain := []byte("committed git bundle bytes")
	ciphertext, err := Encrypt(plain, identity.Recipient())
	if err != nil {
		t.Fatal(err)
	}
	decrypted, err := Decrypt(ciphertext, identity)
	if err != nil {
		t.Fatal(err)
	}
	if string(decrypted) != string(plain) {
		t.Fatalf("decrypted payload = %q, want %q", decrypted, plain)
	}
}

func TestTamperedAgePayloadRejected(t *testing.T) {
	identity, err := GenerateIdentity()
	if err != nil {
		t.Fatal(err)
	}
	ciphertext, err := Encrypt([]byte("payload"), identity.Recipient())
	if err != nil {
		t.Fatal(err)
	}
	ciphertext[len(ciphertext)-1] ^= 0xff
	if _, err := Decrypt(ciphertext, identity); err == nil {
		t.Fatal("tampered ciphertext decrypted successfully")
	}
}
