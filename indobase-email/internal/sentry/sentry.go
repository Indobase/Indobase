// Package sentry initializes optional Sentry error reporting for Indobase Email.
package sentry

import (
	"os"
	"time"

	"github.com/getsentry/sentry-go"
)

// Init configures Sentry from SENTRY_DSN when set. Returns true if enabled.
func Init() bool {
	dsn := os.Getenv("SENTRY_DSN")
	if dsn == "" {
		return false
	}

	env := os.Getenv("SENTRY_ENVIRONMENT")
	if env == "" {
		env = os.Getenv("ENVIRONMENT")
	}
	if env == "" {
		env = "production"
	}

	err := sentry.Init(sentry.ClientOptions{
		Dsn:              dsn,
		Environment:      env,
		TracesSampleRate: 0.001,
		Tags: map[string]string{
			"service": "email-api",
		},
	})
	if err != nil {
		return false
	}
	return true
}

// Flush waits for buffered events to be sent (call on shutdown).
func Flush() {
	sentry.Flush(2 * time.Second)
}

// Recover captures a panic and re-panics after reporting.
func Recover() {
	if err := recover(); err != nil {
		sentry.CurrentHub().Recover(err)
		Flush()
		panic(err)
	}
}
