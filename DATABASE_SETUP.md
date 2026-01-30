# Database Setup Guide

Quick guide to setting up PostgreSQL with pgvector for Aeyez.

## Option 1: Using Docker (Recommended)

The easiest way to get started:

```bash
# Run PostgreSQL 15 with pgvector
docker run -d \
  --name aeyez-db \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=aeyez \
  -p 5432:5432 \
  pgvector/pgvector:pg15

# Verify it's running
docker ps | grep aeyez-db

# Test connection
docker exec -it aeyez-db psql -U postgres -d aeyez -c "SELECT version();"
```

Then update your `.env`:
```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/aeyez?schema=public"
```

## Option 2: Local PostgreSQL Installation

### macOS (Homebrew)

```bash
# Install PostgreSQL
brew install postgresql@15

# Start PostgreSQL
brew services start postgresql@15

# Create database
createdb aeyez

# Install pgvector
cd /tmp
git clone https://github.com/pgvector/pgvector.git
cd pgvector
make
make install

# Enable extension
psql aeyez -c "CREATE EXTENSION vector;"
```

### Ubuntu/Debian

```bash
# Add PostgreSQL repository
sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -

# Install PostgreSQL
sudo apt update
sudo apt install postgresql-15 postgresql-server-dev-15

# Install pgvector
cd /tmp
git clone https://github.com/pgvector/pgvector.git
cd pgvector
make
sudo make install

# Create database
sudo -u postgres createdb aeyez

# Enable extension
sudo -u postgres psql aeyez -c "CREATE EXTENSION vector;"
```

### Windows

Use Docker (Option 1) or install [PostgreSQL for Windows](https://www.postgresql.org/download/windows/) and follow the pgvector build instructions for Windows.

## Verify Installation

```bash
# Connect to database
psql aeyez

# Check pgvector is installed
SELECT * FROM pg_extension WHERE extname = 'vector';

# Should show:
#  extname | extowner | extnamespace | extrelocatable | extversion
# ---------+----------+--------------+----------------+------------
#  vector  |       10 |         2200 | f              | 0.5.1
```

## Redis Setup

### Using Docker

```bash
docker run -d \
  --name aeyez-redis \
  -p 6379:6379 \
  redis:7-alpine

# Test
docker exec -it aeyez-redis redis-cli ping
# Should return: PONG
```

### Local Installation

**macOS:**
```bash
brew install redis
brew services start redis
redis-cli ping
```

**Ubuntu/Debian:**
```bash
sudo apt install redis-server
sudo systemctl start redis
redis-cli ping
```

## Run Migrations

Once PostgreSQL and Redis are running:

```bash
# Generate Prisma client
npm run db:generate

# Run migrations
npm run db:migrate

# Open Prisma Studio to verify (optional)
npm run db:studio
```

You should see all tables created (sites, pages, chunks, etc.).

## Troubleshooting

### "database does not exist"
```bash
createdb aeyez
# or with Docker:
docker exec -it aeyez-db createdb -U postgres aeyez
```

### "extension vector does not exist"
```bash
psql aeyez -c "CREATE EXTENSION vector;"
# or with Docker:
docker exec -it aeyez-db psql -U postgres -d aeyez -c "CREATE EXTENSION vector;"
```

### "connection refused"
```bash
# Check if PostgreSQL is running
pg_isready
# or
docker ps | grep aeyez-db

# Check if Redis is running
redis-cli ping
# or
docker ps | grep aeyez-redis
```

### Permission denied
```bash
# PostgreSQL
sudo -u postgres psql

# Redis (shouldn't require sudo normally)
redis-cli
```

## Docker Compose (Both Services)

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  postgres:
    image: pgvector/pgvector:pg15
    container_name: aeyez-db
    environment:
      POSTGRES_PASSWORD: password
      POSTGRES_DB: aeyez
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    container_name: aeyez-redis
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data

volumes:
  postgres-data:
  redis-data:
```

Then:
```bash
# Start both services
docker-compose up -d

# Stop services
docker-compose down

# View logs
docker-compose logs -f
```

## Next Steps

After database setup, continue with [USAGE.md](USAGE.md) to start analyzing sites!
