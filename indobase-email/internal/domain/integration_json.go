package domain

import "encoding/json"

// UnmarshalJSON accepts legacy integration timestamps and skips null array entries at the slice level.
func (i *Integration) UnmarshalJSON(data []byte) error {
	if string(data) == "null" {
		return nil
	}
	var wire struct {
		ID                string                       `json:"id"`
		Name              string                       `json:"name"`
		Type              IntegrationType              `json:"type"`
		EmailProvider     EmailProvider                `json:"email_provider,omitempty"`
		SupabaseSettings  *SupabaseIntegrationSettings `json:"supabase_settings,omitempty"`
		LLMProvider       *LLMProvider                 `json:"llm_provider,omitempty"`
		FirecrawlSettings *FirecrawlSettings           `json:"firecrawl_settings,omitempty"`
		CreatedAt         flexibleJSONTime             `json:"created_at"`
		UpdatedAt         flexibleJSONTime             `json:"updated_at"`
	}
	if err := json.Unmarshal(data, &wire); err != nil {
		return err
	}
	i.ID = wire.ID
	i.Name = wire.Name
	i.Type = wire.Type
	i.EmailProvider = wire.EmailProvider
	i.SupabaseSettings = wire.SupabaseSettings
	i.LLMProvider = wire.LLMProvider
	i.FirecrawlSettings = wire.FirecrawlSettings
	i.CreatedAt = wire.CreatedAt.Time
	i.UpdatedAt = wire.UpdatedAt.Time
	return nil
}

func (i *Integrations) UnmarshalJSON(data []byte) error {
	var raw []json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	out := make([]Integration, 0, len(raw))
	for _, elem := range raw {
		if string(elem) == "null" {
			continue
		}
		var integration Integration
		if err := json.Unmarshal(elem, &integration); err != nil {
			return err
		}
		if integration.ID == "" {
			continue
		}
		out = append(out, integration)
	}
	*i = out
	return nil
}
