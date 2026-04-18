package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"lurkr/backend/cache"
	"lurkr/backend/handlers"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "5000"
	}

	staticDir := "static"
	c := cache.New(10*time.Minute, 50)

	mux := http.NewServeMux()

	mux.HandleFunc("/health", handlers.HandleHealth)

	// Key management — stores keys in httpOnly cookies, never exposed to JS
	mux.HandleFunc("/keys/set", handlers.HandleSetKey)
	mux.HandleFunc("/keys/clear", handlers.HandleClearKey)
	mux.HandleFunc("/keys/status", handlers.HandleKeyStatus)

	// TikTok routes
	mux.HandleFunc("/scrape/tiktok/videos", handlers.HandleTikTokVideos(c))
	mux.HandleFunc("/scrape/tiktok/comments", handlers.HandleTikTokComments(c))

	// YouTube routes
	mux.HandleFunc("/scrape/youtube/channel", handlers.HandleYouTubeChannel(c))
	mux.HandleFunc("/scrape/youtube/videos", handlers.HandleYouTubeVideos(c))
	mux.HandleFunc("/scrape/youtube/video-stats", handlers.HandleYouTubeVideoStats(c))
	mux.HandleFunc("/scrape/youtube/comments", handlers.HandleYouTubeComments(c))

	// Instagram routes
	mux.HandleFunc("/scrape/instagram/posts", handlers.HandleInstagramPosts(c))
	mux.HandleFunc("/scrape/instagram/comments", handlers.HandleInstagramComments(c))

	mux.HandleFunc("/image-proxy", handlers.HandleImageProxy)

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
