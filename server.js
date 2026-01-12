
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import path from "path";
import cron from 'node-cron'

import mongoose from "mongoose";
import bcrypt, { compareSync } from "bcryptjs";
import jwt from "jsonwebtoken";
import cors from "cors";
import rateLimit from "express-rate-limit"
import { weeklyEmail } from "./weeklyEmail.js";
import crypto from 'crypto';


import { Resend } from 'resend'; // for email
import { fileURLToPath } from "url";
import { dirname } from "path";
//console.log("HF TOKEN RAW:", process.env.HF_TOKEN, typeof process.env.HF_TOKEN);
import { InferenceClient } from "@huggingface/inference";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename); /// es module directory stufff

const app = express();
const PORT = process.env.PORT;

const NYTimesKey = process.env.NYTIMESKEY; //NYTimes API -  articlesearch.json?q={query}&fq={filter}&api-key=yourkey
const GuardianKey = process.env.GUARDIANKEY; // The Guardian API - https://content.guardianapis.com/search?q={query}&api-key={key}
const WorldNewsKey = process.env.WORLDNEWSKEY; // World News api
const resendEmailKey = process.env.RESENDEMAILKEY // for email key 
const youtubeKey = process.env.YOUTUBE_API_KEY
const resend = new Resend(resendEmailKey)
const hf = new InferenceClient(process.env.HF_TOKEN);// If not posted yet ping in group me for token!!!!!!!
let breakingNewsCache = null;
let lastBreakingFetchTime = 0;
const userRecommendationCache = {};
const REC_CACHE_DURATION = 15 * 60 * 1000; // 15 Minutes
const CACHE_DURATION = 15 * 60 * 1000; // 15 Minutes in milliseconds


mongoose.connect(
  process.env.MONGODB_URI || "mongodb://localhost:27017/newsApp"
);








const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000, // max of 45 request every 15 minutes
  message: `Limit exceeded. Max of 1000 request every 15min calm down I suppose`
});






app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());
app.use(express.urlencoded({ extended: false })); // for future posts request
/*const corsOptions = {
  origin: process.env.ALLOWED_ORIGIN, // Reads "http://localhost:5500" from your .env
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204
};*/


//Monica add the 127.0.0.1 to test the reset-password logic
const corsOptions = {
  // Allow 127.0.0.1 AND localhost AND your deployed link
  origin: [
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    process.env.ALLOWED_ORIGIN,
    "https://testertester-production.up.railway.app"
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true, // This is important for cookies/sessions if you use them
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

app.use(cors(corsOptions));
const authMiddleware = (req, res, next) => {
  // 1. Get the token from the Authorization header (e.g., "Bearer <token>")
  const token = req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ message: 'Access denied. Authentication token missing.' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded || !decoded.userId) {
      return res.status(401).json({ message: 'Invalid token payload.' });
    }

    // 1. ATTACH THE USER OBJECT
    req.user = decoded;

    // 2. ONLY CALL NEXT() IF ATTACHMENT WAS SUCCESSFUL
    next();
  } catch (ex) {
    // If token verification fails, stop here and return 401
    console.error("JWT verification failed:", ex.message);
    res.status(401).json({ message: 'Invalid or expired token.' });
  }
};

// ALL SCHEMAS AND MODELS BEFORE ROUTES
//USER SCHEMA
const userSchema = new mongoose.Schema(
  {
    name: String,
    email: { type: String, required: true, unique: true },
    password: String,

    //onboarding stuff :)
    age: Number,
    topics: [String],
    comments: String,
    hasCompletedOnboarding: { type: Boolean, default: false },
    wantsEmail: { type: Boolean, default: true },
    passwordResetToken: String,
    passwordResetExpires: Date,
    wantsEmail: { type: Boolean, default: true },

    blockedTopics: { type: [String], default: [] },
    blockedSources: { type: [String], default: [] }
  },
  { timestamps: true }
);

// We need to eventually have all of these in schemas and models in a folder 
export const User = mongoose.model("User", userSchema);
//ARTICLE SCHEMA
const articleSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    thumbnail: { type: String, default: "" },
    source: { type: String, default: "" },
    publicationDate: { type: Date },

    viewCount: { type: Number, default: 0 },

    embedding: {
      type: [Number],
      default: null,
      index: "vector"
    }
  },
  { timestamps: true }
);

const Article = mongoose.model("Article", articleSchema, "articles2");

//RECOMMENDATION ENGINE SCHEMAS

//To track user's searches, clicks, and bookmarks
const interactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Types.ObjectId, required: true, ref: "User" },
  type: { type: String, enum: ["search", "click", "bookmark"], required: true },
  value: { type: String, required: true }, // URL for bookmarks, search term for searches
  title: { type: String }, // Article title for bookmarks
  description: { type: String }, // Article description for bookmarks
  source: { type: String }, // News source for bookmarks
  timeStamp: { type: Date, default: Date.now }
});

const Interaction = mongoose.model("Interaction", interactionSchema);

//store recommended article history (can be implemented later)
const recommendationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", require: true },
  recommendations: [String], //list of url or article titles
  generatedAt: { type: Date, default: Date.now }
});

export const Recommendation = mongoose.model("Recommendation", recommendationSchema);

app.get("/server-health", async (req, res) => {
  try {
    res.status(200).json({ message: "Server health fine" })
  }
  catch (err) {
    res.status(500).json({ message: `Server error: ${err.message}` })
  }
})

