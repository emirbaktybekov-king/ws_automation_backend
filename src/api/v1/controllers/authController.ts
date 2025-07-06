import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import prisma from "@/lib/prismaClient";

interface RegisterRequest {
  email: string;
  password: string;
  username: string;
}

interface LoginRequest {
  email: string;
  password: string;
}

interface RefreshRequest {
  refreshToken: string;
}

const generateTokens = (user: { id: number; email: string }) => {
  const accessToken = jwt.sign(
    { id: user.id, email: user.email },
    process.env.JWT_SECRET!,
    { expiresIn: "5h" }
  );
  const refreshToken = jwt.sign(
    { id: user.id, email: user.email },
    process.env.JWT_SECRET!,
    { expiresIn: "30d" }
  );
  return { accessToken, refreshToken };
};

export const register = async (req: Request, res: Response) => {
  const { email, password, username } = req.body as RegisterRequest;

  try {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: "Email already exists" });
    }

    const user = await prisma.user.create({
      data: { email, password, username },
    });

    const tokens = generateTokens(user);
    res.status(201).json({ user: { id: user.id, email, username }, ...tokens });
  } catch (error) {
    res.status(500).json({ error: "Registration failed" });
  }
};

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body as LoginRequest;

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.password !== password) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const tokens = generateTokens(user);
    res.json({
      user: { id: user.id, email, username: user.username },
      ...tokens,
    });
  } catch (error) {
    res.status(500).json({ error: "Login failed" });
  }
};

export const refresh = async (req: Request, res: Response) => {
  const { refreshToken } = req.body as RefreshRequest;

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET!) as {
      id: number;
      email: string;
    };
    const user = await prisma.user.findUnique({ where: { id: decoded.id } });

    if (!user) {
      return res.status(401).json({ error: "Invalid refresh token" });
    }

    const tokens = generateTokens(user);
    res.json(tokens);
  } catch (error) {
    res.status(401).json({ error: "Invalid or expired refresh token" });
  }
};
