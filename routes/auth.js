const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const passport = require("passport");
const Joi = require("joi");
const rateLimit = require("express-rate-limit");

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Too many attempts, try again later" },
});

module.exports = (pool) => {
  const registerSchema = Joi.object({
    name: Joi.string().trim().min(2).max(50).required(),
    email: Joi.string().email().lowercase().required(),
    password: Joi.string().min(8).max(72).required(),
  });

  router.post("/register", authLimiter, async (req, res, next) => {
    const { error, value } = registerSchema.validate(req.body);

    if (error) return res.status(400).json({ error: error.details[0].message });

    const { name, email, password } = value;

    try {
      const salt = await bcrypt.genSalt(12);
      const hash = await bcrypt.hash(password, salt);

      const newUserResult = await pool.query(
        "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email",
        [name, email, hash],
      );

      const user = newUserResult.rows[0];

      req.login(user, (err) => {
        if (err) return next(err);

        return res.status(201).json({
          message: "Account created successfully",
          user,
        });
      });
    } catch (err) {
      if (err.code === "23505") {
        return res.status(409).json({ error: "Email already registered" });
      }

      next(err);
    }
  });

  router.post("/login", authLimiter, (req, res, next) => {
    passport.authenticate("local", (err, user, info) => {
      if (err) return next(err);

      if (!user)
        return res
          .status(401)
          .json({ error: info.message || "Authentication failed" });

      req.login(user, (loginErr) => {
        if (loginErr) return next(loginErr);

        return res.json({
          message: "Logged in successfully",
          user: { id: user.id, name: user.name, email: user.email },
        });
      });
    })(req, res, next);
  });

  router.post("/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);

      req.session.destroy((destroyErr) => {
        if (destroyErr) return next(destroyErr);

        res.clearCookie("sid");

        return res.json({ message: "Logged out successfully" });
      });
    });
  });

  router.get("/status", (req, res) => {
    if (req.isAuthenticated()) {
      return res.json({ isAuthenticated: true, user: req.user });
    }

    return res.status(401).json({ isAuthenticated: false, user: null });
  });

  return router;
};
