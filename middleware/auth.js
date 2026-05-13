module.exports = {
  isAuthenticated: (req, res, next) => {
    if (req.isAuthenticated()) {
      return next();
    }

    res.setHeader("WWW-Authenticate", "Challenge");

    return res.status(401).json({
      error: "Session expired or unauthorized",
      code: "AUTH_REQUIRED",
    });
  },
};
