package cache

import (
	"sync"
	"time"
)

type entry struct {
	value     []byte
	expiresAt time.Time
}

type TTLCache struct {
	mu      sync.RWMutex
	entries map[string]entry
	ttl     time.Duration
	maxSize int
}

func New(ttl time.Duration, maxSize int) *TTLCache {
	c := &TTLCache{
		entries: make(map[string]entry),
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

func (c *TTLCache) Get(key string) ([]byte, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	e, ok := c.entries[key]
	if !ok || time.Now().After(e.expiresAt) {
		return nil, false
	}
	return e.value, true
}

func (c *TTLCache) Set(key string, val []byte) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.entries) >= c.maxSize {
		for k, e := range c.entries {
			if time.Now().After(e.expiresAt) {
				delete(c.entries, k)
				break
			}
		}
		if len(c.entries) >= c.maxSize {
			for k := range c.entries {
				delete(c.entries, k)
				break
			}
		}
	}
	c.entries[key] = entry{value: val, expiresAt: time.Now().Add(c.ttl)}
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
