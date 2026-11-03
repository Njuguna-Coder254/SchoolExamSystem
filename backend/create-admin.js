
require("dotenv").config();

const bcrypt = require("bcryptjs");
const readline = require("readline/promises");
const { stdin, stdout } = require("process");
const pool = require("./db");

async function main() {
  const rl = readline.createInterface({ input: stdin, output: stdout });

  try {
    const username = (await rl.question("Administrator username: ")).trim();
    const fullName = (await rl.question("Administrator full name: ")).trim();
    const password = await rl.question("Administrator password: ");

    if (
      !/^[A-Za-z0-9._-]{3,80}$/.test(username) ||
      !fullName ||
      fullName.length > 150 ||
      password.length < 12 ||
      password.length > 200
    ) {
      throw new Error(
        "Use a 3–80 character username, a valid name, and a password of 12–200 characters."
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users (full_name, username, password_hash, role)
       VALUES ($1, $2, $3, 'admin')
       RETURNING id, username, full_name, role`,
      [fullName, username, passwordHash]
    );

    console.log("Administrator created:", result.rows[0]);
  } finally {
    rl.close();
    await pool.end();
  }
}

main().catch((error) => {
  if (error.code === "23505") {
    console.error("That username already exists. Choose another username.");
  } else {
    console.error("Could not create administrator:", error.message);
  }

  process.exitCode = 1;
});
