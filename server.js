const express = require('express')
const app = express()
const cors = require('cors')
require('dotenv').config()

/* My code */
// Formats the IP Address
app.listen(process.env.PORT, '0.0.0.0');

// Logs requests and other info
app.use(function middleware(req, res, next) {  
  let ua = req.headers["user-agent"];
  let dashes = "-".repeat(63);

  console.log("Client: " + ua + "\n" + dashes);
  console.log(req.method + " " + req.path + " - " + req.ip + "\n");
  next();
});

app.use(cors())
app.use(express.static('public'))
app.get('/', (req, res) => {
  // Displays the HTML page
  res.sendFile(__dirname + '/views/index.html')
});

var bodyParser = require("body-parser");
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Simplifies date formatting and comparisons
const moment = require("moment-timezone");

// My timezone
const TZ = "America/Chicago";

// Format for JSON dates
const FOR = "YYYY-MM-DD";
const FOR_JSON = "ddd MMM DD YYYY";

// Bad words filter
const Filter = require("bad-words");
let filter = new Filter();

// Adds words to filter
let words = [
  "Adolf Hitler",
  "adolf Hitler",
  "Adolf hitler",
  "adolf hitler", 
  "Hitler",
  "hitler",
  "Stalin",
  "stalin", 
  "Joseph Stalin",
  "Joseph stalin",
  "joseph Stalin",
  "joseph stalin",
  "Mussolini",
  "mussolini",
  "Benito Mussolini",
  "Benito mussolini",
  "benito Mussolini",
  "Kim Jong-un",
  "kim Jong-un",
  "Kim jong-un",
  "kim jong-un",
  "holocaust",
  "Holocaust"
];
filter.addWords(...words);

const mongoose = require("mongoose");

// Connect to DB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

let db = mongoose.connection;

// Displays connection errors
db.on("error", console.error.bind(console, "connection error:"));

// Schemas
const Schema = mongoose.Schema;
let userSchema = new Schema({
  username: { 
    type: String,  
    required: "{PATH} is required" , 
    maxLength: 20 
  },
  exercises: [
    { 
      type: Schema.Types.ObjectId, 
      ref:"Exercises" 
    }
  ]
});

let exerciseSchema = new Schema({
  date: Date,
  duration: { 
    type: Number, 
    required: "{PATH} is required" 
  },
  description: { 
    type: String, 
    required: "{PATH} is required" 
  },
  user: { type: Schema.Types.ObjectId, ref:"Users" }
});

// Models
const User = mongoose.model("Users", userSchema);
const Exercise = mongoose.model("Exercises", exerciseSchema);

// Executes once connected to DB
db.once("open", function() {
  // Save usernames in DB
  app.post("/api/users", (req, res) => {
    let uname = req.body.username;

    // Checks if the username was taken
    User.findOne({ username: uname }, (err, data) => {
      if (err) {
        res.send(err);
      } else {
        if (filter.isProfane(uname)) {
          res.send("Please choose an appropiate username");
        } else {
          if (data === null) {
            let user = User({
              username: uname
            });

            user.save((err) => {
              if (err) {
                res.send(err.message);
                console.log(err);
              } else {
                // Displays the results
                res.json({
                  _id: user._id,
                  username: user.username
                });
              }
            });
          } else {
            // Displays an error message
            res.send("This username is already taken");
          }
        }
      }
    });
  });

  // Displays all users in the DB and their _id
  app.get("/api/users", (req, res) => {
    User.find({}, (err, data) => {
      if (err) {
        res.send(err);
        console.log(err);
      } else {
        let users = data.map((d) => { 
          return {
            _id: d._id,
            username: d.username,
            __v: d.__v
          }
        });
        
        res.json(users);
      }
    });
  });

  // Save exercises in DB
  app.post("/api/users/:_id/exercises", (req, res) => {
    let id = req.params._id;
    let descrip = req.body.description;
    let dur = req.body.duration;
    let date = req.body.date === "" 
                ? moment().tz(TZ).format(FOR)
                : req.body.date;

    if (id === undefined) {
      res.send("An _id of a user is required");
    }

    User.findById(id, (err, user) => {
      if (err) {
        res.send(err.message);
        console.log(err);
      } else {
        if (user !== null) {
          let exercise = new Exercise({
            description: descrip,
            duration: dur,
            date: date,
            user: id
          });

          user.exercises.push(exercise);
          user.save((err) => {
            if (err) {
              console.log(err);
            }
          });

          exercise.save((err) => {
            if (err) {
              // Displays an error message
              res.send(err.message);
              console.log(err);
            } else {
              // Displays the results
              res.json({ 
                _id: exercise.user,
                username: user.username,
                date: moment(exercise.date)
                        .format(FOR_JSON),
                duration: exercise.duration,
                description: exercise.description
              });
            }
          });
        } else {
          res.send(
            "A user with an _id of " 
            + id 
            + " was not found"
          );
        }
      }
    });
  });

  // Displays a log of a users activity
  app.get("/api/users/:_id/logs?(from=:from&to=:to&limit=:limit)?", (req, res) => {
    let id = req.params._id;
    let fm = req.query.from;
    let to = req.query.to;
    let lt = req.query.limit;
    let logs = [];

    // Gets the user
    User.findById(id, (err, user) => {
      if (err) {
        res.send(err.message);
        console.log(err);
      } else {
        if (user !== null) {
          // Gets all the exercises that a user has posted
          Exercise.find({ user: user._id }, (err, excers) => {
            if (err) {
              res.send(err.message);
              console.log(err);
            } else {
              logs = excers.map((ex) => { 
                return { 
                  description: ex.description,
                  duration: ex.duration,
                  date: moment(ex.date).format(FOR_JSON)
                }
              }); 

              // Filters exercises by dates after :from
              if (fm !== undefined) {
                logs = logs.filter((l) => {
                  if (new Date(l.date).getTime() >= new Date(fm).getTime()) {
                    return l;
                  }
                });
              }
              
              // Filters exercises by dates before :to
              if (to !== undefined) {
                logs = logs.filter((l) => {
                  if (new Date(l.date).getTime() <= new Date(to).getTime()) {
                    return l;
                  }
                });
              } 
              
              // Limits the number of excercises shown by :limit
              if (lt !== undefined) {
                logs = logs.slice(0, parseInt(lt));
              }
              
              // The JSON data that will be displayed
              let json = jsonFormat(id, user.username, logs, fm, to);

              // Displays results
              res.json(json);
            }
          });
        } else {
          res.send(
            "A user with an _id of " 
            + id 
            + " was not found"
          );
        }
      }
    });
  });
});

// Gets the format that the JSON data should be displayed as
function jsonFormat(id, uname, logs, fm, to) {
  if (fm === undefined && to === undefined) {
    return { _id: id, username: uname, count: logs.length, log: logs };
  } else {
    if (fm !== undefined) {
      if (to !== undefined) {
        return {
          _id: id, 
          "from": moment(fm).format(FOR_JSON),
          to: moment(to).format(FOR_JSON),
          username: uname, 
          count: logs.length, 
          log: logs 
        };
      } else {
        return {
          _id: id, 
          "from": moment(fm).format(FOR_JSON),
          username: uname, 
          count: logs.length, 
          log: logs 
        };
      }
    } else if (to !== undefined) {
      return {
        _id: id, 
        to: moment(to).format(FOR_JSON),
        username: uname, 
        count: logs.length, 
        log: logs 
      };
    }
  }
}

const listener = app.listen(process.env.PORT || 3000, () => {
  console.log('Your app is listening on port ' + listener.address().port + "\n")
})
