package domain

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestIntegrationsUnmarshalJSON_legacyTimestampAndNull(t *testing.T) {
	raw := `[null, {"id": "indobase-platform-smtp", "name": "Indobase Platform SMTP", "type": "email", "created_at": "2026-07-27T16:49:56.067604", "updated_at": "2026-07-27T16:49:56.067604", "email_provider": {"kind": "smtp"}}]`
	var integrations Integrations
	require.NoError(t, json.Unmarshal([]byte(raw), &integrations))
	require.Len(t, integrations, 1)
	require.Equal(t, "indobase-platform-smtp", integrations[0].ID)
	require.Equal(t, time.Date(2026, 7, 27, 16, 49, 56, 67604000, time.UTC), integrations[0].CreatedAt)
}
