var express = require('express');
var router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { format } = require('date-fns');

const authorization = require("../middleware/authorization");

/* GET users listing. */
router.get('/', function (req, res, next) {
  res.send('respond with a resource');
  return;
});

/**
 * Authentication endpoints:
 * /login
 * /register
 */
router.post('/login', function (req, res, next) {
  // Retrieve email and password from req.body
  const email = req.body.email;
  const password = req.body.password;

  // Verify body
  if (!email || !password) {
    res.status(400).json({
      error: true,
      message: "Request body incomplete - email and password needed"
    });
    return;
  }

  // Check if user already exists
  const queryUsers = req.db.from("users").select("*").where("email", "=", email);
  queryUsers
    .then(users => {
      if (users.length === 0) {
        // If user does not exist, return error response
        throw new Error("User does not exist");
      }

      // Compare password hashes
      const user = users[0];
      // Verify if passwords match
      return bcrypt.compare(password, user.hash);
    })
    .then(match => {
      if (!match) {
        // If passwords do not match, return error response
        throw new Error("Passwords do not match");
      }

      // If passwords match, return JWT
      const expires_in = 60 * 60 * 24; // 24 hours
      const exp = Math.floor(Date.now() / 1000) + expires_in;
      const token = jwt.sign({ email, exp }, process.env.JWT_SECRET);
      return res.status(200).json({
        token,
        token_type: "Bearer",
        expires_in
      });
    })
    .catch(e => {
      // Log error to the console and send response
      console.log(e);
      return res.status(401).json({ error: true, message: e.message });
    });
});


router.post('/register', function (req, res, next) {
  // Retrieve email and password from req.body
  const email = req.body.email;
  const password = req.body.password;

  // Verify body
  if (!email || !password) {
    return res.status(400).json({
      error: true,
      message: "Request body incomplete - email and password needed"
    });
  }

  // Determine if user already exists in table
  const queryUsers = req.db.from("users").select("*").where("email", "=", email);
  queryUsers.then(users => {
    if (users.length > 0) {
      throw new Error("User already exists");
    }

    // Insert user into database
    const saltRounds = 10;
    const hash = bcrypt.hashSync(password, saltRounds);
    return req.db.from("users").insert({ email, hash });
  })
    .then(() => {
      return res.status(201).json({ success: true, message: "User created" });
    })
    .catch(e => {
      return res.status(500).json({ success: false, message: e.message });
    });
});

/**
 * Profile endpoints
 * /user/{email}/profile (get request)
 * /user/{email}/profile (put request)
 */

router.get("/:email/profile", authorization, function (req, res, next) {
  // parse email from supplied parameters
  const email = req.params.email;

  // set fields to be returned
  let fields = ["email", "firstName", "lastName"];
  const authFields = ["dob", "address"];
  let tokenEmail = null;

  // if user is authenticated, collect email from decoded token and return dob and address as well
  if (req.authenticated) {
    fields = fields.concat(authFields);
    tokenEmail = req.token.email;
  }

  // collect user data based on email
  req.db.from("users").select(fields).where("email", "=", email)
    .then((rows) => {
      if (rows.length === 0) {
        return res.status(404).json({ "error": true, "message": "User not found" });
      }
      else {
        const result = rows.map(row => ({
          "email": row.email,
          "firstName": row.firstName,
          "lastName": row.lastName,
          // only return dob and address if user is authenticated
          ...(req.authenticated && email === tokenEmail && {
            "dob": row.dob === undefined ? null : row.dob,
            "address": row.address === undefined ? null : row.address
          })
        }));
        return res.status(200).json(result[0]);
      }
    })
});


router.put("/:email/profile", authorization, function (req, res, next) {
  // collect email from parameters and userData from header
  const email = req.params.email;
  const userData = req.body;

  const requiredFields = ["firstName", "lastName", "dob", "address"];

  // return error if user is not authenticated
  if (!req.authenticated) {
    return res.status(401).json({ "error": true, "message": "Authorization header ('Bearer token') not found" });
  }

  // see if email in token is the same as supplied email
  if (email !== req.token.email) {
    return res.status(403).json({ "error": true, "message": "Forbidden" });
  }

  // See if all fields have been supplied
  for (const field of requiredFields) {
    if (!(field in userData)) {
      return res.status(400).json({ "error": true, "message": "Request body incomplete: firstName, lastName, dob and address are required." });
    }
  }

  // see if data is string for first name, last name and address
  if (typeof userData.firstName !== 'string' || typeof userData.lastName !== 'string' || typeof userData.address !== 'string') {
    return res.status(400).json({ "error": true, "message": `Request body invalid: firstName, lastName and address must be strings only.` });
  }

  /* Validate date format for format YYYY-MM-DD*/
  const [year, month, day] = userData.dob.split('-');
  const actualDate = new Date(year, month - 1, day);
  const currentDate = new Date();

  const isValidDate = (actualDate.getFullYear() === parseInt(year) && actualDate.getMonth() === month - 1 &&actualDate.getDate() === parseInt(day));

  // return error if date is in invalid format
  if (!isValidDate) {
    return res.status(400).json({ error: true, message: 'Invalid input: dob must be a real date in format YYYY-MM-DD.'});
  }

  // see if data is in the future
  if (actualDate.getTime() > currentDate.getTime()) {
    return res.status(400).json({ error: true, message: 'Invalid input: dob must be a date in the past.'});
  }

  const updateFields = {
    "firstName": userData.firstName,
    "lastName": userData.lastName,
    "dob": userData.dob,
    "address": userData.address
  }

  // Update details based on supplied email
  req.db('users').where("email", "=", email).update(updateFields)
    .then(_ => {
      req.db('users').select("*").where("email", "=", email)
        .then(rows => {
          const result = rows.map(row => ({
            "email": row.email,
            "firstName": row.firstName,
            "lastName": row.lastName,
            "dob": row.dob,
            "address": row.address
          }));
          return res.status(200).json(result[0]);
        })
    })
});


module.exports = router;
