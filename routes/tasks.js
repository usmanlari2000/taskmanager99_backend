const express = require("express");
const router = express.Router();
const { isAuthenticated } = require("../middleware/auth");
const Joi = require("joi");

module.exports = (pool) => {
  const checkMembership = async (userId, teamId) => {
    const membership = await pool.query(
      "SELECT 1 FROM team_members WHERE user_id = $1 AND team_id = $2",
      [userId, teamId],
    );
    return membership.rows.length > 0;
  };

  router.get("/:teamId", isAuthenticated, async (req, res, next) => {
    try {
      const { teamId } = req.params;

      const isMember = await checkMembership(req.user.id, teamId);

      if (!isMember) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      const tasks = await pool.query(
        "SELECT * FROM tasks WHERE team_id = $1 ORDER BY created_at DESC",
        [teamId],
      );

      res.json(tasks.rows);
    } catch (err) {
      next(err);
    }
  });

  router.post("/", isAuthenticated, async (req, res, next) => {
    const schema = Joi.object({
      teamId: Joi.string().uuid().required(),
      title: Joi.string().trim().max(255).required(),
      description: Joi.string().allow("", null).max(1000),
      assignee: Joi.string().allow("unassigned", null),
      status: Joi.string().valid("pending", "in-progress", "completed"),
    });

    const { error, value } = schema.validate(req.body);

    if (error) return res.status(400).json({ error: error.details[0].message });

    const { teamId, title, description, assignee, status } = value;

    try {
      const isMember = await checkMembership(req.user.id, teamId);

      if (!isMember) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      const newTask = await pool.query(
        `INSERT INTO tasks (team_id, title, description, assignee_name, status)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [
          teamId,
          title,
          description,
          assignee || "unassigned",
          status || "pending",
        ],
      );

      res.status(201).json(newTask.rows[0]);
    } catch (err) {
      next(err);
    }
  });

  router.put("/:taskId", isAuthenticated, async (req, res, next) => {
    const schema = Joi.object({
      title: Joi.string().trim().max(255),
      description: Joi.string().allow("", null).max(1000),
      assignee: Joi.string(),
      status: Joi.string().valid("pending", "in-progress", "completed"),
    });

    const { error, value } = schema.validate(req.body);

    if (error) return res.status(400).json({ error: error.details[0].message });

    const { title, description, assignee, status } = value;
    const { taskId } = req.params;

    try {
      const taskCheck = await pool.query(
        `SELECT 1
         FROM tasks t
         WHERE t.id = $1
         AND t.team_id IN (
           SELECT team_id FROM team_members WHERE user_id = $2
         )`,
        [taskId, req.user.id],
      );

      if (taskCheck.rows.length === 0) {
        return res
          .status(403)
          .json({ error: "Not allowed to modify this task" });
      }

      const updatedTask = await pool.query(
        `UPDATE tasks
         SET title = COALESCE($1, title),
             description = COALESCE($2, description),
             assignee_name = COALESCE($3, assignee_name),
             status = COALESCE($4, status)
         WHERE id = $5
         RETURNING *`,
        [title, description, assignee, status, taskId],
      );

      res.json(updatedTask.rows[0]);
    } catch (err) {
      next(err);
    }
  });

  router.delete("/:taskId", isAuthenticated, async (req, res, next) => {
    try {
      const result = await pool.query(
        `DELETE FROM tasks
         WHERE id = $1
         AND team_id IN (
           SELECT team_id FROM team_members WHERE user_id = $2
         )
         RETURNING id`,
        [req.params.taskId, req.user.id],
      );

      if (result.rows.length === 0) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      res.json({ message: "Task deleted successfully" });
    } catch (err) {
      next(err);
    }
  });

  return router;
};
