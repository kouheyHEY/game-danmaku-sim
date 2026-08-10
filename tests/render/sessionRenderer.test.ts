import { describe, expect, it } from 'vitest';
import { bossTextureDisplaySize } from '../../src/render/sessionRenderer';

describe('boss texture display sizes', () => {
  it('renders the priest at one third of the 96px source texture', () => {
    expect(bossTextureDisplaySize('priest')).toBe(32);
  });

  it('keeps the other feature bosses at their 96px source size', () => {
    expect(bossTextureDisplaySize('reversa')).toBe(96);
    expect(bossTextureDisplaySize('sniper')).toBe(96);
    expect(bossTextureDisplaySize('shogun')).toBe(96);
    expect(bossTextureDisplaySize('tank')).toBe(96);
  });
});
