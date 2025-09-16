import express from 'express';
import { createUser, loginUser } from '../controllers/userController.js';

const router = express.Router();

// User registration route
router.post('/register', createUser);

// User login route
router.post('/login', loginUser);

export default router;
