import express from 'express';
import { tokenExchange } from '../controllers/authController.js';

const router = express.Router();

router.post('/', tokenExchange);

export default router;