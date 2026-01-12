import { API_URL } from "./config.js";
//const localLink = "http://localhost:5000";
import { removeSavedUrl } from "./script.js";
const articles = [
  { id: 1, title: "Exploring AI Ethics", description: "A deep dive into responsible AI development.", url: "#" },
  { id: 2, title: "Cybersecurity Tips", description: "How to keep your digital life secure.", url: "#" },
  { id: 3, title: "The Future of Tech", description: "Trends that will shape the next decade.", url: "#" }
];

// Load saved data from localStorage
// let savedArticles = JSON.parse(localStorage.getItem("savedArticles")) || [];
// let viewCounts = JSON.parse(localStorage.getItem("viewCounts")) || {};

//const container = document.getElementById("results") || document.getElementById("articleContainer");
export async function renderSavedArticles() {
  const token = localStorage.getItem("token");
  const savedContainer = document.getElementById("savedArticlesContainer");
  if (!savedContainer) {
    return;
  }
  if (!token) {
    savedContainer.innerHTML =
      `
    <p style="text-align: center; color: #4b5563; padding: 10px;">
        To save articles for later, please 
        <a href="login.html" style="color: #6BBBFF; font-weight: bold; text-decoration: underline;">
          log in or sign up
        </a>.
      </p>
    `;
    return;
  }
  try {
    const res = await fetch(`${API_URL}/api/users/bookmarks`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      }
    });
    if (!res.ok) throw new Error("Failed to fetch saved articles");
    const savedItems = await res.json(); // Expecting an array of saved articles

    savedContainer.innerHTML = ""; //clear old contents

    if (!savedItems || savedItems.length === 0) {
      savedContainer.innerHTML = "<p>No saved articles.</p>";
      return;
    }

    savedItems.forEach(item => {
      const articleDiv = document.createElement("div");
      articleDiv.className = "saved-news";

      const link = document.createElement("a");
      link.href = item.value; // URL stored in value field
      link.target = "_blank";

      // Extract a title from various possible sources
      let displayTitle = item.title;
      if (!displayTitle) {
        // Try to extract title from URL if not provided
        try {
          const url = new URL(item.value);
          displayTitle = url.pathname.split('/').pop()?.replace(/-/g, ' ') || "Untitled Article";
        } catch {
          displayTitle = "Untitled Article";
        }
      }

      // Create title element
      const titleElem = document.createElement("h3");
      titleElem.textContent = displayTitle;
      titleElem.style.fontWeight = "600";
      titleElem.style.fontSize = "1.1em";
      titleElem.style.marginBottom = "8px";

      // Add source if available
      if (item.source) {
        const source = document.createElement("p");
        source.className = "text-sm text-gray-600";
        source.textContent = `From: ${item.source}`;
        source.style.marginBottom = "4px";
        articleDiv.appendChild(source);
      }

      // Add description if available
      if (item.description) {
        const desc = document.createElement("p");
        desc.className = "text-sm text-gray-700";
        desc.style.marginBottom = "8px";
        articleDiv.appendChild(desc);
      }

      // Add timestamp
      const timestamp = document.createElement("p");
      timestamp.className = "text-sm text-gray-500";
      const date = new Date(item.timeStamp).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
      timestamp.textContent = `Saved on ${date}`;

      const removeBtn = document.createElement("button");
      removeBtn.textContent = "Remove"; // or use an icon like "🗑️"
      removeBtn.className = "remove-bookmark-btn";
      removeBtn.style.cssText = "background: #d9534f; color: white; border: none; padding: 5px 10px; cursor: pointer; border-radius: 4px; margin-top: 5px;";
      
      removeBtn.onclick = (e) => {
          e.stopPropagation(); // Stop click from bubbling to the article link
          if(confirm("Remove this article from your bookmarks?")) {
              removeSavedUrl(item.value); 
          }
      };
      link.appendChild(titleElem);
      articleDiv.appendChild(link);
      articleDiv.appendChild(timestamp);
      articleDiv.appendChild(removeBtn);
      savedContainer.appendChild(articleDiv);
    });
  } catch (err) {
    console.error("Error loading saved articles:", err);
    const savedContainer = document.getElementById("savedArticlesContainer");
    if (savedContainer) {
      savedContainer.innerHTML = "<p>Error loading saved articles. Please try again later.</p>";
    }
  }
}
