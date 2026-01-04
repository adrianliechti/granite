package redis

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/adrianliechti/granite/pkg/db"

	"github.com/redis/go-redis/v9"
)

var _ db.Provider = (*Provider)(nil)

// Config contains Redis connection configuration
type Config struct {
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Password string `json:"password,omitempty"`
	DB       int    `json:"db"`
}

// Provider implements db.Provider for Redis
type Provider struct {
	config Config
}

// New creates a new Redis provider
func New(cfg Config) (*Provider, error) {
	if cfg.Host == "" {
		cfg.Host = "localhost"
	}

	if cfg.Port == 0 {
		cfg.Port = 6379
	}

	return &Provider{
		config: cfg,
	}, nil
}

// ParseConfig parses a config map into Config
func ParseConfig(configMap map[string]any) (Config, error) {
	cfg := Config{}

	if v, ok := configMap["host"].(string); ok {
		cfg.Host = v
	}

	if v, ok := configMap["port"].(float64); ok {
		cfg.Port = int(v)
	} else if v, ok := configMap["port"].(int); ok {
		cfg.Port = v
	}

	if v, ok := configMap["password"].(string); ok {
		cfg.Password = v
	}

	if v, ok := configMap["db"].(float64); ok {
		cfg.DB = int(v)
	} else if v, ok := configMap["db"].(int); ok {
		cfg.DB = v
	}

	return cfg, nil
}

func (p *Provider) connect(ctx context.Context) (*redis.Client, error) {
	client := redis.NewClient(&redis.Options{
		Addr:     fmt.Sprintf("%s:%d", p.config.Host, p.config.Port),
		Password: p.config.Password,
		DB:       p.config.DB,
	})

	if err := client.Ping(ctx).Err(); err != nil {
		client.Close()
		return nil, fmt.Errorf("failed to connect to redis: %w", err)
	}

	return client, nil
}

