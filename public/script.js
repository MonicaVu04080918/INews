import { API_URL } from "./config.js";
import { SaveToHistory } from "./history.js";
import { renderHistory } from "./history.js";
import { renderSavedArticles } from "./articles.js";
import { vectorSearch } from "./vectorSearch.js";
import {
  loadBlockedItems,
  blockTopic,
  blockSource,
  unblockTopic,
  unblockSource
} from './blocking.js';
// const deployedLink = "https://testertester-production.up.railway.app"
// const localLink = "http://localhost:5000";
//Global variable to track dark mode state
let isDark = false;
//expost to the window object for access in HTML
window.blockTopic = blockTopic;
window.blockSource = blockSource;
window.unblockTopic = unblockTopic;
window.unblockSource = unblockSource;

const weButton = document.getElementById("weButton")
if (weButton){
  weButton.addEventListener('click', toggleWeeklyEmail);
}
async function getBlockedList() {
  const token = localStorage.getItem("token");
  if (!token) return { topics: [], sources: [] }; //if not logged in case
  try {
    const res = await fetch(`${API_URL}/api/blocks`, {
      headers: { "Authorization": `Bearer ${token}` },
      cache: "no-store" //always get the latest
    });
    if (res.status == 401) {
      console.log("Token expired. Logging out...");
      localStorage.removeItem("token");
      localStorage.removeItem("username");
      window.location.reload();//refresh to clear the invalid state
      return { topics: [], sources: [] };
    }
    if (res.ok) {
      const data = await res.json();
      //return the list of with everything lowercase for easy comparison
      return {
        topics: (data.blockedTopics || []).map(t => t.toLowerCase()),
        sources: (data.blockedSources || []).map(s => s.toLowerCase())
      };
    }
  } catch (err) {
    console.error("Error fetching blocked list:", err);
  }
  return { topics: [], sources: [] };
}
async function getSavedUrlSet() {
  const token = localStorage.getItem("token");
  if (!token) return new Set();
  try {
    const res = await fetch(`${API_URL}/api/users/bookmarks`, {
      headers: { "Authorization": `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      return new Set(data.map(item => item.value));
    }
  } catch (err) {
    console.error("Error fetching saved articles:", err);
  }
  return new Set();
}
export async function removeSavedUrl(url) {
  const token = localStorage.getItem("token");
  if (!token) return;

  try {
    const res = await fetch(`${API_URL}/api/interactions/bookmark`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ url: url })
    });
    if (res.ok) {
      renderSavedArticles();
      location.reload(); //unfade the button right away
    } else {
      console.error("Failed to delete saved article.");
    }
  } catch (err) {
    console.error("Error deleting saved article:", err);
  }
}
async function saveSearchTerm(searchTerm) {
  const token = localStorage.getItem("token");
  // We can only save if the user is logged in.
  if (!token || !searchTerm) {
    console.log("No user or search term, skipping save.");
    return;
  }
  try {
    const res = await fetch(`${API_URL}/api/interactions/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        value: searchTerm,
      }),
    });
    if (res.ok) {
      console.log("Search term saved: ", searchTerm);
    } else {
      console.error("Failed to save search term. Status: " + res.status);
    }
  } catch (error) {
    console.error("Error saving search term:", error);
  }
}
//check if a specific article is blocked
function isBlocked(article, blockedList) {
  if (!article) return false;
  //check source
  const source = (article.source || "").toLowerCase();
  if (blockedList.sources.some(blocked => source.includes(blocked))) {
    return true;
  }
  //check topic (scanning through title and description)
  const text = (article.title + " " + (article.description || "")).toLowerCase();
  if (blockedList.topics.some(blocked => text.includes(blocked))) {
    return true;
  }
  return false;
}

