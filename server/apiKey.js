import crypto from 'crypto';
import { dbGet, dbRun, dbAll } from './db.js';

// Generate a secure random API key
export function generateAPIKey() {
  return 'sm_' + crypto.randomBytes(32).toString('hex'); // sm_ prefix for "Site Monitor"
}

// Create a new API key
export async function createAPIKey(name, permissions = 'read', rateLimit = 100, expiresInDays = null) {
  try {
    const key = generateAPIKey();
    const expiresAt = expiresInDays 
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

    await dbRun(
      `INSERT INTO api_keys (key, name, permissions, rate_limit, expires_at) VALUES (?, ?, ?, ?, ?)`,
      [key, name, permissions, rateLimit, expiresAt]
    );

    return { key, name, permissions, rateLimit, expiresAt };
  } catch (err) {
    throw new Error('Failed to create API key: ' + err.message);
  }
}

// Verify API key and return key info
export async function verifyAPIKey(key) {
  try {
    const apiKey = await dbGet(
      `SELECT * FROM api_keys WHERE key = ?`,
      [key]
    );

    if (!apiKey) {
      return null;
    }

    // Check if expired
    if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) {
      return null;
    }

    // Update last_used_at
    await dbRun(
      `UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?`,
      [apiKey.id]
    );

    return {
      id: apiKey.id,
      name: apiKey.name,
      permissions: apiKey.permissions,
      rateLimit: apiKey.rate_limit,
    };
  } catch (err) {
    console.error('API key verification error:', err.message);
    return null;
  }
}

// List all API keys (without exposing full key)
export async function listAPIKeys() {
  try {
    const keys = await dbAll(`SELECT id, name, permissions, rate_limit, last_used_at, created_at, expires_at FROM api_keys ORDER BY created_at DESC`);
    
    // Mask keys for security
    return keys.map(k => ({
      ...k,
      keyPreview: '••••••••' + (k.key ? k.key.slice(-8) : ''),
    }));
  } catch (err) {
    throw new Error('Failed to list API keys: ' + err.message);
  }
}

// Delete an API key
export async function deleteAPIKey(keyId) {
  try {
    await dbRun(`DELETE FROM api_keys WHERE id = ?`, [keyId]);
    return { success: true };
  } catch (err) {
    throw new Error('Failed to delete API key: ' + err.message);
  }
}

// Middleware to require API key authentication
export function requireAPIKey(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;

  if (!apiKey) {
    return res.status(401).json({ error: 'API key tələb olunur (x-api-key header və ya ?api_key=xxx query param)' });
  }

  verifyAPIKey(apiKey).then(keyInfo => {
    if (!keyInfo) {
      return res.status(401).json({ error: 'API key etibarsızdır və ya vaxtı bitib' });
    }

    // Attach key info to request
    req.apiKey = keyInfo;
    next();
  }).catch(err => {
    res.status(500).json({ error: 'API key verification failed: ' + err.message });
  });
}

// Check permissions
export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.apiKey) {
      return res.status(401).json({ error: 'API key tələb olunur' });
    }

    const permissions = req.apiKey.permissions.split(',').map(p => p.trim());
    
    if (!permissions.includes('all') && !permissions.includes(permission)) {
      return res.status(403).json({ error: `Bu əməliyyat üçün '${permission}' icazəsi lazımdır` });
    }

    next();
  };
}
