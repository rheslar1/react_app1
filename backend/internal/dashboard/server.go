package dashboard

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/mail"
	"net/url"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

const (
	sessionCookie = "relay_session"
	sessionTTL    = 24 * time.Hour
)

type Config struct {
	CookieSecure bool
	Version      string
	Revision     string
	ImageDigest  string
	Environment  string
}

type Server struct {
	repo Repository
	db   interface{ PingContext(context.Context) error }
	cfg  Config
	mux  *http.ServeMux
}

func NewServer(repo Repository, db interface{ PingContext(context.Context) error }, cfg Config) *Server {
	s := &Server{repo: repo, db: db, cfg: cfg, mux: http.NewServeMux()}
	s.mux.HandleFunc("POST /api/auth/register", s.register)
	s.mux.HandleFunc("POST /api/auth/login", s.login)
	s.mux.HandleFunc("GET /api/auth/me", s.me)
	s.mux.HandleFunc("POST /api/auth/logout", s.logout)
	s.mux.HandleFunc("GET /api/health", s.health)
	s.mux.HandleFunc("GET /healthz", s.readiness)
	return s
}

func (s *Server) Handler() http.Handler {
	return securityHeaders(s.mux)
}

func (s *Server) register(w http.ResponseWriter, r *http.Request) {
	var input credentials
	if !decodeJSON(w, r, &input) {
		return
	}
	email, ok := validateCredentials(w, input)
	if !ok {
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), 12)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Unable to create account.")
		return
	}
	user, err := s.repo.CreateUser(r.Context(), email, hash)
	if errors.Is(err, ErrConflict) {
		writeError(w, http.StatusConflict, "An account with this email already exists.")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Unable to create account.")
		return
	}
	if !s.establishSession(w, r.Context(), user) {
		writeError(w, http.StatusInternalServerError, "Unable to start a secure session.")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"user": publicUser(user)})
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	var input credentials
	if !decodeJSON(w, r, &input) {
		return
	}
	email, ok := validateCredentials(w, input)
	if !ok {
		return
	}
	user, err := s.repo.UserByEmail(r.Context(), email)
	if errors.Is(err, ErrNotFound) || (err == nil && bcrypt.CompareHashAndPassword(user.PasswordHash, []byte(input.Password)) != nil) {
		writeError(w, http.StatusUnauthorized, "Email or password is incorrect.")
		return
	}
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "Authentication service is temporarily unavailable.")
		return
	}
	if !s.establishSession(w, r.Context(), user) {
		writeError(w, http.StatusInternalServerError, "Unable to start a secure session.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": publicUser(user)})
}

func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	user, ok := s.authenticatedUser(w, r)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": publicUser(user)})
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie(sessionCookie); err == nil {
		if err := s.repo.DeleteSession(r.Context(), tokenDigest(cookie.Value)); err != nil {
			writeError(w, http.StatusServiceUnavailable, "Unable to revoke the session right now.")
			return
		}
	}
	clearSessionCookie(w, s.cfg.CookieSecure)
	w.WriteHeader(http.StatusNoContent)
}

func clearSessionCookie(w http.ResponseWriter, secure bool) {
	http.SetCookie(w, &http.Cookie{ //nolint:gosec // Secure follows COOKIE_SECURE, which defaults to true.
		Name: sessionCookie, Value: "", Path: "/", HttpOnly: true,
		Secure: secure, SameSite: http.SameSiteLaxMode, MaxAge: -1,
	})
}

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.authenticatedUser(w, r); !ok {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	database := "healthy"
	if err := s.db.PingContext(ctx); err != nil {
		database = "unavailable"
	}
	configured := s.cfg.Version != "" || s.cfg.Revision != "" || s.cfg.ImageDigest != "" || s.cfg.Environment != ""
	writeJSON(w, http.StatusOK, map[string]any{
		"api":       "healthy",
		"database":  database,
		"checkedAt": time.Now().UTC().Format(time.RFC3339),
		"deployment": map[string]any{
			"version": s.cfg.Version, "revision": s.cfg.Revision, "imageDigest": s.cfg.ImageDigest,
			"environment": s.cfg.Environment, "configured": configured,
		},
	})
}

func (s *Server) readiness(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	if err := s.db.PingContext(ctx); err != nil {
		http.Error(w, "not ready", http.StatusServiceUnavailable)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) authenticatedUser(w http.ResponseWriter, r *http.Request) (User, bool) {
	cookie, err := r.Cookie(sessionCookie)
	if err != nil || cookie.Value == "" {
		writeError(w, http.StatusUnauthorized, "Sign in to continue.")
		return User{}, false
	}
	user, err := s.repo.UserBySession(r.Context(), tokenDigest(cookie.Value))
	if errors.Is(err, ErrNotFound) {
		writeError(w, http.StatusUnauthorized, "Sign in to continue.")
		return User{}, false
	}
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "Authentication service is temporarily unavailable.")
		return User{}, false
	}
	return user, true
}

func (s *Server) establishSession(w http.ResponseWriter, requestContext context.Context, user User) bool {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return false
	}
	token := hex.EncodeToString(raw)
	expires := time.Now().UTC().Add(sessionTTL)
	ctx, cancel := context.WithTimeout(requestContext, 3*time.Second)
	defer cancel()
	if err := s.repo.CreateSession(ctx, user.ID, tokenDigest(token), expires); err != nil {
		return false
	}
	http.SetCookie(w, &http.Cookie{ //nolint:gosec // Secure follows COOKIE_SECURE, which defaults to true.
		Name: sessionCookie, Value: token, Path: "/", HttpOnly: true, Secure: s.cfg.CookieSecure,
		SameSite: http.SameSiteLaxMode, Expires: expires, MaxAge: int(sessionTTL.Seconds()),
	})
	return true
}

type credentials struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func validateCredentials(w http.ResponseWriter, input credentials) (string, bool) {
	email := strings.ToLower(strings.TrimSpace(input.Email))
	parsed, err := mail.ParseAddress(email)
	if err != nil || parsed.Address != email || len(email) > 254 {
		writeError(w, http.StatusBadRequest, "Enter a valid email address.")
		return "", false
	}
	if len(input.Password) < 8 || len(input.Password) > 72 {
		writeError(w, http.StatusBadRequest, "Password must be between 8 and 72 characters.")
		return "", false
	}
	return email, true
}

func decodeJSON(w http.ResponseWriter, r *http.Request, target any) bool {
	if r.Body == nil {
		writeError(w, http.StatusBadRequest, "Invalid request body.")
		return false
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body.")
		return false
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		writeError(w, http.StatusBadRequest, "Invalid request body.")
		return false
	}
	return true
}

func tokenDigest(token string) string {
	hash := sha256.Sum256([]byte(token))
	return hex.EncodeToString(hash[:])
}

func publicUser(user User) map[string]string {
	return map[string]string{"email": user.Email}
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "no-store")
		if r.Method == http.MethodPost && strings.HasPrefix(r.URL.Path, "/api/auth/") {
			origin := r.Header.Get("Origin")
			if origin != "" && !sameOrigin(origin, r.Host) {
				writeError(w, http.StatusForbidden, "Cross-origin request rejected.")
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func sameOrigin(origin, host string) bool {
	parsed, err := url.Parse(origin)
	return err == nil && (parsed.Scheme == "https" || parsed.Scheme == "http") && strings.EqualFold(parsed.Host, host) && parsed.User == nil
}
