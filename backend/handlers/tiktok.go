package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"sort"
	"strings"
	"time"

	"lurkr/backend/cache"
	"lurkr/backend/utils"
)

const (
	apifyBase    = "https://api.apify.com/v2/acts"
	apifyTimeout = 105 * time.Second
)

var reTikTokUser = regexp.MustCompile(`tiktok\.com/@([^/?&\s]+)`)

func normalizeTTUsername(u string) string {
	u = strings.TrimSpace(u)
	if m := reTikTokUser.FindStringSubmatch(u); m != nil {
		return m[1]
	}
	return strings.TrimPrefix(u, "@")
}

func itemToVideo(item map[string]any) map[string]any {
	pubRaw := utils.StrVal(item, "createTimeISO", "createTime", "created", "timestamp")
	var published string
	if pubRaw != "" {
		published = pubRaw
	} else {
		for _, k := range []string{"createTime", "timestamp"} {
			if v, ok := item[k]; ok {
				published = utils.ParseTimestamp(v)
				break
			}
		}
	}

	var duration int64
	if vm, ok := item["videoMeta"].(map[string]any); ok {
		duration = utils.NumVal(vm, "duration")
	} else {
		duration = utils.NumVal(item, "duration")
	}

	var thumbnail string
	if vm, ok := item["videoMeta"].(map[string]any); ok {
		thumbnail = utils.StrVal(vm, "coverUrl")
	}
	if thumbnail == "" {
		thumbnail = utils.StrVal(item, "thumbnail")
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

	videoID := utils.StrVal(item, "id")
	videoURL := utils.StrVal(item, "webVideoUrl", "url")
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
		"views":     utils.NumVal(stats, "playCount") + utils.NumVal(item, "playCount"),
		"likes":     utils.NumVal(stats, "diggCount") + utils.NumVal(item, "diggCount"),
		"comments":  utils.NumVal(stats, "commentCount") + utils.NumVal(item, "commentCount"),
		"shares":    utils.NumVal(stats, "shareCount") + utils.NumVal(item, "shareCount"),
		"caption":   utils.StrVal(item, "text", "desc", "description"),
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
	data, status, err := utils.DoPOST(client, endpoint, body)
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

func extractTTProfile(item map[string]any) map[string]any {
	// Author info can be nested under "authorMeta" or top-level
	authorMeta, _ := item["authorMeta"].(map[string]any)
	if authorMeta == nil {
		authorMeta = map[string]any{}
	}

	nickname := utils.StrVal(authorMeta, "nickName", "name")
	if nickname == "" {
		nickname = utils.StrVal(item, "authorName")
	}
	username := utils.StrVal(authorMeta, "name", "uniqueId")
	if username == "" {
		username = utils.StrVal(item, "authorMeta", "uniqueId")
	}
	avatar := utils.StrVal(authorMeta, "avatar", "avatarLarger", "avatarMedium")
	if avatar == "" {
		avatar = utils.StrVal(item, "authorAvatar")
	}
	bio := utils.StrVal(authorMeta, "signature", "bio")
	followers := utils.NumVal(authorMeta, "fans", "followerCount")
	following := utils.NumVal(authorMeta, "following", "followingCount")
	likes := utils.NumVal(authorMeta, "heart", "heartCount", "diggCount")
	verified := authorMeta["verified"] == true

	return map[string]any{
		"nickname":  nickname,
		"username":  username,
		"avatar":    avatar,
		"bio":       bio,
		"followers": followers,
		"following": following,
		"likes":     likes,
		"verified":  verified,
	}
}

func HandleTikTokVideos(c *cache.TTLCache) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Username string `json:"username"`
			DateFrom string `json:"date_from"`
			DateTo   string `json:"date_to"`
			Limit    int    `json:"limit"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			utils.ErrJSON(w, "Invalid request body")
			return
		}
		apiKey, ok := GetKeyFromCookie(r, "tiktok")
		if !ok {
			utils.ErrJSON(w, "Apify API key not set. Click \"API Keys\" to add one.")
			return
		}
		if req.Limit <= 0 {
			req.Limit = 20
		}
		username := normalizeTTUsername(req.Username)
		if username == "" {
			utils.ErrJSON(w, "Username must not be empty")
			return
		}

		cacheKey := fmt.Sprintf("tt_videos|%s|%s|%d|%s|%s", apiKey, username, req.Limit, req.DateFrom, req.DateTo)
		if cached, ok := c.Get(cacheKey); ok {
			w.Header().Set("Content-Type", "application/json")
			w.Write(cached)
			return
		}

		fromDT, hasFrom := utils.ParseDT(req.DateFrom)
		toDT, hasTo := utils.ParseDT(req.DateTo)
		if hasTo {
			toDT = toDT.Add(24*time.Hour - time.Nanosecond)
		}

		var videos []map[string]any
		var firstItems []map[string]any

		if !hasFrom && !hasTo {
			items, err := fetchApifyPage(apiKey, username, req.Limit)
			if err != nil {
				utils.ErrJSON(w, err.Error())
				return
			}
			firstItems = items
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
				items, err := fetchApifyPage(apiKey, username, pageSize)
				if err != nil {
					utils.ErrJSON(w, err.Error())
					return
				}
				if len(items) == 0 {
					break
				}
				if firstItems == nil {
					firstItems = items
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
					pubDT, ok := utils.ParseDT(pub)
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
			sort.Slice(videos, func(i, j int) bool {
				ti, _ := utils.ParseDT(videos[i]["published"].(string))
				tj, _ := utils.ParseDT(videos[j]["published"].(string))
				return ti.After(tj)
			})
			if len(videos) > req.Limit {
				videos = videos[:req.Limit]
			}
		}

		if videos == nil {
			videos = []map[string]any{}
		}

		// Extract profile info from first raw item
		var profile map[string]any
		if len(firstItems) > 0 {
			profile = extractTTProfile(firstItems[0])
		}

		result := map[string]any{"videos": videos, "total": len(videos), "username": req.Username, "profile": profile}
		b, _ := json.Marshal(result)
		c.Set(cacheKey, b)
		w.Header().Set("Content-Type", "application/json")
		w.Write(b)
	}
}

func parseRawComments(raw []map[string]any, limit int) []map[string]any {
	out := []map[string]any{}
	for i, item := range raw {
		if i >= limit {
			break
		}
		var posted string
		for _, k := range []string{"createTimeISO", "createTime"} {
			if v, ok := item[k]; ok {
				posted = utils.ParseTimestamp(v)
				break
			}
		}
		username := utils.StrVal(item, "uniqueId", "uid")
		if username == "" {
			if author, ok := item["author"].(map[string]any); ok {
				username = utils.StrVal(author, "uniqueId", "uid")
			}
		}
		out = append(out, map[string]any{
			"id":       utils.StrVal(item, "cid", "id"),
			"username": username,
			"avatar":   utils.StrVal(item, "avatarThumbnail", "avatarThumb"),
			"text":     utils.StrVal(item, "text", "comment"),
			"likes":    utils.NumVal(item, "diggCount", "likeCount"),
			"replies":  utils.NumVal(item, "replyCommentTotal", "replyCount"),
			"posted":   posted,
		})
	}
	return out
}

func HandleTikTokComments(c *cache.TTLCache) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			VideoURL string `json:"video_url"`
			Count    int    `json:"count"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			utils.ErrJSON(w, "Invalid request body")
			return
		}
		apiKey, ok := GetKeyFromCookie(r, "tiktok")
		if !ok {
			utils.ErrJSON(w, "Apify API key not set. Click \"API Keys\" to add one.")
			return
		}
		if req.VideoURL == "" {
			utils.ErrJSON(w, "video_url is required")
			return
		}
		if req.Count <= 0 {
			req.Count = 50
		}

		cacheKey := fmt.Sprintf("tt_comments|%s|%s|%d", apiKey, req.VideoURL, req.Count)
		if cached, ok := c.Get(cacheKey); ok {
			w.Header().Set("Content-Type", "application/json")
			w.Write(cached)
			return
		}

		client := &http.Client{Timeout: apifyTimeout + 15*time.Second}

		commentsURL := fmt.Sprintf(
			"%s/clockworks~tiktok-comments-scraper/run-sync-get-dataset-items?token=%s&timeout=90&memory=512",
			apifyBase, apiKey,
		)
		data, status, err := utils.DoPOST(client, commentsURL, map[string]any{
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
			fallbackURL := fmt.Sprintf(
				"%s/clockworks~tiktok-scraper/run-sync-get-dataset-items?token=%s&timeout=90&memory=512",
				apifyBase, apiKey,
			)
			data, status, err = utils.DoPOST(client, fallbackURL, map[string]any{
				"postURLs":        []string{req.VideoURL},
				"commentsPerPost": req.Count,
				"includeComments": true,
			})
			if err != nil {
				utils.ErrJSON(w, err.Error())
				return
			}
			if status < 200 || status >= 300 {
				preview := string(data)
				if len(preview) > 300 {
					preview = preview[:300]
				}
				utils.ErrJSON(w, fmt.Sprintf("Apify error %d: %s", status, preview))
				return
			}
			var items []map[string]any
			if e := json.Unmarshal(data, &items); e != nil || len(items) == 0 {
				utils.ErrJSON(w, "No data returned from Apify for that video URL")
				return
			}
			first := items[0]
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
				utils.ErrJSON(w, "No comments returned. Video may have comments disabled or actor doesn't support comment scraping.")
				return
			}
		}

		comments := parseRawComments(rawComments, req.Count)
		result := map[string]any{"comments": comments, "total": len(comments)}
		b, _ := json.Marshal(result)
		c.Set(cacheKey, b)
		w.Header().Set("Content-Type", "application/json")
		w.Write(b)
	}
}