// Query executes a Redis read command
// Supported commands: GET, KEYS, HGETALL, HGET, LRANGE, SMEMBERS, ZRANGE, TYPE, TTL, EXISTS
func (p *Provider) Query(ctx context.Context, query string, params ...any) (*db.QueryResult, error) {
	client, err := p.connect(ctx)

	if err != nil {
		return nil, err
	}

	defer client.Close()

	parts := strings.Fields(query)

	if len(parts) == 0 {
		return nil, errors.New("empty query")
	}

	cmd := strings.ToUpper(parts[0])
	args := parts[1:]

	switch cmd {
	case "GET":
		if len(args) < 1 {
			return nil, errors.New("GET requires a key")
		}

		val, err := client.Get(ctx, args[0]).Result()

		if err == redis.Nil {
			return &db.QueryResult{
				Columns: []string{"key", "value"},
				Rows:    []map[string]any{},
			}, nil
		}

		if err != nil {
			return nil, err
		}

		return &db.QueryResult{
			Columns: []string{"key", "value"},
			Rows:    []map[string]any{{"key": args[0], "value": val}},
		}, nil

	case "KEYS":
		pattern := "*"

		if len(args) > 0 {
			pattern = args[0]
		}

		keys, err := client.Keys(ctx, pattern).Result()

		if err != nil {
			return nil, err
		}

		rows := make([]map[string]any, len(keys))

		for i, key := range keys {
			rows[i] = map[string]any{"key": key}
		}

		return &db.QueryResult{
			Columns: []string{"key"},
			Rows:    rows,
		}, nil

	case "HGETALL":
		if len(args) < 1 {
			return nil, errors.New("HGETALL requires a key")
		}

		val, err := client.HGetAll(ctx, args[0]).Result()
		if err != nil {
			return nil, err
		}

		rows := make([]map[string]any, 0, len(val))

		for field, value := range val {
			rows = append(rows, map[string]any{"field": field, "value": value})
		}

		return &db.QueryResult{
			Columns: []string{"field", "value"},
			Rows:    rows,
		}, nil

	case "HGET":
		if len(args) < 2 {
			return nil, errors.New("HGET requires a key and field")
		}

		val, err := client.HGet(ctx, args[0], args[1]).Result()

		if err == redis.Nil {
			return &db.QueryResult{
				Columns: []string{"field", "value"},
				Rows:    []map[string]any{},
			}, nil
		}

		if err != nil {
			return nil, err
		}

		return &db.QueryResult{
			Columns: []string{"field", "value"},
			Rows:    []map[string]any{{"field": args[1], "value": val}},
		}, nil

	case "LRANGE":
		if len(args) < 3 {
			return nil, errors.New("LRANGE requires key, start, stop")
		}

		start, _ := strconv.ParseInt(args[1], 10, 64)
		stop, _ := strconv.ParseInt(args[2], 10, 64)
		vals, err := client.LRange(ctx, args[0], start, stop).Result()

		if err != nil {
			return nil, err
		}

		rows := make([]map[string]any, len(vals))

		for i, val := range vals {
			rows[i] = map[string]any{"index": i, "value": val}
		}

		return &db.QueryResult{
			Columns: []string{"index", "value"},
			Rows:    rows,
		}, nil

	case "SMEMBERS":
		if len(args) < 1 {
			return nil, errors.New("SMEMBERS requires a key")
		}

		vals, err := client.SMembers(ctx, args[0]).Result()

		if err != nil {
			return nil, err
		}

		rows := make([]map[string]any, len(vals))

		for i, val := range vals {
			rows[i] = map[string]any{"value": val}
		}

		return &db.QueryResult{
			Columns: []string{"value"},
			Rows:    rows,
		}, nil

	case "ZRANGE":
		if len(args) < 3 {
			return nil, errors.New("ZRANGE requires key, start, stop")
		}

		start, _ := strconv.ParseInt(args[1], 10, 64)
		stop, _ := strconv.ParseInt(args[2], 10, 64)
		vals, err := client.ZRangeWithScores(ctx, args[0], start, stop).Result()

		if err != nil {
			return nil, err
		}

		rows := make([]map[string]any, len(vals))

		for i, val := range vals {
			rows[i] = map[string]any{"member": val.Member, "score": val.Score}
		}

		return &db.QueryResult{
			Columns: []string{"member", "score"},
			Rows:    rows,
		}, nil

	case "TYPE":
		if len(args) < 1 {
			return nil, errors.New("TYPE requires a key")
		}

		val, err := client.Type(ctx, args[0]).Result()

		if err != nil {
			return nil, err
		}

		return &db.QueryResult{
			Columns: []string{"key", "type"},
			Rows:    []map[string]any{{"key": args[0], "type": val}},
		}, nil

	case "TTL":
		if len(args) < 1 {
			return nil, errors.New("TTL requires a key")
		}

		val, err := client.TTL(ctx, args[0]).Result()

		if err != nil {
			return nil, err
		}

		return &db.QueryResult{
			Columns: []string{"key", "ttl"},
			Rows:    []map[string]any{{"key": args[0], "ttl": val.Seconds()}},
		}, nil

	case "EXISTS":
		if len(args) < 1 {
			return nil, errors.New("EXISTS requires at least one key")
		}

		val, err := client.Exists(ctx, args...).Result()

		if err != nil {
			return nil, err
		}

		return &db.QueryResult{
			Columns: []string{"count"},
			Rows:    []map[string]any{{"count": val}},
		}, nil

	default:
		return nil, fmt.Errorf("unsupported query command: %s", cmd)
	}
}