app.use(limiter)
app.get("/api-health", async (req, res) => {

  try {
    let searchTerm = "Health"
    const NyResCheck = await fetch(`https://api.nytimes.com/svc/search/v2/articlesearch.json?q=${searchTerm}&api-key=${NYTimesKey}`)
    const GuardianResCheck = await fetch(`https://content.guardianapis.com/search?&q=${searchTerm}&api-key=${GuardianKey}&show-fields=thumbnail,headline,trailText,wordcount,publication`)
    const WorldNewsResCheck = await fetch(`https://api.worldnewsapi.com/search-news?text=earth+quake&language=en&earliest-publish-date=2025-10-01`, {
      method: 'GET',
      headers: {
        'x-api-key': WorldNewsKey
      }
    })
    if (NyResCheck.ok && GuardianResCheck.ok && WorldNewsKey.ok) {
      res.status(200).json({ MESSAGE: "Api" })
    } else {
      throw new Error("An Api is not responding")
    }

  }
  catch (err) {
    res.status(500).json({ message: err.message })

  }
})



app.get("/article", async (req, res) => {
  const { searchTerm } = req.query;
  console.log(searchTerm);
  let allYoutubeVideos = [];

  const nySort = "newest";
  const guardianSort = "newest";

  const safeFetch = async (url, options, sourceName) => {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        // Log the API error (e.g., 403 Quota Exceeded)
        console.error(`API ERROR: ${sourceName} returned status ${response.status}`);
        return { error: `API failed: ${sourceName}` }; // Return an error object
      }
      return await response.json(); // Return the good data
    } catch (err) {
      // Log the network error (e.g., fetch failed)
      console.error(`API FAILED: ${sourceName}`, err.message);
      return { error: err.message }; // Return an error object
    }
  };
  try {
    console.log("--- SERVER V4 IS RUNNING ---");
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const [nyRes, guardianRes, worldRes, youtubeRes, youtubeRes2] = await Promise.all([
      // fires at the same time for speed
      safeFetch(
        `https://api.nytimes.com/svc/search/v2/articlesearch.json?q=${searchTerm}&sort=${nySort}&api-key=${NYTimesKey}`,
        {}, "NYTimes"
      ),
      safeFetch(
        `https://content.guardianapis.com/search?&q=${searchTerm}&order-by=${guardianSort}&api-key=${GuardianKey}&show-fields=thumbnail,headline,trailText,wordcount,publication`,
        {}, "Guardian"
      ),
      safeFetch(`
           https://api.worldnewsapi.com/search-news?text=${searchTerm}&language=en&earliest-publish-date=${thirtyDaysAgo}
      `, {
        method: 'GET',
        headers: {
          'x-api-key': WorldNewsKey
        }
      }, "WorldNews"),
      safeFetch(`
        https://www.googleapis.com/youtube/v3/search?part=snippet&q=${searchTerm}&type=video&maxResults=2&channelId=UCBi2mrWuNuyYy4gbM6fU18Q&videoEmbeddable=true&key=${youtubeKey}
      `, {}, "Youtube1"
      ),
      safeFetch(`
     https://www.googleapis.com/youtube/v3/search?part=snippet&q=${searchTerm}&type=video&maxResults=1&channelId=UCeY0bbntWzzVIaj2z3QigXg&videoEmbeddable=true&key=${youtubeKey}
      `, {}, "Youtube2")
    ]);
    /*console.log("--- YOUTUBE DATA 1 (DEBUG) ---");
    console.log(JSON.stringify(youtubeRes, null, 2));
    console.log("--- YOUTUBE DATA 2 (DEBUG) ---");
    console.log(JSON.stringify(youtubeRes2, null, 2));*/

    let nyArticles = nyRes?.response?.docs ?? [];
    let guardianArticles = guardianRes?.response?.results ?? [];
    let worldArticles = worldRes?.news ?? [];
    let videos = youtubeRes?.items ?? [];
    let videos2 = youtubeRes2?.items ?? [];
    if (videos && videos2) {
      videos.forEach(element => {
        let video = {
          title: element.snippet.title,
          description: element.snippet.description,
          source: element.snippet.channelTitle,
          date: element.snippet.publishTime,
          thumbnail: element.snippet.thumbnails.medium.url,
          link: `https://www.youtube.com/watch?v=${element.id.videoId}`, // it does not give us the direct link so we search using video id
          embedLink: `https://www.youtube.com/embed/${element.id.videoId}`
        }
        allYoutubeVideos.push(video)
      })

      videos2.forEach(element => {
        let video = {
          title: element.snippet.title,
          description: element.snippet.description,
          source: element.snippet.channelTitle,
          date: element.snippet.publishTime,
          thumbnail: element.snippet.thumbnails.medium.url,
          link: `https://www.youtube.com/watch?v=${element.id.videoId}`,
          embedLink: `https://www.youtube.com/embed/${element.id.videoId}` // seperate link to embed
        }
        allYoutubeVideos.push(video)
      })
    }
    // We can reduce this from the api this is just a short version
    nyArticles = nyArticles.slice(0, 7)
    guardianArticles = guardianArticles.slice(0, 5)
    worldArticles = worldArticles.slice(0, 2) // limited
    // console.log(allYoutubeVideos)
    //SET HEADERS TO PREVENT CACHING
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');//HTTP 1.1
    res.setHeader('Pragma', 'no-cache'); //HTTP 1.0
    res.setHeader('Expires', '0'); //Proxies

    return res.status(200).json([guardianArticles, nyArticles, worldArticles, allYoutubeVideos]);
  } catch (err) {
    console.error("!!! API FETCH ERROR:", err);
    return res.status(500).json({ message: err.message });
  }
});
async function generateEmbedding(text) {
  if (!text || text.trim() === "") return null;

  try {
    const output = await hf.featureExtraction({
      model: "sentence-transformers/all-MiniLM-L6-v2",
      inputs: text,
    });

    // Return the vector properly
    return Array.isArray(output[0]) ? output[0] : output;

  } catch (err) {
    console.error("X HF embedding error:", err);
    return null;
  }
}