async function fetchViewCount(urls) {
  try {
    //send only unique urls to backend
    const uniqueUrls = Array.from(new Set(urls)); //get unique urls
    const response = await fetch(`${API_URL}/api/articles/viewCounts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ urls: uniqueUrls }),
    });
    if (!response.ok) {
      throw new Error("Failed to fetch view counts");
      return {}; //return empty map on failure
    }
    return await response.json(); //expecting { url1: count1, url2: count2, ...}
  } catch (error) {
    console.error("Error fetching view counts:", error);
    return {};
  }
}


document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const userQuery = params.get('query');
  const token = localStorage.getItem("token");
  //LOGIN/LOGOUT BUTTON HANDLING
  const loginBtn = document.getElementById("loginNavButton");
  const logoutBtn = document.getElementById("logoutButton");
  const userGreeting = document.getElementById("userGreeting");
  const userDropdown = document.getElementById("userDropdown");
  const username = localStorage.getItem("username");
  if (token && username) {
    // User is logged in, show logout button and greeting
    console.log("Logged in as:", username);
    if (userGreeting) {
      //set personalized greeting
      userGreeting.textContent = `Hello, ${username}!`;
      //userGreeting.classList.remove("hidden");
    }
    if (loginBtn) loginBtn.classList.add("hidden");

    // Show the Dropdown Icon
    if (userDropdown) userDropdown.classList.remove("hidden");

    // Attach Logout Listener
    if (logoutBtn) {
      logoutBtn.addEventListener("click", () => {
        localStorage.removeItem("token");
        localStorage.removeItem("username");
        alert("You have been logged out.");
        window.location.href = "index.html";
      });
    }
  } else {
    if (userDropdown) userDropdown.classList.add("hidden"); // Hide the icon
    if (loginBtn) loginBtn.classList.remove("hidden"); // Show login link
  }
  renderHistory();        // show recently viewed articles
  renderSavedArticles();  // show saved/bookmarked articles
  if (userQuery && token) {
    (async () => {
      try {
        const [hybridResults, blockedList] = await Promise.all([vectorSearch(userQuery, 10), getBlockedList()]);
        // --- DEBUG START ---
        console.group("🔍 Smart Search Debugging");
        console.log("1. Raw Results from DB:", hybridResults.length);
        console.log("2. Active Block List:", blockedList);
        // --- DEBUG END ---
        //console.log("Hybrid search results:", hybridResults);
        const safeResults = (hybridResults || []).filter(item => {
          return !isBlocked({
            title: item.title,
            description: item.description,
            source: item.source
          }, blockedList);
        });
        if (safeResults.length > 0) {
          renderHybridResults(safeResults);
        }
      } catch (err) {
        console.error("Hybrid search error: ", err);
      }
    })();
  } else if (userQuery && !token) {
    console.log("Guest user: Skipping Hybrid Search.");
    let container = document.getElementById("hybridSection");
    if (container) {
      container.innerHTML = `
        <div style="background-color: #f0f8ff; border: 1px dashed #6BBBFF; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
            <h3 style="color: #333; margin-top: 0;">📂 From Our Archives</h3>
            <p style="color: #555; margin: 10px 0;">
                We found additional matches in our database using <b>Smart Search</b> (based on meaning, not just keywords).
            </p>
            <a href="login.html" style="display: inline-block; background-color: #333; color: white; padding: 10px 20px; border-radius: 5px; text-decoration: none; font-weight: bold;">
                Log In to Unlock
            </a>
        </div>
      `;
    }
  }
  loadBreakingNews();
  if (userQuery) {
    searchApis(userQuery);
  }
  fetchRecommendations();

  const modal = document.getElementById("blockingModal");
  const openBtn = document.getElementById("openBlockingModalBtn");
  const closeBtn = document.querySelector(".close-modal");

  if (openBtn && modal) {
    // Open Modal & Load List
    openBtn.onclick = async function () {
      modal.style.display = "block";
      const token = localStorage.getItem('token');
      const form = document.getElementById("blockingForm");
      const msg = document.getElementById("blockingLoginMsg");

      if (!token) {
        // Force hide form, show message
        if (form) form.style.display = "none";
        if (msg) {
          msg.style.display = "block";
          msg.innerHTML = `<p style="text-align:center; padding:20px;">Please <a href="login.html">log in</a> to manage blocks.</p>`;
        }
      } else {
        // Force show form, hide message
        if (form) form.style.display = "block";
        if (msg) msg.style.display = "none";

        // NOW load the data
        console.log("2. Calling loadBlockedItems..."); // <--- DEBUG LOG
        try {
          await loadBlockedItems();
          console.log("3. loadBlockedItems finished"); // <--- DEBUG LOG
        } catch (e) {
          console.error("Error loading items:", e);
        }
        populateSourceDropdown();
      }
    };

    // Close & Reload
    const closeAndReload = () => {
      modal.style.display = "none";
      if (localStorage.getItem('token')) {
        location.reload(); // Reload page to apply blocking filters
      } else {
        //not logged in 
        modal.style.display = "none";
      }
    };

    if (closeBtn) closeBtn.onclick = closeAndReload;

    // Close on outside click
    window.onclick = function (event) {
      if (event.target == modal) {
        closeAndReload();
      }
    };
  }

  document.addEventListener("visibilitychange", () => {
    // Check if the tab is now visible
    if (document.visibilityState === "visible") {
      console.log("Tab is visible. Refreshing history.");

      // Refresh the history list. By this time, the save
      // will have completed in the background.
      renderHistory();
      renderSavedArticles(); // Good to refresh this too
    }
  });
  const changingDisplay = document.getElementById("changeDisplayButton")
  changingDisplay.addEventListener("click", changeDisplay)
  if (localStorage.getItem("theme") === "dark") {
    // Since isDark defaults to false, calling this will flip it to True (Dark)
    changeDisplay();
  }

})
async function loadBreakingNews() {
  const container = document.getElementById("breakingSection");
  const wrapper = document.getElementById("breakingSectionContainer");
  if (!container) return;

  try {
    const [res, savedSet] = await Promise.all([
      fetch(`${API_URL}/api/breaking-news`),
      getSavedUrlSet()
    ]);
    if (!res.ok) throw new Error("Failed to load breaking news");

    const articles = await res.json();

    if (articles.length === 0) return;
    const allUrls = articles.map(item => item.url);
    const viewCountsMap = await fetchViewCount(allUrls);
    //show the container(hidden by default)
    if (wrapper) wrapper.style.display = "block";

    container.innerHTML = "";
    articles.forEach(item => {
      const viewCount = viewCountsMap[item.url] || 0; // Get count or 0
      const newsWidget = document.createElement("div");
      newsWidget.setAttribute("class", "news-widget");

      const articleLink = document.createElement("a");
      articleLink.setAttribute("href", item.url);
      articleLink.setAttribute("target", "_blank");

      const thumbnail = document.createElement("img")
      thumbnail.setAttribute("src", item.thumbnail)
      thumbnail.onerror = () => { thumbnail.src = "https://placehold.co/600x400/eee/ccc?text=Image+Missing" };

      const headline = document.createElement("h3");
      headline.textContent = "HEADLINE: " + item.title;

      const description = document.createElement("h4");
      description.textContent = item.description || "";

      const source = document.createElement("h5");
      source.textContent = "Source: " + item.source;

      const date = document.createElement("h5");
      date.textContent = item.publicationDate
        ? "Date: " + new Date(item.publicationDate).toLocaleDateString()
        : "";

      const viewCountDisplay = document.createElement("h5");
      viewCountDisplay.classList.add("view-count");
      viewCountDisplay.textContent = `Views: ${viewCount}`;

      const saveButton = document.createElement("button");
      saveButton.classList.add("save-button");

      // --- CHECK IF SAVED ---
      if (savedSet.has(item.url)) {
        saveButton.textContent = "Saved!";
        saveButton.disabled = true;
        saveButton.style.opacity = "0.6";
        saveButton.style.cursor = "default";
      } else {
        saveButton.textContent = "Saved";
      }

      // --- APPEND ELEMENTS ---
      articleLink.appendChild(thumbnail);
      articleLink.appendChild(headline);
      articleLink.appendChild(description);
      articleLink.appendChild(source);
      articleLink.appendChild(date);
      articleLink.appendChild(viewCountDisplay);

      newsWidget.appendChild(articleLink);
      newsWidget.appendChild(saveButton);

      container.appendChild(newsWidget);

      // --- CLICK TRACKING ---
      articleLink.addEventListener("click", () => {
        if (typeof SaveToHistory === 'function') {
          SaveToHistory({
            title: item.title, url: item.url, time: new Date().toLocaleString()
          }, viewCountDisplay);
        }
        if (typeof renderHistory === 'function') renderHistory();
      });

      // --- SAVE BUTTON LOGIC ---
      saveButton.addEventListener("click", async (e) => {
        try {
          const token = localStorage.getItem("token");
          if (!token) return alert("Login required");

          const res = await fetch(`${API_URL}/api/interactions/bookmark`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
              value: item.url,
              title: item.title,
              source: item.source,
              description: item.description
            }),
          });

          if (res.ok) {
            saveButton.textContent = "Saved!";
            saveButton.disabled = true;
            saveButton.style.opacity = "0.6";
            if (typeof renderSavedArticles === 'function') {
              renderSavedArticles();
            }
          }
        } catch (err) {
          console.error("Error saving article:", err);
        }
      });
    });

  } catch (err) {
    console.error("Breaking News Error:", err);
    if (wrapper) wrapper.style.display = "none";
  }
}
async function searchApis() {

  document.getElementById("discoveredSection").innerHTML = "";
  document.getElementById("recommendedSection").innerHTML = "";
  document.getElementById("videoSection").innerHTML = "";


  try {
    console.log("We got here");
    //const userQuery = localStorage.getItem("searchTerm")
    //console.log(userQuery)
    const params = new URLSearchParams(window.location.search);
    const userQuery = params.get('query');
    console.log("User query is " + userQuery)
    if (!userQuery) {
      console.log("No search term found.");
      return;
    }
    // Save search term to backend
    await saveSearchTerm(userQuery);

    //fetch the blocked list
    const blockedList = await getBlockedList();

    // replace deployed link with local link
    const res = await fetch(`${API_URL}/article?searchTerm=${userQuery}`);
    if (!res.ok) {
      const errorData = await res.json(); // Get the { "message": "..." } object
      throw new Error(errorData.message || `Server Error: ${res.status}`);
    }
    const data = await res.json();
    // const guardianArticles = data[0] || [];
    // const nyArticles = data[1] ||[];
    // const worldArticles = data[2] || [];
    // const videoArticles = data[3] || [];
    // when the database gets bigger or if we had more time we could move from the hybrid search to just vector search
    // const hybridResults = await vectorSearch(userQuery, 10);
    // console.log("Hybrid vector results:", hybridResults);
    // if (hybridResults && hybridResults.length > 0) {
    //   renderHybridResults(hybridResults);
    // }
    //FILETERING LOGIC FOR BLOCKED LIST
    console.log("--- STARTING FILTER PROCESS ---");
    console.log("Current Block List:", blockedList);
    // 1. Filter Guardian Data
    const rawGuardian = data[0] || [];
    const guardianArticles = rawGuardian.filter(item => {
      const isItemBlocked = isBlocked({
        title: item.webTitle,
        description: item.fields?.trailText,
        source: "The Guardian" // Manually set source name
      }, blockedList);
      if (isItemBlocked) {
        console.log(`🚫 BLOCKED Guardian Article: "${item.webTitle}"`);
      }
      return !isItemBlocked;
    });

    // 2. Filter NYT Data
    const rawNYT = data[1] || [];
    const nyArticles = rawNYT.filter(item => {
      const isItemBlocked = isBlocked({
        title: item.headline?.main,
        description: item.snippet,
        source: item.source || "New York Times"
      }, blockedList);
      if (isItemBlocked) {
        console.log(`🚫 BLOCKED NYT: "${item.headline?.main}"`);
      }
      return !isItemBlocked;
    });

    // 3. Filter World News Data
    const rawWorld = data[2] || [];
    const worldArticles = rawWorld.filter(item => {
      const isItemBlocked = isBlocked({
        title: item.title,
        description: item.summary,
        source: item.source || "World News"
      }, blockedList);
      if (isItemBlocked) {
        console.log(`🚫 BLOCKED World News: "${item.title}"`);
      }
      return !isItemBlocked
    });

    // 4. Filter YouTube Data
    const rawVideo = data[3] || [];
    const videoArticles = rawVideo.filter(item => {
      const isItemBlocked = isBlocked({
        title: item.snippet?.title,
        description: item.snippet?.description,
        source: item.snippet?.channelTitle // Channel name is the source
      }, blockedList);
      if (isItemBlocked) {
        console.log(`🚫 BLOCKED Video: "${item.snippet?.title}"`);
      }
      return !isItemBlocked;
    });
    //in case the blocked filter all article sources or topics
    if (guardianArticles.length + nyArticles.length + worldArticles.length === 0) {
      document.getElementById("discoveredSection").innerHTML = `
        <div style="text-align:center; padding: 20px;">
            <h3>No results found</h3>
            <p>We found articles, but your <b>Block List</b> filtered them all out.</p>
            <p>Try unblocking some topics in Settings.</p>
        </div>
    `;
      return; // Stop execution
    }
    const allUrls = [];
    guardianArticles.forEach(item => allUrls.push(item.webUrl));
    nyArticles.forEach(item => allUrls.push(item.web_url));
    worldArticles.forEach(item => allUrls.push(item.url));
    //fetch view counts
    const [viewCountsMap, savedSet] = await Promise.all([
      fetchViewCount(allUrls),
      getSavedUrlSet()
    ]);
    console.log("View counts map: ", viewCountsMap);
    populatedDisoveryDom(
      nyArticles,
      guardianArticles,
      worldArticles,
      videoArticles,
      viewCountsMap,
      savedSet
    );
    //populatedDisoveryDom(nyArticles, guardianArticles, worldArticles, videoArticles, viewCountsMap);

  } catch (err) {
    console.error("Error fetching articles:", err.message);
    document.getElementById("discoveredSection").innerHTML = `<p class="error" style="color: red; text-align: center;">Error: ${err.message}</p>`;
  }
}
async function renderHybridResults(results) {
  const container = document.getElementById("hybridSection");
  container.innerHTML = ""; // Clear previous results
  if (!results || results.length === 0) {
    container.innerHTML = "<p>No hybrid search results found.</p>";
    return;
  }
  let savedSet = new Set();
  try {
    if (typeof getSavedUrlSet === 'function') {
      savedSet = await getSavedUrlSet();
    }
  } catch (e) {
    console.log("Could not fetch saved set");
  }
  results.forEach(item => {
    console.log("Debug Date:", item.publicationDate);
    const newsWidget = document.createElement("div");
    newsWidget.className = "news-widget";

    const articleLink = document.createElement("a");
    articleLink.href = item.url;
    articleLink.target = "_blank";
    // basic styling to ensure the link block looks good
    articleLink.style.textDecoration = "none";
    articleLink.style.color = "inherit";


    const thumbnail = document.createElement("img");
    thumbnail.src = item.thumbnail || "https://placehold.co/600x400/eee/ccc?text=No+Image";
    thumbnail.onerror = () => {
      thumbnail.src = "https://placehold.co/600x400/eee/ccc?text=No+Image";
    };

    const headline = document.createElement("h3");
    headline.textContent = "Headline: " + (item.title || "No Title");
    const description = document.createElement("h4");
    description.textContent = "Description: " + (item.description || "No description available.");
    const source = document.createElement("h5");
    let sourceText = "Unknown Source";
    if (item.source) {
      if (typeof item.source === 'string') sourceText = item.source;
      else if (item.source.name) sourceText = item.source.name;
    } else if (item.sourceName) {
      sourceText = item.sourceName;
    }
    source.textContent = "News Source: " + sourceText;
    const viewCountDisplay = document.createElement("h5");
    viewCountDisplay.textContent = `Views: ${item.viewCount || 0}`;
    viewCountDisplay.classList.add("view-count");
    const score = document.createElement("h5");
    score.textContent = "Match Score: " + (item.finalScore ?? 0).toFixed(3);
    const saveButton = document.createElement("button");
    saveButton.classList.add("save-button");
    if (savedSet.has(articleLink.href)) {
      saveButton.textContent = "Saved!";
      saveButton.disabled = true;
      saveButton.style.opacity = "0.6";
      saveButton.style.cursor = "default";
    } else {
      saveButton.textContent = "Saved";
    }


    container.appendChild(newsWidget);
    newsWidget.appendChild(articleLink);
    articleLink.appendChild(thumbnail);
    articleLink.appendChild(headline);
    articleLink.appendChild(description);
    articleLink.appendChild(source);
    //articleLink.appendChild(dateEl);
    articleLink.appendChild(score);
    articleLink.appendChild(viewCountDisplay);
    newsWidget.appendChild(saveButton);

    // --- Listeners ---
    articleLink.addEventListener("click", () => {
      if (typeof SaveToHistory === "function") {
        SaveToHistory({
          title: headline.textContent.replace("Headline: ", ""),
          url: articleLink.href,
          time: new Date().toLocaleString()
        }, viewCountDisplay);
      }
      if (typeof renderHistory === "function") renderHistory();
      navigator.clipboard.writeText(articleLink.href);
      alert("Link Copied ... redirecting");
    });

    saveButton.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const token = localStorage.getItem("token");
      if (!token) { alert("Please log in to save."); return; }

      try {
        const res = await fetch(`${API_URL}/api/interactions/bookmark`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
          body: JSON.stringify({
            value: articleLink.href,
            title: headline.textContent.replace("Headline: ", ""),
            source: sourceText,
            description: description.textContent.replace("Description: ", "")
          }),
        });
        if (res.ok) {
          saveButton.textContent = "Saved!";
          saveButton.disabled = true;
          if (typeof renderSavedArticles === 'function') renderSavedArticles();
        }
      } catch (err) { console.error(err); }
    });
  });
}
async function fetchRecommendations() {
  const container = document.getElementById("recommendedSection");
  const token = localStorage.getItem("token");
  if (!container) return;
  if (!token) {
    container.innerHTML = `<p style="text-align: center; color: #4b5563; padding: 10px;">
      To see personalized recommendations, please 
      <a href="login.html" style="color: #6BBBFF; font-weight: bold; text-decoration: underline;">
        log in or sign up
      </a>.
    </p>`;
    return;
  }
  try {
    const [res, blockedList, savedSet] = await Promise.all([fetch(`${API_URL}/api/recommendations`, {
      headers: {
        "Authorization": `Bearer ${token}`
      }
    }),
    getBlockedList(),
    getSavedUrlSet()
    ]);
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.message || `Server Error: ${res.status}`);
    }
    const data = await res.json();
    const rawRecommendations = data.recommendations || [];
    // --- DEBUG START ---
    console.group("🌟 Recommendation Debugging");
    console.log("1. Raw Recommendations:", rawRecommendations.length);
    console.log("2. Active Block List:", blockedList);
    // --- DEBUG END ---
    //const recommendedArticles = data.recommendations || [];
    // if (!recommendedArticles || recommendedArticles == 0) {
    //   container.innerHTML = `<p style="text-align: center;">No recommendations found. Try searching or reading more articles!</p>`;
    //   return;
    // }
    //This ensures cached/old recommendations don't show blocked content
    const safeRecommendations = rawRecommendations.filter(item => {
      return !isBlocked({
        title: item.title,
        description: item.description,
        source: item.source
      }, blockedList);
    });
    //render or show empty space
    if (safeRecommendations.length === 0) {
      container.innerHTML = `<p style="text-align: center;">No recommendations found (some may have been blocked). Try searching or reading more articles!</p>`;
      return;
    }
    populateRecommendationDom(safeRecommendations, savedSet);
  } catch (err) {
    console.error("Error fetching recommendations", err.message);
    container.innerHTML = `<p class="error" style="color: red; text-align: center;">Error fetching recommendations: ${err.message}</p>`;
  }

}
async function populatedDisoveryDom(nyArticles, guardianArticles, worldArticles, videoArticles, viewCountsMap, savedSet = new Set()) {

  try {


    nyArticles.forEach(item => {
      const viewCount = viewCountsMap[item.web_url] || 0;
      const newsWidget = document.createElement("div");
      newsWidget.setAttribute("class", "news-widget")

      const articleLink = document.createElement("a")
      articleLink.setAttribute("href", item.web_url)
      articleLink.setAttribute("target", "_blank")

      const thumbnail = document.createElement("img")
      thumbnail.setAttribute("src", item.multimedia.default.url)

      const Headline = document.createElement("h3");
      Headline.textContent = "Headline: " + item.headline.main

      const description = document.createElement("h4");
      description.textContent = "Description: " + item.snippet;

      const NewsSource = document.createElement("h5")
      NewsSource.textContent = "News Source: " + item.source

      const timeDate = document.createElement("h5")
      timeDate.textContent = "Date: " + item.pub_date

      const viewCountDisplay = document.createElement("h5");
      viewCountDisplay.textContent = `Views: ${viewCount}`;
      viewCountDisplay.classList.add("view-count");

      const saveButton = document.createElement("button");
      saveButton.textContent = "Saved";
      saveButton.classList.add("save-button");

      // --- CHECK IF SAVED (NYT uses web_url) ---
      if (savedSet.has(item.web_url)) {
        saveButton.textContent = "Saved!";
        saveButton.disabled = true;
        saveButton.style.opacity = "0.6";
        saveButton.style.cursor = "default";
      } else {
        saveButton.textContent = "Saved";
      }


      document.getElementById("discoveredSection").appendChild(newsWidget)
      newsWidget.appendChild(articleLink)
      articleLink.appendChild(thumbnail)


      articleLink.appendChild(Headline);
      articleLink.appendChild(description)
      articleLink.appendChild(NewsSource)
      articleLink.appendChild(timeDate)
      articleLink.appendChild(viewCountDisplay);
      newsWidget.appendChild(saveButton);

      const newsData = {
        url: item.web_url,
        title: item.headline.main,
        source: item.source,
        description: item.snippet,
      };


      articleLink.addEventListener("click", () => {
        SaveToHistory({
          title: newsData.title,
          url: newsData.url,
          time: new Date().toLocaleString()
        },
          viewCountDisplay
        );
        renderHistory();
        console.log("I WAS CLICKED ")


        const copyText = item.web_url
        navigator.clipboard.writeText(copyText);
        alert("Link Copied ... redirecting");

      });



      saveButton.addEventListener("click", async (e) => {
        try {

          /*const userId = localStorage.getItem("userId");
          if (!userId) {
            alert("Please log in to save articles.");
            return;
          }*/
          const token = localStorage.getItem("token");
          if (!token) {
            console.log("Token missing.");
            return;
          }

          // Save to backend
          const res = await fetch(`${API_URL}/api/interactions/bookmark`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
              //userId,
              value: newsData.url,
              title: newsData.title,
              source: newsData.source,
              description: newsData.description
            }),
          });

          const data = await res.json();
          if (res.ok) {
            // Save to localStorage
            // const savedArticles = JSON.parse(localStorage.getItem("savedArticles") || "[]");
            // const articleToSave = {
            //   id: Date.now(), // unique ID
            //   url: newsData.url,
            //   title: newsData.title,
            //   source: newsData.source,
            //   description: newsData.description,
            //   savedAt: new Date().toISOString()
            // };

            // Check if article is already saved
            // if (!savedArticles.some(article => article.url === newsData.url)) {
            //   savedArticles.push(articleToSave);
            //   localStorage.setItem("savedArticles", JSON.stringify(savedArticles));
            // }

            saveButton.textContent = "Saved!";
            saveButton.disabled = true;

            // Update the saved articles display if it exists
            if (typeof renderSavedArticles === 'function') {
              renderSavedArticles();
            }
          } else {
            console.log("Error saving article: " + data.message);
          }
        } catch (err) {
          console.error("Error saving article:", err);
          //console.error("Failed to save article. Please try again.");
        }
      });


    });



    guardianArticles.forEach(item => {
      const viewCount = viewCountsMap[item.web_url] || 0;
      const newsWidget = document.createElement("div");
      newsWidget.setAttribute("class", "news-widget")

      const articleLink = document.createElement("a")
      articleLink.setAttribute("href", item.webUrl)
      articleLink.setAttribute("target", "_blank")


      const thumbnail = document.createElement("img")
      thumbnail.setAttribute("src", item.fields.thumbnail)

      const Headline = document.createElement("h3");
      Headline.textContent = "Headline: " + item.webTitle

      const description = document.createElement("h4");
      description.textContent = "Description: " + item.fields.trailText

      const NewsSource = document.createElement("h5")
      NewsSource.textContent = "News Source: " + "The Guardian"

      const timeDate = document.createElement("h5")
      timeDate.textContent = "Date: " + item.webPublicationDate

      const viewCountDisplay = document.createElement("h5");
      viewCountDisplay.textContent = `Views: ${viewCount}`;
      viewCountDisplay.classList.add("view-count");

      const saveButton = document.createElement("button");
      saveButton.textContent = "Saved";
      saveButton.classList.add("save-button");

      // --- CHECK IF SAVED (NYT uses web_url) ---
      if (savedSet.has(item.webUrl)) {
        saveButton.textContent = "Saved!";
        saveButton.disabled = true;
        saveButton.style.opacity = "0.6";
        saveButton.style.cursor = "default";
      } else {
        saveButton.textContent = "Saved";
      }

      document.getElementById("discoveredSection").appendChild(newsWidget)
      newsWidget.appendChild(articleLink)
      articleLink.appendChild(thumbnail)


      articleLink.appendChild(Headline);
      articleLink.appendChild(description)
      articleLink.appendChild(NewsSource)
      articleLink.appendChild(timeDate)
      articleLink.appendChild(viewCountDisplay);
      newsWidget.appendChild(saveButton);

      const newsData = {
        url: item.webUrl,
        title: item.webTitle,
        source: "The Guardian",
        description: item.fields.trailText,
      };


      articleLink.addEventListener("click", () => {
        SaveToHistory({
          title: newsData.title,
          url: newsData.url,
          time: new Date().toLocaleString()
        },
          viewCountDisplay
        );
        renderHistory();

        const copyText = item.webUrl
        navigator.clipboard.writeText(copyText);
        alert("Link Copied ... redirecting");
      });

      saveButton.addEventListener("click", async (e) => {
        try {

          /*const userId = localStorage.getItem("userId");
          if (!userId) {
            alert("Please log in to save articles.");
            return;
          }*/
          const token = localStorage.getItem("token");
          if (!token) {
            console.log("Token missing.");
            return;
          }

          // Save to backend
          const res = await fetch(`${API_URL}/api/interactions/bookmark`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
              //userId,
              value: newsData.url,
              title: newsData.title,
              source: newsData.source,
              description: newsData.description
            }),
          });
          /*// Save to backend
          const res = await fetch(`${deployedLink}/api/interactions/bookmark`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId,
              value: newsData.url,
              title: newsData.title,
              source: newsData.source,
              description: newsData.description
            }),
          });*/

          const data = await res.json();
          if (res.ok) {
            // Save to localStorage
            // const savedArticles = JSON.parse(localStorage.getItem("savedArticles") || "[]");
            // const articleToSave = {
            //   id: Date.now(), // unique ID
            //   url: newsData.url,
            //   title: newsData.title,
            //   source: newsData.source,
            //   description: newsData.description,
            //   savedAt: new Date().toISOString()
            // };

            // Check if article is already saved
            // if (!savedArticles.some(article => article.url === newsData.url)) {
            //   savedArticles.push(articleToSave);
            //   localStorage.setItem("savedArticles", JSON.stringify(savedArticles));
            // }

            saveButton.textContent = "Saved!";
            saveButton.disabled = true;

            // Update the saved articles display if it exists
            if (typeof renderSavedArticles === 'function') {
              renderSavedArticles();
            }
          } else {
            console.log("Error saving article: " + data.message);
          }
        } catch (err) {
          console.error("Error saving article:", err);
          //console.log("Failed to save article. Please try again.");
        }
      });

    });


    worldArticles.forEach(item => {
      const viewCount = viewCountsMap[item.web_url] || 0;
      const newsWidget = document.createElement("div");
      newsWidget.setAttribute("class", "news-widget")

      const articleLink = document.createElement("a")


      articleLink.setAttribute("href", item.url)
      articleLink.setAttribute("target", "_blank")

      const thumbnail = document.createElement("img")
      thumbnail.setAttribute("src", item.image)


      const Headline = document.createElement("h3");
      Headline.textContent = "Headline: " + item.title

      const description = document.createElement("h4");
      description.textContent = "Description: " + item.summary

      const NewsSource = document.createElement("h5")
      NewsSource.textContent = "News Source: " + "World News"

      const timeDate = document.createElement("h5")
      timeDate.textContent = "Date: " + item.publish_date

      const viewCountDisplay = document.createElement("h5");
      viewCountDisplay.textContent = `Views: ${viewCount}`;
      viewCountDisplay.classList.add("view-count");

      const saveButton = document.createElement("button");
      saveButton.textContent = "Saved";
      saveButton.classList.add("save-button");

      if (savedSet.has(item.url)) {
        saveButton.textContent = "Saved!";
        saveButton.disabled = true;
        saveButton.style.opacity = "0.6";
        saveButton.style.cursor = "default";
      } else {
        saveButton.textContent = "Saved";
      }

      document.getElementById("discoveredSection").appendChild(newsWidget)
      newsWidget.appendChild(articleLink)
      articleLink.appendChild(thumbnail)
      articleLink.appendChild(Headline);
      articleLink.appendChild(description)
      articleLink.appendChild(NewsSource)
      articleLink.appendChild(timeDate)
      articleLink.appendChild(viewCountDisplay);
      newsWidget.appendChild(saveButton);

      const newsData = {
        url: item.url,
        title: item.title,
        source: "The World News",
        description: item.summary,
      };


      articleLink.addEventListener("click", () => {
        SaveToHistory({
          title: newsData.title,
          url: newsData.url,
          time: new Date().toLocaleString()
        },
          viewCountDisplay
        );
        renderHistory();

        const copyText = item.url
        navigator.clipboard.writeText(copyText);
        alert("Link Copied ... redirecting");
      });

      saveButton.addEventListener("click", async (e) => {
        try {

          /*const userId = localStorage.getItem("userId");
          if (!userId) {
            alert("Please log in to save articles.");
            return;
          }
 
          // Save to backend
          const res = await fetch(`${deployedLink}/api/interactions/bookmark`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId,
              value: newsData.url,
              title: newsData.title,
              source: newsData.source,
              description: newsData.description
            }),
          });*/
          const token = localStorage.getItem("token");
          if (!token) {
            console.log("Token missing.");
            return;
          }

          // Save to backend
          const res = await fetch(`${API_URL}/api/interactions/bookmark`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
              //userId,
              value: newsData.url,
              title: newsData.title,
              source: newsData.source,
              description: newsData.description
            }),
          });

          const data = await res.json();
          if (res.ok) {
            // Save to localStorage
            // const savedArticles = JSON.parse(localStorage.getItem("savedArticles") || "[]");
            // const articleToSave = {
            //   id: Date.now(), // unique ID
            //   url: newsData.url,
            //   title: newsData.title,
            //   source: newsData.source,
            //   description: newsData.description,
            //   savedAt: new Date().toISOString()
            // };

            // Check if article is already saved
            // if (!savedArticles.some(article => article.url === newsData.url)) {
            //   savedArticles.push(articleToSave);
            //   localStorage.setItem("savedArticles", JSON.stringify(savedArticles));
            // }

            saveButton.textContent = "Saved!";
            saveButton.disabled = true;

            // Update the saved articles display if it exists
            if (typeof renderSavedArticles === 'function') {
              renderSavedArticles();
            }
          } else {
            console.log("Error saving article: " + data.message);
          }
        } catch (err) {
          console.error("Error saving article:", err);
          //alert("Failed to save article. Please try again.");
        }
      });


    })

    console.log("Video articles is " + JSON.stringify(videoArticles)) // debug line if videos not showing

    if (videoArticles) {
      videoArticles.forEach(item => {

        const newsWidget = document.createElement("div");
        newsWidget.setAttribute("class", "news-widget")


        const articleLink = document.createElement("a")
        articleLink.setAttribute("href", item.link)
        articleLink.setAttribute("target", "_blank")


        const frame = document.createElement("iframe")
        frame.setAttribute("src", item.embedLink)

        /* thumbnail already there
                const thumbnail = document.createElement("img")
                thumbnail.setAttribute("src", item.thumbnail)
        */

        const Headline = document.createElement("h3");
        Headline.textContent = "Headline: " + item.title

        const description = document.createElement("h4");
        description.textContent = "Description: " + item.description

        const NewsSource = document.createElement("h5")
        NewsSource.textContent = "News Source: " + item.source

        const timeDate = document.createElement("h5")
        timeDate.textContent = "Date: " + item.date

        document.getElementById("videoSection").appendChild(newsWidget)
        newsWidget.appendChild(articleLink)
        articleLink.appendChild(frame)
        articleLink.appendChild(Headline);
        articleLink.appendChild(description)
        articleLink.appendChild(NewsSource)
        articleLink.appendChild(timeDate)




      })
    }

  } catch (err) {
    console.error("Error populating DOM:", err);
  }
}
function populateRecommendationDom(recommendedArticles, savedSet = new Set()) {
  const container = document.getElementById("recommendedSection");
  container.innerHTML = "";
  try {
    recommendedArticles.forEach(item => {
      // 'item' is { url, title, description, source, viewCount, finalScore }
      const viewCount = item.viewCount || 0;
      const newsWidget = document.createElement("div");
      newsWidget.setAttribute("class", "news-widget")

      const articleLink = document.createElement("a");
      articleLink.setAttribute("href", item.url)
      articleLink.setAttribute("target", "_blank")

      let thumbnailUrl = `https://placehold.co/600x400/eee/ccc?text=${encodeURIComponent(item.source || 'Recommended')}`; // Default


      const thumbnail = document.createElement("img")
      thumbnail.setAttribute("src", item.thumbnail)
      thumbnail.onerror = () => { thumbnail.src = "https://placehold.co/600x400/eee/ccc?text=Image+Missing" };

      const Headline = document.createElement("h3");
      Headline.textContent = "Headline: " + item.title

      const description = document.createElement("h4");
      description.textContent = "Description: " + (item.description || "No description available.");

      const NewsSource = document.createElement("h5")
      NewsSource.textContent = "News Source: " + (item.source || "Unknown Source")

      const timeDate = document.createElement("h5")
      timeDate.textContent = "Date: " + new Date(item.publicationDate).toLocaleDateString();

      const viewCountDisplay = document.createElement("h5");
      viewCountDisplay.textContent = `Views: ${viewCount}`;
      viewCountDisplay.classList.add("view-count");

      const saveButton = document.createElement("button");
      saveButton.textContent = "Saved";
      saveButton.classList.add("save-button");

      if (savedSet.has(item.url)) {
        saveButton.textContent = "Saved!";
        saveButton.disabled = true;
        saveButton.style.opacity = "0.6";
        saveButton.style.cursor = "default";
      } else {
        saveButton.textContent = "Saved";
      }
      container.appendChild(newsWidget)
      newsWidget.appendChild(articleLink)
      articleLink.appendChild(thumbnail)
      articleLink.appendChild(Headline);
      articleLink.appendChild(description)
      articleLink.appendChild(NewsSource)
      articleLink.appendChild(timeDate)
      articleLink.appendChild(viewCountDisplay);
      newsWidget.appendChild(saveButton);

      const newsData = {
        url: item.url,
        title: item.title,
        source: item.source,
        description: item.description,
      };

      articleLink.addEventListener("click", () => {
        SaveToHistory({
          title: newsData.title,
          url: newsData.url,
          time: new Date().toLocaleString()
        },
          viewCountDisplay
        );
        renderHistory();
      });

      // (Save button logic is duplicated here)
      saveButton.addEventListener("click", async (e) => {
        try {
          const token = localStorage.getItem("token");
          if (!token) {
            console.log("Token missing.");
            return;
          }
          const res = await fetch(`${API_URL}/api/interactions/bookmark`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
              value: newsData.url,
              title: newsData.title,
              source: newsData.source,
              description: newsData.description
            }),
          });

          const data = await res.json();
          if (res.ok) {
            saveButton.textContent = "Saved!";
            saveButton.disabled = true;
            if (typeof renderSavedArticles === 'function') {
              renderSavedArticles();
            }
          } else {
            console.log("Error saving article: " + data.message);
            if (data.message === "Already bookmarked") {
              saveButton.textContent = "Saved";
              saveButton.disabled = true;
            }
          }
        } catch (err) {
          console.error("Error saving article:", err);
        }
      });
    });

  } catch (err) {
    console.error("Error populating Recommended DOM:", err);
    container.innerHTML = `<p class="error" style="color: red; text-align: center;">Error rendering recommendations.</p>`;
  }
}
//searchApis();
//renderHistory();
//renderSavedArticles();






