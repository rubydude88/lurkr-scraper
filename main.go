package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// ─────────────────────────────────────────────────────────────────────────────
// TTL Cache
// ─────────────────────────────────────────────────────────────────────────────

type cacheEntry struct {
	value     []byte
	expiresAt time.Time
}

type TTLCache struct {
	mu      sync.RWMutex
	entries map[string]cacheEntry
	ttl     time.Duration
	maxSize int
}

func newTTLCache(ttl time.Duration, maxSize int) *TTLCache {
	c := &TTLCache{
		entries: make(map[string]cacheEntry),
		ttl:     ttl,
		maxSize: maxSize,
	}
	go func() {
		for range time.Tick(60 * time.Second) {
			c.evictExpired()
		}
	}()
	return c
}

func (c *TTLCache) get(key string) ([]byte, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	e, ok := c.entries[key]
	if !ok || time.Now().After(e.expiresAt) {
		return nil, false
	}
	return e.value, true
}

func (c *TTLCache) set(key string, val []byte) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.entries) >= c.maxSize {
		for k, e := range c.entries {
			if time.Now().After(e.expiresAt) {
				delete(c.entries, k)
				break
			}
		}
		// If still full, evict arbitrary entry
		if len(c.entries) >= c.maxSize {
			for k := range c.entries {
				delete(c.entries, k)
				break
			}
		}
	}
	c.entries[key] = cacheEntry{value: val, expiresAt: time.Now().Add(c.ttl)}
}

