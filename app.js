const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const databasePath = path.join(__dirname, "twitterClone.db");

const app = express();

app.use(express.json());

let database = null;

const initializeDbAndServer = async () => {
  try {
    database = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    });

    app.listen(3000, () =>
      console.log("Server Running at http://localhost:3000/")
    );
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

function authenticateToken(request, response, next) {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "My_Token", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
}

function validatePassword(password) {
  return password.length > 5;
}

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  /*console.log(username);
  console.log(password);
  console.log(name);
  console.log(gender);*/
  const hashedPassword = await bcrypt.hash(password, 10);
  const selectUserQuery = `SELECT *
    FROM user
    WHERE username='${username}';`;

  const dbUser = await database.get(selectUserQuery);
  if (dbUser === undefined) {
    const createUserQuery = `INSERT INTO user(name,username,password,gender)
    VALUES ('${name}','${username}','${hashedPassword}','${gender}');`;

    if (validatePassword(password)) {
      const userCreated = await database.run(createUserQuery);
      console.log(userCreated);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  //console.log(username);
  //console.log(password);
  const getUserDetails = `SELECT *
    FROM user
    WHERE username="${username}"`;
  const dbUser = await database.get(getUserDetails);

  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "My_Token");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserId = `SELECT *
    FROM user 
    WHERE username="${username}";`;
  const userId = await database.get(getUserId);
  const getUserQuery = `
    SELECT username,tweet,date_time AS dateTime
    FROM (user INNER JOIN follower ON user.user_id=follower.following_user_id) INNER JOIN tweet ON follower.following_user_id=tweet.user_id  
    WHERE follower.follower_user_id=${userId.user_id}
    ORDER BY dateTime DESC
    LIMIT 4
   ;`;
  const dbTweets = await database.all(getUserQuery);
  response.send(dbTweets);
});

