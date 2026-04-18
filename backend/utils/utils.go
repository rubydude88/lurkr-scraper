package utils

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

func JSONWrite(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

func ErrJSON(w http.ResponseWriter, msg string) {
	JSONWrite(w, map[string]string{"error": msg})
}

func DoGET(client *http.Client, rawURL string, params url.Values) ([]byte, int, error) {
	u, err := url.Parse(rawURL)
	if err != nil {
		return nil, 0, err
	}
	if params != nil {
		q := u.Query()
		for k, vs := range params {
			for _, v := range vs {
				q.Set(k, v)
			}
		}
		u.RawQuery = q.Encode()
	}
	resp, err := client.Get(u.String())
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(resp.Body)
	return data, resp.StatusCode, err
}

func DoPOST(client *http.Client, rawURL string, body any) ([]byte, int, error) {
	b, err := json.Marshal(body)
	if err != nil {
		return nil, 0, err
	}
	resp, err := client.Post(rawURL, "application/json", bytes.NewReader(b))
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(resp.Body)
	return data, resp.StatusCode, err
}

// ─── Value helpers ────────────────────────────────────────────────────────────

func StrVal(m map[string]any, keys ...string) string {
	for _, k := range keys {
		if v, ok := m[k]; ok {
			if s, ok := v.(string); ok && s != "" {
				return s
			}
		}
	}
	return ""
}

func NumVal(m map[string]any, keys ...string) int64 {
	for _, k := range keys {
		if v, ok := m[k]; ok {
			switch n := v.(type) {
			case float64:
				return int64(n)
			case int64:
				return n
			case string:
				i, _ := strconv.ParseInt(n, 10, 64)
				return i
			}
		}
	}
	return 0
}

func IntOrNil(s string) any {
	if s == "" {
		return nil
	}
	n, err := strconv.ParseInt(strings.TrimSpace(s), 10, 64)
	if err != nil {
		return nil
	}
	return n
}

func MinInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

var (
	ReDMY = regexp.MustCompile(`^\d{2}/\d{2}/\d{4}$`)
	ReYMD = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
)

func ParseDT(s string) (time.Time, bool) {
	s = strings.TrimSpace(s)
	if s == "" {
		return time.Time{}, false
	}
	if ReDMY.MatchString(s) {
		t, err := time.ParseInLocation("02/01/2006", s, time.UTC)
		return t, err == nil
	}
	if ReYMD.MatchString(s) {
		t, err := time.ParseInLocation("2006-01-02", s, time.UTC)
		return t, err == nil
	}
	s2 := strings.Replace(s, "Z", "+00:00", 1)
	for _, layout := range []string{time.RFC3339Nano, time.RFC3339, "2006-01-02T15:04:05"} {
		if t, err := time.Parse(layout, s2); err == nil {
			return t.UTC(), true
		}
	}
	return time.Time{}, false
}

func ParseTimestamp(v any) string {
	if v == nil {
		return ""
	}
	switch val := v.(type) {
	case float64:
		ts := val
		if ts > 1e10 {
			ts /= 1000
		}
		return time.Unix(int64(ts), 0).UTC().Format(time.RFC3339)
	case string:
		return val
	}
	return ""
}

func ParseDuration(iso string) *int {
	if iso == "" {
		return nil
	}
	re := regexp.MustCompile(`PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?`)
	m := re.FindStringSubmatch(iso)
	if m == nil {
		return nil
	}
	h, _ := strconv.Atoi(m[1])
	mn, _ := strconv.Atoi(m[2])
	sec, _ := strconv.Atoi(m[3])
	total := h*3600 + mn*60 + sec
	return &total
}
