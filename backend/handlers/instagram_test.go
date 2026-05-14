package handlers

import (
	"fmt"
	"testing"
	"time"
)

// TestItemToIGPost_Image verifies a standard image post maps correctly.
func TestItemToIGPost_Image(t *testing.T) {
	item := map[string]any{
		"id":            "3012345678901234567",
		"type":          "Image",
		"shortCode":     "C_testABC123",
		"caption":       "Test post caption #hello",
		"url":           "https://www.instagram.com/p/C_testABC123/",
		"displayUrl":    "https://cdninstagram.com/v/test.jpg",
		"commentsCount": float64(42),
		"likesCount":    float64(1234),
		"timestamp":     "2024-06-15T10:30:00.000Z",
		"ownerUsername": "testuser",
		"productType":   "feed",
	}

	post := itemToIGPost(item)

	assertStr(t, "id", "3012345678901234567", post["id"])
	assertStr(t, "shortCode", "C_testABC123", post["shortCode"])
	assertStr(t, "url", "https://www.instagram.com/p/C_testABC123/", post["url"])
	assertStr(t, "thumbnail", "https://cdninstagram.com/v/test.jpg", post["thumbnail"])
	assertStr(t, "caption", "Test post caption #hello", post["caption"])
	assertInt(t, "likes", 1234, post["likes"])
	assertInt(t, "comments", 42, post["comments"])
	assertInt(t, "videoViews", 0, post["videoViews"]) // image: no views

	ts := post["timestamp"].(string)
	if ts == "" {
		t.Error("timestamp: expected non-empty, got empty")
	}
	_, err := time.Parse(time.RFC3339, ts)
	if err != nil {
		// Apify may return with milliseconds
		_, err2 := time.Parse("2006-01-02T15:04:05.000Z", ts)
		if err2 != nil {
			t.Errorf("timestamp %q not parseable as RFC3339: %v", ts, err)
		}
	}
}

// TestItemToIGPost_Video verifies a video post maps correctly.
// videoViews must use videoPlayCount — confirmed against real IG, this is what the grid shows.
func TestItemToIGPost_Video(t *testing.T) {
	item := map[string]any{
		"id":             "3098765432109876543",
		"type":           "Video",
		"shortCode":      "C_videoXYZ456",
		"caption":        "Video caption",
		"url":            "https://www.instagram.com/p/C_videoXYZ456/",
		"displayUrl":     "https://cdninstagram.com/v/reel_thumb.jpg",
		"commentsCount":  float64(150),
		"likesCount":     float64(9876),
		"timestamp":      "2024-07-20T08:00:00.000Z",
		"ownerUsername":  "testuser",
		"productType":    "feed",
		"videoViewCount": float64(250000),
		"videoPlayCount": float64(310000), // this is what IG grid actually displays
	}

	post := itemToIGPost(item)

	assertInt(t, "likes", 9876, post["likes"])
	assertInt(t, "comments", 150, post["comments"])
	// Must use videoPlayCount (310000), not videoViewCount (250000)
	assertInt(t, "videoViews", 310000, post["videoViews"])
}

// TestItemToIGPost_Reel verifies productType=clips maps to type "reel".
func TestItemToIGPost_Reel(t *testing.T) {
	item := map[string]any{
		"id":             "3098765432109876500",
		"type":           "Video",
		"shortCode":      "C_reel999",
		"caption":        "Reel caption #reel",
		"url":            "https://www.instagram.com/p/C_reel999/",
		"displayUrl":     "https://cdninstagram.com/v/reel_thumb.jpg",
		"commentsCount":  float64(80),
		"likesCount":     float64(5000),
		"timestamp":      "2024-07-01T10:00:00.000Z",
		"ownerUsername":  "testuser",
		"productType":    "clips", // ← Apify marks Reels as "clips"
		"videoViewCount": float64(80000),
		"videoPlayCount": float64(100000), // IG shows this one
	}

	post := itemToIGPost(item)

	typ := post["type"].(string)
	if typ != "reel" {
		t.Errorf("type: got %q, want %q (productType=clips should map to reel)", typ, "reel")
	}
	assertInt(t, "videoViews", 100000, post["videoViews"])
}

// TestItemToIGPost_Sidecar verifies album maps correctly.
func TestItemToIGPost_Sidecar(t *testing.T) {
	item := map[string]any{
		"id":            "3011111111111111111",
		"type":          "Sidecar",
		"shortCode":     "C_albumDEF789",
		"caption":       "Album post",
		"displayUrl":    "https://cdninstagram.com/v/album_cover.jpg",
		"commentsCount": float64(22),
		"likesCount":    float64(567),
		"timestamp":     "2024-05-01T14:00:00.000Z",
		"ownerUsername": "testuser",
		"productType":   "carousel_container",
	}

	post := itemToIGPost(item)

	assertInt(t, "likes", 567, post["likes"])
	assertInt(t, "comments", 22, post["comments"])
	// URL reconstructed from shortCode since "url" not set
	url := post["url"].(string)
	if url == "" {
		t.Error("url: expected reconstructed URL from shortCode, got empty")
	}
	// carousel_container should map type to sidecar
	typ := post["type"].(string)
	if typ != "sidecar" {
		t.Errorf("type: got %q, want %q (productType=carousel_container)", typ, "sidecar")
	}
}

