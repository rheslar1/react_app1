package main

import (
	"context"
	"database/sql"
	"errors"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/go-sql-driver/mysql"

	"relayops/backend/internal/dashboard"
)

func main() {
	password := os.Getenv("MYSQL_PASSWORD")
	if password == "" {
		log.Fatal("MYSQL_PASSWORD must be set")
	}
	dbConfig := mysql.NewConfig()
	dbConfig.User = envOr("MYSQL_USER", "relay")
	dbConfig.Passwd = password
	dbConfig.Net = "tcp"
	dbConfig.Addr = envOr("MYSQL_HOST", "mysql:3306")
	dbConfig.DBName = envOr("MYSQL_DATABASE", "relayops")
	dbConfig.ParseTime = true
	dbConfig.Params = map[string]string{"charset": "utf8mb4"}
	dbConfig.Timeout = 5 * time.Second
	dbConfig.ReadTimeout = 5 * time.Second
	dbConfig.WriteTimeout = 5 * time.Second
	dsn := dbConfig.FormatDSN()
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		log.Fatalf("open database: %v", err)
	}
	defer db.Close()
	db.SetMaxOpenConns(15)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	for {
		if err = db.PingContext(ctx); err == nil {
			break
		}
		if ctx.Err() != nil {
			log.Fatalf("database unavailable: %v", err)
		}
		log.Printf("waiting for database readiness")
		time.Sleep(2 * time.Second)
	}
	repo := dashboard.NewMySQLRepository(db)
	if err = repo.Migrate(ctx); err != nil {
		log.Fatalf("database migration failed: %v", err)
	}

	secureCookie := !strings.EqualFold(os.Getenv("COOKIE_SECURE"), "false")
	config := dashboard.Config{
		CookieSecure: secureCookie,
		Version:      os.Getenv("APP_VERSION"),
		Revision:     os.Getenv("APP_REVISION"),
		ImageDigest:  os.Getenv("APP_IMAGE_DIGEST"),
		Environment:  os.Getenv("APP_ENVIRONMENT"),
	}
	server := dashboard.NewServer(repo, db, config)
	address := os.Getenv("API_ADDR")
	if address == "" {
		address = ":8081"
	}

	httpServer := &http.Server{
		Addr:              address,
		Handler:           server.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	log.Printf("API listening on %s", address)
	if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("API server: %v", err)
	}
}

func envOr(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}
