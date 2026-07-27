package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode"

	"github.com/Notifuse/notifuse/config"
	"github.com/Notifuse/notifuse/internal/domain"
	"github.com/Notifuse/notifuse/pkg/logger"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

const studioHandoffAudience = "indobase-email"

// StudioHandoffClaims are the Studio-minted JWT claims for Email SSO.
type StudioHandoffClaims struct {
	Email            string `json:"email"`
	OrganizationSlug string `json:"organization_slug"`
	OrganizationName string `json:"organization_name,omitempty"`
	ProjectRef       string `json:"project_ref"`
	ProjectName      string `json:"project_name,omitempty"`
	Role             string `json:"role"`
	StudioURL        string `json:"studio_url,omitempty"`
	jwt.RegisteredClaims
}

// StudioHandoffService exchanges a Studio handoff JWT for a Notifuse session.
type StudioHandoffService struct {
	userRepo      domain.UserRepository
	workspaceRepo domain.WorkspaceRepository
	authService   domain.AuthService
	cfg           *config.Config
	sessionExpiry time.Duration
	logger        logger.Logger
}

// NewStudioHandoffService constructs the Studio SSO exchanger.
func NewStudioHandoffService(
	userRepo domain.UserRepository,
	workspaceRepo domain.WorkspaceRepository,
	authService domain.AuthService,
	cfg *config.Config,
	sessionExpiry time.Duration,
	log logger.Logger,
) *StudioHandoffService {
	return &StudioHandoffService{
		userRepo:      userRepo,
		workspaceRepo: workspaceRepo,
		authService:   authService,
		cfg:           cfg,
		sessionExpiry: sessionExpiry,
		logger:        log,
	}
}

func (s *StudioHandoffService) secret() string {
	if s.cfg == nil {
		return ""
	}
	sec := strings.TrimSpace(s.cfg.StudioHandoffSecret)
	if len(sec) >= 32 {
		return sec
	}
	return ""
}

// StudioPublicURL returns the Studio origin for operator redirects.
func (s *StudioHandoffService) StudioPublicURL() string {
	if s.cfg != nil {
		u := strings.TrimRight(strings.TrimSpace(s.cfg.StudioPublicURL), "/")
		if u != "" {
			return u
		}
	}
	return "https://studio.indobase.in"
}

// Exchange verifies the Studio JWT, ensures user + project workspace, and mints a session token.
func (s *StudioHandoffService) Exchange(ctx context.Context, rawToken string) (*domain.AuthResponse, string, error) {
	secret := s.secret()
	if secret == "" {
		return nil, "", fmt.Errorf("studio handoff is not configured")
	}

	claims, err := s.verifyToken(rawToken, secret)
	if err != nil {
		return nil, "", err
	}

	email := strings.ToLower(strings.TrimSpace(claims.Email))
	if email == "" || !strings.Contains(email, "@") {
		return nil, "", fmt.Errorf("handoff token missing email")
	}
	if !studioRoleAllowed(claims.Role) {
		return nil, "", fmt.Errorf("Email access requires an organization owner, admin, developer, or viewer")
	}

	projectRef := strings.TrimSpace(claims.ProjectRef)
	if projectRef == "" {
		return nil, "", fmt.Errorf("handoff token missing project_ref")
	}

	user, err := s.findOrCreateUser(ctx, email)
	if err != nil {
		return nil, "", err
	}

	workspaceID := WorkspaceIDForProjectRef(projectRef)
	workspaceName := strings.TrimSpace(claims.ProjectName)
	if workspaceName == "" {
		workspaceName = projectRef
	}
	if len(workspaceName) > 255 {
		workspaceName = workspaceName[:255]
	}

	if err := s.ensureWorkspaceMembership(ctx, user, workspaceID, workspaceName, claims.Role); err != nil {
		return nil, "", err
	}

	// Fleet default: when system SMTP is a real transport (not console), ensure the
	// project workspace has Marketing + Transactional providers so campaigns work
	// without each operator pasting Integrations by hand.
	if err := s.ensurePlatformSMTPProvider(ctx, workspaceID); err != nil {
		s.logger.WithField("workspace_id", workspaceID).WithField("error", err.Error()).
			Warn("failed to ensure platform SMTP provider (workspace still usable)")
	}

	expiresAt := time.Now().UTC().Add(s.sessionExpiry)
	session := &domain.Session{
		ID:        uuid.New().String(),
		UserID:    user.ID,
		ExpiresAt: expiresAt,
		CreatedAt: time.Now().UTC(),
	}
	if err := s.userRepo.CreateSession(ctx, session); err != nil {
		return nil, "", fmt.Errorf("failed to create session: %w", err)
	}

	token := s.authService.GenerateUserAuthToken(user, session.ID, expiresAt)
	if token == "" {
		return nil, "", fmt.Errorf("failed to mint auth token")
	}

	s.logger.WithField("email", email).WithField("workspace_id", workspaceID).Info("Studio handoff sign-in succeeded")

	return &domain.AuthResponse{
		Token:     token,
		User:      *user,
		ExpiresAt: expiresAt,
	}, workspaceID, nil
}