func (c *TTLCache) evictExpired() {
	c.mu.Lock()
	defer c.mu.Unlock()
	now := time.Now()
	for k, e := range c.entries {
		if now.After(e.expiresAt) {
			delete(c.entries, k)
		}
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Globals
// ─────────────────────────────────────────────────────────────────────────────

var cache = newTTLCache(10*time.Minute, 50)

const (
	apifyBase    = "https://api.apify.com/v2/acts"
	youtubeBase  = "https://www.googleapis.com/youtube/v3"
	apifyTimeout = 105 * time.Second
	ytTimeout    = 60 * time.Second
)

// ─────────────────────────────────────────────────────────────────────────────
// HTTP helpers
// ─────────────────────────────────────────────────────────────────────────────

func jsonWrite(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

func errJSON(w http.ResponseWriter, msg string) {
	jsonWrite(w, map[string]string{"error": msg})
}

func doGET(client *http.Client, rawURL string, params url.Values) ([]byte, int, error) {
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

func doPOST(client *http.Client, rawURL string, body any) ([]byte, int, error) {
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

// ─────────────────────────────────────────────────────────────────────────────
// Utility helpers
// ─────────────────────────────────────────────────────────────────────────────

func strVal(m map[string]any, keys ...string) string {
	for _, k := range keys {
		if v, ok := m[k]; ok {
			if s, ok := v.(string); ok && s != "" {
				return s
			}
		}
	}
	return ""
}

func numVal(m map[string]any, keys ...string) int64 {
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

func intOrNil(s string) any {
	if s == "" {
		return nil
	}
	n, err := strconv.ParseInt(strings.TrimSpace(s), 10, 64)
	if err != nil {
		return nil
	}
	return n
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// ─────────────────────────────────────────────────────────────────────────────
// Date parsing
// ─────────────────────────────────────────────────────────────────────────────

var (
	reDMY = regexp.MustCompile(`^\d{2}/\d{2}/\d{4}$`)
	reYMD = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
)

func parseDT(s string) (time.Time, bool) {
	s = strings.TrimSpace(s)
	if s == "" {
		return time.Time{}, false
	}
	if reDMY.MatchString(s) {
		t, err := time.ParseInLocation("02/01/2006", s, time.UTC)
		return t, err == nil
	}
	if reYMD.MatchString(s) {
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

func parseTimestamp(v any) string {
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

// ─────────────────────────────────────────────────────────────────────────────
// TikTok — video scraping
// ─────────────────────────────────────────────────────────────────────────────

var reTikTokUser = regexp.MustCompile(`tiktok\.com/@([^/?&\s]+)`)

func normalizeTTUsername(u string) string {
	u = strings.TrimSpace(u)
	if m := reTikTokUser.FindStringSubmatch(u); m != nil {
		return m[1]
	}
	return strings.TrimPrefix(u, "@")
}

func itemToVideo(item map[string]any) map[string]any {
	pubRaw := strVal(item, "createTimeISO", "createTime", "created", "timestamp")
	var published string
	if pubRaw != "" {
		published = pubRaw
	} else {
		for _, k := range []string{"createTime", "timestamp"} {
			if v, ok := item[k]; ok {
				published = parseTimestamp(v)
				break
			}
		}
	}

	var duration int64
	if vm, ok := item["videoMeta"].(map[string]any); ok {
		duration = numVal(vm, "duration")
	} else {
		duration = numVal(item, "duration")
	}

	var thumbnail string
	if vm, ok := item["videoMeta"].(map[string]any); ok {
		thumbnail = strVal(vm, "coverUrl")
	}
	if thumbnail == "" {
		thumbnail = strVal(item, "thumbnail")
		if thumbnail == "" {
			if covers, ok := item["covers"].([]any); ok && len(covers) > 0 {
				if s, ok := covers[0].(string); ok {
					thumbnail = s
				}
			}
		}
	}

	stats := map[string]any{}
	if s, ok := item["stats"].(map[string]any); ok {
		stats = s
	}

	videoID := strVal(item, "id")
	videoURL := strVal(item, "webVideoUrl", "url")
	if videoID == "" && videoURL != "" {
		parts := strings.Split(videoURL, "/")
		videoID = parts[len(parts)-1]
	}

	return map[string]any{
		"id":        videoID,
		"url":       videoURL,
		"thumbnail": thumbnail,
		"published": published,
		"duration":  duration,
		"views":     numVal(stats, "playCount") + numVal(item, "playCount"),
		"likes":     numVal(stats, "diggCount") + numVal(item, "diggCount"),
		"comments":  numVal(stats, "commentCount") + numVal(item, "commentCount"),
		"shares":    numVal(stats, "shareCount") + numVal(item, "shareCount"),
		"caption":   strVal(item, "text", "desc", "description"),
	}
}

func fetchApifyPage(apiKey, username string, pageSize int) ([]map[string]any, error) {
	client := &http.Client{Timeout: apifyTimeout}
	endpoint := fmt.Sprintf(
		"%s/clockworks~tiktok-scraper/run-sync-get-dataset-items?token=%s&timeout=90&memory=512",
		apifyBase, apiKey,
	)
	body := map[string]any{
		"profiles":       []string{fmt.Sprintf("https://www.tiktok.com/@%s", username)},
		"resultsPerPage": pageSize,
	}
	data, status, err := doPOST(client, endpoint, body)
	if err != nil {
		return nil, err
	}
	if status < 200 || status >= 300 {
		preview := string(data)
		if len(preview) > 300 {
			preview = preview[:300]
		}
		return nil, fmt.Errorf("Apify error %d: %s", status, preview)
	}
	var items []map[string]any
	if err := json.Unmarshal(data, &items); err != nil {
		preview := string(data)
		if len(preview) > 200 {
			preview = preview[:200]
		}
		return nil, fmt.Errorf("unexpected Apify response: %s", preview)
	}
	return items, nil
}

func handleTikTokVideos(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Username string `json:"username"`
		APIKey   string `json:"api_key"`
		DateFrom string `json:"date_from"`
		DateTo   string `json:"date_to"`
		Limit    int    `json:"limit"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		errJSON(w, "Invalid request body")
		return
	}
	req.APIKey = strings.TrimSpace(req.APIKey)
	if req.APIKey == "" {
		errJSON(w, "API key is required")
		return
	}
	if req.Limit <= 0 {
		req.Limit = 30
	}
	username := normalizeTTUsername(req.Username)
	if username == "" {
		errJSON(w, "Username must not be empty")
		return
	}

	cacheKey := fmt.Sprintf("tt_videos|%s|%s|%d|%s|%s", req.APIKey, username, req.Limit, req.DateFrom, req.DateTo)
	if cached, ok := cache.get(cacheKey); ok {
		w.Header().Set("Content-Type", "application/json")
		w.Write(cached)
		return
	}

	fromDT, hasFrom := parseDT(req.DateFrom)
	toDT, hasTo := parseDT(req.DateTo)
	if hasTo {
		// Include full end day
		toDT = toDT.Add(24*time.Hour - time.Nanosecond)
	}

	var videos []map[string]any

	if !hasFrom && !hasTo {
		items, err := fetchApifyPage(req.APIKey, username, req.Limit)
		if err != nil {
			errJSON(w, err.Error())
			return
		}
		for _, item := range items {
			v := itemToVideo(item)
			videos = append(videos, v)
		}
		if len(videos) > req.Limit {
			videos = videos[:req.Limit]
		}
	} else {
		seen := map[string]bool{}
		pageSize := 30
		for pageSize <= 300 {
			items, err := fetchApifyPage(req.APIKey, username, pageSize)
			if err != nil {
				errJSON(w, err.Error())
				return
			}
			if len(items) == 0 {
				break
			}
			reachedOlder := false
			for _, item := range items {
				v := itemToVideo(item)
				id := v["id"].(string) + "|" + v["url"].(string)
				if seen[id] {
					continue
				}
				seen[id] = true
				pub := v["published"].(string)
				pubDT, ok := parseDT(pub)
				if !ok {
					continue
				}
				if hasFrom && pubDT.Before(fromDT) {
					reachedOlder = true
					continue
				}
				if hasTo && pubDT.After(toDT) {
					continue
				}
				videos = append(videos, v)
			}
			if reachedOlder || len(items) < pageSize {
				break
			}
			pageSize += 30
		}
		// Sort descending by published
		sort.Slice(videos, func(i, j int) bool {
			ti, _ := parseDT(videos[i]["published"].(string))
			tj, _ := parseDT(videos[j]["published"].(string))
			return ti.After(tj)
		})
		if len(videos) > req.Limit {
			videos = videos[:req.Limit]
		}
	}

	if videos == nil {
		videos = []map[string]any{}
	}
	result := map[string]any{"videos": videos, "total": len(videos), "username": req.Username}
	b, _ := json.Marshal(result)
	cache.set(cacheKey, b)
	w.Header().Set("Content-Type", "application/json")
	w.Write(b)
}

// ─────────────────────────────────────────────────────────────────────────────
// TikTok — comments
// ─────────────────────────────────────────────────────────────────────────────

func parseRawComments(raw []map[string]any, limit int) []map[string]any {
	out := []map[string]any{}
	for i, item := range raw {
		if i >= limit {
			break
		}
		var posted string
		for _, k := range []string{"createTimeISO", "createTime"} {
			if v, ok := item[k]; ok {
				posted = parseTimestamp(v)
				break
			}
		}
		username := strVal(item, "uniqueId", "uid")
		if username == "" {
			if author, ok := item["author"].(map[string]any); ok {
				username = strVal(author, "uniqueId", "uid")
			}
		}
		out = append(out, map[string]any{
			"id":       strVal(item, "cid", "id"),
			"username": username,
			"avatar":   strVal(item, "avatarThumbnail", "avatarThumb"),
			"text":     strVal(item, "text", "comment"),
			"likes":    numVal(item, "diggCount", "likeCount"),
			"replies":  numVal(item, "replyCommentTotal", "replyCount"),
			"posted":   posted,
		})
	}
	return out
}

func handleTikTokComments(w http.ResponseWriter, r *http.Request) {
	var req struct {
		VideoURL string `json:"video_url"`
		APIKey   string `json:"api_key"`
		Count    int    `json:"count"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		errJSON(w, "Invalid request body")
		return
	}
	req.APIKey = strings.TrimSpace(req.APIKey)
	if req.APIKey == "" {
		errJSON(w, "API key is required")
		return
	}
	if req.VideoURL == "" {
		errJSON(w, "video_url is required")
		return
	}
	if req.Count <= 0 {
		req.Count = 50
	}

	cacheKey := fmt.Sprintf("tt_comments|%s|%s|%d", req.APIKey, req.VideoURL, req.Count)
	if cached, ok := cache.get(cacheKey); ok {
		w.Header().Set("Content-Type", "application/json")
		w.Write(cached)
		return
	}

	client := &http.Client{Timeout: apifyTimeout + 15*time.Second}

	// Try dedicated comments actor first
	commentsURL := fmt.Sprintf(
		"%s/clockworks~tiktok-comments-scraper/run-sync-get-dataset-items?token=%s&timeout=90&memory=512",
		apifyBase, req.APIKey,
	)
	data, status, err := doPOST(client, commentsURL, map[string]any{
		"postURLs":    []string{req.VideoURL},
		"maxComments": req.Count,
	})

	var rawComments []map[string]any
	useDedicatedActor := err == nil && status >= 200 && status < 300

	if useDedicatedActor {
		var arr []map[string]any
		if e := json.Unmarshal(data, &arr); e == nil && len(arr) > 0 {
			rawComments = arr
		} else {
			useDedicatedActor = false
		}
	}

	if !useDedicatedActor {
		// Fallback: general scraper with commentsPerPost
		fallbackURL := fmt.Sprintf(
			"%s/clockworks~tiktok-scraper/run-sync-get-dataset-items?token=%s&timeout=90&memory=512",
			apifyBase, req.APIKey,
		)
		data, status, err = doPOST(client, fallbackURL, map[string]any{
			"postURLs":        []string{req.VideoURL},
			"commentsPerPost": req.Count,
			"includeComments": true,
		})
		if err != nil {
			errJSON(w, err.Error())
			return
		}
		if status < 200 || status >= 300 {
			preview := string(data)
			if len(preview) > 300 {
				preview = preview[:300]
			}
			errJSON(w, fmt.Sprintf("Apify error %d: %s", status, preview))
			return
		}
		var items []map[string]any
		if e := json.Unmarshal(data, &items); e != nil || len(items) == 0 {
			errJSON(w, "No data returned from Apify for that video URL")
			return
		}
		first := items[0]
		// Try inline comment fields
		for _, field := range []string{"latestComments", "comments"} {
			if arr, ok := first[field].([]any); ok && len(arr) > 0 {
				for _, c := range arr {
					if cm, ok := c.(map[string]any); ok {
						rawComments = append(rawComments, cm)
					}
				}
				break
			}
		}
		if len(rawComments) == 0 {
			errJSON(w, "No comments returned. Video may have comments disabled or actor doesn't support comment scraping.")
			return
		}
	}

	comments := parseRawComments(rawComments, req.Count)
	result := map[string]any{"comments": comments, "total": len(comments)}
	b, _ := json.Marshal(result)
	cache.set(cacheKey, b)
	w.Header().Set("Content-Type", "application/json")
	w.Write(b)
}

// ─────────────────────────────────────────────────────────────────────────────
// YouTube — channel ID resolution
// ─────────────────────────────────────────────────────────────────────────────

var (
	reYTAtHandle  = regexp.MustCompile(`youtube\.com/@([^/?&\s]+)`)
	reYTChannelID = regexp.MustCompile(`youtube\.com/channel/([A-Za-z0-9_-]+)`)
	reYTCUser     = regexp.MustCompile(`youtube\.com/(?:c|user)/([^/?&\s]+)`)
	reYTBareID    = regexp.MustCompile(`^UC[A-Za-z0-9_-]{20,}$`)
)

func resolveChannelParam(raw string) (string, string) {
	raw = strings.TrimSpace(raw)
	if strings.Contains(raw, "youtube.com") {
		if m := reYTAtHandle.FindStringSubmatch(raw); m != nil {
			return "forHandle", "@" + m[1]
		}
		if m := reYTChannelID.FindStringSubmatch(raw); m != nil {
			return "id", m[1]
		}
		if m := reYTCUser.FindStringSubmatch(raw); m != nil {
			return "forHandle", "@" + m[1]
		}
	}
	if reYTBareID.MatchString(raw) {
		return "id", raw
	}
	if strings.HasPrefix(raw, "@") {
		return "forHandle", raw
	}
	return "forHandle", "@" + raw
}

// parseYTError extracts YouTube API error message from response body.
func parseYTError(data []byte) string {
	var envelope struct {
		Error *struct {
			Code    int    `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if json.Unmarshal(data, &envelope) == nil && envelope.Error != nil {
		return fmt.Sprintf("YouTube API error %d: %s", envelope.Error.Code, envelope.Error.Message)
	}
	return ""
}

func parseDuration(iso string) *int {
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
	s, _ := strconv.Atoi(m[3])
	total := h*3600 + mn*60 + s
	return &total
}

type ytThumbnail struct {
	URL    string `json:"url"`
	Width  int    `json:"width"`
	Height int    `json:"height"`
}

// ─────────────────────────────────────────────────────────────────────────────
// YouTube — channel info
// ─────────────────────────────────────────────────────────────────────────────

func handleYouTubeChannel(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ChannelID string `json:"channel_id"`
		APIKey    string `json:"api_key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		errJSON(w, "Invalid request body")
		return
	}
	req.APIKey = strings.TrimSpace(req.APIKey)
	if req.APIKey == "" {
		errJSON(w, "YouTube API key is required")
		return
	}
	req.ChannelID = strings.TrimSpace(req.ChannelID)
	if req.ChannelID == "" {
		errJSON(w, "channel_id is required")
		return
	}

	cacheKey := fmt.Sprintf("yt_channel|%s|%s", req.APIKey, req.ChannelID)
	if cached, ok := cache.get(cacheKey); ok {
		w.Header().Set("Content-Type", "application/json")
		w.Write(cached)
		return
	}

	client := &http.Client{Timeout: ytTimeout}
	param, value := resolveChannelParam(req.ChannelID)

	data, status, err := doGET(client, youtubeBase+"/channels", url.Values{
		"part": {"snippet,statistics"},
		param:  {value},
		"key":  {req.APIKey},
	})
	if err != nil {
		errJSON(w, "Request failed: "+err.Error())
		return
	}
	if status != 200 {
		if msg := parseYTError(data); msg != "" {
			errJSON(w, msg)
		} else {
			errJSON(w, fmt.Sprintf("YouTube API returned status %d", status))
		}
		return
	}
	if msg := parseYTError(data); msg != "" {
		errJSON(w, msg)
		return
	}

	var resp struct {
		Items []struct {
			ID      string `json:"id"`
			Snippet struct {
				Title       string                 `json:"title"`
				Description string                 `json:"description"`
				CustomURL   string                 `json:"customUrl"`
				PublishedAt string                 `json:"publishedAt"`
				Country     string                 `json:"country"`
				Thumbnails  map[string]ytThumbnail `json:"thumbnails"`
			} `json:"snippet"`
			Statistics struct {
				SubscriberCount string `json:"subscriberCount"`
				VideoCount      string `json:"videoCount"`
				ViewCount       string `json:"viewCount"`
			} `json:"statistics"`
		} `json:"items"`
		Error *struct {
			Code    int    `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}

	if err := json.Unmarshal(data, &resp); err != nil {
		log.Printf("YouTube channel parse error: %v\nRaw response: %s", err, string(data))
		errJSON(w, "Failed to parse YouTube response")
		return
	}
	if resp.Error != nil {
		errJSON(w, fmt.Sprintf("YouTube API error %d: %s", resp.Error.Code, resp.Error.Message))
		return
	}
	if len(resp.Items) == 0 {
		errJSON(w, "Channel not found. Check the handle, channel ID, or URL and ensure your API key is valid.")
		return
	}

	item := resp.Items[0]
	thumbs := item.Snippet.Thumbnails
	var thumb string
	for _, size := range []string{"high", "medium", "default"} {
		if t, ok := thumbs[size]; ok {
			thumb = t.URL
			break
		}
	}

	result := map[string]any{
		"id":              item.ID,
		"title":           item.Snippet.Title,
		"description":     item.Snippet.Description,
		"customUrl":       item.Snippet.CustomURL,
		"thumbnailUrl":    thumb,
		"subscriberCount": intOrNil(item.Statistics.SubscriberCount),
		"videoCount":      intOrNil(item.Statistics.VideoCount),
		"viewCount":       intOrNil(item.Statistics.ViewCount),
		"publishedAt":     item.Snippet.PublishedAt,
		"country":         item.Snippet.Country,
	}
	b, _ := json.Marshal(result)
	cache.set(cacheKey, b)
	w.Header().Set("Content-Type", "application/json")
	w.Write(b)
}

func handleImageProxy(w http.ResponseWriter, r *http.Request) {
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

	// Allow only YouTube/Google image hosts you expect
	host := strings.ToLower(u.Host)
	allowed := strings.Contains(host, "yt3.ggpht.com") ||
		strings.Contains(host, "googleusercontent.com") ||
		strings.Contains(host, "ggpht.com")

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

// ─────────────────────────────────────────────────────────────────────────────
// YouTube — channel videos (with stats auto-fetched concurrently)
// ─────────────────────────────────────────────────────────────────────────────

type videoMeta struct {
	id           string
	title        string
	description  string
	publishedAt  string
	thumbnailURL string
	videoURL     string
}

type videoStats struct {
	viewCount    any
	likeCount    any
	commentCount any
	duration     string
	durationSecs *int
	tags         []string
	categoryID   string
	liveStatus   string
}

func handleYouTubeVideos(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ChannelID  string `json:"channel_id"`
		APIKey     string `json:"api_key"`
		MaxResults int    `json:"max_results"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		errJSON(w, "Invalid request body")
		return
	}
	req.APIKey = strings.TrimSpace(req.APIKey)
	if req.APIKey == "" {
		errJSON(w, "YouTube API key is required")
		return
	}
	req.ChannelID = strings.TrimSpace(req.ChannelID)
	if req.ChannelID == "" {
		errJSON(w, "channel_id is required")
		return
	}
	if req.MaxResults <= 0 {
		req.MaxResults = 25
	}
	if req.MaxResults > 200 {
		req.MaxResults = 200
	}

	cacheKey := fmt.Sprintf("yt_videos|%s|%s|%d", req.APIKey, req.ChannelID, req.MaxResults)
	if cached, ok := cache.get(cacheKey); ok {
		w.Header().Set("Content-Type", "application/json")
		w.Write(cached)
		return
	}

	client := &http.Client{Timeout: ytTimeout}
	param, value := resolveChannelParam(req.ChannelID)

	// Step 1: resolve uploads playlist
	chData, chStatus, chErr := doGET(client, youtubeBase+"/channels", url.Values{
		"part": {"contentDetails"},
		param:  {value},
		"key":  {req.APIKey},
	})
	if chErr != nil {
		errJSON(w, "Request failed: "+chErr.Error())
		return
	}
	if chStatus != 200 {
		if msg := parseYTError(chData); msg != "" {
			errJSON(w, msg)
		} else {
			errJSON(w, fmt.Sprintf("YouTube API returned status %d", chStatus))
		}
		return
	}

	var chResp struct {
		Items []struct {
			ID             string `json:"id"`
			ContentDetails struct {
				RelatedPlaylists struct {
					Uploads string `json:"uploads"`
				} `json:"relatedPlaylists"`
			} `json:"contentDetails"`
		} `json:"items"`
		Error *struct {
			Code    int    `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(chData, &chResp); err != nil {
		errJSON(w, "Failed to parse YouTube channel response")
		return
	}
	if chResp.Error != nil {
		errJSON(w, fmt.Sprintf("YouTube API error %d: %s", chResp.Error.Code, chResp.Error.Message))
		return
	}
	if len(chResp.Items) == 0 {
		errJSON(w, "Channel not found. Check the handle, channel ID, or URL and ensure your API key is valid.")
		return
	}
	uploadsPlaylist := chResp.Items[0].ContentDetails.RelatedPlaylists.Uploads
	resolvedChannelID := chResp.Items[0].ID
	if uploadsPlaylist == "" {
		errJSON(w, "Could not find uploads playlist for this channel")
		return
	}

	// Step 2: paginate playlist items
	var order []string
	metaMap := map[string]videoMeta{}
	pageToken := ""
	remaining := req.MaxResults

	for remaining > 0 {
		fetch := minInt(remaining, 50)
		params := url.Values{
			"part":       {"snippet"},
			"playlistId": {uploadsPlaylist},
			"maxResults": {strconv.Itoa(fetch)},
			"key":        {req.APIKey},
		}
		if pageToken != "" {
			params.Set("pageToken", pageToken)
		}
		plData, plStatus, plErr := doGET(client, youtubeBase+"/playlistItems", params)
		if plErr != nil {
			errJSON(w, "Request failed: "+plErr.Error())
			return
		}
		if plStatus != 200 {
			if msg := parseYTError(plData); msg != "" {
				errJSON(w, msg)
			} else {
				errJSON(w, fmt.Sprintf("YouTube playlist API returned status %d", plStatus))
			}
			return
		}

		var plResp struct {
			Items []struct {
				Snippet struct {
					Title       string `json:"title"`
					Description string `json:"description"`
					PublishedAt string `json:"publishedAt"`
					Thumbnails  map[string]struct {
						URL    string `json:"url"`
						Width  int    `json:"width"`
						Height int    `json:"height"`
					} `json:"thumbnails"`
					ResourceID struct {
						VideoID string `json:"videoId"`
					} `json:"resourceId"`
				} `json:"snippet"`
			} `json:"items"`
			NextPageToken string `json:"nextPageToken"`
		}
		if e := json.Unmarshal(plData, &plResp); e != nil {
			log.Printf("YouTube playlist parse error: %v\nRaw response: %s", e, string(plData))
			errJSON(w, "Failed to parse playlist response")
			return
		}
		if len(plResp.Items) == 0 {
			break
		}

		for _, item := range plResp.Items {
			vid := item.Snippet.ResourceID.VideoID
			if vid == "" {
				continue
			}
			if _, exists := metaMap[vid]; exists {
				continue // dedup
			}
			thumbs := item.Snippet.Thumbnails
			var thumb string
			for _, size := range []string{"maxres", "high", "medium", "default"} {
				if t, ok := thumbs[size]; ok {
					thumb = t.URL
					break
				}
			}
			order = append(order, vid)
			metaMap[vid] = videoMeta{
				id:           vid,
				title:        item.Snippet.Title,
				description:  item.Snippet.Description,
				publishedAt:  item.Snippet.PublishedAt,
				thumbnailURL: thumb,
				videoURL:     "https://www.youtube.com/watch?v=" + vid,
			}
		}

		pageToken = plResp.NextPageToken
		remaining -= len(plResp.Items)
		if pageToken == "" || remaining <= 0 {
			break
		}
	}

	// Step 3: batch-fetch stats concurrently (50 per chunk)
	statsMap := map[string]videoStats{}
	var statsMu sync.Mutex
	var wg sync.WaitGroup

	for start := 0; start < len(order); start += 50 {
		end := minInt(start+50, len(order))
		ids := strings.Join(order[start:end], ",")
		wg.Add(1)

		go func(ids string) {
			defer wg.Done()

			vData, vStatus, vErr := doGET(client, youtubeBase+"/videos", url.Values{
				"part": {"contentDetails,statistics,liveStreamingDetails,snippet"},
				"id":   {ids},
				"key":  {req.APIKey},
			})
			if vErr != nil {
				log.Printf("YouTube videos request failed: %v", vErr)
				return
			}
			if vStatus != 200 {
				log.Printf("YouTube videos API returned status %d: %s", vStatus, string(vData))
				return
			}

			var vResp struct {
				Items []struct {
					ID             string `json:"id"`
					ContentDetails struct {
						Duration string `json:"duration"`
					} `json:"contentDetails"`
					Statistics struct {
						ViewCount    string `json:"viewCount"`
						LikeCount    string `json:"likeCount"`
						CommentCount string `json:"commentCount"`
					} `json:"statistics"`
					Snippet struct {
						Tags       []string `json:"tags"`
						CategoryID string   `json:"categoryId"`
						LiveStatus string   `json:"liveBroadcastContent"`
					} `json:"snippet"`
				} `json:"items"`
			}
			if e := json.Unmarshal(vData, &vResp); e != nil {
				log.Printf("YouTube video stats parse error: %v", e)
				return
			}

			local := map[string]videoStats{}
			for _, item := range vResp.Items {
				durSecs := parseDuration(item.ContentDetails.Duration)
				local[item.ID] = videoStats{
					viewCount:    intOrNil(item.Statistics.ViewCount),
					likeCount:    intOrNil(item.Statistics.LikeCount),
					commentCount: intOrNil(item.Statistics.CommentCount),
					duration:     item.ContentDetails.Duration,
					durationSecs: durSecs,
					tags:         item.Snippet.Tags,
					categoryID:   item.Snippet.CategoryID,
					liveStatus:   item.Snippet.LiveStatus,
				}
			}

			statsMu.Lock()
			for k, v := range local {
				statsMap[k] = v
			}
			statsMu.Unlock()
		}(ids)
	}

	wg.Wait()

	// Step 4: assemble final ordered result
	videos := make([]map[string]any, 0, len(order))
	for _, vid := range order {
		meta, ok := metaMap[vid]
		if !ok {
			continue
		}
		st := statsMap[vid]

		isShort := false

		titleLower := strings.ToLower(meta.title)
		urlLower := strings.ToLower(meta.videoURL)
		tagsJoined := strings.ToLower(strings.Join(st.tags, " "))

		if strings.Contains(urlLower, "/shorts/") {
			isShort = true
		}
		if strings.Contains(titleLower, "#shorts") || strings.Contains(titleLower, "#short") {
			isShort = true
		}
		if strings.Contains(tagsJoined, "shorts") || strings.Contains(tagsJoined, "short") {
			isShort = true
		}

		// Shorts can be longer than 60s now, so use duration only as a supporting hint.
		if !isShort && st.durationSecs != nil && *st.durationSecs <= 180 {
			if strings.Contains(titleLower, "short") || strings.Contains(tagsJoined, "short") {
				isShort = true
			}
		}

		finalURL := meta.videoURL
		if isShort {
			finalURL = "https://www.youtube.com/shorts/" + meta.id
		}

		videos = append(videos, map[string]any{
			"id":              meta.id,
			"channelId":       resolvedChannelID,
			"title":           meta.title,
			"description":     meta.description,
			"publishedAt":     meta.publishedAt,
			"thumbnailUrl":    meta.thumbnailURL,
			"url":             finalURL,
			"viewCount":       st.viewCount,
			"likeCount":       st.likeCount,
			"commentCount":    st.commentCount,
			"duration":        st.duration,
			"durationSecs":    st.durationSecs,
			"durationSeconds": st.durationSecs,
			"isShort":         isShort,
			"tags":            st.tags,
			"categoryId":      st.categoryID,
			"liveStatus":      st.liveStatus,
		})
	}

	result := map[string]any{
		"channelId": resolvedChannelID,
		"videos":    videos,
		"total":     len(videos),
	}
	b, _ := json.Marshal(result)
	cache.set(cacheKey, b)
	w.Header().Set("Content-Type", "application/json")
	w.Write(b)
}

// ─────────────────────────────────────────────────────────────────────────────
// Health / settings
// ─────────────────────────────────────────────────────────────────────────────

func handleHealth(w http.ResponseWriter, r *http.Request) {
	jsonWrite(w, map[string]any{
		"ok":   true,
		"time": time.Now().UTC().Format(time.RFC3339),
	})
}

func handleSettingsStatus(w http.ResponseWriter, r *http.Request) {
	jsonWrite(w, map[string]any{
		"configured": false,
		"masked":     "",
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "5000"
	}

	staticDir := "static"

	mux := http.NewServeMux()

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		jsonWrite(w, map[string]string{"status": "ok"})
	})

	// TikTok routes
	mux.HandleFunc("/scrape/tiktok/videos", handleTikTokVideos)
	mux.HandleFunc("/scrape/tiktok/comments", handleTikTokComments)

	// YouTube routes
	mux.HandleFunc("/scrape/youtube/channel", handleYouTubeChannel)
	mux.HandleFunc("/scrape/youtube/videos", handleYouTubeVideos)
	mux.HandleFunc("/image-proxy", handleImageProxy)

	// Static files
	mux.Handle("/static/", http.StripPrefix("/static", http.FileServer(http.Dir(staticDir))))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		http.ServeFile(w, r, staticDir+"/index.html")
	})

	addr := "0.0.0.0:" + port
	log.Printf("Lurkr running on http://%s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}
