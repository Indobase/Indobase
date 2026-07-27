package service

import (
	"strings"
	"testing"

	"github.com/Notifuse/notifuse/config"
	"github.com/Notifuse/notifuse/internal/domain"
)

func TestWorkspaceIDForProjectRef_FitsVarchar20(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"AbCdEfGhIjKlMnOpQrSt", "abcdefghijklmnopqrst"},
		{"proj-123", "proj123"},
		{strings.Repeat("a", 40), strings.Repeat("a", 20)},
		{"proj-with-dashes-and-more-chars", "projwithdashesandmor"},
	}
	for _, tc := range cases {
		got := WorkspaceIDForProjectRef(tc.in)
		if got != tc.want {
			t.Fatalf("WorkspaceIDForProjectRef(%q)=%q want %q", tc.in, got, tc.want)
		}
		if len(got) > 20 {
			t.Fatalf("id %q longer than 20", got)
		}
	}
	emptyish := WorkspaceIDForProjectRef("---")
	if len(emptyish) == 0 || len(emptyish) > 20 {
		t.Fatalf("empty cleaned ref produced bad id %q", emptyish)
	}
	if !strings.HasPrefix(emptyish, "ib") {
		t.Fatalf("expected ib-prefixed hash for empty cleaned, got %q", emptyish)
	}
}

func TestPlatformSMTPIntegrationID_IsStable(t *testing.T) {
	if platformSMTPIntegrationID == "" {
		t.Fatal("platformSMTPIntegrationID must be set")
	}
}

func TestEnsurePlatformSMTPProvider_NoopWhenConsole(t *testing.T) {
	s := &StudioHandoffService{
		cfg: &config.Config{
			SMTP: config.SMTPConfig{
				Mailer:    "console",
				Host:      "indobase-smtp-relay",
				Port:      587,
				FromEmail: "noreply@indobase.in",
			},
		},
	}
	if err := s.ensurePlatformSMTPProvider(nil, "ws1"); err != nil {
		t.Fatalf("expected nil for console mailer, got %v", err)
	}
}

func TestEnsurePlatformSMTPProvider_NoopWhenSMTPIncomplete(t *testing.T) {
	s := &StudioHandoffService{
		cfg: &config.Config{
			SMTP: config.SMTPConfig{
				Mailer: "smtp",
				Host:   "indobase-smtp-relay",
			},
		},
	}
	if err := s.ensurePlatformSMTPProvider(nil, "ws1"); err != nil {
		t.Fatalf("expected nil when SMTP incomplete, got %v", err)
	}
}

func TestBuildPlatformSMTPIntegrationShape(t *testing.T) {
	integration := domain.Integration{
		ID:   platformSMTPIntegrationID,
		Name: "Indobase Platform SMTP",
		Type: domain.IntegrationTypeEmail,
		EmailProvider: domain.EmailProvider{
			Kind: domain.EmailProviderKindSMTP,
			SMTP: &domain.SMTPSettings{
				Host:     "indobase-smtp-relay",
				Port:     587,
				UseTLS:   false,
				AuthType: "basic",
			},
			Senders:            []domain.EmailSender{domain.NewEmailSender("noreply@indobase.in", "Indobase Email")},
			RateLimitPerMinute: 60,
		},
	}
	if err := integration.Validate("test-passphrase-at-least-32-chars!!"); err != nil {
		t.Fatalf("open-relay SMTP integration should validate: %v", err)
	}
}
