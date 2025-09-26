import jwt from 'jsonwebtoken';

// Authenticate a request using JWT created in userController
export const authenticate = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || '';
    const parts = authHeader.split(' ');

    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      req.userId = null;
      return next();
    }

    const token = parts[1];
    if (!token) {
      req.userId = null;
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    return next();
  } catch (err) {
    // On verification failure, treat as unauthenticated; requireAuth will block protected routes
    req.userId = null;
    return next();
  }
};

// Require authentication (to protect routes)
export const requireAuth = (req, res, next) => {
  if (!req.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
};
