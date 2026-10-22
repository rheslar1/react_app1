package dashboard

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/go-sql-driver/mysql"
	"golang.org/x/crypto/bcrypt"
)

type memoryRepository struct {
	mu       sync.Mutex
	users    map[string]User
	sessions map[string]int64
	nextID   int64
}

func newMemoryRepository() *memoryRepository {
	return &memoryRepository{users: map[string]User{}, sessions: map[string]int64{}}
}

func (m *memoryRepository) CreateUser(_ context.Context, email string, hash []byte) (User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, exists := m.users[email]; exists {
		return User{}, ErrConflict
	}
	m.nextID++
	user := User{ID: m.nextID, Email: email, PasswordHash: hash}
	m.users[email] = user
	return user, nil
}

func (m *memoryRepository) UserByEmail(_ context.Context, email string) (User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	user, ok := m.users[email]
	if !ok {
		return User{}, ErrNotFound
	}
	return user, nil
}

func (m *memoryRepository) CreateSession(_ context.Context, userID int64, tokenHash string, _ time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.sessions[tokenHash] = userID
	return nil
}

func (m *memoryRepository) UserBySession(_ context.Context, tokenHash string) (User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	userID, ok := m.sessions[tokenHash]
	if !ok {
		return User{}, ErrNotFound
	}
	for _, user := range m.users {
		if user.ID == userID {
			return user, nil
		}
	}
	return User{}, ErrNotFound
}

func (m *memoryRepository) DeleteSession(_ context.Context, tokenHash string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.sessions, tokenHash)
	return nil
}

type healthyDB struct{}

func (healthyDB) PingContext(context.Context) error { return nil }

type unavailableDB struct{}

func (unavailableDB) PingContext(context.Context) error { return errors.New("connection unavailable") }

type unavailableSessionRepository struct{ Repository }

func (unavailableSessionRepository) UserBySession(context.Context, string) (User, error) {
	return User{}, errors.New("database unavailable")
}

type unavailableLogoutRepository struct{ Repository }

func (unavailableLogoutRepository) DeleteSession(context.Context, string) error {
	return errors.New("database unavailable")
}

func TestRegisterCreatesHttpOnlySessionAndMeRestoresUser(t *testing.T) {
	repo := newMemoryRepository()
	handler := NewServer(repo, healthyDB{}, Config{})
	register := httptest.NewRequest(http.MethodPost, "/api/auth/register", strings.NewReader(`{"email":"OPERATOR@example.com","password":"secure-password"}`))
	register.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.Handler().ServeHTTP(response, register)

	if response.Code != http.StatusCreated {
		t.Fatalf("register status = %d, body=%s", response.Code, response.Body.String())
	}
	cookies := response.Result().Cookies()
	if len(cookies) != 1 || cookies[0].Name != sessionCookie || !cookies[0].HttpOnly || cookies[0].SameSite != http.SameSiteLaxMode {
		t.Fatalf("session cookie does not have required attributes: %#v", cookies)
	}
	if len(repo.sessions) != 1 {
		t.Fatalf("session was not persisted")
	}
	var body struct {
		User map[string]string `json:"user"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil || body.User["email"] != "operator@example.com" {
		t.Fatalf("unexpected registration response: %s (%v)", response.Body.String(), err)
	}
	if _, leaked := body.User["password"]; leaked {
		t.Fatal("password was included in public user response")
	}

	me := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	me.AddCookie(cookies[0])
	meResponse := httptest.NewRecorder()
	handler.Handler().ServeHTTP(meResponse, me)
	if meResponse.Code != http.StatusOK || !strings.Contains(meResponse.Body.String(), "operator@example.com") {
		t.Fatalf("session restore failed: %d %s", meResponse.Code, meResponse.Body.String())
	}
}

func TestLoginRejectsIncorrectPassword(t *testing.T) {
	repo := newMemoryRepository()
	hash, err := bcrypt.GenerateFromPassword([]byte("correct-password"), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	repo.users["person@example.com"] = User{ID: 1, Email: "person@example.com", PasswordHash: hash}
	handler := NewServer(repo, healthyDB{}, Config{})
	request := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{"email":"person@example.com","password":"incorrect-password"}`))
	response := httptest.NewRecorder()
	handler.Handler().ServeHTTP(response, request)
	if response.Code != http.StatusUnauthorized || len(response.Result().Cookies()) != 0 {
		t.Fatalf("unexpected failed login: %d %s", response.Code, response.Body.String())
	}
}

