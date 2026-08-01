package domain

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// flexibleJSONTime unmarshals RFC3339 and legacy timestamps without a timezone suffix.
type flexibleJSONTime struct {
	time.Time
}

func parseFlexibleJSONTime(s string) (time.Time, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return time.Time{}, nil
	}
	layouts := []string{
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02T15:04:05.999999",
		"2006-01-02T15:04:05",
	}
	for _, layout := range layouts {
		if t, err := time.Parse(layout, s); err == nil {
			if layout == "2006-01-02T15:04:05.999999" || layout == "2006-01-02T15:04:05" {
				return t.UTC(), nil
			}
			return t, nil
		}
	}
	return time.Time{}, fmt.Errorf("invalid time: %q", s)
}

func (t *flexibleJSONTime) UnmarshalJSON(b []byte) error {
	var s string
	if err := json.Unmarshal(b, &s); err != nil {
		return err
	}
	parsed, err := parseFlexibleJSONTime(s)
	if err != nil {
		return err
	}
	t.Time = parsed
	return nil
}
