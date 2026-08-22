const jwt = require('jsonwebtoken');

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET_KEY;
  if (!secret) throw new Error('Server configuration error: JWT_SECRET_KEY is missing.');
  return secret;
};

const extractBearerToken = (authorization = '') => {
  const [scheme, token] = String(authorization).trim().split(/\s+/);
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
};

const verifyJwt = (token) => jwt.verify(token, getJwtSecret());

const requireAuth = (req, res, next) => {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) return res.status(401).json({ error: 'Authentication required.' });

  try {
    const payload = verifyJwt(token);
    if (!payload?.userId) return res.status(401).json({ error: 'Invalid authentication token.' });
    req.auth = { userId: String(payload.userId), email: payload.email };
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired authentication token.' });
  }
};

module.exports = { extractBearerToken, getJwtSecret, requireAuth, verifyJwt };
