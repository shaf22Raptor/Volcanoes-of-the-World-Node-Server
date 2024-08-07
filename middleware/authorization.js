const jwt = require('jsonwebtoken');
module.exports = function (req, res, next) {
    // see if authorization data is in body, see if it is malformed
    if ("authorization" in req.headers && !req.headers.authorization.match(/^Bearer /)) {
        return res.status(401).json({ error: true, message: "Authorization header is malformed" });
    }
    // check if user is authorised
    if (!("authorization" in req.headers)
        || !req.headers.authorization.match(/^Bearer /)
    ) {
        req.authenticated = false;
        console.log("authorisation not found");
    } else {
        // collect token
        const token = req.headers.authorization.replace(/^Bearer /, "");
        try {
            // get decoded token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.authenticated = true;
            req.token = decoded;
        } catch (e) {
            if (e.name === "TokenExpiredError") {
                res.status(401).json({ error: true, message: "JWT token has expired" });
            } else {
                res.status(401).json({ error: true, message: "Invalid JWT token" });
            }
        }
    }

    next();
};