func (s *StudioHandoffService) verifyToken(rawToken, secret string) (*StudioHandoffClaims, error) {
	parser := jwt.NewParser(jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}))
	claims := &StudioHandoffClaims{}
	token, err := parser.ParseWithClaims(rawToken, claims, func(t *jwt.Token) (interface{}, error) {
		return []byte(secret), nil
	})
	if err != nil || token == nil || !token.Valid {
		return nil, fmt.Errorf("invalid handoff token")
	}
	audOK := false
	for _, a := range claims.Audience {
		if a == studioHandoffAudience {
			audOK = true
			break
		}
	}
	if !audOK {
		return nil, fmt.Errorf("invalid handoff audience")
	}
	return claims, nil
}

func studioRoleAllowed(role string) bool {
	switch strings.ToLower(strings.TrimSpace(role)) {
	case "owner", "admin", "developer", "viewer":
		return true
	default:
		return false
	}
}

func (s *StudioHandoffService) findOrCreateUser(ctx context.Context, email string) (*domain.User, error) {
	user, err := s.userRepo.GetUserByEmailInsensitive(ctx, email)
	if err == nil {
		return user, nil
	}
	var notFound *domain.ErrUserNotFound
	if !errors.As(err, &notFound) {
		// also accept plain ErrUserNotFound style
		if !strings.Contains(strings.ToLower(err.Error()), "not found") {
			return nil, err
		}
	}

	now := time.Now().UTC()
	user = &domain.User{
		ID:        uuid.New().String(),
		Email:     email,
		Name:      email,
		Type:      domain.UserTypeUser,
		Language:  "en",
		CreatedAt: now,
		UpdatedAt: now,
	}
	if err := s.userRepo.CreateUser(ctx, user); err != nil {
		var exists *domain.ErrUserExists
		if errors.As(err, &exists) {
			return s.userRepo.GetUserByEmailInsensitive(ctx, email)
		}
		return nil, fmt.Errorf("failed to create user: %w", err)
	}
	return user, nil
}

func (s *StudioHandoffService) ensureWorkspaceMembership(
	ctx context.Context,
	user *domain.User,
	workspaceID, workspaceName, role string,
) error {
	existing, err := s.workspaceRepo.GetByID(ctx, workspaceID)
	if err != nil || existing == nil {
		secretKey, genErr := GenerateSecureKey(32)
		if genErr != nil {
			return genErr
		}
		ws := &domain.Workspace{
			ID:   workspaceID,
			Name: workspaceName,
			Settings: domain.WorkspaceSettings{
				Timezone:             "UTC",
				SecretKey:            secretKey,
				EmailTrackingEnabled: true,
				DefaultLanguage:      "en",
				Languages:            []string{"en"},
			},
			CreatedAt: time.Now().UTC(),
			UpdatedAt: time.Now().UTC(),
		}
		if err := s.workspaceRepo.Create(ctx, ws); err != nil {
			// race: another handoff created it
			if existing2, e2 := s.workspaceRepo.GetByID(ctx, workspaceID); e2 == nil && existing2 != nil {
				// ok
			} else {
				return fmt.Errorf("failed to create workspace: %w", err)
			}
		}
	}

	uw, err := s.workspaceRepo.GetUserWorkspace(ctx, user.ID, workspaceID)
	wsRole, perms := mapStudioRole(role)
	if err == nil && uw != nil {
		return nil
	}

	membership := &domain.UserWorkspace{
		UserID:      user.ID,
		WorkspaceID: workspaceID,
		Role:        wsRole,
		Permissions: perms,
		CreatedAt:   time.Now().UTC(),
		UpdatedAt:   time.Now().UTC(),
	}
	if err := s.workspaceRepo.AddUserToWorkspace(ctx, membership); err != nil {
		// already a member is fine
		if _, e2 := s.workspaceRepo.GetUserWorkspace(ctx, user.ID, workspaceID); e2 == nil {
			return nil
		}
		return fmt.Errorf("failed to add workspace member: %w", err)
	}
	return nil
}

func mapStudioRole(role string) (string, domain.UserPermissions) {
	switch strings.ToLower(strings.TrimSpace(role)) {
	case "owner", "admin":
		return "owner", domain.FullPermissions
	case "viewer":
		return "member", readOnlyPermissions()
	default: // developer
		return "member", domain.FullPermissions
	}
}

