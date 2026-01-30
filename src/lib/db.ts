import { PrismaClient } from '@prisma/client';
import config from './config';

// Singleton pattern for Prisma client
const prismaClientSingleton = () => {
  return new PrismaClient({
    log: config.app.nodeEnv === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
};

declare global {
  // eslint-disable-next-line no-var
  var prisma: undefined | ReturnType<typeof prismaClientSingleton>;
}

const prisma = globalThis.prisma ?? prismaClientSingleton();

if (config.app.nodeEnv !== 'production') {
  globalThis.prisma = prisma;
}

export default prisma;

// Helper function for vector operations
export async function findSimilarChunks(
  siteId: string,
  queryVector: number[],
  limit: number = 10
): Promise<Array<{ id: string; text: string; similarity: number }>> {
  const result = await prisma.$queryRaw<Array<{
    id: string;
    text: string;
    similarity: number;
  }>>`
    SELECT 
      c.id,
      c.text,
      1 - (e.vector <=> ${queryVector}::vector) AS similarity
    FROM chunks c
    JOIN pages p ON p.id = c.page_id
    JOIN embeddings e ON e.chunk_id = c.id
    WHERE p.site_id = ${siteId}
    ORDER BY e.vector <=> ${queryVector}::vector
    LIMIT ${limit}
  `;
  return result;
}

export async function insertEmbedding(
  chunkId: string,
  modelName: string,
  vector: number[]
): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO embeddings (id, chunk_id, model_name, vector, created_at)
    VALUES (gen_random_uuid(), ${chunkId}, ${modelName}, ${vector}::vector, NOW())
    ON CONFLICT (chunk_id, model_name) 
    DO UPDATE SET vector = ${vector}::vector, created_at = NOW()
  `;
}
