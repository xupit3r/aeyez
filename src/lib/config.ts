import dotenv from 'dotenv';
import { DatabaseConfig } from '../types';

dotenv.config();

export const config = {
  // Database
  database: {
    postgres: {
      url: process.env.DATABASE_URL || 'postgresql://localhost:5432/aeyez',
      maxConnections: 10,
      connectionTimeout: 10000,
    },
    redis: {
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      maxRetries: 3,
      keyPrefix: 'aeyez:',
    },
    storage: {
      type: (process.env.STORAGE_TYPE as 'local' | 's3') || 'local',
      localPath: process.env.STORAGE_LOCAL_PATH || './storage',
      s3: process.env.S3_BUCKET ? {
        bucket: process.env.S3_BUCKET,
        region: process.env.S3_REGION || 'us-east-1',
        accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
      } : undefined,
    },
    cache: {
      defaultTtl: 300, // 5 minutes
      enabled: true,
    },
  } as DatabaseConfig,

  // AI Providers
  providers: {
    openai: {
      apiKey: process.env.OPENAI_API_KEY || '',
      model: 'gpt-4o-mini',
      temperature: 0.7,
      maxTokens: 4096,
      timeout: 30000,
    },
    google: {
      apiKey: process.env.GOOGLE_API_KEY || '',
      model: 'gemini-1.5-flash',
      temperature: 0.7,
      maxTokens: 8192,
      timeout: 30000,
    },
  },

  // Application
  app: {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3000', 10),
  },

  // Crawling
  crawl: {
    userAgent: 'Aeyez/1.0 (AI Site Analyzer; +https://github.com/aeyez)',
    timeout: 30000,
    maxConcurrent: 5,
    respectRobotsTxt: true,
  },

  // Query Generation
  queryGeneration: {
    defaultCount: 50,
    maxVariationsPerQuery: 3,
  },

  // Analysis
  analysis: {
    defaultProviders: ['openai', 'google'] as ('openai' | 'google')[],
    maxRetries: 3,
    retryDelay: 1000,
  },
} as const;

export default config;
