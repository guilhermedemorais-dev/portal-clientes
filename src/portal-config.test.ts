import { describe, expect, it } from 'vitest';
import { parsePortalConfig } from './portal-config';

describe('parsePortalConfig', () => {
  it('accepts public project settings and refuses embedded credentials', () => {
    expect(parsePortalConfig({
      projectName: 'Projeto Aurora',
      projectBio: 'Acompanhe a evolução do projeto.',
      projectId: 'aurora',
      apiBaseUrl: 'https://api.example.test',
      boardUrl: 'https://github.com/org/repo/projects/1',
    })).toMatchObject({ projectName: 'Projeto Aurora', apiBaseUrl: 'https://api.example.test' });

    expect(() => parsePortalConfig({
      projectName: 'Projeto Aurora',
      projectId: 'aurora',
      apiBaseUrl: 'https://api.example.test',
      clientSecret: 'do-not-ship',
    })).toThrow(/credential/i);
  });

  it('requires HTTPS for a remotely hosted API', () => {
    expect(() => parsePortalConfig({ projectName: 'Demo', projectId: 'demo', apiBaseUrl: 'http://api.example.test' }))
      .toThrow(/https/i);
  });
});