app.post("/api/signup", async (req, res) => {
  const { name, email, password } = req.body;
  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      //If user exist, return 409 conflict status and do not send the email
      console.log('Signed up rejected. User already exists:', email);
      return res.status(409).json({ message: "User already exists. Please login!" });
    }
    //Create new user if not exist
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ name, email, password: hashedPassword });
    await user.save();

    console.log(
      `✅ New user created: ${name} (${email}) at ${new Date().toLocaleString()}`
    );

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);

    await resend.emails.send({
      from: 'inewsreader@mylinkly.work',
      to: `${email}`,
      subject: 'Welcome to Inews Reader!',
      html: `Dear ${name}, </br>
    We're thrilled to welcome you to the Inews Reader Community. Our mission is to give you only the news your eyes want and to filter out the other noise
    <h4> Here's a glimpse of what you can expect: </h4>
    <ul>
    <li>Personalized News discovery</li>
     <li>AI Powered Recommendation System</li>
      <li>Diverse News sources (filter the ones you dont want)</li>
    </ul>
    <a href="testertester-production.up.railway.app">Inews Reader</a>
   `
    });

    console.log(`Signup Email sent to ${email}`)

    res.json({
      message: "User created",
      token,
      user: { name: user.name, email: user.email },
    });
  } catch (err) {
    res.status(500).json({ message: "An internal server error occur during sign up" });
  }
});
app.get("/api/users/status", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId; // from authMiddleware
    const user = await User.findById(userId).select('hasCompletedOnboarding');
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    //the user need 'onboardingComplete' 
    res.json({
      onboardingComplete: user.hasCompletedOnboarding || false,
      wantsEmail: user.wantsEmail
    });
  } catch (err) {
    console.error("Error checking user status:", err.message);
    res.status(500).json({ message: "Server error during status check" });
  }
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.status(400).json({ message: "User not found" });

  const validPassword = await bcrypt.compare(password, user.password);
  if (!validPassword)
    return res.status(400).json({ message: "Wrong password" });

  console.log(
    `🔐 User logged in: ${user.name
    } (${email}) at ${new Date().toLocaleString()}`
  );

  const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
  res.json({
    message: "Login successful",
    token,
    user: { name: user.name, email: user.email },
  });
});

app.get("/api/users", async (req, res) => {
  const users = await User.find({}, { name: 1, email: 1, createdAt: 1 });
  res.json(users);
});
//User's interation routes

