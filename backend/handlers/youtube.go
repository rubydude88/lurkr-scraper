package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"lurkr/backend/cache"
	"lurkr/backend/utils"
)

const (
	youtubeBase = "https://www.googleapis.com/youtube/v3"
	ytTimeout   = 60 * time.Second
)

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

type ytThumbnail struct {
	URL    string `json:"url"`
	Width  int    `json:"width"`
	Height int    `json:"height"`
}

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

func HandleYouTubeChannel(c *cache.TTLCache) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			ChannelID string `json:"channel_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			utils.ErrJSON(w, "Invalid request body")
			return
		}
		apiKey, ok := GetKeyFromCookie(r, "youtube")
		if !ok {
			utils.ErrJSON(w, "YouTube API key not set. Click \"API Keys\" to add one.")
			return
		}
		req.ChannelID = strings.TrimSpace(req.ChannelID)
		if req.ChannelID == "" {
			utils.ErrJSON(w, "channel_id is required")
			return
		}

		cacheKey := fmt.Sprintf("yt_channel|%s|%s", apiKey, req.ChannelID)
		if cached, ok := c.Get(cacheKey); ok {
			w.Header().Set("Content-Type", "application/json")
			w.Write(cached)
			return
		}

		client := &http.Client{Timeout: ytTimeout}
		param, value := resolveChannelParam(req.ChannelID)

		data, status, err := utils.DoGET(client, youtubeBase+"/channels", url.Values{
			"part": {"snippet,statistics"},
			param:  {value},
			"key":  {apiKey},
		})
		if err != nil {
			utils.ErrJSON(w, "Request failed: "+err.Error())
			return
		}
		if status != 200 {
			if msg := parseYTError(data); msg != "" {
				utils.ErrJSON(w, msg)
			} else {
				utils.ErrJSON(w, fmt.Sprintf("YouTube API returned status %d", status))
			}
			return
		}
		if msg := parseYTError(data); msg != "" {
			utils.ErrJSON(w, msg)
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
			utils.ErrJSON(w, "Failed to parse YouTube response")
			return
		}
		if resp.Error != nil {
			utils.ErrJSON(w, fmt.Sprintf("YouTube API error %d: %s", resp.Error.Code, resp.Error.Message))
			return
		}
		if len(resp.Items) == 0 {
			utils.ErrJSON(w, "Channel not found. Check the handle, channel ID, or URL and ensure your API key is valid.")
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
			"subscriberCount": utils.IntOrNil(item.Statistics.SubscriberCount),
			"videoCount":      utils.IntOrNil(item.Statistics.VideoCount),
			"viewCount":       utils.IntOrNil(item.Statistics.ViewCount),
			"publishedAt":     item.Snippet.PublishedAt,
			"country":         item.Snippet.Country,
		}
		b, _ := json.Marshal(result)
		c.Set(cacheKey, b)
		w.Header().Set("Content-Type", "application/json")
		w.Write(b)
	}
}

func HandleYouTubeVideos(c *cache.TTLCache) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			ChannelID  string `json:"channel_id"`
			MaxResults int    `json:"max_results"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			utils.ErrJSON(w, "Invalid request body")
			return
		}
		apiKey, ok := GetKeyFromCookie(r, "youtube")
		if !ok {
			utils.ErrJSON(w, "YouTube API key not set. Click \"API Keys\" to add one.")
			return
		}
		req.ChannelID = strings.TrimSpace(req.ChannelID)
		if req.ChannelID == "" {
			utils.ErrJSON(w, "channel_id is required")
			return
		}
		if req.MaxResults <= 0 {
			req.MaxResults = 25
		}
		if req.MaxResults > 200 {
			req.MaxResults = 200
		}

		cacheKey := fmt.Sprintf("yt_videos|%s|%s|%d", apiKey, req.ChannelID, req.MaxResults)
		if cached, ok := c.Get(cacheKey); ok {
			w.Header().Set("Content-Type", "application/json")
			w.Write(cached)
			return
		}

		client := &http.Client{Timeout: ytTimeout}
		param, value := resolveChannelParam(req.ChannelID)

		chData, chStatus, chErr := utils.DoGET(client, youtubeBase+"/channels", url.Values{
			"part": {"contentDetails"},
			param:  {value},
			"key":  {apiKey},
		})
		if chErr != nil {
			utils.ErrJSON(w, "Request failed: "+chErr.Error())
			return
		}
		if chStatus != 200 {
			if msg := parseYTError(chData); msg != "" {
				utils.ErrJSON(w, msg)
			} else {
				utils.ErrJSON(w, fmt.Sprintf("YouTube API returned status %d", chStatus))
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
			utils.ErrJSON(w, "Failed to parse YouTube channel response")
			return
		}
		if chResp.Error != nil {
			utils.ErrJSON(w, fmt.Sprintf("YouTube API error %d: %s", chResp.Error.Code, chResp.Error.Message))
			return
		}
		if len(chResp.Items) == 0 {
			utils.ErrJSON(w, "Channel not found. Check the handle, channel ID, or URL and ensure your API key is valid.")
			return
		}
		uploadsPlaylist := chResp.Items[0].ContentDetails.RelatedPlaylists.Uploads
		resolvedChannelID := chResp.Items[0].ID
		if uploadsPlaylist == "" {
			utils.ErrJSON(w, "Could not find uploads playlist for this channel")
			return
		}

		var order []string
		metaMap := map[string]videoMeta{}
		pageToken := ""
		remaining := req.MaxResults

		for remaining > 0 {
			fetch := utils.MinInt(remaining, 50)
			params := url.Values{
				"part":       {"snippet"},
				"playlistId": {uploadsPlaylist},
				"maxResults": {strconv.Itoa(fetch)},
				"key":        {apiKey},
			}
			if pageToken != "" {
				params.Set("pageToken", pageToken)
			}
			plData, plStatus, plErr := utils.DoGET(client, youtubeBase+"/playlistItems", params)
			if plErr != nil {
				utils.ErrJSON(w, "Request failed: "+plErr.Error())
				return
			}
			if plStatus != 200 {
				if msg := parseYTError(plData); msg != "" {
					utils.ErrJSON(w, msg)
				} else {
					utils.ErrJSON(w, fmt.Sprintf("YouTube playlist API returned status %d", plStatus))
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
				utils.ErrJSON(w, "Failed to parse playlist response")
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
					continue
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

		statsMap := map[string]videoStats{}
		var statsMu sync.Mutex
		var wg sync.WaitGroup

		for start := 0; start < len(order); start += 50 {
			end := utils.MinInt(start+50, len(order))
			ids := strings.Join(order[start:end], ",")
			wg.Add(1)

			go func(ids string) {
				defer wg.Done()

				vData, vStatus, vErr := utils.DoGET(client, youtubeBase+"/videos", url.Values{
					"part": {"contentDetails,statistics,liveStreamingDetails,snippet"},
					"id":   {ids},
					"key":  {apiKey},
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
					durSecs := utils.ParseDuration(item.ContentDetails.Duration)
					local[item.ID] = videoStats{
						viewCount:    utils.IntOrNil(item.Statistics.ViewCount),
						likeCount:    utils.IntOrNil(item.Statistics.LikeCount),
						commentCount: utils.IntOrNil(item.Statistics.CommentCount),
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
		c.Set(cacheKey, b)
		w.Header().Set("Content-Type", "application/json")
		w.Write(b)
	}
}

func HandleYouTubeVideoStats(c *cache.TTLCache) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			VideoIDs string `json:"video_ids"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			utils.ErrJSON(w, "Invalid request body")
			return
		}
		apiKey, ok := GetKeyFromCookie(r, "youtube")
		if !ok {
			utils.ErrJSON(w, "YouTube API key not set. Click \"API Keys\" to add one.")
			return
		}
		if req.VideoIDs == "" {
			utils.ErrJSON(w, "video_ids is required")
			return
		}

		// Parse comma-separated IDs, strip URLs
		reYTVideoID := regexp.MustCompile(`[A-Za-z0-9_-]{11}`)
		rawIDs := strings.Split(req.VideoIDs, ",")
		var ids []string
		seen := map[string]bool{}
		for _, raw := range rawIDs {
			raw = strings.TrimSpace(raw)
			if raw == "" {
				continue
			}
			// If it looks like a URL, extract ID
			if strings.Contains(raw, "youtube.com") || strings.Contains(raw, "youtu.be") {
				if m := regexp.MustCompile(`(?:v=|youtu\.be/|/shorts/)([A-Za-z0-9_-]{11})`).FindStringSubmatch(raw); m != nil {
					raw = m[1]
				}
			}
			if reYTVideoID.MatchString(raw) && !seen[raw] {
				ids = append(ids, raw)
				seen[raw] = true
			}
		}
		if len(ids) == 0 {
			utils.ErrJSON(w, "No valid video IDs found")
			return
		}
		if len(ids) > 50 {
			ids = ids[:50]
		}

		cacheKey := fmt.Sprintf("yt_vstats|%s|%s", apiKey, strings.Join(ids, ","))
		if cached, ok := c.Get(cacheKey); ok {
			w.Header().Set("Content-Type", "application/json")
			w.Write(cached)
			return
		}

		client := &http.Client{Timeout: ytTimeout}
		data, status, err := utils.DoGET(client, youtubeBase+"/videos", url.Values{
			"part":  {"snippet,statistics,contentDetails"},
			"id":    {strings.Join(ids, ",")},
			"key":   {apiKey},
		})
		if err != nil {
			utils.ErrJSON(w, "Request failed: "+err.Error())
			return
		}
		if status != 200 {
			if msg := parseYTError(data); msg != "" {
				utils.ErrJSON(w, msg)
			} else {
				utils.ErrJSON(w, fmt.Sprintf("YouTube API error %d", status))
			}
			return
		}

		var envelope struct {
			Items []struct {
				ID      string `json:"id"`
				Snippet struct {
					Title       string `json:"title"`
					PublishedAt string `json:"publishedAt"`
				} `json:"snippet"`
				Statistics struct {
					ViewCount    string `json:"viewCount"`
					LikeCount    string `json:"likeCount"`
					CommentCount string `json:"commentCount"`
				} `json:"statistics"`
				ContentDetails struct {
					Duration string `json:"duration"`
				} `json:"contentDetails"`
			} `json:"items"`
		}
		if err := json.Unmarshal(data, &envelope); err != nil {
			utils.ErrJSON(w, "Failed to parse YouTube response")
			return
		}

		stats := []map[string]any{}
		for _, item := range envelope.Items {
			secs := utils.ParseDuration(item.ContentDetails.Duration)
			vc, _ := strconv.ParseInt(item.Statistics.ViewCount, 10, 64)
			lc, _ := strconv.ParseInt(item.Statistics.LikeCount, 10, 64)
			cc, _ := strconv.ParseInt(item.Statistics.CommentCount, 10, 64)
			stats = append(stats, map[string]any{
				"id":              item.ID,
				"title":           item.Snippet.Title,
				"publishedAt":     item.Snippet.PublishedAt,
				"duration":        item.ContentDetails.Duration,
				"durationSeconds": secs,
				"viewCount":       vc,
				"likeCount":       lc,
				"commentCount":    cc,
				"url":             "https://www.youtube.com/watch?v=" + item.ID,
			})
		}

		result := map[string]any{"stats": stats, "total": len(stats)}
		b, _ := json.Marshal(result)
		c.Set(cacheKey, b)
		w.Header().Set("Content-Type", "application/json")
		w.Write(b)
	}
}

func HandleYouTubeComments(c *cache.TTLCache) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			VideoID string `json:"video_id"`
			Count   int    `json:"count"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			utils.ErrJSON(w, "Invalid request body")
			return
		}
		apiKey, ok := GetKeyFromCookie(r, "youtube")
		if !ok {
			utils.ErrJSON(w, "YouTube API key not set. Click \"API Keys\" to add one.")
			return
		}
		if req.VideoID == "" {
			utils.ErrJSON(w, "video_id is required")
			return
		}
		if req.Count <= 0 {
			req.Count = 100
		}
		if req.Count > 100 {
			req.Count = 100
		}

		cacheKey := fmt.Sprintf("yt_comments|%s|%s|%d", apiKey, req.VideoID, req.Count)
		if cached, ok := c.Get(cacheKey); ok {
			w.Header().Set("Content-Type", "application/json")
			w.Write(cached)
			return
		}

		client := &http.Client{Timeout: ytTimeout}
		endpoint := fmt.Sprintf("%s/commentThreads?part=snippet&videoId=%s&maxResults=%d&order=relevance&key=%s",
			youtubeBase, url.QueryEscape(req.VideoID), req.Count, apiKey)

		resp, err := client.Get(endpoint)
		if err != nil {
			utils.ErrJSON(w, "YouTube API request failed: "+err.Error())
			return
		}
		defer resp.Body.Close()

		var buf strings.Builder
		for {
			b := make([]byte, 4096)
			n, e := resp.Body.Read(b)
			if n > 0 {
				buf.Write(b[:n])
			}
			if e != nil {
				break
			}
		}
		rawData := []byte(buf.String())

		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			if msg := parseYTError(rawData); msg != "" {
				utils.ErrJSON(w, msg)
			} else {
				utils.ErrJSON(w, fmt.Sprintf("YouTube API error %d", resp.StatusCode))
			}
			return
		}

		var envelope struct {
			Items []struct {
				Snippet struct {
					TopLevelComment struct {
						Snippet struct {
							AuthorDisplayName  string `json:"authorDisplayName"`
							AuthorProfileImage string `json:"authorProfileImageUrl"`
							TextDisplay        string `json:"textDisplay"`
							LikeCount          int64  `json:"likeCount"`
							PublishedAt        string `json:"publishedAt"`
						} `json:"snippet"`
						ID string `json:"id"`
					} `json:"topLevelComment"`
					TotalReplyCount int64 `json:"totalReplyCount"`
				} `json:"snippet"`
			} `json:"items"`
		}
		if err := json.Unmarshal(rawData, &envelope); err != nil {
			utils.ErrJSON(w, "Failed to parse YouTube response")
			return
		}

		comments := []map[string]any{}
		for _, item := range envelope.Items {
			s := item.Snippet.TopLevelComment.Snippet
			comments = append(comments, map[string]any{
				"id":       item.Snippet.TopLevelComment.ID,
				"username": s.AuthorDisplayName,
				"avatar":   s.AuthorProfileImage,
				"text":     s.TextDisplay,
				"likes":    s.LikeCount,
				"replies":  item.Snippet.TotalReplyCount,
				"posted":   s.PublishedAt,
			})
		}

		result := map[string]any{"comments": comments, "total": len(comments)}
		b, _ := json.Marshal(result)
		c.Set(cacheKey, b)
		w.Header().Set("Content-Type", "application/json")
		w.Write(b)
	}
}
