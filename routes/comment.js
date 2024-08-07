var express = require('express');
var router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { format } = require('date-fns');

const authorization = require("../middleware/authorization");

/* Data endpoints: 
*  /:volcanoID
*  /:commentID/:likeOrDislike
*  /volcano/{id}
*/

router.post("/:volcanoID", authorization, function (req, res, next) {
    
    // collect volcanoID, userID and comment data from body
    const volcanoID = req.params.volcanoID;
    const userID = req.body.userID;
    const comment = req.body.comment;

    // check if user is authenticated
    if (!req.authenticated) {
        return res.status(401).json({ "error": true, "message": "Unauthorized. You are required to sign in to comment." });
    }

    // Validate input to see if data has been supplied and if comment is a string and to check if it is empty
    if (!userID || !comment || typeof comment !== 'string' || comment.trim() === '') {
        return res.status(400).json({ "error": true, "message": "Invalid input: userID and comment are required, and comment must be a non-empty string" });
    }

    const data = {
        "volcanoID": volcanoID,
        "userID": userID,
        "comment": comment.trim(),
    };

    const checkVolcano = req.db.from("data").select("*").where("id", "=", volcanoID);
    const checkUser = req.db.from("users").select("*").where("id", "=", userID);
    checkVolcano
        .then(volcanoes => {
            // check if volcano comment is being made for exists
            if (volcanoes.length === 0) {
                return res.status(404).json({ "error": true, "message": "Volcano not found." });
            }
            return checkUser;
        })
        // check if user comment is being made for exists
        .then(users => {
            if (users.length === 0) {
                return res.status(404).json({ "error": true, "message": "User not found." });
            }
            return req.db.from("comments").insert(data);
        })
        // post comment
        .then(() => {
            return res.status(201).json({ "error": false, message: "Comment posted" });
        })
        .catch((err) => {
            // handle data fetch errors
            console.log(err);
            return res.status(500).json({ "error": true, message: "Internal Server Error" });
        });
});

router.put('/:commentID/:likeOrDislike', authorization, function (req, res, next) {
    // collect all parameters and body data
    const commentID = req.params.commentID;
    const likeOrDislike = req.params.likeOrDislike;
    const intCommentID = parseInt(commentID)
    const likeOrDislikeColumn = ["like", "dislike"];
    const index = likeOrDislikeColumn.indexOf(likeOrDislike);
    const column = likeOrDislikeColumn[index];

    // check if user is authenticated
    if (!req.authenticated) {
        return res.status(401).json({ "error": true, "message": "Unauthorized. You are required to sign in to like or dislike." });
    }

    // Validate input
    if (!commentID || !likeOrDislike || !Number.isInteger(intCommentID) || column === undefined) {
        return res.status(400).json({ "error": true, "message": `Invalid input: commentID, and like or dislike required. CommentID as an int, like or dislike as string.`});
    }

    // collect comment data using commentID
    const seeLikesDislikes = req.db.from("comments").select(`${column}s`).where("id", "=", commentID);
    seeLikesDislikes
        .then(rows => {
            // see if the comment exists
            if (rows.length === 0) {
                return res.status(404).json({ "error": true, "message": "Comment does not exist" });
            } else {
                // append the like or dislike column depending on parameter passed through endpoint
                const updatedFields = {};
                updatedFields[`${column}s`] = rows[0][`${column}s`] + 1;

                // send data back to database with updated values
                req.db('comments').where("id", "=", commentID).update(updatedFields)
                    .then(() => {
                        return res.status(201).json({ "error": false, message: `Comment liked or disliked` });
                    });
            }
        })
        .catch((err) => {
            if (!res.headersSent) {
                return res.status(500).json({ "error": true, "Message": `Internal Server Error` });
            }
        });
});

// collects comment data
router.get('/:commentID', function (req, res, next) {
    const commentID = req.params.commentID;
    const intCommentID = parseInt(commentID);
    // Validate input
    if (!commentID || !Number.isInteger(intCommentID)) {
        return res.status(400).json({ "error": true, "message": "Invalid input: commentID required. CommentID as an int." });
    }

    // function to calculate like to dislike ratio
    const likeDislikeRatio = (likes, dislikes) => {
        let ratio = null;
        let ratioText = null;
        // if there are no dislikes and more than 0 likes, return 100%
        if (dislikes === 0 && likes > 0) {
            ratioText = "100%";
        }
        // if there are also 0 likes, return 0%
        else if(likes === 0) {
            ratioText = "0%";
        }
        // otherwise calculate as normal
        else {
            ratio = (likes / (likes+dislikes))*100;
            ratioText = `${ratio.toFixed(2)}%`;
        }
        return ratioText
    }

    // select all comment data using commentID
    const query = req.db("comments").select("*").where("id", "=", commentID);
    query
        .then(rows => {
            // check if comment exists
            if (rows.length === 0) {
                return res.status(404).json({ "error": true, "message": "Comment does not exist" });
            }
            else {
                // format data to return to client
                const result = rows.map(row => ({
                    "commentID": row.id,
                    "volcanoID": row.volcanoID,
                    "userID": row.userID,
                    "timeStamp": row.timeStamp,
                    "comment": row.comment,
                    "likes": row.likes,
                    "dislikes": row.dislikes,
                    "ratio": likeDislikeRatio(row.likes,row.dislikes)
                }));
                return res.status(200).json(result[0]);
            }
        })
});

module.exports = router;