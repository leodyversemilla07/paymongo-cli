import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Create mock axios instance
const mockAxiosInstance = {
  get: jest.fn<() => Promise<unknown>>(),
  post: jest.fn<() => Promise<unknown>>(),
  put: jest.fn<() => Promise<unknown>>(),
  delete: jest.fn<() => Promise<unknown>>(),
  defaults: {
    headers: {
      common: {} as Record<string, string>,
    },
  },
  interceptors: {
    request: { use: jest.fn() },
    response: { use: jest.fn() },
  },
};

// Create mock axios
const mockAxios = {
  create: jest.fn(() => mockAxiosInstance),
};

// Mock axios before importing GitHubClient
jest.unstable_mockModule('axios', () => ({
  default: mockAxios,
}));

// Import after mocking
const { GitHubClient } = await import('../../src/services/github/client.js');
type GitHubRepoType = import('../../src/services/github/client.js').GitHubRepo;
type GitHubFileContentType = import('../../src/services/github/client.js').GitHubFileContent;
type GitHubCommitType = import('../../src/services/github/client.js').GitHubCommit;

describe('GitHubClient', () => {
  let githubClient: InstanceType<typeof GitHubClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mock axios instance
    mockAxiosInstance.get.mockReset();
    mockAxiosInstance.post.mockReset();
    mockAxiosInstance.put.mockReset();
    mockAxiosInstance.delete.mockReset();
    mockAxiosInstance.defaults.headers.common = {};
    mockAxios.create.mockReturnValue(mockAxiosInstance as any);
  });

  describe('constructor', () => {
    it('should create client with default options', () => {
      githubClient = new GitHubClient();
      expect(mockAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://api.github.com',
          timeout: 30000,
        })
      );
    });

    it('should create client with custom timeout', () => {
      githubClient = new GitHubClient({ timeout: 5000 });
      expect(mockAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 5000,
        })
      );
    });

    it('should set authorization header when token provided', () => {
      githubClient = new GitHubClient({ token: 'ghp_test_token' });
      expect(mockAxiosInstance.defaults.headers.common['Authorization']).toBe('token ghp_test_token');
    });

    it('should setup request and response interceptors', () => {
      githubClient = new GitHubClient();
      expect(mockAxiosInstance.interceptors.request.use).toHaveBeenCalled();
      expect(mockAxiosInstance.interceptors.response.use).toHaveBeenCalled();
    });
  });

  describe('getRepo', () => {
    beforeEach(() => {
      githubClient = new GitHubClient({ token: 'test_token' });
    });

    it('should fetch repository information', async () => {
      const mockRepo: GitHubRepoType = {
        name: 'test-repo',
        full_name: 'owner/test-repo',
        owner: { login: 'owner', id: 123 },
        private: false,
        html_url: 'https://github.com/owner/test-repo',
        description: 'Test repository',
      };

      mockAxiosInstance.get.mockResolvedValue({ data: mockRepo });

      const result = await githubClient.getRepo('owner', 'test-repo');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/repos/owner/test-repo');
      expect(result).toEqual(mockRepo);
    });
  });

  describe('getFile', () => {
    beforeEach(() => {
      githubClient = new GitHubClient({ token: 'test_token' });
    });

    it('should fetch file content', async () => {
      const mockFile: GitHubFileContentType = {
        name: 'config.json',
        path: '.paymongo/config.json',
        sha: 'abc123',
        size: 1024,
        url: 'https://api.github.com/repos/owner/repo/contents/config.json',
        html_url: 'https://github.com/owner/repo/blob/main/config.json',
        git_url: 'https://api.github.com/repos/owner/repo/git/blobs/abc123',
        download_url: 'https://raw.githubusercontent.com/owner/repo/main/config.json',
        type: 'file',
        content: Buffer.from('{"test": true}').toString('base64'),
        encoding: 'base64',
      };

      mockAxiosInstance.get.mockResolvedValue({ data: mockFile });

      const result = await githubClient.getFile('owner', 'repo', '.paymongo/config.json');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/repos/owner/repo/contents/.paymongo/config.json',
        { params: {} }
      );
      expect(result).toEqual(mockFile);
    });

    it('should fetch file content for specific branch', async () => {
      const mockFile: GitHubFileContentType = {
        name: 'config.json',
        path: '.paymongo/config.json',
        sha: 'abc123',
        size: 1024,
        url: 'https://api.github.com/repos/owner/repo/contents/config.json',
        html_url: 'https://github.com/owner/repo/blob/develop/config.json',
        git_url: 'https://api.github.com/repos/owner/repo/git/blobs/abc123',
        download_url: 'https://raw.githubusercontent.com/owner/repo/develop/config.json',
        type: 'file',
      };

      mockAxiosInstance.get.mockResolvedValue({ data: mockFile });

      await githubClient.getFile('owner', 'repo', '.paymongo/config.json', 'develop');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/repos/owner/repo/contents/.paymongo/config.json',
        { params: { ref: 'develop' } }
      );
    });
  });

  describe('createOrUpdateFile', () => {
    beforeEach(() => {
      githubClient = new GitHubClient({ token: 'test_token' });
    });

    it('should create a new file', async () => {
      const mockResponse = {
        content: { sha: 'new_sha' },
        commit: { sha: 'commit_sha' },
      };

      mockAxiosInstance.put.mockResolvedValue({ data: mockResponse });

      const content = JSON.stringify({ test: true });
      const result = await githubClient.createOrUpdateFile(
        'owner',
        'repo',
        '.paymongo/config.json',
        content,
        'Add config file'
      );

      expect(mockAxiosInstance.put).toHaveBeenCalledWith(
        '/repos/owner/repo/contents/.paymongo/config.json',
        {
          message: 'Add config file',
          content: Buffer.from(content).toString('base64'),
          branch: 'main',
        }
      );
      expect(result).toEqual(mockResponse);
    });

    it('should update an existing file with sha', async () => {
      const mockResponse = {
        content: { sha: 'new_sha' },
        commit: { sha: 'commit_sha' },
      };

      mockAxiosInstance.put.mockResolvedValue({ data: mockResponse });

      const content = JSON.stringify({ test: true, updated: true });
      await githubClient.createOrUpdateFile(
        'owner',
        'repo',
        '.paymongo/config.json',
        content,
        'Update config file',
        'main',
        'existing_sha'
      );

      expect(mockAxiosInstance.put).toHaveBeenCalledWith(
        '/repos/owner/repo/contents/.paymongo/config.json',
        {
          message: 'Update config file',
          content: Buffer.from(content).toString('base64'),
          branch: 'main',
          sha: 'existing_sha',
        }
      );
    });

    it('should create file on custom branch', async () => {
      mockAxiosInstance.put.mockResolvedValue({ data: {} });

      await githubClient.createOrUpdateFile(
        'owner',
        'repo',
        'config.json',
        '{}',
        'Add config',
        'develop'
      );

      expect(mockAxiosInstance.put).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          branch: 'develop',
        })
      );
    });
  });

  describe('getCommits', () => {
    beforeEach(() => {
      githubClient = new GitHubClient({ token: 'test_token' });
    });

    it('should fetch recent commits', async () => {
      const mockCommits: GitHubCommitType[] = [
        {
          sha: 'abc123',
          commit: {
            message: 'Initial commit',
            author: {
              name: 'Test User',
              email: 'test@example.com',
              date: '2024-01-01T00:00:00Z',
            },
          },
          html_url: 'https://github.com/owner/repo/commit/abc123',
        },
      ];

      mockAxiosInstance.get.mockResolvedValue({ data: mockCommits });

      const result = await githubClient.getCommits('owner', 'repo');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/repos/owner/repo/commits', {
        params: { per_page: 10 },
      });
      expect(result).toEqual(mockCommits);
    });

    it('should fetch commits for specific path', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: [] });

      await githubClient.getCommits('owner', 'repo', '.paymongo/config.json');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/repos/owner/repo/commits', {
        params: { per_page: 10, path: '.paymongo/config.json' },
      });
    });

    it('should fetch commits since date', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: [] });

      await githubClient.getCommits('owner', 'repo', undefined, '2024-01-01T00:00:00Z');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/repos/owner/repo/commits', {
        params: { per_page: 10, since: '2024-01-01T00:00:00Z' },
      });
    });
  });

  describe('createRepo', () => {
    beforeEach(() => {
      githubClient = new GitHubClient({ token: 'test_token' });
    });

    it('should create a public repository', async () => {
      const mockRepo: GitHubRepoType = {
        name: 'new-repo',
        full_name: 'owner/new-repo',
        owner: { login: 'owner', id: 123 },
        private: false,
        html_url: 'https://github.com/owner/new-repo',
      };

      mockAxiosInstance.post.mockResolvedValue({ data: mockRepo });

      const result = await githubClient.createRepo('new-repo', 'My new repo');

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/user/repos', {
        name: 'new-repo',
        description: 'My new repo',
        private: false,
        auto_init: true,
      });
      expect(result).toEqual(mockRepo);
    });

    it('should create a private repository', async () => {
      mockAxiosInstance.post.mockResolvedValue({
        data: { name: 'private-repo', private: true },
      });

      await githubClient.createRepo('private-repo', 'Private repo', true);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/user/repos', {
        name: 'private-repo',
        description: 'Private repo',
        private: true,
        auto_init: true,
      });
    });

    it('should use default description when none provided', async () => {
      mockAxiosInstance.post.mockResolvedValue({ data: { name: 'repo' } });

      await githubClient.createRepo('repo');

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/user/repos', {
        name: 'repo',
        description: 'PayMongo CLI team configuration',
        private: false,
        auto_init: true,
      });
    });
  });

  describe('setToken', () => {
    it('should set authorization token', () => {
      githubClient = new GitHubClient();
      githubClient.setToken('new_token');

      expect(mockAxiosInstance.defaults.headers.common['Authorization']).toBe('token new_token');
    });
  });

  describe('hasToken', () => {
    it('should return true when token is set', () => {
      githubClient = new GitHubClient({ token: 'test_token' });
      expect(githubClient.hasToken()).toBe(true);
    });

    it('should return false when token is not set', () => {
      githubClient = new GitHubClient();
      expect(githubClient.hasToken()).toBe(false);
    });

    it('should return true after setting token', () => {
      githubClient = new GitHubClient();
      expect(githubClient.hasToken()).toBe(false);

      githubClient.setToken('new_token');
      expect(githubClient.hasToken()).toBe(true);
    });
  });
});
