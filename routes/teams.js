const express = require("express");
const router = express.Router();
const { isAuthenticated } = require("../middleware/auth");
const Joi = require("joi");

module.exports = (pool) => {
  router.get("/", isAuthenticated, async (req, res, next) => {
    try {
      const teams = await pool.query(
        `SELECT t.id, t.name, t.creator_id, tm.role 
         FROM teams t
         JOIN team_members tm ON t.id = tm.team_id
         WHERE tm.user_id = $1
         ORDER BY t.created_at DESC`,
        [req.user.id],
      );

      res.json(teams.rows);
    } catch (err) {
      next(err);
    }
  });

  router.get("/:teamId/members", isAuthenticated, async (req, res, next) => {
    try {
      const { teamId } = req.params;

      const membershipCheck = await pool.query(
        "SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2",
        [teamId, req.user.id],
      );

      if (membershipCheck.rows.length === 0) {
        return res
          .status(403)
          .json({ error: "Unauthorized to view this team's members" });
      }

      const members = await pool.query(
        `SELECT u.id, u.name, u.email, tm.role 
         FROM users u
         JOIN team_members tm ON u.id = tm.user_id
         WHERE tm.team_id = $1`,
        [teamId],
      );

      res.json(members.rows);
    } catch (err) {
      next(err);
    }
  });

  router.post("/", isAuthenticated, async (req, res, next) => {
    const schema = Joi.object({
      name: Joi.string().trim().min(2).max(100).required(),
    });

    const { error, value } = schema.validate(req.body);

    if (error) return res.status(400).json({ error: error.details[0].message });

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const teamResult = await client.query(
        "INSERT INTO teams (name, creator_id) VALUES ($1, $2) RETURNING *",
        [value.name, req.user.id],
      );

      const team = teamResult.rows[0];

      await client.query(
        "INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, $3)",
        [team.id, req.user.id, "creator"],
      );

      await client.query("COMMIT");

      res.status(201).json(team);
    } catch (err) {
      await client.query("ROLLBACK");
      next(err);
    } finally {
      client.release();
    }
  });

  router.post("/:teamId/members", isAuthenticated, async (req, res, next) => {
    const schema = Joi.object({
      email: Joi.string().email().lowercase().required(),
    });

    const { error, value } = schema.validate(req.body);

    if (error) return res.status(400).json({ error: error.details[0].message });

    const { teamId } = req.params;

    try {
      const inviterCheck = await pool.query(
        "SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2",
        [teamId, req.user.id],
      );

      if (inviterCheck.rows.length === 0) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      const userResult = await pool.query(
        "SELECT id, name, email FROM users WHERE email = $1",
        [value.email],
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: "User hasn't registered yet" });
      }

      const targetUser = userResult.rows[0];

      await pool.query(
        "INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, $3)",
        [teamId, targetUser.id, "member"],
      );

      console.info(
        `Audit: User ${req.user.id} added ${targetUser.id} to Team ${teamId}`,
      );

      res.json({
        message: "Member added successfully",
        member: {
          id: targetUser.id,
          name: targetUser.name,
          email: targetUser.email,
        },
      });
    } catch (err) {
      if (err.code === "23505")
        return res.status(400).json({ error: "User already in the team" });

      next(err);
    }
  });

  router.delete("/:teamId", isAuthenticated, async (req, res, next) => {
    try {
      const result = await pool.query(
        "DELETE FROM teams WHERE id = $1 AND creator_id = $2 RETURNING id",
        [req.params.teamId, req.user.id],
      );

      if (result.rows.length === 0) {
        return res
          .status(403)
          .json({ error: "Unauthorized or team not found" });
      }

      res.json({ message: "Team deleted successfully" });
    } catch (err) {
      next(err);
    }
  });

  return router;
};
