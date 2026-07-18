import { describe, expect, it } from 'vitest';
import { isIncompleteBoltArtifact } from './incomplete-artifact';

describe('isIncompleteBoltArtifact', () => {
  it('returns false for empty or plain prose', () => {
    expect(isIncompleteBoltArtifact('')).toBe(false);
    expect(isIncompleteBoltArtifact('Just a clarifying question.')).toBe(false);
  });

  it('returns false for a fully closed artifact', () => {
    const content = `<boltArtifact id="x" title="App">
<boltAction type="file" filePath="a.js">console.log(1)</boltAction>
</boltArtifact>`;
    expect(isIncompleteBoltArtifact(content)).toBe(false);
  });

  it('returns true when boltArtifact is unclosed', () => {
    const content = `<boltArtifact id="x" title="App">
<boltAction type="file" filePath="a.js">console.log(1)</boltAction>`;
    expect(isIncompleteBoltArtifact(content)).toBe(true);
  });

  it('returns true when a boltAction is unclosed mid-file', () => {
    const content = `<boltArtifact id="x" title="App">
<boltAction type="file" filePath="Navbar.jsx">
const x = {
  mobileMenu`;
    expect(isIncompleteBoltArtifact(content)).toBe(true);
  });
});
