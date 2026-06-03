package relay

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"time"
)

type Client struct {
	BaseURL    string
	Token      string
	HTTPClient *http.Client
	Timeout    time.Duration
}

type UploadRequest struct {
	RelayEntryID string
	BundleHash   string
	CommitCount  string
	SizeBytes    string
	Payload      []byte
}

func NewClient(baseURL, token string) *Client {
	return &Client{
		BaseURL:    baseURL,
		Token:      token,
		HTTPClient: http.DefaultClient,
		Timeout:    30 * time.Second,
	}
}

func (c *Client) UploadBundle(ctx context.Context, upload UploadRequest) (*http.Response, error) {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for key, value := range map[string]string{
		"relayEntryId": upload.RelayEntryID,
		"bundleHash":   upload.BundleHash,
		"commitCount":  upload.CommitCount,
		"sizeBytes":    upload.SizeBytes,
	} {
		if err := writer.WriteField(key, value); err != nil {
			return nil, err
		}
	}
	part, err := writer.CreateFormFile("bundle", "bundle.bundle.enc")
	if err != nil {
		return nil, err
	}
	if _, err := io.Copy(part, bytes.NewReader(upload.Payload)); err != nil {
		return nil, err
	}
	if err := writer.Close(); err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(ctx, c.Timeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.BaseURL+"/v1/bundles/upload", &body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("content-type", writer.FormDataContentType())
	req.Header.Set("authorization", "Bearer "+c.Token)
	return c.HTTPClient.Do(req)
}

func UploadOrQueue(ctx context.Context, client *Client, repoPath string, upload UploadRequest) (QueuedBundle, string, error) {
	response, err := client.UploadBundle(ctx, upload)
	if err != nil {
		queued, queueErr := WriteQueueBundle(repoPath, upload.RelayEntryID, upload.Payload)
		if queueErr != nil {
			return QueuedBundle{}, "", queueErr
		}
		return queued, RenderRelayUnreachable(filepathBase(queued.Path)), nil
	}
	defer response.Body.Close()
	if response.StatusCode >= 200 && response.StatusCode < 300 {
		return QueuedBundle{}, "", nil
	}
	body, _ := io.ReadAll(response.Body)
	switch response.StatusCode {
	case http.StatusPaymentRequired:
		return QueuedBundle{}, RenderOverLimit(body), fmt.Errorf("over limit")
	case http.StatusUnauthorized:
		return QueuedBundle{}, RenderAuthExpired(), fmt.Errorf("auth expired")
	case http.StatusUnprocessableEntity:
		return QueuedBundle{}, RenderBundleRejected(body), fmt.Errorf("bundle rejected")
	default:
		return QueuedBundle{}, string(body), fmt.Errorf("relay returned %d", response.StatusCode)
	}
}

func RetryQueuedBundle(ctx context.Context, client *Client, path, expectedHash string, upload UploadRequest) error {
	payload, err := ReadQueueBundle(path, expectedHash)
	if err != nil {
		return err
	}
	upload.Payload = payload
	response, err := client.UploadBundle(ctx, upload)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("retry upload failed with status %d", response.StatusCode)
	}
	return nil
}

func filepathBase(path string) string {
	for i := len(path) - 1; i >= 0; i-- {
		if path[i] == '/' || path[i] == '\\' {
			return path[i+1:]
		}
	}
	return path
}