func readOnlyPermissions() domain.UserPermissions {
	p := domain.UserPermissions{}
	for k := range domain.FullPermissions {
		p[k] = domain.ResourcePermissions{Read: true, Write: false}
	}
	return p
}

// platformSMTPIntegrationID is a stable integration id so handoffs are idempotent.
const platformSMTPIntegrationID = "indobase-platform-smtp"

// ensurePlatformSMTPProvider attaches a workspace SMTP integration that mirrors
// the system SMTP_* env (typically the Indobase Postfix relay on dokploy-network)
// and sets it as Marketing + Transactional when those slots are empty.
// No-op when SMTP is unset or SMTP_MAILER=console (log-only smoke).
func (s *StudioHandoffService) ensurePlatformSMTPProvider(ctx context.Context, workspaceID string) error {
	if s.cfg == nil {
		return nil
	}
	if strings.EqualFold(strings.TrimSpace(s.cfg.SMTP.Mailer), "console") {
		return nil
	}
	host := strings.TrimSpace(s.cfg.SMTP.Host)
	fromEmail := strings.TrimSpace(s.cfg.SMTP.FromEmail)
	port := s.cfg.SMTP.Port
	if host == "" || fromEmail == "" || port <= 0 {
		return nil
	}

	ws, err := s.workspaceRepo.GetByID(ctx, workspaceID)
	if err != nil || ws == nil {
		return fmt.Errorf("load workspace for SMTP ensure: %w", err)
	}

	fromName := strings.TrimSpace(s.cfg.SMTP.FromName)
	if fromName == "" {
		fromName = "Indobase Email"
	}
	ehlo := strings.TrimSpace(s.cfg.SMTP.EHLOHostname)
	if ehlo == "" {
		ehlo = host
	}

	needMarketing := strings.TrimSpace(ws.Settings.MarketingEmailProviderID) == ""
	needTransactional := strings.TrimSpace(ws.Settings.TransactionalEmailProviderID) == ""
	existing := ws.GetIntegrationByID(platformSMTPIntegrationID)
	if existing != nil && !needMarketing && !needTransactional {
		return nil
	}

	now := time.Now().UTC()
	sender := domain.NewEmailSender(fromEmail, fromName)
	integration := domain.Integration{
		ID:   platformSMTPIntegrationID,
		Name: "Indobase Platform SMTP",
		Type: domain.IntegrationTypeEmail,
		EmailProvider: domain.EmailProvider{
			Kind: domain.EmailProviderKindSMTP,
			SMTP: &domain.SMTPSettings{
				Host:         host,
				Port:         port,
				Username:     strings.TrimSpace(s.cfg.SMTP.Username),
				Password:     s.cfg.SMTP.Password,
				UseTLS:       s.cfg.SMTP.UseTLS,
				EHLOHostname: ehlo,
				AuthType:     "basic",
			},
			Senders:            []domain.EmailSender{sender},
			RateLimitPerMinute: 60,
		},
		CreatedAt: now,
		UpdatedAt: now,
	}
	if existing != nil {
		integration.CreatedAt = existing.CreatedAt
		// Preserve operator-customized senders if they already configured this integration.
		if len(existing.EmailProvider.Senders) > 0 {
			integration.EmailProvider.Senders = existing.EmailProvider.Senders
		}
	}

	if err := integration.Validate(s.cfg.Security.SecretKey); err != nil {
		return fmt.Errorf("validate platform SMTP integration: %w", err)
	}
	ws.AddIntegration(integration)
	if needMarketing {
		ws.Settings.MarketingEmailProviderID = platformSMTPIntegrationID
	}
	if needTransactional {
		ws.Settings.TransactionalEmailProviderID = platformSMTPIntegrationID
	}
	ws.UpdatedAt = now

	if err := s.workspaceRepo.Update(ctx, ws); err != nil {
		return fmt.Errorf("save platform SMTP integration: %w", err)
	}
	s.logger.WithField("workspace_id", workspaceID).Info("ensured platform SMTP marketing/transactional provider")
	return nil
}

// WorkspaceIDForProjectRef maps an Indobase project ref to a Notifuse workspace id.
// Notifuse system schema uses VARCHAR(20) for workspaces.id — keep ≤20 or handoff
// fails with "value too long for type character varying(20)".
func WorkspaceIDForProjectRef(projectRef string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(projectRef) {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
		}
	}
	s := b.String()
	if s == "" {
		sum := sha256.Sum256([]byte(projectRef))
		return "ib" + hex.EncodeToString(sum[:])[:18]
	}
	if len(s) > 20 {
		s = s[:20]
	}
	return s
}