//Track user's search term
app.post("/api/interactions/search", authMiddleware, async (req, res) => {
  //console.log("--- [DEBUG] /api/interactions/search HIT ---");
  try {
    const { value } = req.body;
    const userId = req.user.userId; // from authMiddleware
    // validate userId to avoid Mongoose CastError
    if (!value) {
      return res.status(400).json({ message: 'Search term is required' });
    }
    const interaction = new Interaction({ userId: userId, type: "search", value: value });
    await interaction.save();
    res.status(201).json({ message: "Search term saved to DB" });
  } catch (err) {
    // res.statusCode = 500;
    // res.write(JSON.stringify(err.message));
    res.status(500).json({ message: err.message });
  }
});
//FORGOT PASSWORD route
app.post("/api/forgot-password", async (req, res) => {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email });
    //if no user, still send the success response
    //this is to prevent email enumeration
    if (!user) {
      console.log(`[Forgot-PW] Request for non-existent email: ${email}`);
      return res.status(200).json({ message: "Reset link sent." });
    }
    //generate a secure token
    const resetToken = crypto.randomBytes(32).toString("hex");
    //hash it and save it to the user
    user.passwordResetToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    //expire in 1 hour
    user.passwordResetExpires = Date.now() + 3600000; //in ms

    await user.save();

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password.html?token=${resetToken}`;

    await resend.emails.send({
      from: 'inewsreader@mylinkly.work', // Your "from" address
      to: user.email,
      subject: 'Your Password Reset Link (iNews Reader)',
      html: `
        <p>You requested a password reset for your iNews Reader account.</p>
        <p>Please click this link to set a new password. The link will expire in 1 hour:</p>
        <a href="${resetUrl}" target="_blank">Reset Your Password</a>
        <p>If you did not request this, please ignore this email.</p>
      `
    });

    console.log(`[Forgot PW] Reset email sent to : ${user.email}`);
    res.status(200).json({ message: "Reset link sent." });

  } catch (err) {
    console.error("Error in /api/forgot-password:", err);
    //for security purposes
    res.status(200).json({ message: "Reset link sent." });
  }
});
//Verify token and set new password
app.post("/api/reset-password", express.json(), async (req, res) => {
  const { token, password } = req.body;

  try {
    //hash the token from the URL to match the storage in DB
    //store the sha256, not the raw one
    const hashedToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    //find use with the same token and check if token is not expired
    //expiry time must be greater than current time (in the future)
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    });
    if (!user) {
      return res.status(400).json({ message: "Token is not valid or has expired" });
    }

    //hash the new password
    const salt = await bcrypt.genSalt(10); //ensure unique hash for identical password
    user.password = await bcrypt.hash(password, salt);

    //clear the reset fields (single used token)
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;

    //save the user
    await user.save();

    console.log(`[RESET PW] Password succesfully reset for : ${user.email}`);
    res.status(200).json({ message: "Password reset successful." });
  } catch (err) {
    console.error("Error in /api/reset-password:", err);
    res.status(500).json({ message: "Server error" });
  }
});
//Track user's clicks
app.post("/api/interactions/click", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { articleTitle, url, description, thumbnail, source, publicationDate } = req.body;

    if (!articleTitle || !url) {
      return res.status(400).json({ message: "Missing article title or url" });
    }

    const updatedArticle = await Article.findOneAndUpdate(
      { url: url },
      {
        $inc: { viewCount: 1 },
        $setOnInsert: {
          title: articleTitle,
          url: url,
          description: description || "",
          thumbnail: thumbnail || "",
          source: source || "",
          publicationDate: publicationDate ? new Date(publicationDate) : null
        }
      },
      { upsert: true, new: true }
    );


    if (!updatedArticle.embedding || updatedArticle.embedding.length === 0) {
      console.log("Generating embedding for:", updatedArticle.title);

      const vector = await generateEmbedding(updatedArticle.title);

      if (vector) {
        updatedArticle.embedding = vector;
        await updatedArticle.save();
        console.log("Saved embedding for:", updatedArticle.title);
      } else {
        console.log("X Failed to generate embedding for:", updatedArticle.title);
      }
    }
    console.log(
      `Article view count updated: ${updatedArticle.title} (${updatedArticle.viewCount} views)`
    );
    const interaction = new Interaction({
      userId,
      type: "click",
      title: articleTitle,
      value: url
    });

    await interaction.save();
    //send the response with the new view count back to front end
    res.status(201).json({
      message: "Clicked article recorded",
      newViewCount: updatedArticle.viewCount
    });

  } catch (err) {
    console.error("Error recording click:", err);
    res.status(500).json({ message: err.message });
  }
});
app.post("/api/articles/viewcounts", async (req, res) => {
  try {
    const { urls } = req.body; // expecting array of urls
    if (!Array.isArray(urls)) {
      return res.status(400).json({ message: "Request body must be an array of urls" });
    }
    const articles = await Article.find({ url: { $in: urls } }).select('url viewCount');
    const viewcountMap = articles.reduce((map, article) => {
      map[article.url] = article.viewCount;
      return map;
    }, {});
    res.json(viewcountMap); //send back a map of url back to the frontend

  } catch (err) {
    console.error("Error fetching view counts:", err.message);
    res.status(500).json({ message: "Error fetching view counts" });
  }
});
app.post("/api/articles/view", async (req, res) => {
  try {
    const { articleTitle, url } = req.body;
    if (!articleTitle || !url) {
      return res.status(400).json({ message: 'Missing article title or url.' });
    }
    const updatedOperations = {
      $inc: { viewCount: 1 },
      $setOnInsert: { title: articleTitle, url: url }
    };
    const options = {
      upsert: true, new: true
    };
    const updatedArticle = await Article.findOneAndUpdate(
      { url: url },
      updatedOperations,
      options
    );
    console.log(`Anonymous article view updated: ${updatedArticle.title} (${updatedArticle.viewCount} views)`);

    res.status(201).json({
      message: "Public view count recorded",
      newViewCount: updatedArticle.viewCount
    });
  } catch (err) {
    console.error("Error recording public view:", err.message);
    res.status(500).json({ message: err.message });
  }
});
app.get("/api/users/history", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId; // from authMiddleware

    //find interactions matching the schema
    const history = await Interaction.find({ userId: userId, type: "click" })
      .sort({ timeStamp: -1 }) //most recent first  
      .limit(10) //limit to 10 most recent
      .select('title value timeStamp');

    //formated datas to send back to frontend
    const formattedHistory = history.map(item => ({
      title: item.title,
      url: item.value,
      time: new Date(item.timeStamp).toLocaleString('en-US')
    }));

    res.status(200).json(formattedHistory);
  } catch (err) {
    console.error("Error fetching history:", err.message);
    res.status(500).json({ message: "Error fetching history" });
  }
});
//Save bookmarked articles
app.post("/api/interactions/bookmark", authMiddleware, async (req, res) => {
  const userId = req.user.userId; // from authMiddleware
  //const { userId, value } = req.body;
  //if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
  //  return res.status(400).json({ message: 'Invalid or missing userId' });
  //
  try {
    const { value, title, description, source } = req.body;
    if (!value) {
      return res.status(400).json({ message: "Article URL (value) is required" });
    }
    const existing = await Interaction.findOne({ userId, type: "bookmark", value });
    if (existing) {
      return res.status(200).json({ message: "Already bookmarked" });
    }
    const interaction = new Interaction({
      userId,
      type: "bookmark",
      value,  // URL
      title: req.body.title,
      description: req.body.description,
      source: req.body.source
    });
    await interaction.save();
    console.log("Saved successfully:", req.body.title);
    res.status(201).json({ message: "Bookmarked article recorded" });
  } catch (err) {
    console.error("Backend error stack:", err.stack);
    res.status(500).json({ message: err.message });
  }
});
app.get("/api/users/bookmarks", authMiddleware, async (req, res) => {
  const userId = req.user.userId; // from authMiddleware
  // const { userId } = req.params;
  // if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
  //   return res.status(400).json({ message: 'Invalid or missing userId' });
  // }
  try {
    const bookmarks = await Interaction.find({ userId, type: "bookmark" }).sort({ timeStamp: -1 });
    res.json(bookmarks);
  } catch (err) {
    console.error("Error fetching bookmarks:", err.message);
    res.status(500).json({ message: "Error fetching saved article" });
  }
});
app.delete("/api/interactions/bookmark", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { url } = req.body; //identify by urls
    if (!url) {
      return res.status(400).json({ message: "Article URL is required" });
    }
    const result = await Interaction.findOneAndDelete({
      userId: userId,
      type: "bookmark",
      value: url
    });
    if (!result) {
      return res.status(404).json({ message: "Bookmark not founs" });
    }
    console.log(`Bookmark reomoved: ${url}`);
    res.json({ message: "Bookmark removed succesfully" });
  } catch (err) {
    console.error("Error removing bookmark:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});
async function fetchFreshArticles(searchTerms) {
  // Get date from 90 days ago for a wider recommendation pool
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const nytDate = ninetyDaysAgo.replace(/-/g, '');
  // Get unique, recent search terms
  const uniqueTerms = [...new Set(searchTerms)]; // e.g., ['World', 'Sports']
  if (uniqueTerms.length === 0) return [];

  try {
    // Create fetch promises for each unique term
    const allApiPromises = [];

    uniqueTerms.forEach(term => {
      // Add NYT and Guardian fetch for each term
      allApiPromises.push(
        fetch(
          `https://api.nytimes.com/svc/search/v2/articlesearch.json?q=${term}&sort=newest&api-key=${process.env.NYTIMESKEY}&fl=web_url,headline,snippet,source,pub_date,multimedia&begin_date=${nytDate}`
        ).then(async res => {
          if (!res.ok) { return { source: 'nyt', data: null }; }
          const data = await res.json();
          return { source: 'nyt', data };
        })
      );
      allApiPromises.push(
        fetch(
          `https://content.guardianapis.com/search?&q=${term}&order-by=newest&api-key=${process.env.GUARDIANKEY}&show-fields=thumbnail,headline,trailText,webPublicationDate&from-date=${ninetyDaysAgo}`
        ).then(async res => {
          if (!res.ok) { return { source: 'guardian', data: null }; }
          const data = await res.json();
          return { source: 'guardian', data };
        })
      );
      //World news API
      allApiPromises.push(
        fetch(
          `https://api.worldnewsapi.com/search-news?text=${term}&language=en&earliest-publish-date=${thirtyDaysAgo}`,
          { headers: { 'x-api-key': process.env.WORLDNEWSKEY } }
        ).then(async res => {
          if (!res.ok) { return { source: 'world', data: null }; }
          const data = await res.json();
          return { source: 'world', data };
        })
      );
    });

    const allResults = await Promise.allSettled(allApiPromises);

    let allCandidates = [];
    let urlMap = new Set(); // To prevent duplicates

    for (let i = 0; i < allResults.length; i++) {
      const result = allResults[i];
      if (result.status === 'rejected' || !result.value) {
        console.error(`API call failed: ${result.reason.message}`);
        continue;
      }
      // if (!result.value.ok) {
      //   // Log API errors (like quota) but don't crash
      //   const errorBody = await result.value.json().catch(() => ({})); // try to get error json
      //   console.error(`API call returned status: ${result.value.status}`, errorBody.message || '');
      //   continue;
      //}

      const { source, data } = result.value;
      if (!data) continue;

      // Check if it's NYT or Guardian and parse accordingly
      //ADD more sources soon as needed!
      if (source == 'nyt' && data?.response?.docs) { // NYT
        const nyArticles = (data.response.docs || []).map(item => ({
          url: item.web_url,
          title: item.headline.main,
          description: item.snippet,
          source: item.source || "New York Times",
          thumbnail: item.multimedia.default.url || [],
          publicationDate: item.pub_date
        }));
        nyArticles.forEach(article => {
          if (article.url && !urlMap.has(article.url)) {
            allCandidates.push(article);
            urlMap.add(article.url);
          }
        });
      } else if (data?.response?.results) { // Guardian
        const guardianArticles = (data.response.results || []).map(item => ({
          url: item.webUrl,
          title: item.webTitle,
          description: item.fields.trailText,
          source: "The Guardian",
          thumbnail: item.fields.thumbnail || null,
          publicationDate: item.webPublicationDate
        }));
        guardianArticles.forEach(article => {
          if (article.url && !urlMap.has(article.url)) {
            allCandidates.push(article);
            urlMap.add(article.url);
          }
        });
      } else if (data?.news) {
        const worldArticles = (data.news || []).map(item => ({
          url: item.url,
          title: item.title,
          description: item.summary || "",
          source: "World News",
          thumbnail: item.image || null,
          publicationDate: item.publish_date
        }));
        worldArticles.forEach(article => {
          if (article.url && !urlMap.has(article.url)) {
            allCandidates.push(article);
            urlMap.add(article.url);
          }
        });
      }
    }

    console.log(`Found ${allCandidates.length} total unique candidates.`);
    return allCandidates;

  } catch (err) {
    console.error("Error fetching fresh articles:", err.message);
    return [];
  }
}

