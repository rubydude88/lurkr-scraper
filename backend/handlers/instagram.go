package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"lurkr/backend/cache"
	"lurkr/backend/utils"
)

var reIGUser = regexp.MustCompile(`instagram\.com/([^/?&\s]+)`)

func normalizeIGUsername(u string) string {
	u = strings.TrimSpace(u)
	if m := reIGUser.FindStringSubmatch(u); m != nil {
		return strings.TrimPrefix(m[1], "@")
	}
	return strings.TrimPrefix(u, "@")
}

func extractIGProfile(item map[string]any) map[string]any {
	// "details" resultsType returns top-level profile fields directly
	// "posts" resultsType nests them under owner* prefixed keys
	fullName := utils.StrVal(item, "fullName", "full_name", "ownerFullName", "name")
	username := utils.StrVal(item, "username", "ownerUsername")
	biography := utils.StrVal(item, "biography", "bio", "ownerBio")
	profilePic := utils.StrVal(item,
		"profilePicUrl", "profilePicUrlHD", "profile_pic_url",
		"ownerProfilePicUrl", "avatarUrl", "profilePic",
	)

	// Nested owner object fallback (posts mode)
	if profilePic == "" {
		if owner, ok := item["owner"].(map[string]any); ok {
			profilePic = utils.StrVal(owner, "profile_pic_url", "profilePicUrl", "avatarUrl")
			if fullName == "" {
				fullName = utils.StrVal(owner, "full_name", "fullName")
			}
			if username == "" {
				username = utils.StrVal(owner, "username")
			}
		}
	}

	followers := utils.NumVal(item, "followersCount", "followedByCount",
		"ownerFollowersCount", "edge_followed_by_count")
	following := utils.NumVal(item, "followsCount", "followingCount", "edge_follow_count")
	postsCount := utils.NumVal(item, "postsCount", "mediaCount",
		"ownerPostsCount", "edge_owner_to_timeline_media_count")
	verified := item["verified"] == true || item["isVerified"] == true ||
		item["ownerIsVerified"] == true

	return map[string]any{
		"fullName":   fullName,
		"username":   username,
		"biography":  biography,
		"profilePic": profilePic,
		"followers":  followers,
		"following":  following,
		"postsCount": postsCount,
		"verified":   verified,
	}
}

