package dashboard

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"golang.org/x/crypto/bcrypt"
)

type loginFailingRepository struct{ *memoryRepository }

func (loginFailingRepository) UserByEmail(context.Context, string) (User, error) {
	return User{}, errors.New("database unavailable")
}

type sessionCreateFailingRepository struct{ *memoryRepository }

func (sessionCreateFailingRepository) CreateSession(context.Context, int64, string, time.Time) error {
	return errors.New("database unavailable")
}

func serve(handler http.Handler, method, path, body string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(method, path, strings.NewReader(body))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}

func TestRegisterRejectsDuplicateEmail(t *testing.T) {
	repo := newMemoryRepository()
	hash, err := bcrypt.GenerateFromPassword([]byte("correct-password"), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	repo.users["person@example.com"] = User{ID: 1, Email: "person@example.com", PasswordHash: hash}
	handler := NewServer(repo, healthyDB{}, Config{}).Handler()
	response := serve(handler, http.MethodPost, "/api/auth/register", `{"email":"person@example.com","password":"another-password"}`)
	if response.Code != http.StatusConflict {
		t.Fatalf("duplicate register status = %d, want 409", response.Code)
	}
}

func TestRegisterReportsSessionFailureWithoutLeakingCookie(t *testing.T) {
	repo := sessionCreateFailingRepository{newMemoryRepository()}
	handler := NewServer(repo, healthyDB{}, Config{}).Handler()
	response := serve(handler, http.MethodPost, "/api/auth/register", `{"email":"person@example.com","password":"secure-password"}`)
	if response.Code != http.StatusInternalServerError || len(response.Result().Cookies()) != 0 {
		t.Fatalf("session failure: status=%d cookies=%d", response.Code, len(response.Result().Cookies()))
	}
}

func TestLoginReportsRepositoryFailureAsUnavailable(t *testing.T) {
	handler := NewServer(loginFailingRepository{newMemoryRepository()}, healthyDB{}, Config{}).Handler()
	response := serve(handler, http.MethodPost, "/api/auth/login", `{"email":"person@example.com","password":"secure-password"}`)
	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("login with repository failure status = %d, want 503", response.Code)
	}
}

func TestLoginReportsSessionFailure(t *testing.T) {
	repo := sessionCreateFailingRepository{newMemoryRepository()}
	hash, err := bcrypt.GenerateFromPassword([]byte("correct-password"), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	repo.users["person@example.com"] = User{ID: 1, Email: "person@example.com", PasswordHash: hash}
	handler := NewServer(repo, healthyDB{}, Config{}).Handler()
	response := serve(handler, http.MethodPost, "/api/auth/login", `{"email":"person@example.com","password":"correct-password"}`)
	if response.Code != http.StatusInternalServerError {
		t.Fatalf("login with session failure status = %d, want 500", response.Code)
	}
}

func TestMalformedRequestBodiesAreRejected(t *testing.T) {
	handler := NewServer(newMemoryRepository(), healthyDB{}, Config{}).Handler()
	for name, body := range map[string]string{
		"invalid JSON":     `{"email":`,
		"unknown field":    `{"email":"person@example.com","password":"secure-password","role":"admin"}`,
		"trailing content": `{"email":"person@example.com","password":"secure-password"} {}`,
	} {
		response := serve(handler, http.MethodPost, "/api/auth/login", body)
		if response.Code != http.StatusBadRequest {
			t.Fatalf("%s: status = %d, want 400", name, response.Code)
		}
	}
}

func TestMissingRequestBodyIsRejected(t *testing.T) {
	handler := NewServer(newMemoryRepository(), healthyDB{}, Config{}).Handler()
	request := httptest.NewRequest(http.MethodPost, "/api/auth/login", nil)
	request.Body = nil
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("nil body status = %d, want 400", response.Code)
	}
}

func TestHealthReportsDatabaseDownWhileSessionIsValid(t *testing.T) {
	repo := newMemoryRepository()
	repo.users["person@example.com"] = User{ID: 1, Email: "person@example.com"}
	repo.sessions[tokenDigest("live-token")] = 1
	handler := NewServer(repo, unavailableDB{}, Config{}).Handler()
	request := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	request.AddCookie(&http.Cookie{Name: sessionCookie, Value: "live-token"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"database":"unavailable"`) {
		t.Fatalf("health with database down: status=%d body=%s", response.Code, response.Body.String())
	}
}

func TestLogoutWithoutSessionClearsCookie(t *testing.T) {
	handler := NewServer(newMemoryRepository(), healthyDB{}, Config{CookieSecure: true}).Handler()
	response := serve(handler, http.MethodPost, "/api/auth/logout", "")
	cookies := response.Result().Cookies()
	if response.Code != http.StatusNoContent || len(cookies) != 1 || cookies[0].MaxAge != -1 || !cookies[0].Secure {
		t.Fatalf("logout without session: status=%d cookies=%#v", response.Code, cookies)
	}
}
