# Security Documentation

This document describes security measures implemented in AhaRadar.

## API Key Encryption

User-provided API keys are encrypted at rest using AES-256-GCM.

### Encryption Details

| Property | Value |
|----------|-------|
| Algorithm | AES-256-GCM (authenticated encryption) |
| Key size | 256 bits (32 bytes) |
| IV size | 96 bits (12 bytes, randomly generated per encryption) |
| Auth tag | 128 bits (appended to ciphertext) |

### Why AES-256-GCM?

- **Authenticated encryption**: Provides both confidentiality and integrity
- **Industry standard**: Widely used and vetted by security experts
- **Performance**: Hardware acceleration available on modern CPUs
- **GCM mode**: Parallelizable, no padding oracle vulnerabilities

### Master Key Management

The master encryption key is provided via `APP_ENCRYPTION_KEY` environment variable.

**Generation:**
```bash
# Generate a secure 32-byte key
openssl rand -hex 32
```

**Requirements:**
- Must be 64 hex characters (32 bytes)
- Must be kept secret and backed up securely
- Rotation requires re-encrypting all stored keys

**Storage recommendations:**
- Development: `.env` file (gitignored)
- Production: Secret manager (AWS Secrets Manager, HashiCorp Vault, etc.)
- Never commit to version control

### Key Suffix Display

For user identification, only the last 4 characters of an API key are stored in plaintext (`key_suffix` column). This allows users to identify which key is stored without exposing the full key.

Example display: `sk-...abcd`

### Database Schema

```sql
CREATE TABLE user_api_keys (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  provider VARCHAR(50) NOT NULL,      -- 'openai', 'anthropic', 'xai'
  encrypted_key BYTEA NOT NULL,       -- AES-256-GCM encrypted
  iv BYTEA NOT NULL,                  -- 12-byte initialization vector
  key_suffix VARCHAR(8) NOT NULL,     -- Last 4 chars for display
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE(user_id, provider)
);
```

## Key Resolution

When resolving API keys for LLM calls:

1. **User key first**: Check if user has a key for the provider
2. **Decrypt on demand**: Keys are decrypted only when needed
3. **System fallback**: If `ALLOW_SYSTEM_KEY_FALLBACK=true` and no user key exists, use system key from environment
4. **No key available**: Return null, caller must handle

### Security Logging

- **Never log decrypted keys** - even at debug level
- **Log key operations** - creation, update, deletion (without key values)
- **Correlation IDs** - track key usage across requests

## Authentication

### Session-Based Auth (Web UI)

- Magic link email authentication
- Session tokens stored in HTTP-only cookies
- Tokens hashed before storage (SHA-256)
- Session expiration: 30 days

### API Key Auth (CLI/Admin)

- Static API key via `X-API-Key` header
- Used for admin operations and CLI
- Set via `ADMIN_API_KEY` environment variable

## Future Improvements

- [ ] Envelope encryption with per-key data keys
- [ ] KMS integration (AWS KMS, GCP KMS, HashiCorp Vault)
- [ ] Key rotation automation
- [ ] Audit logging for key access
- [ ] Rate limiting per API key
- [ ] Key revocation and expiration

## Secure Development Practices

### Secrets Handling

- Never commit secrets to version control
- Use `.env` files locally (gitignored)
- Use secret managers in production
- Rotate secrets regularly

### Code Review Checklist

- [ ] No hardcoded secrets
- [ ] Sensitive data encrypted at rest
- [ ] API keys not logged
- [ ] Input validation on all endpoints
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS prevention (proper escaping)
