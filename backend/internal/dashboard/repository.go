package dashboard

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/go-sql-driver/mysql"
)

var (
	ErrNotFound = errors.New("not found")
	ErrConflict = errors.New("conflict")
)

type User struct {
	ID           int64
	Email        string
	PasswordHash []byte
}

type Repository interface {
	CreateUser(context.Context, string, []byte) (User, error)
	UserByEmail(context.Context, string) (User, error)
	CreateSession(context.Context, int64, string, time.Time) error
	UserBySession(context.Context, string) (User, error)
	DeleteSession(context.Context, string) error
}

type MySQLRepository struct {
	db *sql.DB
}

func NewMySQLRepository(db *sql.DB) *MySQLRepository {
	return &MySQLRepository{db: db}
}

func (r *MySQLRepository) Migrate(ctx context.Context) error {
	statements := []string{
		`CREATE TABLE IF NOT EXISTS users (
			id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
			email VARCHAR(254) NOT NULL UNIQUE,
			password_hash VARBINARY(128) NOT NULL,
			created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
		) ENGINE=InnoDB`,
		`CREATE TABLE IF NOT EXISTS sessions (
			token_hash CHAR(64) NOT NULL PRIMARY KEY,
			user_id BIGINT UNSIGNED NOT NULL,
			expires_at DATETIME NOT NULL,
			created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
			INDEX sessions_expiry (expires_at),
			CONSTRAINT sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
		) ENGINE=InnoDB`,
	}
	for _, statement := range statements {
		if _, err := r.db.ExecContext(ctx, statement); err != nil {
			return err
		}
	}
	return nil
}

func (r *MySQLRepository) CreateUser(ctx context.Context, email string, passwordHash []byte) (User, error) {
	result, err := r.db.ExecContext(ctx, `INSERT INTO users (email, password_hash) VALUES (?, ?)`, email, passwordHash)
	if err != nil {
		if isDuplicateKey(err) {
			return User{}, ErrConflict
		}
		return User{}, err
	}
	id, err := result.LastInsertId()
	return User{ID: id, Email: email}, err
}

func (r *MySQLRepository) UserByEmail(ctx context.Context, email string) (User, error) {
	var user User
	err := r.db.QueryRowContext(ctx, `SELECT id, email, password_hash FROM users WHERE email = ?`, email).
		Scan(&user.ID, &user.Email, &user.PasswordHash)
	if errors.Is(err, sql.ErrNoRows) {
		return User{}, ErrNotFound
	}
	return user, err
}

func (r *MySQLRepository) CreateSession(ctx context.Context, userID int64, tokenHash string, expires time.Time) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM sessions WHERE expires_at <= UTC_TIMESTAMP()`)
	if err != nil {
		return err
	}
	_, err = r.db.ExecContext(ctx, `INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)`, tokenHash, userID, expires.UTC())
	return err
}

func (r *MySQLRepository) UserBySession(ctx context.Context, tokenHash string) (User, error) {
	var user User
	err := r.db.QueryRowContext(ctx,
		`SELECT u.id, u.email FROM users u JOIN sessions s ON s.user_id = u.id WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP()`,
		tokenHash).Scan(&user.ID, &user.Email)
	if errors.Is(err, sql.ErrNoRows) {
		return User{}, ErrNotFound
	}
	return user, err
}

func (r *MySQLRepository) DeleteSession(ctx context.Context, tokenHash string) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM sessions WHERE token_hash = ?`, tokenHash)
	return err
}

func isDuplicateKey(err error) bool {
	var mysqlError *mysql.MySQLError
	return errors.As(err, &mysqlError) && mysqlError.Number == 1062
}
