const LocalStrategy = require("passport-local").Strategy;
const bcrypt = require("bcrypt");

module.exports = function (passport, pool) {
  passport.use(
    new LocalStrategy(
      { usernameField: "email" },
      async (email, password, done) => {
        try {
          const result = await pool.query(
            "SELECT id, name, email, password_hash FROM users WHERE email = $1",
            [email],
          );

          const user = result.rows[0];

          if (!user) {
            await bcrypt.compare(
              "dummy_password",
              "$2b$10$fakehashavoidstimingattacks",
            );

            return done(null, false, { message: "Invalid email or password" });
          }

          const isMatch = await bcrypt.compare(password, user.password_hash);

          if (isMatch) {
            delete user.password_hash;

            return done(null, user);
          }

          return done(null, false, { message: "Invalid email or password" });
        } catch (err) {
          return done(err);
        }
      },
    ),
  );

  passport.serializeUser((user, done) => done(null, user.id));

  passport.deserializeUser(async (id, done) => {
    try {
      const result = await pool.query(
        "SELECT id, name, email FROM users WHERE id = $1",
        [id],
      );

      const user = result.rows[0];

      if (!user) return done(null, false);

      done(null, user);
    } catch (err) {
      console.error("Deserialization Error: ", err);

      done(err, null);
    }
  });
};