//recommendation engine end point
app.get("/api/recommendations", authMiddleware, async (req, res) => {
  console.log("--- RECOMMENDATION IS RUNNING ---");
  try {
    const userId = req.user.userId;
    const now = Date.now();
    //check cache first
    //does this user have data? is it fresh (< 15min)?
    if (userRecommendationCache[userId] && (now - userRecommendationCache[userId].timestamp < REC_CACHE_DURATION)) {
      console.log(`Serving Recommendations from Cache for user ${userId} ⚡️`);
      return res.json({ recommendations: userRecommendationCache[userId].data });
    }
    //if no cache
    //fetch user profile (to get onboarding info later)
    const user = await User.findById(userId);
    const onboardingTopics = user.topics || [];

    //get user's recent search terms
    const recentSearches = await Interaction.find({
      userId: userId,
      type: "search"
    })
      .sort({ timeStamp: -1 })
      .limit(10)
      .select('value');
    const searchTerms = recentSearches.map(s => s.value);
    //console.log(`Found ${searchTerms.length} recent searches:`, searchTerms);
    //use set to remove duplicate
    let combinedTerms = [...new Set([...searchTerms, ...onboardingTopics])];
    combinedTerms = combinedTerms.slice(0, 4);
    console.log(`Found ${combinedTerms.length} recent searches:`, combinedTerms);
    if (combinedTerms.length === 0) {
      return res.json({
        recommendations: [],
        message: "Select topics in profile or search to get recommendations!"
      });
    }
    //get all user's saved articles/bookmarks
    const readInteractions = await Interaction.find({
      userId: userId,
      $or: [{ type: "click" }, { type: "bookmark" }]
    })
      .select('title value');

    //create a set to lookup
    const readUrls = new Set(readInteractions.map(i => i.value));
    console.log(`Found ${readUrls.size} unique read/clicked URLs.`);
    // if (recentSearches.length === 0) {
    //   console.log("User has no search history. Returning empty.");
    //   //user has no search history
    //   //return empty
    //   return res.json({
    //     recommendations: [],
    //     message: "Enter your first search to activate this!"
    //   });
    // }

    //find all articles that match
    const matchedArticles = await fetchFreshArticles(combinedTerms);
    console.log(`Found ${matchedArticles.length} new candidates from external APIs.`);
    if (matchedArticles.length === 0) {
      console.log("No new articles found from external APIs.");
      return res.json({
        recommendations: [],
        message: "No new articles found for your recent searches."
      });
    }
    const articleUrls = matchedArticles.map(c => c.url);
    const articlesDB = await Article.find({ url: { $in: articleUrls } })
      .select('url viewCount');

    const viewCountMap = articlesDB.reduce((map, article) => {
      map[article.url] = article.viewCount;
      return map;
    }, {});
    console.log(`Found view counts for ${articlesDB.length} of the articles.`);
    //SCORE AND RANK
    let filteredOutCount = 0;
    const scoredArticles = matchedArticles.map(item => {
      const viewCount = viewCountMap[item.url] || 0;
      let score = 0;

      //if user had read it => score = 0
      if (readUrls.has(item.url)) {
        filteredOutCount++;
        return { ...item, finalScore: 0 };
      }
      //base score: high score for matching a search term
      score += 50;
      //popularity (viewcount)
      score += viewCount;
      score += Math.random(); //allow mutiple sources to display together

      return { ...item, viewCount, finalScore: score };
    });
    console.log(`Filtered out ${filteredOutCount} articles that were already read.`);
    //filter and return
    const finalRecommendations = scoredArticles
      .sort((a, b) => b.finalScore - a.finalScore) //sort by scores
      .filter(c => c.finalScore > 0) //remove read articles
      .slice(0, 10); //take the top 5
    console.log(`Returning ${finalRecommendations.length} final recommendations.`);

    if (finalRecommendations.length === 0) {
      return res.json({
        recommendations: [],
        message: "No new articles found for your recent searches."
      });
    }
    if (finalRecommendations.length > 0) {
      // Save to In-Memory Cache (For speed/API protection)
      userRecommendationCache[userId] = {
        data: finalRecommendations,
        timestamp: now
      };
      console.log(`Saved fresh recommendations to Memory Cache for user ${userId}`);
      //cache the result
      Recommendation.updateOne(
        { userId: userId },
        {
          $set: {
            recommendations: finalRecommendations.map(r => r.url),
            generatedAt: new Date()
          }
        },
        { upsert: true }
      ).catch(err => console.error("Error caching recommendations:", err));
    }
    console.log("Success! Returning recommendations.");
    res.json({ recommendations: finalRecommendations });
  } catch (err) {
    console.error("!!! RECOMMENDATION ERROR:", err.message);
    //fall back: if API fails, try to serve old cache
    if (userRecommendationCache[req.user.userId]) {
      return res.json({ recommendations: userRecommendationCache[req.user.userId].data });
    }
    res.status(500).json({ message: err.message });
  }
});
app.post("/api/onboarding", authMiddleware, async (req, res) => {
  const userId = req.user.userId; // from authMiddleware
  const { name, age, topics, comments } = req.body;
  //will be feed to recommendation engine later

  try {
    // Update the users profile after onboarding with preferences and other data
    const user = await User.findByIdAndUpdate(
      userId,
      {
        name,
        age: parseInt(age), //ensure age is stored as number
        topics,
        comments,
        hasCompletedOnboarding: true,
      },
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    console.log(`👽Onboarding completed for ${userId}👽`);
    res.json({ success: true, user: { name: user.name, email: user.email } });
  } catch (err) {
    console.error("Onboarding error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});




app.post('/cancel-weekly-emails', authMiddleware, async (req, res) => { // the route in this can be seen from the weekly emails


  try {


    // const authHeader = req.headers['authorization'];
    // if (!authHeader || !authHeader.startsWith('Bearer')) {
    //   return res.status(401).json({ message: 'Authorization header missing or malformed' });
    // }

    // console.log("HIY SECOND")

    // const token = authHeader.split(' ')[1];
    // const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // const user = await User.findById(decoded.userId);
    //console.log(user)
    const userId = req.user.userId;
    const user = await User.findById(userId);
    if (!user){
      return res.status(404).json({ message: "User not found" });
    }
    //let userEmailDecision = user.wantsEmail
    user.wantsEmail = !user.wantsEmail // basically an on or off toggle incase they want to activate it back 
    //let finalUserChoice = user.wantsEmail
    await user.save();
    const action = user.wantsEmail ? "enabled" : "disabled";
    return res.status(200).json({
      success: true,
      message: `Succesfully ${action} weekly emails.`,
      wantsEmail: user.wantsEmail,
      website: "https://testertester-production.up.railway.app"
    })

  }
  catch (err) {
    console.error("Eail toggle error:", err);
    return res.status(500).json({
      message: "Failed to update email settings",
      advice: "Try logging in again",
      //website: "https://testertester-production.up.railway.app/login.html",
      error: err.message
    });

  }
});


cron.schedule('0 0 * * THU', async () => {  // * * * * activates every minute for testing
  weeklyEmail();
});

// ==========================================
// BLOCKING FEATURE ROUTES (From blockingRoutes.js that was written by Sreya)
// ==========================================

// Get blocked topics and sources
app.get('/api/blocks', authMiddleware, async (req, res) => {
  try {
    // req.user.userId comes from your existing authMiddleware
    const user = await User.findById(req.user.userId);
    res.json({
      blockedTopics: user.blockedTopics || [],
      blockedSources: user.blockedSources || []
    });
  } catch (error) {
    console.error("Blocking fetch error:", error);
    res.status(500).json({ error: 'Failed to fetch blocked items' });
  }
});

// Add blocked topic
app.post('/api/blocks/topic', authMiddleware, async (req, res) => {
  try {
    const { topic } = req.body;
    if (!topic) return res.status(400).json({ error: "Topic required" });

    const user = await User.findById(req.user.userId);

    if (!user.blockedTopics.includes(topic.toLowerCase())) {
      user.blockedTopics.push(topic.toLowerCase());
      await user.save();
    }

    res.json({ success: true, blockedTopics: user.blockedTopics });
  } catch (error) {
    res.status(500).json({ error: 'Failed to block topic' });
  }
});

// Remove blocked topic
app.delete('/api/blocks/topic/:topic', authMiddleware, async (req, res) => {
  try {
    const topic = req.params.topic;
    const user = await User.findById(req.user.userId);

    user.blockedTopics = user.blockedTopics.filter(t => t !== topic.toLowerCase());
    await user.save();

    res.json({ success: true, blockedTopics: user.blockedTopics });
  } catch (error) {
    res.status(500).json({ error: 'Failed to unblock topic' });
  }
});

// Add blocked source
app.post('/api/blocks/source', authMiddleware, async (req, res) => {
  try {
    const { source } = req.body;
    if (!source) return res.status(400).json({ error: "Source required" });

    const user = await User.findById(req.user.userId);

    if (!user.blockedSources.includes(source.toLowerCase())) {
      user.blockedSources.push(source.toLowerCase());
      await user.save();
    }

    res.json({ success: true, blockedSources: user.blockedSources });
  } catch (error) {
    res.status(500).json({ error: 'Failed to block source' });
  }
});

// Remove blocked source
app.delete('/api/blocks/source/:source', authMiddleware, async (req, res) => {
  try {
    const source = req.params.source;
    const user = await User.findById(req.user.userId);

    user.blockedSources = user.blockedSources.filter(s => s !== source.toLowerCase());
    await user.save();

    res.json({ success: true, blockedSources: user.blockedSources });
  } catch (error) {
    res.status(500).json({ error: 'Failed to unblock source' });
  }
});
app.post("/api/articles/hybrid-search", authMiddleware, async (req, res) => {
  try {
    const { query, limit = 10 } = req.body;
    const userId = req.user.userId;

    const user = await User.findById(userId);
    const blockedTopics = (user.blockedTopics || []).map(t => t.toLowerCase());
    const blockedSources = (user.blockedSources || []).map(s => s.toLowerCase());

    const queryEmbedding = await generateEmbedding(query);
    if (!queryEmbedding) {
      return res.status(400).json({ message: "Embedding failed" });
    }


    const vectorResults = await Article.aggregate([
      {
        $vectorSearch: {
          index: "vector_index",
          path: "embedding",
          numCandidates: 200,
          queryVector: queryEmbedding,
          limit: 50
        }
      },
      {//preserve full doc using $$ROOT in a temporary field 'doc'
        $project: {
          vectorScore: { $meta: "vectorSearchScore" },
          doc: "$$ROOT"
        }
      },
      { //merge the score back into the main docuement
        $replaceRoot: {
          newRoot: { $mergeObjects: ["$doc", { vectorScore: "$vectorScore" }] }
        }
      },
      {//clean up
        $project: {
          embedding: 0, //exclude embedding from results
        }
      }
    ]);


    const textResults = await Article.aggregate([
      {
        $search: {
          index: "text_index",
          text: {
            query,
            path: ["title", "description", "content"], //expanded search path for better accuracy
            fuzzy: {
              maxEdits: 2,
              prefixLength: 2
            }
          }
        }
      },
      {//preserve full doc using $$ROOT in a temporary field 'doc'
        $project: {
          vectorScore: { $meta: "searchScore" },
          doc: "$$ROOT"
        }
      },
      { //merge the score back into the main docuement
        $replaceRoot: {
          newRoot: { $mergeObjects: ["$doc", { textScore: "$textScore" }] }
        }
      },
      {//clean up
        $project: {
          embedding: 0, //exclude embedding from results
        }
      }
    ]);


    const map = new Map();

    vectorResults.forEach(doc => {
      map.set(doc.url, {
        ...doc,
        vectorScore: doc.vectorScore || 0,
        textScore: 0
      });
    });

    textResults.forEach(doc => {
      if (map.has(doc.url)) {
        map.get(doc.url).textScore = doc.textScore || 0;
      } else {
        map.set(doc.url, {
          ...doc,
          vectorScore: 0,
          textScore: doc.textScore || 0
        });
      }
    });

    //this can be adjusted later
    let merged = [...map.values()].map(doc => ({
      ...doc,
      finalScore:
        doc.vectorScore * 0.65 +   // semantic relevance
        doc.textScore * 0.35 +     // keyword match
        Math.log(doc.viewCount + 1) * 0.05  // popularity bonus
    }));//should be functional ;)
    //FILTER-OUT BLOCKED TOPICS AND SOURCES
    if (blockedTopics.length > 0 || blockedSources.length > 0) {
      merged = merged.filter(doc => {
        //check source
        const sourceName = (doc.source || "").toLowerCase();
        //handle cases where source is a string or an object {id, name}
        const cleanSource = (typeof sourceName === 'string' ? sourceName : "").toLowerCase();
        if (blockedSources.some(blocked => cleanSource.includes(blocked))) {
          return false;//blocked
        }

        //check topic
        const text = (doc.title + " " + (doc.description || "")).toLowerCase();
        if (blockedTopics.some(blocked => text.includes(blocked))) {
          return false; //blocked
        }

        return true;//keep article
      });
      console.log(`Filter hybrid search. Returning ${merged.length} results.`);
    }

    merged.sort((a, b) => b.finalScore - a.finalScore);

    res.json({ results: merged.slice(0, limit) });

  } catch (error) {
    console.error("Hybrid Search Error:", error);
    res.status(500).json({ message: "Hybrid search failed" });
  }
});
//Endpoint to populate "Quick Search" bubbles
app.get("/api/user/suggestions", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);
    //get onboarding topics
    const topics = user.topics || [];
    console.log(`[DEBUG] User Topics:`, topics);
    //get recent searches
    const recentSearches = await Interaction.find({ userId: userId, type: "search" })
      .sort({ timeStamp: -1 })
      .limit(5);
    const searches = recentSearches ? recentSearches.map(h => h.value) : [];
    console.log(`[DEBUG] Recent Searches:`, searches);
    //put recent searches first, then topics
    const combined = [...new Set([...searches, ...topics])];
    console.log(`[DEBUG] Final Suggestions sent:`, combined);
    //fallback: if user is new and has no or data, give defaults
    if (combined.length === 0) {
      return res.json(["Technology", "World News", "Science", "Health", "Sports"]);
    }
    //return top 6
    res.json(combined.slice(0, 6));
  } catch (err) {
    console.error("Error fetching suggestions:", err);
    //fail with defaults
    res.json(["News", "Trending", "World", "Business", "Technology"]);
  }
});
app.get("/api/breaking-news", async (req, res) => {
  try {
    const now = Date.now();

    //check cache if have data and less than 15 minutes old, use it
    if (breakingNewsCache && (now - lastBreakingFetchTime < CACHE_DURATION)) {
      console.log("Serving Breaking News from Cache");
      return res.json(breakingNewsCache);
    }
    console.log("Fetching new Breaking News from APIS");

    //fetch from apis (only run if cache is expired
    const [nyRes, guardianRes] = await Promise.all([
      fetch(`https://api.nytimes.com/svc/search/v2/articlesearch.json?q=world&sort=newest&api-key=${process.env.NYTIMESKEY}`),
      fetch(`https://content.guardianapis.com/search?order-by=newest&show-fields=thumbnail,trailText&api-key=${process.env.GUARDIANKEY}`)
    ]);

    const nyData = await nyRes.json();
    const guardianData = await guardianRes.json();

    let breakingArticles = [];
    // Parse NYT
    if (nyData.response?.docs) {
      breakingArticles.push(...nyData.response.docs.slice(0, 4).map(item => ({
        url: item.web_url,
        title: item.headline.main,
        description: item.snippet,
        source: item.source || "New York Times",
        thumbnail: item.multimedia.default.url || [],
        publicationDate: item.pub_date
      })));
    }

    // Parse Guardian
    if (guardianData.response?.results) {
      breakingArticles.push(...guardianData.response.results.slice(0, 4).map(item => ({
        url: item.webUrl,
        title: item.webTitle,
        description: item.fields?.trailText,
        source: "The Guardian",
        thumbnail: item.fields?.thumbnail || "https://placehold.co/600x400?text=Breaking+News",
        publicationDate: item.webPublicationDate
      })));
    }
    //update cache
    breakingNewsCache = breakingArticles;
    lastBreakingFetchTime = now;

    res.json(breakingArticles);

  } catch (err) {
    console.error("Breaking news error:", err);
    //if api fail, return old cache if it exists
    if (breakingNewsCache) {
      return res.json(breakingNewsCache);
    }
    res.status(500).json({ message: "Failed to fetch breaking news" });
  }
});


app.listen(PORT, () => {
  console.log(`Connected to database`);
  console.log(`Server running on http://localhost:${process.env.PORT}`);
});






