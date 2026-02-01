const express = require('express');
const { Pool } = require('pg');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database connection - with error handling
let pool;
let dbReady = false;

if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
} else {
  console.warn('WARNING: No DATABASE_URL set - running in memory-only mode');
}

// Initialize database
async function initDB() {
  if (!pool) {
    console.log('No database configured, skipping init');
    return;
  }
  
  try {
    const client = await pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS sf_articles (
          id SERIAL PRIMARY KEY,
          article_id VARCHAR(10) UNIQUE NOT NULL,
          title TEXT NOT NULL,
          keyword VARCHAR(255),
          intent VARCHAR(100),
          funnel VARCHAR(50),
          description TEXT,
          priority VARCHAR(20),
          word_count INTEGER,
          category VARCHAR(100),
          week INTEGER,
          status VARCHAR(50) DEFAULT 'planned',
          notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('Database initialized');
      dbReady = true;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Database init failed:', err.message);
    console.log('App will still run, but database features will be unavailable');
  }
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', dbReady });
});

// API Routes
app.get('/api/articles', async (req, res) => {
  if (!pool || !dbReady) {
    return res.json([]);
  }
  try {
    const result = await pool.query('SELECT * FROM sf_articles ORDER BY week, article_id');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/articles/:id', async (req, res) => {
  if (!pool || !dbReady) {
    return res.status(503).json({ error: 'Database not available' });
  }
  try {
    const result = await pool.query('SELECT * FROM sf_articles WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Article not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/articles', async (req, res) => {
  if (!pool || !dbReady) {
    return res.status(503).json({ error: 'Database not available' });
  }
  const { article_id, title, keyword, intent, funnel, description, priority, word_count, category, week, status, notes } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO sf_articles (article_id, title, keyword, intent, funnel, description, priority, word_count, category, week, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (article_id) DO UPDATE SET
         title = EXCLUDED.title,
         keyword = EXCLUDED.keyword,
         intent = EXCLUDED.intent,
         funnel = EXCLUDED.funnel,
         description = EXCLUDED.description,
         priority = EXCLUDED.priority,
         word_count = EXCLUDED.word_count,
         category = EXCLUDED.category,
         week = EXCLUDED.week,
         status = COALESCE(EXCLUDED.status, sf_articles.status),
         notes = COALESCE(EXCLUDED.notes, sf_articles.notes),
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [article_id, title, keyword, intent, funnel, description, priority, word_count, category, week, status || 'planned', notes]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/articles/:id', async (req, res) => {
  if (!pool || !dbReady) {
    return res.status(503).json({ error: 'Database not available' });
  }
  const { status, notes, week } = req.body;
  try {
    const result = await pool.query(
      `UPDATE sf_articles SET 
        status = COALESCE($1, status),
        notes = COALESCE($2, notes),
        week = COALESCE($3, week),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 RETURNING *`,
      [status, notes, week, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Article not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/articles/:id', async (req, res) => {
  if (!pool || !dbReady) {
    return res.status(503).json({ error: 'Database not available' });
  }
  try {
    await pool.query('DELETE FROM sf_articles WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk import endpoint
app.post('/api/articles/bulk', async (req, res) => {
  if (!pool || !dbReady) {
    return res.status(503).json({ error: 'Database not available' });
  }
  const { articles } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const article of articles) {
      await client.query(
        `INSERT INTO sf_articles (article_id, title, keyword, intent, funnel, description, priority, word_count, category, week)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (article_id) DO UPDATE SET
           title = EXCLUDED.title,
           keyword = EXCLUDED.keyword,
           intent = EXCLUDED.intent,
           funnel = EXCLUDED.funnel,
           description = EXCLUDED.description,
           priority = EXCLUDED.priority,
           word_count = EXCLUDED.word_count,
           category = EXCLUDED.category,
           week = EXCLUDED.week,
           updated_at = CURRENT_TIMESTAMP`,
        [article.id, article.title, article.keyword, article.intent, article.funnel, article.description, article.priority, article.wordCount, article.category, article.week]
      );
    }
    await client.query('COMMIT');
    res.json({ success: true, count: articles.length });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Stats endpoint
app.get('/api/stats', async (req, res) => {
  if (!pool || !dbReady) {
    return res.json({ total: 0, high_priority: 0, medium_priority: 0, low_priority: 0 });
  }
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE priority = 'High') as high_priority,
        COUNT(*) FILTER (WHERE priority = 'Medium') as medium_priority,
        COUNT(*) FILTER (WHERE priority = 'Low') as low_priority,
        COUNT(*) FILTER (WHERE status = 'planned') as planned,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
        COUNT(*) FILTER (WHERE status = 'written') as written,
        COUNT(*) FILTER (WHERE status = 'published') as published
      FROM sf_articles
    `);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;

// Start server (don't wait for DB)
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  // Init DB in background
  initDB().catch(err => console.error('DB init error:', err.message));
});