func TestLoginCreatesHttpOnlySession(t *testing.T) {
	repo := newMemoryRepository()
	hash, err := bcrypt.GenerateFromPassword([]byte("correct-password"), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	repo.users["person@example.com"] = User{ID: 1, Email: "person@example.com", PasswordHash: hash}
	handler := NewServer(repo, healthyDB{}, Config{CookieSecure: true})
	request := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{"email":"person@example.com","password":"correct-password"}`))
	response := httptest.NewRecorder()
	handler.Handler().ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("login status = %d, body=%s", response.Code, response.Body.String())
	}
	cookies := response.Result().Cookies()
	if len(cookies) != 1 || !cookies[0].HttpOnly || !cookies[0].Secure || len(repo.sessions) != 1 {
		t.Fatalf("login did not create a secure persisted session: cookie=%#v sessions=%d", cookies, len(repo.sessions))
	}
}

func TestAuthValidationAndUnauthorizedSession(t *testing.T) {
	handler := NewServer(newMemoryRepository(), healthyDB{}, Config{})
	for _, payload := range []string{
		`{"email":"not-an-email","password":"secure-password"}`,
		`{"email":"person@example.com","password":"short"}`,
		`{"email":"person@example.com","password":"secure-password","extra":true}`,
	} {
		request := httptest.NewRequest(http.MethodPost, "/api/auth/register", strings.NewReader(payload))
		response := httptest.NewRecorder()
		handler.Handler().ServeHTTP(response, request)
		if response.Code != http.StatusBadRequest {
			t.Errorf("payload %s returned %d: %s", payload, response.Code, response.Body.String())
		}
	}

	request := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	response := httptest.NewRecorder()
	handler.Handler().ServeHTTP(response, request)
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("unauthenticated /me status = %d", response.Code)
	}
}

func TestLogoutRevokesSession(t *testing.T) {
	repo := newMemoryRepository()
	hash, _ := bcrypt.GenerateFromPassword([]byte("secure-password"), bcrypt.MinCost)
	repo.users["person@example.com"] = User{ID: 1, Email: "person@example.com", PasswordHash: hash}
	repo.sessions[tokenDigest("opaque-token")] = 1
	handler := NewServer(repo, healthyDB{}, Config{CookieSecure: true})
	logout := httptest.NewRequest(http.MethodPost, "/api/auth/logout", nil)
	logout.AddCookie(&http.Cookie{Name: sessionCookie, Value: "opaque-token"})
	response := httptest.NewRecorder()
	handler.Handler().ServeHTTP(response, logout)
	if response.Code != http.StatusNoContent || len(repo.sessions) != 0 {
		t.Fatalf("logout did not revoke session: %d", response.Code)
	}
	expired := response.Result().Cookies()
	if len(expired) != 1 || !expired[0].Secure || expired[0].MaxAge != -1 {
		t.Fatalf("logout did not clear secure cookie: %#v", expired)
	}
}

func TestLogoutPreservesCookieWhenRevocationFails(t *testing.T) {
	handler := NewServer(unavailableLogoutRepository{Repository: newMemoryRepository()}, healthyDB{}, Config{CookieSecure: true})
	logout := httptest.NewRequest(http.MethodPost, "/api/auth/logout", nil)
	logout.AddCookie(&http.Cookie{Name: sessionCookie, Value: "opaque-token"})
	response := httptest.NewRecorder()
	handler.Handler().ServeHTTP(response, logout)

	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("logout status = %d, want %d", response.Code, http.StatusServiceUnavailable)
	}
	if cookies := response.Result().Cookies(); len(cookies) != 0 {
		t.Fatalf("logout cleared the cookie before revocation succeeded: %#v", cookies)
	}
}

func TestHealthReportsRealMetadataAndDatabaseState(t *testing.T) {
	repo := newMemoryRepository()
	hash, _ := bcrypt.GenerateFromPassword([]byte("secure-password"), bcrypt.MinCost)
	repo.users["person@example.com"] = User{ID: 1, Email: "person@example.com", PasswordHash: hash}
	repo.sessions[tokenDigest("health-session")] = 1
	handler := NewServer(repo, healthyDB{}, Config{
		Version: "1.2.3", Revision: "abc123", ImageDigest: "sha256:abcd", Environment: "staging",
	})
	request := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	request.AddCookie(&http.Cookie{Name: sessionCookie, Value: "health-session"})
	response := httptest.NewRecorder()
	handler.Handler().ServeHTTP(response, request)
	var data map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &data); err != nil {
		t.Fatal(err)
	}
	deployment := data["deployment"].(map[string]any)
	if data["api"] != "healthy" || data["database"] != "healthy" || deployment["revision"] != "abc123" || deployment["configured"] != true {
		t.Fatalf("unexpected health result: %s", response.Body.String())
	}
}

func TestMySQLUniqueKeyDetection(t *testing.T) {
	if !isDuplicateKey(&mysql.MySQLError{Number: 1062}) {
		t.Fatal("duplicate key should be recognized")
	}
	if isDuplicateKey(&mysql.MySQLError{Number: 1045}) {
		t.Fatal("ordinary SQL errors must not be treated as duplicate keys")
	}
}

func TestReadinessFailsWhenDatabaseIsUnavailable(t *testing.T) {
	handler := NewServer(newMemoryRepository(), unavailableDB{}, Config{})
	request := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	response := httptest.NewRecorder()
	handler.Handler().ServeHTTP(response, request)
	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("readiness status = %d, want %d", response.Code, http.StatusServiceUnavailable)
	}
}

func TestSessionLookupDatabaseFailureIsNotReportedAsUnauthorized(t *testing.T) {
	handler := NewServer(unavailableSessionRepository{Repository: newMemoryRepository()}, healthyDB{}, Config{})
	request := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	request.AddCookie(&http.Cookie{Name: sessionCookie, Value: "valid-format-token"})
	response := httptest.NewRecorder()
	handler.Handler().ServeHTTP(response, request)
	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("session lookup status = %d, want %d", response.Code, http.StatusServiceUnavailable)
	}
}

func TestCrossOriginAuthMutationIsRejected(t *testing.T) {
	handler := NewServer(newMemoryRepository(), healthyDB{}, Config{})
	request := httptest.NewRequest(http.MethodPost, "/api/auth/logout", nil)
	request.Host = "relay.example.com"
	request.Header.Set("Origin", "https://attacker.example")
	response := httptest.NewRecorder()
	handler.Handler().ServeHTTP(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("cross-origin request status = %d, want %d", response.Code, http.StatusForbidden)
	}
}