function changeDisplay() {
  const logo = document.getElementById("logo");
  const backgroundTarget = document.getElementById("container") || document.body;

  // --- SELECTORS ---
  // 1. Weather Elements
  const weatherBar = document.querySelector('.weather-bar');
  const forecastContainer = document.getElementById('forecast-container');
  // Select specific text inside weather bar to handle colors carefully
  const weatherText = document.querySelectorAll('.weather-bar p, .weather-bar span, .weather-bar .temperature, .weather-bar .city, .weather-bar .condition');
  const expandBtn = document.getElementById('expand-forecast');

  // 2. Cards (News, History, Saved)
  const newsWidgets = Array.from(document.getElementsByClassName("news-widget"));
  const historyItems = Array.from(document.querySelectorAll("#history > div"));
  const savedItems = Array.from(document.querySelectorAll("#savedArticlesContainer > div"));
  const loginCards = Array.from(document.getElementsByClassName("login-card"));
  const allCards = [...newsWidgets, ...historyItems, ...savedItems, ...loginCards];

  // 3. Bubbles & General Text
  const quickSearches = document.querySelectorAll(".quickSearch");
  const allText = document.querySelectorAll("h1, h2, h3, h4, h5, p, span, a, label, li");

  if (!isDark) {
    // ============================
    // SWITCH TO DARK MODE
    // ============================
    localStorage.setItem("theme", "dark");
    const btn = document.getElementById("changeDisplayButton");
    if (btn) btn.textContent = "Light Mode";

    //  Background
    backgroundTarget.style.backgroundImage = "linear-gradient(60deg, #29323c 0%, #485563 100%)";
    if (backgroundTarget === document.body) document.body.style.minHeight = "100vh";

    //  Weather Bar -> Dark Glass
    if (weatherBar) {
      weatherBar.style.background = "linear-gradient(135deg, rgba(30, 35, 45, 0.9), rgba(50, 60, 70, 0.95))";
      weatherBar.style.borderColor = "rgba(255, 255, 255, 0.1)";
      weatherBar.style.boxShadow = "0 4px 15px rgba(0,0,0,0.5)";
    }
    if (forecastContainer) {
      forecastContainer.style.backgroundColor = "#2d3748";
      const dayTexts = forecastContainer.querySelectorAll('p');
      dayTexts.forEach(p => p.style.color = "#f0f0f0");
    }
    // Force all weather text white
    weatherText.forEach(el => el.style.color = "#f0f0f0");
    if (expandBtn) expandBtn.style.color = "#6BBBFF";

    // Global Text -> White (Excluding cards & weather)
    allText.forEach(el => {
      if (el.closest('.news-widget') ||
        el.closest('.modal-content') ||
        el.closest('#history > div') ||
        el.closest('#savedArticlesContainer > div') ||
        el.closest('.weather-bar') || // <--- Skip Weather (Handled above)
        el.classList.contains('quickSearch')) return;

      el.style.color = "#f0f0f0";
      if (el.tagName === 'A') el.style.color = "#6BBBFF";
    });

    // Bubbles -> Dark Theme
    quickSearches.forEach(bubble => {
      bubble.style.backgroundColor = "#4a5568";
      bubble.style.color = "white";
      bubble.style.borderColor = "#718096";
    });

    // Cards -> White Background
    if (logo) logo.style.color = "white";
    allCards.forEach(card => {
      card.style.backgroundColor = "#D2ECF7";
      card.style.color = "#333";
      card.style.border = "1px solid #444";
      card.style.boxShadow = "0 4px 8px rgba(0,0,0,0.3)";
    });

    isDark = true;

  } else {
    // ============================
    //  SWITCH TO LIGHT MODE
    // ============================
    localStorage.setItem("theme", "light");
    const btn = document.getElementById("changeDisplayButton");
    if (btn) btn.textContent = "Dark Mode";

    // Background
    backgroundTarget.style.backgroundImage = "linear-gradient(to top, #dfe9f3 0%, white 100%)";

    // Weather Bar -> Light Glass
    if (weatherBar) {
      weatherBar.style.background = "linear-gradient(135deg, #f6f8fb, #6fb1fc)";
      weatherBar.style.borderColor = "rgba(255, 255, 255, 0.5)";
      weatherBar.style.boxShadow = "0 4px 15px rgba(0, 0, 0, 0.1)";
    }
    if (forecastContainer) {
      forecastContainer.style.backgroundColor = "white";
      const dayTexts = forecastContainer.querySelectorAll('p');
      dayTexts.forEach(p => p.style.color = "#333");
    }
    // Restore specific weather text colors
    const temp = document.getElementById("temperature");
    const cond = document.getElementById("condition");
    const city = document.getElementById("city");
    if (temp) temp.style.color = "#333";
    if (cond) cond.style.color = "#555";
    if (city) city.style.color = "#888";

    // Global Text -> Dark
    allText.forEach(el => {
      if (el.closest('.news-widget') ||
        el.closest('.modal-content') ||
        el.closest('#history > div') ||
        el.closest('#savedArticlesContainer > div') ||
        el.closest('.weather-bar') ||
        el.classList.contains('quickSearch')) return;

      el.style.color = "#333";
      if (el.tagName === 'A') el.style.color = "#333";
    });

    // Bubbles -> Light Theme
    quickSearches.forEach(bubble => {
      bubble.style.backgroundColor = "white";
      bubble.style.color = "#555";
      bubble.style.borderColor = "#ccc";
    });

    // Cards -> White with Border
    if (logo) logo.style.color = "black";
    allCards.forEach(card => {
      card.style.backgroundColor = "#D2ECF7";
      card.style.color = "#333";
      card.style.border = "1px solid black"; // Restore border visibility
      card.style.boxShadow = "0 2px 5px rgba(0,0,0,0.1)";
    });

    isDark = false;
  }
}

