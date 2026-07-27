package service

import (
	"strings"
	"testing"
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
