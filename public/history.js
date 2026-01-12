const LOCAL_HISTORY_KEY = "history";
import { API_URL } from "./config.js";
//const localLink = "http://localhost:5000";
//local storage
export function SaveToHistory(article, viewCountElement = null) {
  //let history = JSON.parse(localStorage.getItem("history")) || [];

  //adding new article at front(dashboard)
  //history.unshift(article);

  // keep the 10 most recents
  //if (history.length > 10) {
  //  history.pop();
  //}
  //saving to local storage
  //localStorage.setItem("history", JSON.stringify(history));
  //renderHistory(); //allow auto-update on recently viewed section without refresh
  //SEND information to BACKEND for recommendation tracking
  //const userId = localStorage.getItem("userId");
  const token = localStorage.getItem("token");
  if (token && article.title && article.url) {
    //replace to deployed link when needed
    fetch(`${API_URL}/api/interactions/click`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        articleTitle: article.title,
        url: article.url,
      })
    })
      .then(res => res.json())
      .then((data) => {
        console.log(`Click recorded. New view counted: ", ${data.newViewCount}`);
        if (viewCountElement && data.newViewCount !== undefined) {
          viewCountElement.textContent = `Views: ${data.newViewCount} views`;
        }
      })
      .catch(err => console.log("Error recording click:", err))
  } else if (!token && article.title && article.url){
    //PUBLIC USERS
    fetch(`${API_URL}/api/articles/view`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        articleTitle: article.title,
        url: article.url,
      })
    })
    .then(res => res.json())
      .then((data) => {
        console.log(`Public view recorded. New view counted: ", ${data.newViewCount}`);
        if (viewCountElement && data.newViewCount !== undefined) {
          viewCountElement.textContent = `Views: ${data.newViewCount} views`;
        }
      })
      .catch(err => console.log("Error recording public view:", err));
  }
}
//get history from local storage
export async function getHistory() {
  //return JSON.parse(localStorage.getItem("history")) || [];
  const token = localStorage.getItem("token");
  if (!token) return [];
  try {
    const response = await fetch(`${API_URL}/api/users/history`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
      }
    });
    if (!response.ok) {
      console.log("Failed to fetch history from backend.");
      return [];
    }
    const historyData = await response.json();
    return historyData;
  } catch (error) {
    console.log("Error fetching history:", error);
    return [];
  }
}
//Render history onto the page
export async function renderHistory() {
  const token = localStorage.getItem("token");
  let historyContainer = document.getElementById("history");
  if (!historyContainer) return; //nothing to render
  if (!token) {
    historyContainer.innerHTML =
      `
      <p style="text-align: center; color: #4b5563; padding: 10px;">
        To view your recent clicks, please 
        <a href="login.html" style="color: #6BBBFF; font-weight: bold; text-decoration: underline;">
          log in or sign up
        </a>.
      </p>
    `;
    return;
  }
  historyContainer.innerHTML = "";
  let history = await getHistory();
  if (history.length === 0) {
    historyContainer.innerHTML = "<p>No recently viewed articles.</p>";
    return;
  }
  history.forEach(item => {
    let entry = document.createElement("div");
    entry.innerHTML = `<a href = "${item.url}" target = "_blank">${item.title}</a> 
                            <small> (${item.time})</small>`;
    historyContainer.appendChild(entry);
  });
}