app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserId = `SELECT *
    FROM user 
    WHERE username="${username}";`;
  const userId = await database.get(getUserId);
  const getUserQuery = `
    SELECT DISTINCT name

    FROM user INNER JOIN follower ON user.user_id=follower.following_user_id
    WHERE follower.follower_user_id=${userId.user_id}
  ;`;

  const dbFollowingNames = await database.all(getUserQuery);
  response.send(dbFollowingNames);
});

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserId = `SELECT *
    FROM user 
    WHERE username="${username}";`;
  const userId = await database.get(getUserId);
  const getUserQuery = `
    SELECT DISTINCT name

    FROM user INNER JOIN follower ON user.user_id=follower.follower_user_id
    WHERE follower.following_user_id=${userId.user_id}
   ;`;

  const dbFollowerNames = await database.all(getUserQuery);
  response.send(dbFollowerNames);
});

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { username } = request;
  const { tweetId } = request.params;
  const getUserQuery = `
    SELECT *
    FROM user INNER JOIN tweet ON user.user_id=tweet.user_id INNER JOIN follower ON user.user_id=follower.following_user_id
   WHERE username="${username}" AND tweet_id=${tweetId};`;
  //${username}
  const dbTweet = await database.get(getUserQuery);
  if (dbTweet === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const getUserId = `SELECT *
    FROM user 
    WHERE username="${username}";`;
    const userId = await database.get(getUserId);
    const getTweetsQuery = `
   SELECT
  tweet,
  COUNT(LIKE.user_id) AS likes,
  (
    SELECT
      COUNT(reply.user_id) AS replies
    FROM
      user
      INNER JOIN follower ON user.user_id = follower.following_user_id
      INNER JOIN tweet ON follower.following_user_id = tweet.user_id
      INNER JOIN reply ON tweet.tweet_id = reply.tweet_id
    WHERE
      follower.follower_user_id = ${userId.user_id}
      AND tweet.tweet_id = ${tweetId}
  ) AS replies
FROM
  user
  INNER JOIN follower ON user.user_id = follower.following_user_id
  INNER JOIN tweet ON follower.following_user_id = tweet.user_id
  INNER JOIN reply ON tweet.tweet_id = reply.tweet_id
  INNER JOIN LIKE ON tweet.tweet_id = LIKE.tweet_id
WHERE
  follower.follower_user_id = ${userId.user_id}
  AND tweet.tweet_id = ${tweetId}
GROUP BY
  tweet`;
    const dbTweets = await database.all(getTweetsQuery);
    response.send(dbTweets);
  }
});

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const getUserQuery = `
    SELECT *

    FROM user INNER JOIN tweet ON user.user_id=tweet.user_id INNER JOIN follower ON user.user_id=follower.following_user_id
   WHERE username="${username}" AND tweet_id=${tweetId};`;

    const dbTweet = await database.get(getUserQuery);
    if (dbTweet === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const getUserId = `SELECT *
    FROM user 
    WHERE username="${username}";`;
      const userId = await database.get(getUserId);
      const getLikesQuery = `SELECT
  username
FROM
  user
  INNER JOIN follower ON follower.following_user_id = user.user_id
  INNER JOIN tweet ON follower.following_user_id = tweet.user_id
  INNER JOIN LIKE ON tweet.tweet_id = LIKE.tweet_id
WHERE
  follower.follower_user_id = ${userId.user_id}
  AND tweet.tweet_id = ${tweetId}`;
      let myArray = [];
      const dbUserNames = await database.all(getLikesQuery);
      dbUserNames.map((eachObject) => myArray.push(eachObject.username));
      response.send({ likes: myArray });
    }
  }
);

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const getUserQuery = `
    SELECT *

    FROM user INNER JOIN tweet ON user.user_id=tweet.user_id INNER JOIN follower ON user.user_id=follower.following_user_id
   WHERE username="${username}" AND tweet_id=${tweetId};`;

    const dbTweet = await database.get(getUserQuery);
    if (dbTweet === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const getRepliesQuery = `SELECT name , reply
    FROM (user INNER JOIN reply ON user.user_id=reply.user_id) INNER JOIN tweet ON tweet.tweet_id=reply.tweet_id
     WHERE tweet.tweet_id=${tweetId}
     GROUP BY reply.user_id
     ;`;
      const myArray = [];
      const dbUserReplies = await database.all(getRepliesQuery);
      dbUserReplies.map((eachObj) => myArray.push(eachObj));
      response.send({ replies: myArray });
    }
  }
);

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getTweetsQuery = `SELECT tweet,COUNT(like.like_id) AS likes,COUNT(reply.user_id) AS replies,date_time AS dateTime
    FROM user INNER JOIN tweet ON user.user_id=tweet.user_id INNER JOIN reply ON tweet.tweet_id=reply.tweet_id INNER JOIN like ON tweet.tweet_id=like.tweet_id
    WHERE user.username="${username}";`;
  const dbAllTweets = await database.all(getTweetsQuery);
  response.send(dbAllTweets);
});

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request.body;
  const { username } = request;
  const date = new Date();
  //date=(`${date.getFullYear()}-${date.getMonth()}-${date.getDay} ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`)
  const getUserId = `SELECT *
    FROM user 
    WHERE username="${username}";`;
  const dbUserId = await database.get(getUserId);
  const addTweetQuery = `INSERT INTO tweet(tweet,user_id,date_time)
    VALUES ("${tweet}",${dbUserId.user_id},"${date}");`;
  const dbAddTweet = await database.run(addTweetQuery);
  console.log(dbAddTweet);
  response.send("Created a Tweet");
});

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const getUserQuery = `
    SELECT *

    FROM user INNER JOIN tweet ON user.user_id=tweet.user_id INNER JOIN follower ON user.user_id=follower.following_user_id
   WHERE username="${username}" AND tweet_id=${tweetId};`;

    const dbTweet = await database.get(getUserQuery);
    if (dbTweet === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const deleteTweetQuery = `DELETE FROM tweet
    WHERE tweet_id=${tweetId} ;`;

      await database.run(deleteTweetQuery);
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;

