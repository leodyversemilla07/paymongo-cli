import axios, { AxiosInstance } from 'axios';
import { NetworkError, withRetry } from '../../utils/errors.js';

export interface GitHubClientOptions {
  token?: string;
  timeout?: number;
}

export interface GitHubRepo {
  name: string;
  full_name: string;
  owner: {
    login: string;
    id: number;
  };
  private: boolean;
  html_url: string;
  description?: string;
}

export interface GitHubFileContent {
  name: string;
  path: string;
  sha: string;
  size: number;
  url: string;
  html_url: string;
  git_url: string;
  download_url: string;
  type: 'file' | 'dir';
  content?: string;
  encoding?: string;
}

export interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string;
      email: string;
      date: string;
    };
  };
  html_url: string;
}

export class GitHubClient {
  private client: AxiosInstance;
  private token: string | undefined;

  constructor(options: GitHubClientOptions = {}) {
    this.token = options.token as string | undefined;
    const timeout = options.timeout || 30000;

    this.client = axios.create({
      baseURL: 'https://api.github.com',
      timeout,
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'paymongo-cli/1.0.0',
      },
    });

    if (this.token) {
      const authToken = this.token as string;
      this.client.defaults.headers.common['Authorization'] = `token ${authToken}`;
    }

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor for debugging
    this.client.interceptors.request.use((config) => {
      if (!this.token && config.url?.includes('/repos/')) {
        // For public repo access, we can proceed without token
        // But for private repos or write operations, token is required
      }
      return config;
    });

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          throw new Error('GitHub authentication failed. Please check your token.');
        }
        if (error.response?.status === 403) {
          throw new Error('GitHub API rate limit exceeded or insufficient permissions.');
        }
        if (error.response?.status === 404) {
          throw new Error('GitHub repository or file not found.');
        }
        throw new NetworkError(`GitHub API error: ${error.message}`);
      }
    );
  }

  async getRepo(owner: string, repo: string): Promise<GitHubRepo> {
    const response = await withRetry(() => this.client.get(`/repos/${owner}/${repo}`), {
      maxRetries: 3,
      delayMs: 1000,
    });
    return response.data;
  }

  async getFile(
    owner: string,
    repo: string,
    path: string,
    ref?: string
  ): Promise<GitHubFileContent> {
    const params = ref ? { ref } : {};
    const response = await withRetry(
      () => this.client.get(`/repos/${owner}/${repo}/contents/${path}`, { params }),
      { maxRetries: 3, delayMs: 1000 }
    );
    return response.data;
  }

  async createOrUpdateFile(
    owner: string,
    repo: string,
    path: string,
    content: string,
    message: string,
    branch: string = 'main',
    sha?: string
  ): Promise<GitHubFileContent> {
    const data: { message: string; content: string; branch: string; sha?: string } = {
      message,
      content: Buffer.from(content).toString('base64'),
      branch,
    };

    if (sha) {
      data.sha = sha;
    }

    const response = await withRetry(
      () => this.client.put(`/repos/${owner}/${repo}/contents/${path}`, data),
      { maxRetries: 3, delayMs: 1000 }
    );
    return response.data;
  }

  async getCommits(
    owner: string,
    repo: string,
    path?: string,
    since?: string
  ): Promise<GitHubCommit[]> {
    const params: { per_page: number; path?: string; since?: string } = { per_page: 10 };
    if (path) {params.path = path;}
    if (since) {params.since = since;}

    const response = await withRetry(
      () => this.client.get(`/repos/${owner}/${repo}/commits`, { params }),
      { maxRetries: 3, delayMs: 1000 }
    );
    return response.data;
  }

  async createRepo(
    name: string,
    description?: string,
    isPrivate: boolean = false
  ): Promise<GitHubRepo> {
    const data = {
      name,
      description: description || 'PayMongo CLI team configuration',
      private: isPrivate,
      auto_init: true,
    };

    const response = await withRetry(() => this.client.post('/user/repos', data), {
      maxRetries: 3,
      delayMs: 1000,
    });
    return response.data;
  }

  setToken(token: string): void {
    this.token = token;
    this.client.defaults.headers.common['Authorization'] = `token ${token}`;
  }

  hasToken(): boolean {
    return !!this.token;
  }
}