// TestItemToIGPost_NumericTimestamp verifies Unix epoch integer timestamps are handled.
// Apify sometimes returns "timestamp" as a numeric Unix epoch rather than ISO string.
func TestItemToIGPost_NumericTimestamp(t *testing.T) {
	item := map[string]any{
		"id":            "1234567890",
		"shortCode":     "Babcde",
		"displayUrl":    "https://cdn.instagram.com/img.jpg",
		"likesCount":    float64(100),
		"commentsCount": float64(5),
		"timestamp":     float64(1718445000), // numeric Unix epoch
	}

	post := itemToIGPost(item)

	ts := post["timestamp"].(string)
	if ts == "" {
		t.Error("timestamp: numeric Unix epoch not parsed — got empty string")
	}
	_, err := time.Parse(time.RFC3339, ts)
	if err != nil {
		t.Errorf("timestamp %q from numeric epoch is not valid RFC3339: %v", ts, err)
	}
}

// TestItemToIGPost_ShortCodeURLFallback verifies URL is built from shortCode when url missing.
func TestItemToIGPost_ShortCodeURLFallback(t *testing.T) {
	item := map[string]any{
		"shortCode":     "C_mypost123",
		"likesCount":    float64(10),
		"commentsCount": float64(1),
		"timestamp":     "2024-01-01T00:00:00Z",
	}

	post := itemToIGPost(item)

	want := "https://www.instagram.com/p/C_mypost123/"
	url := post["url"].(string)
	if url != want {
		t.Errorf("url: got %q, want %q", url, want)
	}
}

// TestItemToIGPost_Shares verifies shares gracefully returns 0 for IG posts
// (Instagram does not expose share counts via API).
func TestItemToIGPost_Shares(t *testing.T) {
	item := map[string]any{
		"shortCode":     "C_noshares",
		"likesCount":    float64(500),
		"commentsCount": float64(10),
		"timestamp":     "2024-01-01T00:00:00Z",
	}
	post := itemToIGPost(item)
	assertInt(t, "shares", 0, post["shares"])
}

// TestSortPostsNewestFirst verifies the sort in HandleInstagramPosts produces newest-first order.
func TestSortPostsNewestFirst(t *testing.T) {
	makePost := func(ts, sc string) map[string]any {
		return itemToIGPost(map[string]any{
			"shortCode":     sc,
			"timestamp":     ts,
			"likesCount":    float64(1),
			"commentsCount": float64(0),
		})
	}

	posts := []map[string]any{
		makePost("2024-01-01T00:00:00Z", "old"),
		makePost("2024-06-15T00:00:00Z", "new"),
		makePost("2024-03-10T00:00:00Z", "mid"),
	}

	// Replicate the sort from HandleInstagramPosts
	for i := 0; i < len(posts)-1; i++ {
		for j := i + 1; j < len(posts); j++ {
			ti, _ := time.Parse(time.RFC3339, fmt.Sprintf("%v", posts[i]["timestamp"]))
			tj, _ := time.Parse(time.RFC3339, fmt.Sprintf("%v", posts[j]["timestamp"]))
			if ti.Before(tj) {
				posts[i], posts[j] = posts[j], posts[i]
			}
		}
	}

	order := []string{
		posts[0]["shortCode"].(string),
		posts[1]["shortCode"].(string),
		posts[2]["shortCode"].(string),
	}
	if order[0] != "new" || order[1] != "mid" || order[2] != "old" {
		t.Errorf("sort order: got %v, want [new mid old]", order)
	}
}

// ── helpers ───────────────────────────────────────────────────────────────────

func assertStr(t *testing.T, field, want string, got any) {
	t.Helper()
	s, _ := got.(string)
	if s != want {
		t.Errorf("%s: got %q, want %q", field, s, want)
	}
}

func assertInt(t *testing.T, field string, want int64, got any) {
	t.Helper()
	var v int64
	switch n := got.(type) {
	case int64:
		v = n
	case float64:
		v = int64(n)
	case int:
		v = int64(n)
	default:
		t.Errorf("%s: unexpected type %T (value %v)", field, got, got)
		return
	}
	if v != want {
		t.Errorf("%s: got %d, want %d", field, v, want)
	}
}
