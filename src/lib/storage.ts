import fs from 'fs/promises';
import path from 'path';
import { FileStorage, PutOptions } from '../types';
import config from './config';

export class LocalFileStorage implements FileStorage {
  constructor(private basePath: string) {}

  private getFullPath(key: string): string {
    return path.join(this.basePath, key);
  }

  async put(key: string, content: Buffer | string, options?: PutOptions): Promise<string> {
    const fullPath = this.getFullPath(key);
    const dir = path.dirname(fullPath);
    
    // Ensure directory exists
    await fs.mkdir(dir, { recursive: true });
    
    // Write file
    const buffer = typeof content === 'string' ? Buffer.from(content, 'utf-8') : content;
    await fs.writeFile(fullPath, buffer);
    
    return key;
  }

  async get(key: string): Promise<Buffer> {
    const fullPath = this.getFullPath(key);
    return fs.readFile(fullPath);
  }

  async exists(key: string): Promise<boolean> {
    const fullPath = this.getFullPath(key);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    const fullPath = this.getFullPath(key);
    await fs.unlink(fullPath);
  }
}

// Factory function
export function createFileStorage(): FileStorage {
  const storageConfig = config.database.storage;
  
  if (storageConfig.type === 's3') {
    // TODO: Implement S3FileStorage when needed
    throw new Error('S3 storage not yet implemented. Use local storage for now.');
  }
  
  return new LocalFileStorage(storageConfig.localPath || './storage');
}

// Singleton instance
let storageInstance: FileStorage | null = null;

export function getStorage(): FileStorage {
  if (!storageInstance) {
    storageInstance = createFileStorage();
  }
  return storageInstance;
}