func HandleInstagramPosts(c *cache.TTLCache) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Username string `json:"username"`
			Limit    int    `json:"limit"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			utils.ErrJSON(w, "Invalid request body")
			return
		}
		apiKey, ok := GetKeyFromCookie(r, "instagram")
		if !ok {
			utils.ErrJSON(w, "Apify API key not set. Click \"API Keys\" to add one.")
			return
		}
		if req.Limit <= 0 {
			req.Limit = 20
		}
		username := normalizeIGUsername(req.Username)
		if username == "" {
			utils.ErrJSON(w, "Username must not be empty")
			return
		}

		cacheKey := fmt.Sprintf("ig_posts|%s|%s|%d", apiKey, username, req.Limit)
		if cached, ok := c.Get(cacheKey); ok {
			w.Header().Set("Content-Type", "application/json")
			w.Write(cached)
			return
		}

		client := &http.Client{Timeout: apifyTimeout}
		profileURL := fmt.Sprintf("https://www.instagram.com/%s/", username)
		endpoint := fmt.Sprintf(
			"%s/apify~instagram-scraper/run-sync-get-dataset-items?token=%s&timeout=90&memory=1024",
			apifyBase, apiKey,
		)

		type result struct {
			data   []byte
			status int
			err    error
		}

		postsCh := make(chan result, 1)
		detailsCh := make(chan result, 1)

		go func() {
			d, s, e := utils.DoPOST(client, endpoint, map[string]any{
				"directUrls":    []string{profileURL},
				"resultsType":   "posts",
				"resultsLimit":  req.Limit,
				"addParentData": false,
			})
			postsCh <- result{d, s, e}
		}()

		go func() {
			d, s, e := utils.DoPOST(client, endpoint, map[string]any{
				"directUrls":   []string{profileURL},
				"resultsType":  "details",
				"resultsLimit": 1,
			})
			detailsCh <- result{d, s, e}
		}()

		postsRes := <-postsCh
		detailsRes := <-detailsCh

		if postsRes.err != nil {
			utils.ErrJSON(w, postsRes.err.Error())
			return
		}
		if postsRes.status < 200 || postsRes.status >= 300 {
			preview := string(postsRes.data)
			if len(preview) > 300 {
				preview = preview[:300]
			}
			utils.ErrJSON(w, fmt.Sprintf("Apify error %d: %s", postsRes.status, preview))
			return
		}

		var items []map[string]any
		if err := json.Unmarshal(postsRes.data, &items); err != nil {
			utils.ErrJSON(w, "Unexpected Apify response")
			return
		}

		posts := []map[string]any{}
		for i, item := range items {
			if i >= req.Limit {
				break
			}
			posts = append(posts, itemToIGPost(item))
		}

		// Extract profile from dedicated details call — much richer than post owner fields
		var profile map[string]any
		if detailsRes.err == nil && detailsRes.status >= 200 && detailsRes.status < 300 {
			var detailItems []map[string]any
			if json.Unmarshal(detailsRes.data, &detailItems) == nil && len(detailItems) > 0 {
				profile = extractIGProfile(detailItems[0])
			}
		}
		// Fall back to first post item if details call failed
		if profile == nil && len(items) > 0 {
			profile = extractIGProfile(items[0])
		}

		response := map[string]any{"posts": posts, "total": len(posts), "username": username, "profile": profile}
		b, _ := json.Marshal(response)
		c.Set(cacheKey, b)
		w.Header().Set("Content-Type", "application/json")
		w.Write(b)
	}
}

func itemToIGPost(item map[string]any) map[string]any {
	timestamp := utils.StrVal(item, "timestamp", "taken_at_timestamp")
	if timestamp == "" {
		for _, k := range []string{"takenAtTimestamp", "taken_at"} {
			if v, ok := item[k]; ok {
				timestamp = utils.ParseTimestamp(v)
				break
			}
		}
	}

	// caption
	caption := utils.StrVal(item, "caption")
	if caption == "" {
		if edge, ok := item["edge_media_to_caption"].(map[string]any); ok {
			if edges, ok := edge["edges"].([]any); ok && len(edges) > 0 {
				if node, ok := edges[0].(map[string]any); ok {
					if n, ok := node["node"].(map[string]any); ok {
						caption = utils.StrVal(n, "text")
					}
				}
			}
		}
	}

	// thumbnail
	thumbnail := utils.StrVal(item, "displayUrl", "display_url", "thumbnail_src")
	if thumbnail == "" {
		thumbnail = utils.StrVal(item, "thumbnailSrc", "thumbnail")
	}

	postType := utils.StrVal(item, "type", "product_type")
	if postType == "" {
		if utils.StrVal(item, "is_video") == "true" || item["is_video"] == true {
			postType = "video"
		} else {
			postType = "image"
		}
	}

	postURL := utils.StrVal(item, "url", "shortCode")
	if !strings.HasPrefix(postURL, "http") {
		shortCode := utils.StrVal(item, "shortCode", "shortcode")
		if shortCode != "" {
			postURL = "https://www.instagram.com/p/" + shortCode + "/"
		}
	}

	likesCount := utils.NumVal(item, "likesCount", "likes_count")
	if likesCount == 0 {
		if edge, ok := item["edge_liked_by"].(map[string]any); ok {
			if cnt, ok := edge["count"].(float64); ok {
				likesCount = int64(cnt)
			}
		}
	}

	commentsCount := utils.NumVal(item, "commentsCount", "comments_count")
	if commentsCount == 0 {
		if edge, ok := item["edge_media_to_parent_comment"].(map[string]any); ok {
			if cnt, ok := edge["count"].(float64); ok {
				commentsCount = int64(cnt)
			}
		}
	}

	videoViews := utils.NumVal(item, "videoViewCount", "video_view_count", "videoPlayCount")
	shares := utils.NumVal(item, "sharesCount", "shares_count", "reshareCount", "videoShareCount")

	return map[string]any{
		"id":         utils.StrVal(item, "id"),
		"shortCode":  utils.StrVal(item, "shortCode", "shortcode"),
		"url":        postURL,
		"thumbnail":  thumbnail,
		"caption":    caption,
		"type":       postType,
		"timestamp":  timestamp,
		"likes":      likesCount,
		"comments":   commentsCount,
		"videoViews": videoViews,
		"shares":     shares,
	}
}

func HandleInstagramComments(c *cache.TTLCache) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			PostURL string `json:"post_url"`
			Count   int    `json:"count"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			utils.ErrJSON(w, "Invalid request body")
			return
		}
		apiKey, ok := GetKeyFromCookie(r, "instagram")
		if !ok {
			utils.ErrJSON(w, "Apify API key not set. Click \"API Keys\" to add one.")
			return
		}
		if req.PostURL == "" {
			utils.ErrJSON(w, "post_url is required")
			return
		}
		if req.Count <= 0 {
			req.Count = 50
		}

		// Read optional Instagram session cookie for higher comment limits
		sessionID := ""
		if sc, err := r.Cookie("lurkr_ig_session"); err == nil {
			sessionID = strings.TrimSpace(sc.Value)
		}

		cacheKey := fmt.Sprintf("ig_comments|%s|%s|%d|%s", apiKey, req.PostURL, req.Count, sessionID)
		if cached, ok := c.Get(cacheKey); ok {
			w.Header().Set("Content-Type", "application/json")
			w.Write(cached)
			return
		}

		client := &http.Client{Timeout: apifyTimeout + 30*time.Second}
		endpoint := fmt.Sprintf(
			"%s/apify~instagram-comment-scraper/run-sync-get-dataset-items?token=%s&timeout=110&memory=1024",
			apifyBase, apiKey,
		)

		body := map[string]any{
			"directUrls":   []string{req.PostURL}, // fixed: was "postURLs"
			"resultsLimit": req.Count,
		}
		if sessionID != "" {
			body["cookiesID"] = sessionID
		}

		data, status, err := utils.DoPOST(client, endpoint, body)
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

		var raw []map[string]any
		if err := json.Unmarshal(data, &raw); err != nil {
			result := map[string]any{
				"comments": []map[string]any{},
				"total":    0,
				"warning":  "No comments returned. If this post has comments, add an Instagram Session ID in API Keys for full access.",
			}
			b, _ := json.Marshal(result)
			w.Header().Set("Content-Type", "application/json")
			w.Write(b)
			return
		}
		if len(raw) == 0 {
			noSessionMsg := ""
			if sessionID == "" {
				noSessionMsg = " Add an Instagram Session ID in API Keys to unlock more comments."
			}
			result := map[string]any{
				"comments": []map[string]any{},
				"total":    0,
				"warning":  "No comments returned." + noSessionMsg,
			}
			b, _ := json.Marshal(result)
			w.Header().Set("Content-Type", "application/json")
			w.Write(b)
			return
		}

		comments := []map[string]any{}
		for i, item := range raw {
			if i >= req.Count {
				break
			}
			timestamp := utils.StrVal(item, "timestamp", "created_at_utc")
			if timestamp == "" {
				for _, k := range []string{"createdAt", "created_at"} {
					if v, ok := item[k]; ok {
						timestamp = utils.ParseTimestamp(v)
						break
					}
				}
			}
			ownerUsername := utils.StrVal(item, "ownerUsername", "owner_username")
			if ownerUsername == "" {
				if owner, ok := item["owner"].(map[string]any); ok {
					ownerUsername = utils.StrVal(owner, "username")
				}
			}
			avatar := utils.StrVal(item, "ownerProfilePicUrl", "profilePicUrl",
				"avatarUrl", "ownerAvatar", "profile_pic_url")
			if avatar == "" {
				if owner, ok := item["owner"].(map[string]any); ok {
					avatar = utils.StrVal(owner, "profile_pic_url", "profilePicUrl", "avatarUrl")
				}
			}
			comments = append(comments, map[string]any{
				"id":       utils.StrVal(item, "id"),
				"username": ownerUsername,
				"avatar":   avatar,
				"text":     utils.StrVal(item, "text"),
				"likes":    utils.NumVal(item, "likesCount", "like_count"),
				"replies":  utils.NumVal(item, "repliesCount", "replies_count"),
				"posted":   timestamp,
			})
		}

		result := map[string]any{"comments": comments, "total": len(comments)}
		b, _ := json.Marshal(result)
		c.Set(cacheKey, b)
		w.Header().Set("Content-Type", "application/json")
		w.Write(b)
	}
}