// Execute executes a Redis write command
// Supported commands: SET, DEL, HSET, HDEL, LPUSH, RPUSH, SADD, SREM, ZADD, ZREM, EXPIRE, RENAME, FLUSHDB
func (p *Provider) Execute(ctx context.Context, query string, params ...any) (*db.ExecResult, error) {
	client, err := p.connect(ctx)

	if err != nil {
		return nil, err
	}

	defer client.Close()

	parts := strings.Fields(query)

	if len(parts) == 0 {
		return nil, errors.New("empty query")
	}

	cmd := strings.ToUpper(parts[0])
	args := parts[1:]

	switch cmd {
	case "SET":
		if len(args) < 2 {
			return nil, errors.New("SET requires key and value")
		}

		value := strings.Join(args[1:], " ")
		err := client.Set(ctx, args[0], value, 0).Err()

		if err != nil {
			return nil, err
		}

		return &db.ExecResult{RowsAffected: 1}, nil

	case "DEL":
		if len(args) < 1 {
			return nil, errors.New("DEL requires at least one key")
		}

		val, err := client.Del(ctx, args...).Result()

		if err != nil {
			return nil, err
		}

		return &db.ExecResult{RowsAffected: val}, nil

	case "HSET":
		if len(args) < 3 {
			return nil, errors.New("HSET requires key, field, and value")
		}

		value := strings.Join(args[2:], " ")
		val, err := client.HSet(ctx, args[0], args[1], value).Result()

		if err != nil {
			return nil, err
		}

		return &db.ExecResult{RowsAffected: val}, nil

	case "HDEL":
		if len(args) < 2 {
			return nil, errors.New("HDEL requires key and at least one field")
		}

		val, err := client.HDel(ctx, args[0], args[1:]...).Result()

		if err != nil {
			return nil, err
		}

		return &db.ExecResult{RowsAffected: val}, nil

	case "LPUSH":
		if len(args) < 2 {
			return nil, errors.New("LPUSH requires key and at least one value")
		}

		values := make([]any, len(args)-1)

		for i, v := range args[1:] {
			values[i] = v
		}

		val, err := client.LPush(ctx, args[0], values...).Result()

		if err != nil {
			return nil, err
		}

		return &db.ExecResult{RowsAffected: val}, nil

	case "RPUSH":
		if len(args) < 2 {
			return nil, errors.New("RPUSH requires key and at least one value")
		}

		values := make([]any, len(args)-1)

		for i, v := range args[1:] {
			values[i] = v
		}

		val, err := client.RPush(ctx, args[0], values...).Result()

		if err != nil {
			return nil, err
		}

		return &db.ExecResult{RowsAffected: val}, nil

	case "SADD":
		if len(args) < 2 {
			return nil, errors.New("SADD requires key and at least one member")
		}

		members := make([]any, len(args)-1)

		for i, v := range args[1:] {
			members[i] = v
		}

		val, err := client.SAdd(ctx, args[0], members...).Result()

		if err != nil {
			return nil, err
		}

		return &db.ExecResult{RowsAffected: val}, nil

	case "SREM":
		if len(args) < 2 {
			return nil, errors.New("SREM requires key and at least one member")
		}

		members := make([]any, len(args)-1)

		for i, v := range args[1:] {
			members[i] = v
		}

		val, err := client.SRem(ctx, args[0], members...).Result()

		if err != nil {
			return nil, err
		}

		return &db.ExecResult{RowsAffected: val}, nil

	case "ZADD":
		if len(args) < 3 {
			return nil, errors.New("ZADD requires key, score, and member")
		}

		score, err := strconv.ParseFloat(args[1], 64)

		if err != nil {
			return nil, fmt.Errorf("invalid score: %w", err)
		}

		val, err := client.ZAdd(ctx, args[0], redis.Z{Score: score, Member: args[2]}).Result()

		if err != nil {
			return nil, err
		}

		return &db.ExecResult{RowsAffected: val}, nil

	case "ZREM":
		if len(args) < 2 {
			return nil, errors.New("ZREM requires key and at least one member")
		}

		members := make([]any, len(args)-1)

		for i, v := range args[1:] {
			members[i] = v
		}

		val, err := client.ZRem(ctx, args[0], members...).Result()

		if err != nil {
			return nil, err
		}

		return &db.ExecResult{RowsAffected: val}, nil

	case "EXPIRE":
		if len(args) < 2 {
			return nil, errors.New("EXPIRE requires key and seconds")
		}

		seconds, err := strconv.ParseInt(args[1], 10, 64)

		if err != nil {
			return nil, fmt.Errorf("invalid seconds: %w", err)
		}

		val, err := client.Expire(ctx, args[0], time.Duration(seconds)*time.Second).Result()

		if err != nil {
			return nil, err
		}

		affected := int64(0)

		if val {
			affected = 1
		}

		return &db.ExecResult{RowsAffected: affected}, nil

	case "RENAME":
		if len(args) < 2 {
			return nil, errors.New("RENAME requires old key and new key")
		}

		err := client.Rename(ctx, args[0], args[1]).Err()

		if err != nil {
			return nil, err
		}

		return &db.ExecResult{RowsAffected: 1}, nil

	case "FLUSHDB":
		err := client.FlushDB(ctx).Err()

		if err != nil {
			return nil, err
		}

		return &db.ExecResult{RowsAffected: 0}, nil

	default:
		return nil, fmt.Errorf("unsupported execute command: %s", cmd)
	}
}