function populateSourceDropdown() {
  const select = document.getElementById("sourceInput");
  if (!select) return;
  //default/major sources
  //user a set to avoid duplicates automatically
  const sources = new Set(["The Guardian", "New York Times", "World News", "YouTube"]);
  //scan the current search results for specific sources
  const widgetHeaders = document.querySelectorAll(".news-widget h5");
  widgetHeaders.forEach(header => {
    const text = header.textContent;
    if (text.includes("News Source: ")) {
      //extract just the name 
      const cleanName = text.replace("News Source:", "").trim();
      if (cleanName) sources.add(cleanName);
    }
  });

  //clean and rebuild the dropdown
  select.innerHTML = '<option value ="" disabled selected>Select a source...</option>';

  //sort them alphabetically
  Array.from(sources).sort().forEach(sourceName => {
    const option = document.createElement('option');
    option.value = sourceName;
    option.textContent = sourceName;
    select.appendChild(option);
  });
}
function updateEmailButtonText(isSubscribed) {
    if (!weButton) return;
    
    if (isSubscribed) {
        weButton.textContent = "Disable Weekly Emails";
        weButton.style.backgroundColor = "#d9534f"; // Red for disable
        weButton.style.color = "white";
    } else {
        weButton.textContent = "Enable Weekly Emails";
        weButton.style.backgroundColor = "#28a745"; // Green for enable
        weButton.style.color = "white";
    }
}
async function toggleWeeklyEmail() {
  try {
    // alert("we were clicked")
    const token = localStorage.getItem("token");
    if (!token) {
        // Change button to a Login Link
        weButton.textContent = "🔒 Login to Subscribe";
        weButton.style.backgroundColor = "#e0e0e0"; // Light grey
        weButton.style.color = "#555";
        weButton.style.cursor = "pointer";
        
        // Override the click behavior to redirect to login
        // We use cloneNode to strip the old 'toggleWeeklyEmail' listener
        const newBtn = weButton.cloneNode(true);
        weButton.parentNode.replaceChild(newBtn, weButton);
        
        newBtn.addEventListener("click", () => {
            window.location.href = "login.html";
        });
        return; 
    }

    const res = await fetch(`${API_URL}/cancel-weekly-emails`, {
      headers: { "Authorization": `Bearer ${token}` },
      method: 'POST'
    });

    //console.log(res.status)
    if (res.status == 401) {
      console.log("Token expired. Logging out...");
      localStorage.removeItem("token");
      localStorage.removeItem("username");
      window.location.reload();
      return;
    }
    const data = await res.json();
    if (res.ok){
      alert(data.message);
      if (typeof updateEmailButtonText === 'function') {
          updateEmailButtonText(data.wantsEmail); 
      }
    }
    else {
      console.error("Server Error:", data);
      alert("Error: " + (data.message || "Failed to toggle setting"));
    }
  }
  catch (err) {
    console.error("Toggle error:", err);
    alert("Failed to toggle email settings");
  }

}

