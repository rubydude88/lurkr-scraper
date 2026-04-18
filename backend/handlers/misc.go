package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"lurkr/backend/utils"
)

const (
	cookieApify    = "lurkr_apify_key"
	cookieYouTube  = "lurkr_youtube_key"
	cookieIGSession = "lurkr_ig_session"
	cookieMaxAge   = 60 * 60 * 24 * 30 // 30 days
)

func HandleHealth(w http.ResponseWriter, r *http.Request) {
	utils.JSONWrite(w, map[string]string{"status": "ok"})
}

// HandleSetKey stores API keys in httpOnly cookies — never visible in JS or network requests
func HandleSetKey(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		Platform string `json:"platform"`
		Key      string `json:"key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.ErrJSON(w, "invalid body")
		return
	}
	req.Key = strings.TrimSpace(req.Key)
	cookieName := platformToCookie(req.Platform)
	if cookieName == "" {
		utils.ErrJSON(w, "unknown platform")
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    req.Key,
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
		Path:     "/",
		MaxAge:   cookieMaxAge,
	})
	utils.JSONWrite(w, map[string]string{"status": "ok"})
}

// HandleClearKey removes the httpOnly cookie for a platform
func HandleClearKey(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		Platform string `json:"platform"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.ErrJSON(w, "invalid body")
		return
	}
	cookieName := platformToCookie(req.Platform)
	if cookieName == "" {
		utils.ErrJSON(w, "unknown platform")
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    "",
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
		Path:     "/",
		MaxAge:   -1,
	})
	utils.JSONWrite(w, map[string]string{"status": "ok"})
}

// HandleKeyStatus returns which keys are set (boolean only — never the key value)
func HandleKeyStatus(w http.ResponseWriter, r *http.Request) {
	status := map[string]bool{
		"tiktok":     cookieIsSet(r, cookieApify),
		"youtube":    cookieIsSet(r, cookieYouTube),
		"instagram":  cookieIsSet(r, cookieApify),
		"ig-session": cookieIsSet(r, cookieIGSession),
	}
	utils.JSONWrite(w, status)
}

func platformToCookie(p string) string {
	switch p {
	case "tiktok", "instagram":
		return cookieApify
	case "youtube":
		return cookieYouTube
	case "ig-session":
		return cookieIGSession
	}
	return ""
}

func cookieIsSet(r *http.Request, name string) bool {
	c, err := r.Cookie(name)
	return err == nil && strings.TrimSpace(c.Value) != ""
}

// GetKeyFromCookie reads a key from the httpOnly cookie — used by scrape handlers
func GetKeyFromCookie(r *http.Request, platform string) (string, bool) {
	name := platformToCookie(platform)
	if name == "" {
		return "", false
	}
	c, err := r.Cookie(name)
	if err != nil || strings.TrimSpace(c.Value) == "" {
		return "", false
	}
	return strings.TrimSpace(c.Value), true
}

func HandleImageProxy(w http.ResponseWriter, r *http.Request) {
	raw := strings.TrimSpace(r.URL.Query().Get("url"))
	if raw == "" {
		http.Error(w, "missing url", http.StatusBadRequest)
		return
	}

	u, err := url.Parse(raw)
	if err != nil || u.Scheme == "" || u.Host == "" {
		http.Error(w, "invalid url", http.StatusBadRequest)
		return
	}

	host := strings.ToLower(u.Host)
	allowed := strings.Contains(host, "yt3.ggpht.com") ||
		strings.Contains(host, "googleusercontent.com") ||
		strings.Contains(host, "ggpht.com") ||
		strings.HasSuffix(host, "cdninstagram.com") ||
		strings.HasSuffix(host, "fbcdn.net") ||
		strings.Contains(host, "scontent-") ||
		strings.Contains(host, "instagram.f")

	if !allowed {
		http.Error(w, "host not allowed", http.StatusForbidden)
		return
	}

	client := &http.Client{Timeout: 20 * time.Second}
	req, err := http.NewRequest(http.MethodGet, raw, nil)
	if err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	req.Header.Set("User-Agent", "Mozilla/5.0")

	resp, err := client.Do(req)
	if err != nil {
		http.Error(w, "fetch failed", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		http.Error(w, "upstream failed", http.StatusBadGateway)
		return
	}

	if ct := resp.Header.Get("Content-Type"); ct != "" {
		w.Header().Set("Content-Type", ct)
	}
	w.Header().Set("Cache-Control", "public, max-age=3600")
	_, _ = io.Copy(w, resp.Body)
}
