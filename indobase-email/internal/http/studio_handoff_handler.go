package http

import (
	"net/http"
	"net/url"
	"strings"

	"github.com/Notifuse/notifuse/internal/service"
	"github.com/Notifuse/notifuse/pkg/logger"
)

// StudioHandoffHandler exchanges Studio SSO JWTs for console sessions.
type StudioHandoffHandler struct {
	service *service.StudioHandoffService
	logger  logger.Logger
}

// NewStudioHandoffHandler constructs the handler.
func NewStudioHandoffHandler(svc *service.StudioHandoffService, log logger.Logger) *StudioHandoffHandler {
	return &StudioHandoffHandler{service: svc, logger: log}
}

// RegisterRoutes registers the public Studio handoff route.
func (h *StudioHandoffHandler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/studio.handoff", h.Handoff)
}

// Handoff is a full-page GET exchange (same pattern as Payments /oauth/studio-handoff).
// On success it redirects to /console/launch#token=… so the SPA can store auth_token.
func (h *StudioHandoffHandler) Handoff(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		WriteJSONError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	token := strings.TrimSpace(r.URL.Query().Get("token"))
	if token == "" {
		h.redirectStudioError(w, r, "missing handoff token")
		return
	}

	resp, workspaceID, err := h.service.Exchange(r.Context(), token)
	if err != nil {
		if h.logger != nil {
			h.logger.WithField("error", err.Error()).Warn("Studio handoff failed")
		}
		h.redirectStudioError(w, r, err.Error())
		return
	}

	// Redirect into the SPA launch page with the session JWT in the fragment
	// (never logged by proxies / Referer).
	dest := "/console/launch#auth_token=" + url.PathEscape(resp.Token)
	if workspaceID != "" {
		dest += "&workspace_id=" + url.PathEscape(workspaceID)
	}
	http.Redirect(w, r, dest, http.StatusFound)
}

func (h *StudioHandoffHandler) redirectStudioError(w http.ResponseWriter, r *http.Request, msg string) {
	target := "/console/signin?error=" + url.QueryEscape(msg)
	http.Redirect(w, r, target, http.StatusFound)
}
